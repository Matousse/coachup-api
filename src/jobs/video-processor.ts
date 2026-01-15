/**
 * Video Job Processor
 *
 * Asynchronous job processor that polls the database for pending video jobs
 * and processes them using the video generation service.
 *
 * IMPORTANT: On server restart, jobs with existing kieTaskId will RESUME polling
 * instead of creating new generation tasks (which would waste API credits).
 */

import { prisma } from '../lib/prisma';
import {
  runVideoGenerationPipeline,
  resumeKieTaskPolling,
  GenerationContext,
} from '../services/video-generation';

// Configuration
const POLL_INTERVAL_MS = 5000; // Poll every 5 seconds
const MAX_CONCURRENT_JOBS = 2; // Process max 2 jobs at once
const MAX_RETRY_COUNT = 1; // Maximum number of retries

// Track currently processing jobs to avoid double-processing
const processingJobs = new Set<string>();

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Process a single video job
 */
async function processVideoJob(jobId: string): Promise<void> {
  // Mark as processing
  processingJobs.add(jobId);

  try {
    // Load job with coach data
    const job = await prisma.videoJob.findUnique({
      where: { id: jobId },
      include: { coach: true },
    });

    if (!job) {
      console.error(`[Processor] Job ${jobId} not found`);
      return;
    }

    console.log(`[Processor] Processing job ${jobId} (attempt ${job.retryCount + 1})`);

    // Check if this job already has a Kie.ai task ID
    // If so, we RESUME polling instead of creating a new task
    if (job.kieTaskId) {
      console.log(`[Processor] Job ${jobId} has existing kieTaskId: ${job.kieTaskId}`);
      console.log(`[Processor] RESUMING polling (NOT creating new task - saves API credits)`);

      // Update status to processing
      await prisma.videoJob.update({
        where: { id: jobId },
        data: { status: 'processing' },
      });

      // Resume polling the existing task
      const result = await resumeKieTaskPolling(job.kieTaskId, job.coachId, job.id);

      if (result.success) {
        await prisma.videoJob.update({
          where: { id: jobId },
          data: {
            status: 'completed',
            videoUrl: result.videoUrl,
            error: null,
          },
        });
        console.log(`[Processor] Job ${jobId} completed successfully (resumed)`);
      } else {
        await prisma.videoJob.update({
          where: { id: jobId },
          data: {
            status: 'failed',
            error: result.error || 'Resume polling failed',
          },
        });
        console.log(`[Processor] Job ${jobId} failed: ${result.error}`);
      }

      return;
    }

    // No existing task - this is a new generation request
    console.log(`[Processor] Job ${jobId} is NEW - creating Kie.ai task`);

    // Update status to processing
    await prisma.videoJob.update({
      where: { id: jobId },
      data: { status: 'processing' },
    });

    // Build context
    const context: GenerationContext = {
      job,
      coach: job.coach,
    };

    // Run the video generation pipeline
    const result = await runVideoGenerationPipeline(context);

    // Save the kieTaskId immediately if we got one (even on failure)
    // This prevents duplicate generation on retry/restart
    if (result.taskId) {
      console.log(`[Processor] Saving kieTaskId ${result.taskId} to job ${jobId}`);
      await prisma.videoJob.update({
        where: { id: jobId },
        data: { kieTaskId: result.taskId },
      });
    }

    if (result.success) {
      // Success: Update to completed
      await prisma.videoJob.update({
        where: { id: jobId },
        data: {
          status: 'completed',
          videoUrl: result.videoUrl,
          error: null,
        },
      });

      console.log(`[Processor] Job ${jobId} completed successfully`);
    } else {
      // Failure: Check if we should retry
      if (job.retryCount < MAX_RETRY_COUNT) {
        // Retry: Increment count and set status to retrying
        await prisma.videoJob.update({
          where: { id: jobId },
          data: {
            status: 'retrying',
            retryCount: job.retryCount + 1,
            error: result.error,
          },
        });

        console.log(
          `[Processor] Job ${jobId} failed, scheduling retry (${job.retryCount + 1}/${MAX_RETRY_COUNT})`
        );

        // Wait a bit before retrying (will be picked up on next poll)
        await sleep(2000);

        // Set back to pending for retry
        await prisma.videoJob.update({
          where: { id: jobId },
          data: { status: 'pending' },
        });
      } else {
        // Max retries reached: Mark as failed
        await prisma.videoJob.update({
          where: { id: jobId },
          data: {
            status: 'failed',
            error: result.error || 'Max retries reached',
          },
        });

        console.log(`[Processor] Job ${jobId} failed permanently after ${MAX_RETRY_COUNT + 1} attempts`);
        // TODO Epic 5: Send failure notification email
      }
    }
  } catch (error) {
    // Unexpected error
    console.error(`[Processor] Unexpected error processing job ${jobId}:`, error);

    await prisma.videoJob.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  } finally {
    // Remove from processing set
    processingJobs.delete(jobId);
  }
}

