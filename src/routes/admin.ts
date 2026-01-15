/**
 * Admin Routes (Story 4.1)
 *
 * Routes for admin dashboard functionality
 * Includes alert management and queue processing
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { processQueuedCoaches, getQueueStatus } from '../services/meta-account';
import { getMrrData } from '../services/stripe-mrr';
import {
  TicketsQuerySchema,
  AddMessageSchema,
  UpdateStatusSchema,
  TICKET_STATUS,
} from '../schemas/support';
import { sendTicketReplyNotification } from '../services/email';

const router = Router();

// TODO: Add proper admin authentication middleware (Story 5.3)
// For now, using the same auth middleware but checking email against admin list
const ADMIN_EMAILS = ['damien@coachup.fr', 'admin@coachup.fr'];

const adminMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.coach) {
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Non authentifié' },
    });
  }

  // Check if user is admin
  const coach = await prisma.coach.findUnique({
    where: { id: req.coach.coachId },
    select: { email: true },
  });

  if (!coach || !ADMIN_EMAILS.includes(coach.email)) {
    return res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'Accès admin requis' },
    });
  }

  next();
};

// GET /api/admin/alerts - List unresolved alerts
router.get(
  '/alerts',
  authMiddleware,
  adminMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const resolved = req.query.resolved === 'true';

      const alerts = await prisma.alert.findMany({
        where: { resolved },
        include: {
          coach: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return res.json({
        data: {
          alerts: alerts.map(alert => ({
            id: alert.id,
            type: alert.type,
            message: alert.message,
            resolved: alert.resolved,
            createdAt: alert.createdAt.toISOString(),
            coach: alert.coach
              ? {
                  id: alert.coach.id,
                  name: alert.coach.name,
                  email: alert.coach.email,
                }
              : null,
          })),
          count: alerts.length,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/admin/alerts/:id/resolve - Mark an alert as resolved
router.put(
  '/alerts/:id/resolve',
  authMiddleware,
  adminMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const alertId = req.params.id;

      const alert = await prisma.alert.findUnique({
        where: { id: alertId },
      });

      if (!alert) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Alerte non trouvée' },
        });
      }

      const updated = await prisma.alert.update({
        where: { id: alertId },
        data: { resolved: true },
      });

      console.log(`Alert resolved: ${alertId} (${alert.type})`);

      return res.json({
        data: {
          alert: {
            id: updated.id,
            type: updated.type,
            resolved: updated.resolved,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/admin/meta/queue - Get Meta queue status
router.get(
  '/meta/queue',
  authMiddleware,
  adminMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const status = await getQueueStatus();

      // Get queued coaches
      const queuedCoaches = await prisma.coach.findMany({
        where: { queuedForMeta: true },
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      });

      return res.json({
        data: {
          queuedCount: status.queuedCount,
          availableSlots: status.availableSlots,
          limit: status.limit,
          queuedCoaches: queuedCoaches.map(coach => ({
            id: coach.id,
            name: coach.name,
            email: coach.email,
            queuedSince: coach.createdAt.toISOString(),
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/admin/meta/process-queue - Process queued coaches
router.post(
  '/meta/process-queue',
  authMiddleware,
  adminMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const processed = await processQueuedCoaches();

      return res.json({
        data: {
          processed,
          message: `${processed} coach(es) traité(s)`,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/admin/stats - Get admin dashboard stats
router.get(
  '/stats',
  authMiddleware,
  adminMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const [
        totalCoaches,
        activeSubscriptions,
        pendingAlerts,
        queuedForMeta,
        coachesWithMetaAccount,
        activeCampaigns,
        cancelledSubscriptions,
      ] = await Promise.all([
        prisma.coach.count(),
        prisma.subscription.count({ where: { status: 'active' } }),
        prisma.alert.count({ where: { resolved: false } }),
        prisma.coach.count({ where: { queuedForMeta: true } }),
        prisma.coach.count({ where: { metaAdAccountId: { not: null } } }),
        prisma.campaign.count({ where: { status: 'active' } }),
        prisma.subscription.count({ where: { status: 'cancelled' } }),
      ]);

      return res.json({
        data: {
          totalCoaches,
          activeSubscriptions,
          cancelledSubscriptions,
          pendingAlerts,
          activeCampaigns,
          meta: {
            queuedForMeta,
            withMetaAccount: coachesWithMetaAccount,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// Story 5.3: Admin Dashboard Routes
// ============================================

// Query schema for coaches list
const CoachesQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
  status: z.enum(['active', 'cancelled', 'inactive', 'all']).optional(),
  search: z.string().optional(),
});

// GET /api/admin/coaches - List coaches with pagination and filters
router.get(
  '/coaches',
  authMiddleware,
  adminMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = CoachesQuerySchema.parse(req.query);
      const { page, pageSize, status, search } = query;

      // Build where clause
      const where: Record<string, unknown> = {};

      // Filter by subscription status
      if (status && status !== 'all') {
        if (status === 'inactive') {
          // Coaches without subscription
          where.subscription = null;
        } else {
          where.subscription = { status };
        }
      }

      // Search by name or email
      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ];
      }

      // Get total count and coaches
      const [total, coaches] = await Promise.all([
        prisma.coach.count({ where }),
        prisma.coach.findMany({
          where,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { createdAt: 'desc' },
          include: {
            subscription: {
              select: {
                plan: true,
                status: true,
              },
            },
            campaign: {
              select: {
                status: true,
              },
            },
          },
        }),
      ]);

      const totalPages = Math.ceil(total / pageSize);

      return res.json({
        data: {
          coaches: coaches.map(coach => ({
            id: coach.id,
            name: coach.name,
            email: coach.email,
            phone: coach.phone,
            subscription: coach.subscription
              ? {
                  plan: coach.subscription.plan,
                  status: coach.subscription.status,
                }
              : null,
            campaign: coach.campaign
              ? {
                  status: coach.campaign.status,
                }
              : null,
            createdAt: coach.createdAt.toISOString(),
          })),
          pagination: {
            page,
            pageSize,
            total,
            totalPages,
          },
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: error.errors[0].message },
        });
      }
      next(error);
    }
  }
);

// GET /api/admin/coaches/:id - Get coach detail
router.get(
  '/coaches/:id',
  authMiddleware,
  adminMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const coachId = req.params.id;

      const coach = await prisma.coach.findUnique({
        where: { id: coachId },
        include: {
          subscription: true,
          campaign: {
            include: {
              stats: true,
            },
          },
          videoJobs: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          photos: {
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
          alerts: {
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
        },
      });

      if (!coach) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Coach non trouvé' },
        });
      }

      const latestVideoJob = coach.videoJobs[0] || null;

      return res.json({
        data: {
          coach: {
            id: coach.id,
            email: coach.email,
            name: coach.name,
            phone: coach.phone,
            description: coach.description,
            specialty: coach.specialty,
            city: coach.city,
            radius: coach.radius,
            instagramUrl: coach.instagramUrl,
            websiteUrl: coach.websiteUrl,
            metaAdAccountId: coach.metaAdAccountId,
            queuedForMeta: coach.queuedForMeta,
            emailWeeklyRecap: coach.emailWeeklyRecap,
            emailCampaignLive: coach.emailCampaignLive,
            subscription: coach.subscription
              ? {
                  id: coach.subscription.id,
                  plan: coach.subscription.plan,
                  status: coach.subscription.status,
                  stripeSubId: coach.subscription.stripeSubId,
                  createdAt: coach.subscription.createdAt.toISOString(),
                }
              : null,
            campaign: coach.campaign
              ? {
                  id: coach.campaign.id,
                  status: coach.campaign.status,
                  dailyBudget: coach.campaign.dailyBudget,
                  rejectReason: coach.campaign.rejectReason,
                  launchedAt: coach.campaign.launchedAt?.toISOString() || null,
                  stats: coach.campaign.stats
                    ? {
                        impressions: coach.campaign.stats.impressions,
                        clicks: coach.campaign.stats.clicks,
                        reach: coach.campaign.stats.reach,
                        spend: coach.campaign.stats.spend,
                        ctr: coach.campaign.stats.ctr,
                        cpc: coach.campaign.stats.cpc,
                      }
                    : null,
                }
              : null,
            latestVideoJob: latestVideoJob
              ? {
                  id: latestVideoJob.id,
                  status: latestVideoJob.status,
                  mode: latestVideoJob.mode,
                  template: latestVideoJob.template,
                  videoUrl: latestVideoJob.videoUrl,
                  error: latestVideoJob.error,
                  createdAt: latestVideoJob.createdAt.toISOString(),
                }
              : null,
            photos: coach.photos.map(photo => ({
              id: photo.id,
              url: photo.url,
              filename: photo.filename,
            })),
            recentAlerts: coach.alerts.map(alert => ({
              id: alert.id,
              type: alert.type,
              message: alert.message,
              resolved: alert.resolved,
              createdAt: alert.createdAt.toISOString(),
            })),
            createdAt: coach.createdAt.toISOString(),
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/admin/mrr - Get MRR data from Stripe
router.get(
  '/mrr',
  authMiddleware,
  adminMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const mrrData = await getMrrData();

      return res.json({
        data: mrrData,
      });
    } catch (error) {
      console.error('[Admin] Error fetching MRR:', error);
      next(error);
    }
  }
);

// ============================================
// Story 5.4: Admin Ticket Routes
// ============================================

// GET /api/admin/tickets - List all tickets with pagination and filters
router.get(
  '/tickets',
  authMiddleware,
  adminMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = TicketsQuerySchema.parse(req.query);
      const { page, pageSize, status } = query;

      // Build where clause
      const where: Record<string, unknown> = {};
      if (status && status !== 'all') {
        where.status = status;
      }

      // Get total count and tickets
      const [total, tickets] = await Promise.all([
        prisma.supportTicket.count({ where }),
        prisma.supportTicket.findMany({
          where,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { updatedAt: 'desc' },
          include: {
            coach: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
            _count: {
              select: { messages: true },
            },
          },
        }),
      ]);

      const totalPages = Math.ceil(total / pageSize);

      return res.json({
        data: {
          tickets: tickets.map((ticket) => ({
            id: ticket.id,
            subject: ticket.subject,
            status: ticket.status,
            coach: {
              id: ticket.coach.id,
              name: ticket.coach.name,
              email: ticket.coach.email,
            },
            messageCount: ticket._count.messages,
            lastMessageAt: ticket.messages[0]?.createdAt.toISOString() || ticket.createdAt.toISOString(),
            createdAt: ticket.createdAt.toISOString(),
          })),
          pagination: {
            page,
            pageSize,
            total,
            totalPages,
          },
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: error.errors[0].message },
        });
      }
      next(error);
    }
  }
);

// GET /api/admin/tickets/:id - Get ticket detail with messages
router.get(
  '/tickets/:id',
  authMiddleware,
  adminMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ticketId = req.params.id;

      const ticket = await prisma.supportTicket.findUnique({
        where: { id: ticketId },
        include: {
          coach: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          messages: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      if (!ticket) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Ticket non trouvé' },
        });
      }

      return res.json({
        data: {
          ticket: {
            id: ticket.id,
            subject: ticket.subject,
            status: ticket.status,
            coach: {
              id: ticket.coach.id,
              name: ticket.coach.name,
              email: ticket.coach.email,
            },
            messages: ticket.messages.map((msg) => ({
              id: msg.id,
              content: msg.content,
              isAdmin: msg.isAdmin,
              createdAt: msg.createdAt.toISOString(),
            })),
            createdAt: ticket.createdAt.toISOString(),
            updatedAt: ticket.updatedAt.toISOString(),
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/admin/tickets/:id/messages - Admin reply to ticket
router.post(
  '/tickets/:id/messages',
  authMiddleware,
  adminMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ticketId = req.params.id;
      const validated = AddMessageSchema.parse(req.body);

      // Verify ticket exists
      const ticket = await prisma.supportTicket.findUnique({
        where: { id: ticketId },
        include: {
          coach: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      if (!ticket) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Ticket non trouvé' },
        });
      }

      // Create admin message
      const message = await prisma.ticketMessage.create({
        data: {
          ticketId,
          content: validated.content,
          isAdmin: true,
        },
      });

      // Update ticket timestamp and set status to in_progress if open
      const newStatus = ticket.status === TICKET_STATUS.OPEN ? TICKET_STATUS.IN_PROGRESS : ticket.status;
      await prisma.supportTicket.update({
        where: { id: ticketId },
        data: {
          updatedAt: new Date(),
          status: newStatus,
        },
      });

      console.log(`[ADMIN] Reply added to ticket ${ticketId}`);

      // Send notification to coach
      await sendTicketReplyNotification({
        ticketId: ticket.id,
        subject: ticket.subject,
        replyContent: validated.content,
        coachName: ticket.coach.name,
        coachEmail: ticket.coach.email,
      });

      return res.status(201).json({
        data: {
          message: {
            id: message.id,
            content: message.content,
            isAdmin: message.isAdmin,
            createdAt: message.createdAt.toISOString(),
          },
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: error.errors[0].message },
        });
      }
      next(error);
    }
  }
);

// PUT /api/admin/tickets/:id/status - Update ticket status
router.put(
  '/tickets/:id/status',
  authMiddleware,
  adminMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ticketId = req.params.id;
      const validated = UpdateStatusSchema.parse(req.body);

      // Verify ticket exists
      const ticket = await prisma.supportTicket.findUnique({
        where: { id: ticketId },
      });

      if (!ticket) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Ticket non trouvé' },
        });
      }

      // Update status
      const updated = await prisma.supportTicket.update({
        where: { id: ticketId },
        data: { status: validated.status },
      });

      console.log(`[ADMIN] Ticket ${ticketId} status changed to ${validated.status}`);

      return res.json({
        data: {
          ticket: {
            id: updated.id,
            status: updated.status,
          },
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: error.errors[0].message },
        });
      }
      next(error);
    }
  }
);

export default router;
