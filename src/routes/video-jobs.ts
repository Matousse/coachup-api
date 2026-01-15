import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { provisionMetaAccount, ProvisionResult } from '../services/meta-account';
import { launchCampaign, LaunchResult } from '../services/campaign';

const router = Router();

// Schema for video generation request
const GenerateVideoSchema = z.object({
  mode: z.enum(['simple', 'sophisticated']),
  template: z.enum(['dynamic', 'local', 'transform']).optional(),
});

// Template auto-selection based on coach specialty
const SPECIALTY_TEMPLATE_MAP: Record<string, string> = {
  musculation: 'dynamic',
  crossfit: 'dynamic',
  yoga: 'transform',
  'perte de poids': 'local',
  autre: 'dynamic',
};

function autoSelectTemplate(specialty: string | null): string {
  if (!specialty) return 'dynamic';
  const normalized = specialty.toLowerCase();
  return SPECIALTY_TEMPLATE_MAP[normalized] || 'dynamic';
}

// POST /api/video-jobs/generate - Create a new video job with mode selection
router.post(
  '/generate',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.coach) {
        return res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: 'Non authentifie' },
        });
      }

      // Count existing video jobs for this coach
      const existingJobsCount = await prisma.videoJob.count({
        where: { coachId: req.coach.coachId },
      });

      // First generation is free, subsequent ones require active subscription
      if (existingJobsCount > 0) {
        const subscription = await prisma.subscription.findUnique({
          where: { coachId: req.coach.coachId },
        });

        if (!subscription || subscription.status !== 'active') {
          return res.status(400).json({
            error: { code: 'NO_ACTIVE_SUBSCRIPTION', message: 'Abonnement actif requis' },
          });
        }
      } else {
        console.log(`[VideoJobs] First generation for coach ${req.coach.coachId} - FREE`);
      }

      // Parse and validate request body
      const validated = GenerateVideoSchema.parse(req.body);

      // Get coach info for template auto-selection
      const coach = await prisma.coach.findUnique({
        where: { id: req.coach.coachId },
        select: { specialty: true },
      });

      // Determine template
      let template: string;
      if (validated.mode === 'simple') {
        // Auto-select template based on specialty
        template = autoSelectTemplate(coach?.specialty || null);
      } else {
        // Sophisticated mode requires explicit template
        if (!validated.template) {
          return res.status(400).json({
            error: {
              code: 'TEMPLATE_REQUIRED',
              message: 'Le template est requis en mode sophistique',
            },
          });
        }
        template = validated.template;
      }

      // Create video job
      const videoJob = await prisma.videoJob.create({
        data: {
          coachId: req.coach.coachId,
          status: 'pending',
          mode: validated.mode,
          template,
          regeneration: false,
        },
      });

      console.log(
        `Video job created: ${videoJob.id} (mode: ${validated.mode}, template: ${template})`
      );

      return res.status(201).json({
        data: {
          videoJob: {
            id: videoJob.id,
            status: videoJob.status,
            mode: videoJob.mode,
            template: videoJob.template,
            createdAt: videoJob.createdAt.toISOString(),
          },
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Donnees invalides',
            issues: error.issues,
          },
        });
      }
      next(error);
    }
  }
);