/**
 * Poll for pending jobs and process them
 */
async function pollAndProcessJobs(): Promise<void> {
  try {
    // Calculate how many more jobs we can process
    const availableSlots = MAX_CONCURRENT_JOBS - processingJobs.size;

    if (availableSlots <= 0) {
      return; // All slots are busy
    }

    // Find pending jobs (excluding ones already being processed)
    const pendingJobs = await prisma.videoJob.findMany({
      where: {
        status: { in: ['pending', 'retrying'] },
        id: { notIn: Array.from(processingJobs) },
      },
      take: availableSlots,
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });

    if (pendingJobs.length > 0) {
      console.log(`[Processor] Found ${pendingJobs.length} pending job(s)`);
    }

    // Process each job (don't await - process concurrently)
    for (const job of pendingJobs) {
      processVideoJob(job.id).catch((err) => {
        console.error(`[Processor] Error in job ${job.id}:`, err);
      });
    }
  } catch (error) {
    console.error('[Processor] Error polling for jobs:', error);
  }
}

/**
 * Recover orphaned jobs on startup
 *
 * Jobs that were "processing" when the server crashed:
 * - Jobs WITH kieTaskId: Set to 'pending' to resume polling (NO new API call)
 * - Jobs WITHOUT kieTaskId: Set to 'pending' to start fresh
 */
async function recoverOrphanedJobs(): Promise<void> {
  try {
    // Find all orphaned jobs
    const orphanedJobs = await prisma.videoJob.findMany({
      where: {
        status: { in: ['processing', 'processing_ffmpeg'] },
      },
      select: { id: true, kieTaskId: true },
    });

    if (orphanedJobs.length === 0) {
      return;
    }

    const withTaskId = orphanedJobs.filter(j => j.kieTaskId);
    const withoutTaskId = orphanedJobs.filter(j => !j.kieTaskId);

    if (withTaskId.length > 0) {
      console.log(`[Processor] Found ${withTaskId.length} orphaned job(s) WITH kieTaskId - will RESUME polling`);
      // These will resume polling the existing task (no new API call)
      await prisma.videoJob.updateMany({
        where: {
          id: { in: withTaskId.map(j => j.id) },
        },
        data: {
          status: 'pending',
        },
      });
    }

    if (withoutTaskId.length > 0) {
      console.log(`[Processor] Found ${withoutTaskId.length} orphaned job(s) WITHOUT kieTaskId - will restart`);
      // These need to start fresh (API call not made yet)
      await prisma.videoJob.updateMany({
        where: {
          id: { in: withoutTaskId.map(j => j.id) },
        },
        data: {
          status: 'pending',
        },
      });
    }

    console.log(`[Processor] Recovered ${orphanedJobs.length} orphaned job(s)`);
  } catch (error) {
    console.error('[Processor] Error recovering orphaned jobs:', error);
  }
}

/**
 * Start the video job processor
 *
 * This runs in the background and continuously polls for new jobs.
 */
export async function startVideoJobProcessor(): Promise<void> {
  console.log('[Processor] Starting video job processor...');

  // Recover any orphaned jobs from previous crashes
  await recoverOrphanedJobs();

  // Start polling loop
  console.log(`[Processor] Polling every ${POLL_INTERVAL_MS / 1000}s for pending jobs`);

  const pollLoop = async () => {
    while (true) {
      await pollAndProcessJobs();
      await sleep(POLL_INTERVAL_MS);
    }
  };

  // Run in background (don't block)
  pollLoop().catch((err) => {
    console.error('[Processor] Fatal error in poll loop:', err);
  });
}

/**
 * Get processor status (for debugging/monitoring)
 */
export function getProcessorStatus(): {
  activeJobs: number;
  processingJobIds: string[];
} {
  return {
    activeJobs: processingJobs.size,
    processingJobIds: Array.from(processingJobs),
  };
}
