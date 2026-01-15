/**
 * Video Generation Service - Kie.ai / Sora 2 Integration
 *
 * This service integrates with Kie.ai's Sora 2 API for AI video generation.
 * It supports both real API calls and stub mode for development/testing.
 */

import { VideoJob, Coach } from '@prisma/client';
import { prisma } from '../lib/prisma';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

// Storage configuration
const STORAGE_BASE = path.join(__dirname, '../../storage');
const VIDEOS_DIR = path.join(STORAGE_BASE, 'videos');

// Ensure storage directories exist
if (!fs.existsSync(VIDEOS_DIR)) {
  fs.mkdirSync(VIDEOS_DIR, { recursive: true });
  console.log(`[Storage] Created videos directory: ${VIDEOS_DIR}`);
}

// Configuration
const KIE_API_BASE = 'https://api.kie.ai/api/v1';
const KIE_API_KEY = process.env.KIE_AI_API_KEY;
const IMGBB_API_KEY = process.env.IMGBB_API_KEY;
const USE_STUB = process.env.VIDEO_GENERATION_STUB === 'true' || !KIE_API_KEY;

// Template prompts for different video styles
export const TEMPLATE_PROMPTS: Record<string, string> = {
  dynamic: `Créer une vidéo fitness énergique et professionnelle en français.
    Scene 1 (0-4s): Un coach fitness dynamique face caméra dit "Tu veux te transformer à {city}?" avec enthousiasme.
    Scene 2 (4-10s): Le coach se présente brièvement avec confiance, souriant face caméra.
    Scene 3 (10-15s): Le coach fait une démonstration d'exercice dynamique.
    Style: Transitions rapides, musique high-energy, format vertical 9:16 pour publicité mobile.
    Important: Voix française naturelle avec lip sync, visuel professionnel gym/extérieur.`,

  local: `Créer une vidéo fitness chaleureuse et communautaire en français.
    Scene 1 (0-4s): Un coach fitness accueillant dit "Salut {city}!" avec un grand sourire.
    Scene 2 (4-10s): Le coach se présente de manière amicale et accessible.
    Scene 3 (10-15s): Le coach aide un client ou montre son environnement local.
    Style: Couleurs chaudes, ton amical, ambiance quartier, format vertical 9:16.
    Important: Voix française naturelle avec lip sync, atmosphère bienveillante.`,

  transform: `Créer une vidéo fitness inspirante sur les transformations en français.
    Scene 1 (0-4s): Un coach fitness motivant dit "À {city}, j'ai déjà aidé des dizaines de personnes..." avec passion.
    Scene 2 (4-10s): Le coach partage des histoires de succès de ses clients.
    Scene 3 (10-15s): Montrer des moments de transformation ou témoignages.
    Style: Musique émotionnelle et inspirante, focus transformation, format vertical 9:16.
    Important: Voix française naturelle avec lip sync, ton motivationnel.`,
};

export interface GenerationResult {
  success: boolean;
  videoUrl?: string;
  taskId?: string;
  error?: string;
  errorCode?: string;
}

export interface GenerationContext {
  job: VideoJob;
  coach: Coach;
}

interface KieCreateTaskResponse {
  code: number;
  msg: string;
  data?: {
    taskId: string;
  };
}

interface KieTaskStatusResponse {
  code: number;
  msg: string;
  data?: {
    taskId: string;
    model: string;
    state: 'generating' | 'success' | 'failed' | 'pending';
    param: string;
    resultJson: string;
    failCode: string | null;
    failMsg: string | null;
    costTime: number | null;
    completeTime: number | null;
    createTime: number;
  };
}

/**
 * Sleep utility for delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Upload image to imgBB and get public URL
 */