// GET /api/video-jobs/current - Get current video job for authenticated coach
router.get(
  '/current',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.coach) {
        return res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: 'Non authentifie' },
        });
      }

      // Get the most recent video job for this coach
      const videoJob = await prisma.videoJob.findFirst({
        where: { coachId: req.coach.coachId },
        orderBy: { createdAt: 'desc' },
      });

      if (!videoJob) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Aucune video trouvee' },
        });
      }

      return res.json({
        data: {
          videoJob: {
            id: videoJob.id,
            status: videoJob.status,
            mode: videoJob.mode,
            template: videoJob.template,
            regeneration: videoJob.regeneration,
            videoUrl: videoJob.videoUrl,
            error: videoJob.error,
            createdAt: videoJob.createdAt.toISOString(),
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Status to progress mapping
const STATUS_PROGRESS: Record<string, number> = {
  pending: 5,
  processing: 40,
  processing_ffmpeg: 75,
  retrying: 30,
  completed: 100,
  validated: 100,
  failed: 0,
};

// Status to localized message mapping
const STATUS_MESSAGES: Record<string, string> = {
  pending: 'Preparation de la generation...',
  processing: "L'IA genere votre video...",
  processing_ffmpeg: 'Finalisation de la video...',
  retrying: 'Nouvelle tentative en cours...',
  completed: 'Video prete!',
  validated: 'Video validee!',
  failed: 'Generation echouee',
};

// GET /api/video-jobs/:id - Get specific video job by ID with progress
router.get(
  '/:id',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.coach) {
        return res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: 'Non authentifie' },
        });
      }

      const jobId = req.params.id as string;
      const videoJob = await prisma.videoJob.findFirst({
        where: {
          id: jobId,
          coachId: req.coach.coachId, // Ensure coach can only access their own jobs
        },
      });

      if (!videoJob) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Video non trouvee' },
        });
      }

      // Calculate progress and get message
      const progress = STATUS_PROGRESS[videoJob.status] ?? 0;
      const statusMessage = STATUS_MESSAGES[videoJob.status] ?? 'En cours...';

      return res.json({
        data: {
          videoJob: {
            id: videoJob.id,
            status: videoJob.status,
            progress,
            statusMessage,
            mode: videoJob.mode,
            template: videoJob.template,
            regeneration: videoJob.regeneration,
            videoUrl: videoJob.videoUrl,
            error: videoJob.error,
            retryCount: videoJob.retryCount,
            createdAt: videoJob.createdAt.toISOString(),
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/video-jobs/:id/validate - Validate a completed video
router.put(
  '/:id/validate',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.coach) {
        return res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: 'Non authentifie' },
        });
      }

      const jobId = req.params.id as string;

      // Find the video job and verify ownership
      const videoJob = await prisma.videoJob.findFirst({
        where: {
          id: jobId,
          coachId: req.coach.coachId,
        },
      });

      if (!videoJob) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Video non trouvee' },
        });
      }

      // Verify current status is 'completed' before validation
      if (videoJob.status !== 'completed') {
        return res.status(400).json({
          error: {
            code: 'INVALID_STATUS',
            message: 'La video doit etre en statut "completed" pour etre validee',
          },
        });
      }

      // Update status to validated
      const updatedVideoJob = await prisma.videoJob.update({
        where: { id: jobId },
        data: { status: 'validated' },
      });

      console.log(`Video job validated: ${jobId}`);

      // Trigger Meta account provisioning (Story 4.1)
      let metaResult: ProvisionResult = {
        status: 'error',
        message: 'Configuration en cours...',
      };

      try {
        metaResult = await provisionMetaAccount(req.coach.coachId);
        console.log(`Meta provisioning result for coach ${req.coach.coachId}: ${metaResult.status}`);
      } catch (error) {
        console.error('Meta provisioning error:', error);
        // Don't block validation if Meta fails
        metaResult = {
          status: 'error',
          message: 'Configuration campagne en cours...',
        };
      }

      // Story 4.2: Launch campaign if Meta account is ready
      let campaignResult: LaunchResult = {
        success: false,
        error: 'Meta account not ready',
      };

      if (metaResult.status === 'provisioned' || metaResult.status === 'existing') {
        try {
          campaignResult = await launchCampaign(req.coach.coachId);
          console.log(`Campaign launch result for coach ${req.coach.coachId}: ${campaignResult.success}`);
        } catch (error) {
          console.error('Campaign launch error:', error);
          campaignResult = {
            success: false,
            error: 'Campaign launch failed',
          };
        }
      }

      return res.json({
        data: {
          videoJob: {
            id: updatedVideoJob.id,
            status: updatedVideoJob.status,
            videoUrl: updatedVideoJob.videoUrl,
          },
          meta: {
            status: metaResult.status,
            message: metaResult.message,
            adAccountId: metaResult.adAccountId,
          },
          campaign: campaignResult.success
            ? {
                id: campaignResult.campaign?.id,
                status: campaignResult.campaign?.status,
                metaCampaignId: campaignResult.campaign?.metaCampaignId,
              }
            : null,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/video-jobs/:id/stream - Get video URL with anti-download headers
router.get(
  '/:id/stream',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.coach) {
        return res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: 'Non authentifie' },
        });
      }

      const jobId = req.params.id as string;

      // Find the video job and verify ownership
      const videoJob = await prisma.videoJob.findFirst({
        where: {
          id: jobId,
          coachId: req.coach.coachId,
        },
      });

      if (!videoJob) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Video non trouvee' },
        });
      }

      // Verify video is completed or validated
      if (videoJob.status !== 'completed' && videoJob.status !== 'validated') {
        return res.status(400).json({
          error: {
            code: 'VIDEO_NOT_READY',
            message: 'La video n\'est pas encore prete',
          },
        });
      }

      if (!videoJob.videoUrl) {
        return res.status(404).json({
          error: { code: 'VIDEO_URL_NOT_FOUND', message: 'URL video non disponible' },
        });
      }

      // Set anti-download headers
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, no-store');

      // For MVP, return the URL for client-side streaming
      // In production, this could redirect to a signed URL or stream the video directly
      return res.json({
        data: {
          streamUrl: videoJob.videoUrl,
          status: videoJob.status,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
