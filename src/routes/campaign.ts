/**
 * Campaign Routes (Story 4.2)
 *
 * Routes for campaign status and management
 */

import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth';
import { prisma } from '../lib/prisma';

const router = Router();

// GET /api/campaign - Get campaign for authenticated coach
router.get(
  '/',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.coach) {
        return res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: 'Non authentifie' },
        });
      }

      const campaign = await prisma.campaign.findUnique({
        where: { coachId: req.coach.coachId },
      });

      if (!campaign) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Aucune campagne trouvee' },
        });
      }

      return res.json({
        data: {
          campaign: {
            id: campaign.id,
            status: campaign.status,
            dailyBudget: campaign.dailyBudget,
            metaCampaignId: campaign.metaCampaignId,
            rejectReason: campaign.rejectReason,
            submittedAt: campaign.submittedAt?.toISOString(),
            launchedAt: campaign.launchedAt?.toISOString(),
            createdAt: campaign.createdAt.toISOString(),
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Status to localized message mapping
const STATUS_MESSAGES: Record<string, string> = {
  draft: 'Brouillon',
  pending_review: 'En attente de validation Meta',
  active: 'Active - Votre pub est diffusee!',
  rejected: 'Rejetee par Meta',
  paused: 'En pause',
};

// GET /api/campaign/status - Get campaign status for polling (Story 5.1: with stats)
router.get(
  '/status',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.coach) {
        return res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: 'Non authentifie' },
        });
      }

      const campaign = await prisma.campaign.findUnique({
        where: { coachId: req.coach.coachId },
        include: {
          stats: true, // Story 5.1: Include campaign stats
        },
      });

      if (!campaign) {
        return res.json({
          data: {
            hasCampaign: false,
            status: null,
            statusMessage: 'Aucune campagne creee',
            stats: null,
          },
        });
      }

      // Story 5.1: Format stats for response
      const stats = campaign.stats
        ? {
            impressions: campaign.stats.impressions,
            clicks: campaign.stats.clicks,
            reach: campaign.stats.reach,
            spend: campaign.stats.spend,
            ctr: campaign.stats.ctr,
            cpc: campaign.stats.cpc,
            lastSyncedAt: campaign.stats.lastSyncedAt?.toISOString() || null,
          }
        : null;

      return res.json({
        data: {
          hasCampaign: true,
          status: campaign.status,
          statusMessage: STATUS_MESSAGES[campaign.status] || campaign.status,
          dailyBudget: campaign.dailyBudget,
          rejectReason: campaign.rejectReason,
          launchedAt: campaign.launchedAt?.toISOString(),
          stats, // Story 5.1: Include stats in response
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
