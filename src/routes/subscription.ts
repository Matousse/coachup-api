import { Router, Request, Response, NextFunction } from 'express';
import { SelectPlanSchema } from '../schemas/subscription';
import { authMiddleware } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { PLANS } from '../constants/plans';
import { stripe, getStripePriceId } from '../services/stripe';
import { pauseCampaign } from '../services/campaign';

const router = Router();

// GET /api/subscription/plans - List available plans (public)
router.get('/plans', (req: Request, res: Response) => {
  const plans = Object.values(PLANS);
  return res.json({
    data: { plans },
  });
});

// POST /api/subscription/select-plan - Select a plan (auth required)
router.post(
  '/select-plan',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.coach) {
        return res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: 'Non authentifie' },
        });
      }

      const validated = SelectPlanSchema.parse(req.body);

      // Verify plan exists
      if (!PLANS[validated.plan]) {
        return res.status(400).json({
          error: { code: 'INVALID_PLAN', message: 'Plan invalide' },
        });
      }

      // Upsert subscription (create or update)
      const subscription = await prisma.subscription.upsert({
        where: { coachId: req.coach.coachId },
        create: {
          coachId: req.coach.coachId,
          plan: validated.plan,
          status: 'pending',
        },
        update: {
          plan: validated.plan,
          status: 'pending',
        },
      });

      return res.status(201).json({
        data: {
          subscription: {
            id: subscription.id,
            plan: subscription.plan,
            status: subscription.status,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/subscription - Get current subscription (auth required)
router.get('/', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.coach) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Non authentifie' },
      });
    }

    const subscription = await prisma.subscription.findUnique({
      where: { coachId: req.coach.coachId },
    });

    if (!subscription) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Aucun abonnement trouve' },
      });
    }

    return res.json({
      data: {
        subscription: {
          id: subscription.id,
          plan: subscription.plan,
          status: subscription.status,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/subscription/create-checkout-session - Create Stripe checkout session
router.post(
  '/create-checkout-session',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.coach) {
        return res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: 'Non authentifie' },
        });
      }

      // Get coach's pending subscription
      const subscription = await prisma.subscription.findUnique({
        where: { coachId: req.coach.coachId },
      });

      if (!subscription) {
        return res.status(400).json({
          error: { code: 'NO_PLAN', message: 'Veuillez d\'abord selectionner un forfait' },
        });
      }

      // Get Stripe price ID for the plan
      const priceId = getStripePriceId(subscription.plan);
      if (!priceId) {
        return res.status(400).json({
          error: { code: 'INVALID_PLAN', message: 'Plan non configure dans Stripe' },
        });
      }

      // Create Stripe checkout session
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        success_url: `${process.env.FRONTEND_URL}/onboarding/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL}/onboarding/payment?canceled=true`,
        client_reference_id: req.coach.coachId,
        metadata: {
          coachId: req.coach.coachId,
          plan: subscription.plan,
        },
      });

      return res.json({
        data: {
          sessionUrl: session.url,
          sessionId: session.id,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/subscription/regenerate-checkout - Create Stripe checkout for video regeneration (5EUR one-shot)
router.post(
  '/regenerate-checkout',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.coach) {
        return res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: 'Non authentifie' },
        });
      }

      // Check if coach has an active subscription
      const subscription = await prisma.subscription.findUnique({
        where: { coachId: req.coach.coachId },
      });

      if (!subscription || subscription.status !== 'active') {
        return res.status(400).json({
          error: { code: 'NO_ACTIVE_SUBSCRIPTION', message: 'Abonnement actif requis' },
        });
      }

      // Check if coach has a completed video (can regenerate)
      const existingVideo = await prisma.videoJob.findFirst({
        where: {
          coachId: req.coach.coachId,
          status: 'completed',
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!existingVideo) {
        return res.status(400).json({
          error: { code: 'NO_VIDEO', message: 'Vous n\'avez pas encore de video a regenerer' },
        });
      }

      // Get regeneration price ID
      const priceId = getStripePriceId('regeneration');
      if (!priceId) {
        return res.status(400).json({
          error: { code: 'PRICE_NOT_CONFIGURED', message: 'Prix regeneration non configure' },
        });
      }

      // Create Stripe checkout session for one-shot payment
      const session = await stripe.checkout.sessions.create({
        mode: 'payment', // One-shot, NOT subscription
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        success_url: `${process.env.FRONTEND_URL}/dashboard/video/regenerate/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL}/dashboard/video?canceled=true`,
        client_reference_id: req.coach.coachId,
        metadata: {
          coachId: req.coach.coachId,
          type: 'video_regeneration',
        },
      });

      return res.json({
        data: {
          sessionUrl: session.url,
          sessionId: session.id,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/subscription/cancel-preview - Get estimated refund before cancellation
router.get(
  '/cancel-preview',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.coach) {
        return res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: 'Non authentifie' },
        });
      }

      // Get coach's subscription
      const subscription = await prisma.subscription.findUnique({
        where: { coachId: req.coach.coachId },
      });

      if (!subscription || subscription.status !== 'active') {
        return res.status(400).json({
          error: { code: 'NO_ACTIVE_SUBSCRIPTION', message: 'Aucun abonnement actif' },
        });
      }

      if (!subscription.stripeSubId) {
        return res.status(400).json({
          error: { code: 'NO_STRIPE_SUB', message: 'Abonnement Stripe non trouve' },
        });
      }

      // Get Stripe subscription details
      const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripeSubId) as unknown as {
        current_period_start: number;
        current_period_end: number;
        items: { data: Array<{ price: { unit_amount: number | null } }> };
      };

      // Calculate prorated refund estimate
      const periodStart = stripeSubscription.current_period_start;
      const periodEnd = stripeSubscription.current_period_end;
      const now = Math.floor(Date.now() / 1000);

      const totalPeriodSeconds = periodEnd - periodStart;
      const usedSeconds = now - periodStart;
      const unusedRatio = Math.max(0, 1 - usedSeconds / totalPeriodSeconds);

      const priceItem = stripeSubscription.items.data[0];
      const monthlyAmount = (priceItem.price.unit_amount || 0) / 100;
      const estimatedRefund = Math.round(monthlyAmount * unusedRatio * 100) / 100;

      const plan = PLANS[subscription.plan];

      return res.json({
        data: {
          subscription: {
            plan: subscription.plan,
            planName: plan?.name || subscription.plan,
            monthlyAmount,
            periodEnd: new Date(periodEnd * 1000).toISOString(),
          },
          refund: {
            estimatedAmount: estimatedRefund,
            unusedDays: Math.round((periodEnd - now) / 86400),
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/subscription/cancel - Cancel subscription with prorated refund
router.post(
  '/cancel',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.coach) {
        return res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: 'Non authentifie' },
        });
      }

      // Get coach's subscription
      const subscription = await prisma.subscription.findUnique({
        where: { coachId: req.coach.coachId },
      });

      if (!subscription || subscription.status !== 'active') {
        return res.status(400).json({
          error: { code: 'NO_ACTIVE_SUBSCRIPTION', message: 'Aucun abonnement actif a annuler' },
        });
      }

      if (!subscription.stripeSubId) {
        return res.status(400).json({
          error: { code: 'NO_STRIPE_SUB', message: 'Abonnement Stripe non trouve' },
        });
      }

      // Cancel Stripe subscription immediately with proration
      const cancelledSubscription = await stripe.subscriptions.cancel(subscription.stripeSubId, {
        prorate: true,
      }) as unknown as { canceled_at: number | null };

      // Update local subscription status
      // Note: Webhook will also update this, but we do it here for immediate feedback
      await prisma.subscription.update({
        where: { coachId: req.coach.coachId },
        data: { status: 'cancelled' },
      });

      console.log(`Subscription cancelled for coach ${req.coach.coachId}`);

      // Story 4.2: Pause campaign when subscription is cancelled
      try {
        await pauseCampaign(req.coach.coachId);
        console.log(`Campaign paused for coach ${req.coach.coachId}`);
      } catch (error) {
        console.error('Failed to pause campaign:', error);
        // Don't block cancellation if campaign pause fails
      }

      // TODO Epic 5: Send cancellation email

      return res.json({
        data: {
          message: 'Abonnement annule avec succes',
          cancelledAt: cancelledSubscription.canceled_at
            ? new Date(cancelledSubscription.canceled_at * 1000).toISOString()
            : new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/subscription/skip-payment - DEV ONLY: Skip payment and activate subscription
router.post(
  '/skip-payment',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Only allow in development
      if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({
          error: { code: 'FORBIDDEN', message: 'Non disponible en production' },
        });
      }

      if (!req.coach) {
        return res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: 'Non authentifie' },
        });
      }

      // Get coach's pending subscription
      const subscription = await prisma.subscription.findUnique({
        where: { coachId: req.coach.coachId },
      });

      if (!subscription) {
        return res.status(400).json({
          error: { code: 'NO_PLAN', message: 'Veuillez d\'abord selectionner un forfait' },
        });
      }

      // Activate subscription directly (skip Stripe)
      const activated = await prisma.subscription.update({
        where: { coachId: req.coach.coachId },
        data: {
          status: 'active',
          stripeSubId: `dev_skip_${Date.now()}`, // Fake Stripe ID for dev
        },
      });

      console.log(`[DEV] Subscription activated without payment for coach ${req.coach.coachId}`);

      return res.json({
        data: {
          subscription: {
            id: activated.id,
            plan: activated.plan,
            status: activated.status,
          },
          message: 'Abonnement active (mode dev)',
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
