import { Router, Request, Response, NextFunction } from 'express';
import { ProfileSchema, EmailPreferencesSchema } from '../schemas/profile';
import { authMiddleware } from '../middleware/auth';
import { prisma } from '../lib/prisma';

const router = Router();

// GET /api/profile
router.get('/', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.coach) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Non authentifie' },
      });
    }

    const coach = await prisma.coach.findUnique({
      where: { id: req.coach.coachId },
      select: {
        description: true,
        specialty: true,
        city: true,
        radius: true,
        instagramUrl: true,
        websiteUrl: true,
      },
    });

    return res.json({
      data: { profile: coach },
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/profile
router.put('/', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.coach) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Non authentifie' },
      });
    }

    const validated = ProfileSchema.parse(req.body);

    const coach = await prisma.coach.update({
      where: { id: req.coach.coachId },
      data: {
        description: validated.description,
        specialty: validated.specialty,
        city: validated.city,
        radius: validated.radius,
        instagramUrl: validated.instagramUrl || null,
        websiteUrl: validated.websiteUrl || null,
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        description: true,
        specialty: true,
        city: true,
        radius: true,
        instagramUrl: true,
        websiteUrl: true,
      },
    });

    return res.json({
      data: { coach },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/profile/email-preferences (Story 5.2)
router.get('/email-preferences', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.coach) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Non authentifie' },
      });
    }

    const coach = await prisma.coach.findUnique({
      where: { id: req.coach.coachId },
      select: {
        emailWeeklyRecap: true,
        emailCampaignLive: true,
      },
    });

    return res.json({
      data: {
        preferences: {
          emailWeeklyRecap: coach?.emailWeeklyRecap ?? true,
          emailCampaignLive: coach?.emailCampaignLive ?? true,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/profile/email-preferences (Story 5.2)
router.patch('/email-preferences', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.coach) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Non authentifie' },
      });
    }

    const validated = EmailPreferencesSchema.parse(req.body);

    // Build update data only with provided fields
    const updateData: { emailWeeklyRecap?: boolean; emailCampaignLive?: boolean } = {};
    if (validated.emailWeeklyRecap !== undefined) {
      updateData.emailWeeklyRecap = validated.emailWeeklyRecap;
    }
    if (validated.emailCampaignLive !== undefined) {
      updateData.emailCampaignLive = validated.emailCampaignLive;
    }

    const coach = await prisma.coach.update({
      where: { id: req.coach.coachId },
      data: updateData,
      select: {
        emailWeeklyRecap: true,
        emailCampaignLive: true,
      },
    });

    console.log(`[PROFILE] Email preferences updated for coach ${req.coach.coachId}`);

    return res.json({
      data: {
        preferences: {
          emailWeeklyRecap: coach.emailWeeklyRecap,
          emailCampaignLive: coach.emailCampaignLive,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