async function uploadToImgBB(imagePath: string): Promise<{ success: boolean; url?: string; error?: string }> {
  if (!IMGBB_API_KEY) {
    console.error('[imgBB] IMGBB_API_KEY not configured');
    return { success: false, error: 'IMGBB_API_KEY not configured' };
  }

  try {
    // Read file and convert to base64
    const absolutePath = path.join(__dirname, '../..', imagePath);
    console.log(`[imgBB] Reading image from: ${absolutePath}`);

    if (!fs.existsSync(absolutePath)) {
      console.error(`[imgBB] File not found: ${absolutePath}`);
      return { success: false, error: `File not found: ${imagePath}` };
    }

    const imageBuffer = fs.readFileSync(absolutePath);
    const base64Image = imageBuffer.toString('base64');

    console.log(`[imgBB] Uploading image (${(imageBuffer.length / 1024).toFixed(1)} KB)...`);

    // Upload to imgBB
    const formData = new URLSearchParams();
    formData.append('key', IMGBB_API_KEY);
    formData.append('image', base64Image);

    const response = await fetch('https://api.imgbb.com/1/upload', {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();

    if (data.success && data.data?.url) {
      console.log(`[imgBB] ✅ Upload success: ${data.data.url}`);
      return { success: true, url: data.data.url };
    }

    console.error('[imgBB] Upload failed:', data);
    return { success: false, error: data.error?.message || 'Upload failed' };
  } catch (err) {
    console.error('[imgBB] Error:', err);
    return { success: false, error: `Upload error: ${err instanceof Error ? err.message : 'Unknown'}` };
  }
}

/**
 * Upload coach photos to imgBB and return public URLs
 */
async function uploadCoachPhotosToImgBB(photoUrls: string[]): Promise<string[]> {
  const publicUrls: string[] = [];

  for (const photoUrl of photoUrls) {
    const result = await uploadToImgBB(photoUrl);
    if (result.success && result.url) {
      publicUrls.push(result.url);
    }
  }

  console.log(`[imgBB] Uploaded ${publicUrls.length}/${photoUrls.length} photos`);
  return publicUrls;
}

/**
 * Generate prompt for Sora 2 based on template and coach data
 */
export function generatePrompt(template: string, coach: Coach): string {
  const basePrompt = TEMPLATE_PROMPTS[template] || TEMPLATE_PROMPTS.dynamic;
  const city = coach.city || 'votre ville';
  const sport = coach.specialty || 'fitness';
  const name = coach.name || 'Coach';

  return basePrompt
    .replace(/{city}/g, city)
    .replace(/{sport}/g, sport)
    .replace(/{name}/g, name);
}

/**
 * Create a video generation task via Kie.ai API
 * Uses image-to-video model if imageUrls provided, otherwise text-to-video
 */
async function createKieTask(
  prompt: string,
  imageUrls?: string[]
): Promise<{ taskId?: string; error?: string }> {
  if (!KIE_API_KEY) {
    return { error: 'KIE_AI_API_KEY not configured' };
  }

  // Choose model based on whether we have images
  const hasImages = imageUrls && imageUrls.length > 0;
  const model = hasImages ? 'sora-2-image-to-video' : 'sora-2-pro-text-to-video';

  console.log(`[Kie.ai] Using model: ${model}`);
  if (hasImages) {
    console.log(`[Kie.ai] With ${imageUrls.length} image(s): ${imageUrls.join(', ')}`);
  }

  try {
    const inputPayload: Record<string, unknown> = {
      prompt,
      aspect_ratio: 'portrait', // 9:16 for mobile ads
      n_frames: '15', // 15 seconds
      remove_watermark: true,
    };

    // Add size only for text-to-video (image-to-video doesn't support it)
    if (!hasImages) {
      inputPayload.size = 'standard'; // 720p
    }

    // Add image URLs for image-to-video model
    if (hasImages) {
      inputPayload.image_urls = imageUrls;
    }

    const requestBody = {
      model,
      input: inputPayload,
    };

    console.log(`[Kie.ai] Request body:`, JSON.stringify(requestBody, null, 2));

    const response = await fetch(`${KIE_API_BASE}/jobs/createTask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${KIE_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    const data: KieCreateTaskResponse = await response.json();

    if (data.code === 200 && data.data?.taskId) {
      console.log(`[Kie.ai] ✅ Task created: ${data.data.taskId}`);
      return { taskId: data.data.taskId };
    }

    console.error(`[Kie.ai] Task creation failed:`, data);
    return { error: data.msg || 'Task creation failed' };
  } catch (err) {
    console.error(`[Kie.ai] API error:`, err);
    return { error: `API request failed: ${err instanceof Error ? err.message : 'Unknown error'}` };
  }
}

/**
 * Check task status via Kie.ai API
 */
async function checkKieTaskStatus(taskId: string): Promise<{
  completed: boolean;
  videoUrl?: string;
  error?: string;
  state?: string;
}> {
  if (!KIE_API_KEY) {
    return { completed: false, error: 'KIE_AI_API_KEY not configured' };
  }

  try {
    const response = await fetch(`${KIE_API_BASE}/jobs/recordInfo?taskId=${taskId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${KIE_API_KEY}`,
      },
    });

    const data: KieTaskStatusResponse = await response.json();
    console.log(`[Kie.ai] Status response for ${taskId}:`, JSON.stringify(data, null, 2));

    if (data.code !== 200) {
      console.error(`[Kie.ai] Status check failed:`, data);
      return { completed: false, error: data.msg };
    }

    const taskData = data.data;
    if (!taskData) {
      console.log(`[Kie.ai] No task data in response`);
      return { completed: false };
    }

    // Check state field
    const state = taskData.state;
    console.log(`[Kie.ai] Task ${taskId} state: ${state}`);

    // Check if task failed
    if (state === 'failed' || taskData.failCode || taskData.failMsg) {
      const errorMsg = taskData.failMsg || taskData.failCode || 'Unknown error';
      console.error(`[Kie.ai] Task failed: ${errorMsg}`);
      return {
        completed: true,
        error: errorMsg,
        state,
      };
    }

    // Check if task completed successfully
    if (state === 'success' && taskData.resultJson) {
      try {
        const result = JSON.parse(taskData.resultJson);
        console.log(`[Kie.ai] Task result:`, JSON.stringify(result, null, 2));

        // Extract video URL from result
        const videoUrl = result.video_url || result.resultUrls?.[0] || result.url;
        if (videoUrl) {
          console.log(`[Kie.ai] Video URL found: ${videoUrl}`);
          return {
            completed: true,
            videoUrl,
            state,
          };
        }

        console.error(`[Kie.ai] Success but no video URL in result:`, result);
        return {
          completed: true,
          error: 'No video URL in result',
          state,
        };
      } catch (parseErr) {
        console.error(`[Kie.ai] Failed to parse resultJson:`, taskData.resultJson);
        return {
          completed: true,
          error: 'Failed to parse result',
          state,
        };
      }
    }

    // Still processing (generating or pending)
    return { completed: false, state };
  } catch (err) {
    console.error(`[Kie.ai] Status check error:`, err);
    return { completed: false, error: `Status check failed: ${err instanceof Error ? err.message : 'Unknown error'}` };
  }
}

/**
 * Poll Kie.ai task until completion (with timeout)
 */
async function pollKieTask(
  taskId: string,
  maxWaitMs: number = 900000, // 15 minutes max (Sora 2 can take 10+ minutes)
  pollIntervalMs: number = 15000 // Poll every 15 seconds
): Promise<{ videoUrl?: string; error?: string }> {
  const startTime = Date.now();
  let pollCount = 0;

  console.log(`[Kie.ai] Starting poll for task ${taskId} (max wait: ${maxWaitMs / 60000} min)`);

  while (Date.now() - startTime < maxWaitMs) {
    pollCount++;
    const elapsedMin = ((Date.now() - startTime) / 60000).toFixed(1);

    const status = await checkKieTaskStatus(taskId);

    if (status.completed) {
      if (status.videoUrl) {
        console.log(`[Kie.ai] ✅ Task ${taskId} completed after ${elapsedMin} min! Video: ${status.videoUrl}`);
        return { videoUrl: status.videoUrl };
      }
      console.error(`[Kie.ai] ❌ Task ${taskId} failed after ${elapsedMin} min: ${status.error}`);
      return { error: status.error || 'Generation failed' };
    }

    console.log(`[Kie.ai] ⏳ Task ${taskId} state: ${status.state || 'unknown'} (poll #${pollCount}, elapsed: ${elapsedMin} min)`);
    await sleep(pollIntervalMs);
  }

  const totalMin = ((Date.now() - startTime) / 60000).toFixed(1);
  console.error(`[Kie.ai] ⏰ Task ${taskId} TIMEOUT after ${totalMin} min (${pollCount} polls)`);
  return { error: 'SORA_TIMEOUT' };
}

/**
 * Generate video with Sora 2 via Kie.ai (REAL IMPLEMENTATION)
 */
export async function generateVideoWithSora2(
  context: GenerationContext
): Promise<GenerationResult> {
  const { job, coach } = context;

  console.log(`[VideoGen] Starting generation for job ${job.id}`);
  console.log(`[VideoGen] Template: ${job.template}, Mode: ${job.mode}`);
  console.log(`[VideoGen] Coach: ${coach.name}, City: ${coach.city}`);
  console.log(`[VideoGen] Using ${USE_STUB ? 'STUB' : 'REAL Kie.ai API'}`);

  // Generate the prompt
  const prompt = generatePrompt(job.template || 'dynamic', coach);
  console.log(`[VideoGen] Generated prompt (first 200 chars): ${prompt.substring(0, 200)}...`);

  // Use stub mode for development/testing
  if (USE_STUB) {
    return generateVideoStub(context);
  }

  // Step 1: Get coach photos from database
  console.log(`[VideoGen] Step 1: Fetching coach photos...`);
  const photos = await prisma.photo.findMany({
    where: { coachId: coach.id },
    orderBy: { createdAt: 'asc' },
  });

  if (photos.length === 0) {
    console.warn(`[VideoGen] ⚠️ No photos found for coach ${coach.id}, using text-to-video`);
  } else {
    console.log(`[VideoGen] Found ${photos.length} photo(s)`);
  }

  // Step 2: Upload photos to imgBB (if any)
  let imageUrls: string[] = [];
  if (photos.length > 0 && IMGBB_API_KEY) {
    console.log(`[VideoGen] Step 2: Uploading photos to imgBB...`);
    const photoUrls = photos.map(p => p.url); // e.g., /uploads/filename.png
    imageUrls = await uploadCoachPhotosToImgBB(photoUrls);

    if (imageUrls.length === 0) {
      console.warn(`[VideoGen] ⚠️ Failed to upload photos, falling back to text-to-video`);
    } else {
      console.log(`[VideoGen] ✅ ${imageUrls.length} photo(s) uploaded to imgBB`);
    }
  } else if (photos.length > 0 && !IMGBB_API_KEY) {
    console.warn(`[VideoGen] ⚠️ IMGBB_API_KEY not set, using text-to-video`);
  }

  // Step 3: Create Kie.ai task (with or without images)
  console.log(`[VideoGen] Step 3: Creating Kie.ai task...`);
  const createResult = await createKieTask(prompt, imageUrls.length > 0 ? imageUrls : undefined);
  if (createResult.error || !createResult.taskId) {
    return {
      success: false,
      error: createResult.error || 'Failed to create task',
      errorCode: 'KIE_TASK_CREATE_FAILED',
    };
  }

  // IMPORTANT: Save kieTaskId to database IMMEDIATELY after creation
  // This ensures we can resume polling if the server restarts
  console.log(`[VideoGen] Saving kieTaskId ${createResult.taskId} to job ${job.id} (prevents duplicate API calls on restart)`);
  await prisma.videoJob.update({
    where: { id: job.id },
    data: { kieTaskId: createResult.taskId },
  });

  // Step 4: Poll for completion
  console.log(`[VideoGen] Step 4: Waiting for video generation...`);
  const pollResult = await pollKieTask(createResult.taskId);
  if (pollResult.error) {
    return {
      success: false,
      error: pollResult.error,
      errorCode: pollResult.error.includes('TIMEOUT') ? 'SORA_TIMEOUT' : 'SORA_API_ERROR',
      taskId: createResult.taskId,
    };
  }

  console.log(`[VideoGen] ✅ Success! Video URL: ${pollResult.videoUrl}`);

  return {
    success: true,
    videoUrl: pollResult.videoUrl,
    taskId: createResult.taskId,
  };
}

/**
 * STUB: Simulate Sora 2 video generation for development/testing
 */
async function generateVideoStub(context: GenerationContext): Promise<GenerationResult> {
  const { job, coach } = context;

  console.log(`[VideoGen STUB] Simulating generation for job ${job.id}`);

  // Simulate processing time (10-30 seconds)
  const processingTime = 10000 + Math.random() * 20000;
  console.log(`[VideoGen STUB] Simulating ${Math.round(processingTime / 1000)}s processing time`);
  await sleep(processingTime);

  // 90% success rate (10% failure for retry testing)
  const isRetry = job.retryCount > 0;
  const successRate = isRetry ? 0.95 : 0.9;

  if (Math.random() < successRate) {
    const placeholderUrl = `https://storage.coachup.example/videos/${job.id}/generated.mp4`;
    console.log(`[VideoGen STUB] Success! Video URL: ${placeholderUrl}`);

    return {
      success: true,
      videoUrl: placeholderUrl,
    };
  }

  const errorCodes = ['SORA_CONTENT_POLICY', 'SORA_TIMEOUT', 'SORA_API_ERROR'];
  const errorCode = errorCodes[Math.floor(Math.random() * errorCodes.length)];
  console.log(`[VideoGen STUB] Failed with error: ${errorCode}`);

  return {
    success: false,
    error: `Video generation failed: ${errorCode}`,
    errorCode,
  };
}

/**
 * Download video from remote URL and save locally
 */
export async function downloadVideo(
  remoteUrl: string,
  coachId: string,
  jobId: string
): Promise<{ success: boolean; localPath?: string; localUrl?: string; error?: string }> {
  const coachDir = path.join(VIDEOS_DIR, coachId);

  // Create coach-specific directory
  if (!fs.existsSync(coachDir)) {
    fs.mkdirSync(coachDir, { recursive: true });
    console.log(`[Storage] Created coach directory: ${coachDir}`);
  }

  const filename = `${jobId}.mp4`;
  const localPath = path.join(coachDir, filename);
  const localUrl = `/storage/videos/${coachId}/${filename}`;

  console.log(`[Storage] Downloading video from: ${remoteUrl}`);
  console.log(`[Storage] Saving to: ${localPath}`);

  try {
    const response = await fetch(remoteUrl);

    if (!response.ok) {
      console.error(`[Storage] Download failed: HTTP ${response.status}`);
      return { success: false, error: `Download failed: HTTP ${response.status}` };
    }

    if (!response.body) {
      console.error(`[Storage] No response body`);
      return { success: false, error: 'No response body' };
    }

    // Convert web ReadableStream to Node.js Readable
    const reader = response.body.getReader();
    const nodeStream = new Readable({
      async read() {
        const { done, value } = await reader.read();
        if (done) {
          this.push(null);
        } else {
          this.push(Buffer.from(value));
        }
      }
    });

    // Write to file
    const writeStream = fs.createWriteStream(localPath);
    await pipeline(nodeStream, writeStream);

    // Get file size for logging
    const stats = fs.statSync(localPath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

    console.log(`[Storage] ✅ Video downloaded successfully: ${localPath} (${sizeMB} MB)`);

    return {
      success: true,
      localPath,
      localUrl,
    };
  } catch (err) {
    console.error(`[Storage] Download error:`, err);
    return {
      success: false,
      error: `Download failed: ${err instanceof Error ? err.message : 'Unknown error'}`
    };
  }
}

/**
 * Post-process video with FFmpeg (add CTA, overlays)
 * TODO: Implement real FFmpeg processing
 */
export async function postProcessWithFFmpeg(
  videoUrl: string,
  coach: Coach
): Promise<GenerationResult> {
  console.log(`[FFmpeg] Starting post-processing for ${videoUrl}`);
  console.log(`[FFmpeg] Coach handle: @${coach.instagramUrl || 'coach'}`);

  // For MVP, we skip FFmpeg processing and return the video as-is
  // Real implementation would:
  // 1. Download the video (DONE - now in downloadVideo)
  // 2. Add CTA screen (4s) with template PNG
  // 3. Add text overlays (@handle, city)
  // 4. Add animation effects
  // 5. Export final video

  // Simulate minimal processing time
  await sleep(2000);

  console.log(`[FFmpeg] Post-processing skipped (MVP mode)`);

  return {
    success: true,
    videoUrl,
  };
}

/**
 * Resume polling for an existing Kie.ai task
 * Used when server restarts and a task was already created
 */
export async function resumeKieTaskPolling(
  kieTaskId: string,
  coachId: string,
  jobId: string
): Promise<GenerationResult> {
  console.log(`[Pipeline] Resuming polling for existing task ${kieTaskId}`);

  // Poll for completion
  const pollResult = await pollKieTask(kieTaskId);
  if (pollResult.error) {
    return {
      success: false,
      error: pollResult.error,
      errorCode: pollResult.error.includes('TIMEOUT') ? 'SORA_TIMEOUT' : 'SORA_API_ERROR',
      taskId: kieTaskId,
    };
  }

  if (!pollResult.videoUrl) {
    return {
      success: false,
      error: 'No video URL returned',
      errorCode: 'NO_VIDEO_URL',
      taskId: kieTaskId,
    };
  }

  // Download video to local storage
  console.log(`[Pipeline] Downloading video to local storage...`);
  const downloadResult = await downloadVideo(pollResult.videoUrl, coachId, jobId);

  if (!downloadResult.success) {
    console.error(`[Pipeline] Download failed: ${downloadResult.error}`);
    return {
      success: false,
      error: downloadResult.error,
      errorCode: 'DOWNLOAD_FAILED',
      taskId: kieTaskId,
    };
  }

  console.log(`[Pipeline] ✅ Resume complete! Video: ${downloadResult.localUrl}`);

  return {
    success: true,
    videoUrl: downloadResult.localUrl,
    taskId: kieTaskId,
  };
}

/**
 * Full video generation pipeline
 * 1. Generate video with Sora 2 via Kie.ai
 * 2. Download video to local storage
 * 3. Post-process with FFmpeg (TODO: implement)
 * 4. Return final local video URL
 */
export async function runVideoGenerationPipeline(
  context: GenerationContext
): Promise<GenerationResult> {
  const { job, coach } = context;

  // Step 1: Generate video with Sora 2
  console.log(`[Pipeline] Step 1/3: Generating video with Kie.ai...`);
  const generationResult = await generateVideoWithSora2(context);

  if (!generationResult.success) {
    return generationResult;
  }

  // Step 2: Download video to local storage
  console.log(`[Pipeline] Step 2/3: Downloading video to local storage...`);
  const downloadResult = await downloadVideo(
    generationResult.videoUrl!,
    coach.id,
    job.id
  );

  if (!downloadResult.success) {
    console.error(`[Pipeline] Download failed: ${downloadResult.error}`);
    return {
      success: false,
      error: downloadResult.error,
      errorCode: 'DOWNLOAD_FAILED',
      taskId: generationResult.taskId,
    };
  }

  // Step 3: Post-process with FFmpeg (optional for MVP)
  console.log(`[Pipeline] Step 3/3: Post-processing video...`);
  const ffmpegResult = await postProcessWithFFmpeg(
    downloadResult.localUrl!,
    coach
  );

  if (!ffmpegResult.success) {
    return ffmpegResult;
  }

  console.log(`[Pipeline] ✅ Pipeline complete! Video: ${downloadResult.localUrl}`);

  return {
    success: true,
    videoUrl: downloadResult.localUrl,
    taskId: generationResult.taskId,
  };
}
