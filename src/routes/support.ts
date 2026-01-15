/**
 * Support Routes (Story 5.4)
 *
 * Routes for coach support ticket functionality
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import {
  CreateTicketSchema,
  AddMessageSchema,
  TICKET_STATUS,
} from '../schemas/support';
import { sendNewTicketNotificationToAdmin } from '../services/email';

const router = Router();

// GET /api/support/tickets - List coach's tickets
router.get(
  '/tickets',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.coach) {
        return res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: 'Non authentifié' },
        });
      }

      const tickets = await prisma.supportTicket.findMany({
        where: { coachId: req.coach.coachId },
        orderBy: { updatedAt: 'desc' },
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      return res.json({
        data: {
          tickets: tickets.map((ticket) => ({
            id: ticket.id,
            subject: ticket.subject,
            status: ticket.status,
            lastMessageAt: ticket.messages[0]?.createdAt.toISOString() || ticket.createdAt.toISOString(),
            createdAt: ticket.createdAt.toISOString(),
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/support/tickets - Create a new ticket
router.post(
  '/tickets',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.coach) {
        return res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: 'Non authentifié' },
        });
      }

      const validated = CreateTicketSchema.parse(req.body);

      // Create ticket with initial message
      const ticket = await prisma.supportTicket.create({
        data: {
          coachId: req.coach.coachId,
          subject: validated.subject,
          status: TICKET_STATUS.OPEN,
          messages: {
            create: {
              content: validated.description,
              isAdmin: false,
            },
          },
        },
        include: {
          messages: true,
          coach: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      });

      console.log(`[SUPPORT] New ticket created: ${ticket.id} by coach ${req.coach.coachId}`);

      // Send notification to admin
      await sendNewTicketNotificationToAdmin({
        ticketId: ticket.id,
        subject: ticket.subject,
        description: validated.description,
        coachName: ticket.coach.name,
        coachEmail: ticket.coach.email,
      });

      return res.status(201).json({
        data: {
          ticket: {
            id: ticket.id,
            subject: ticket.subject,
            status: ticket.status,
            createdAt: ticket.createdAt.toISOString(),
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

// GET /api/support/tickets/:id - Get ticket detail with messages
router.get(
  '/tickets/:id',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.coach) {
        return res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: 'Non authentifié' },
        });
      }

      const ticketId = req.params.id;

      const ticket = await prisma.supportTicket.findFirst({
        where: {
          id: ticketId,
          coachId: req.coach.coachId, // Ensure coach owns this ticket
        },
        include: {
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

// POST /api/support/tickets/:id/messages - Add a message to ticket
router.post(
  '/tickets/:id/messages',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.coach) {
        return res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: 'Non authentifié' },
        });
      }

      const ticketId = req.params.id;
      const validated = AddMessageSchema.parse(req.body);

      // Verify ticket belongs to coach
      const ticket = await prisma.supportTicket.findFirst({
        where: {
          id: ticketId,
          coachId: req.coach.coachId,
        },
      });

      if (!ticket) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Ticket non trouvé' },
        });
      }

      // Create message and update ticket timestamp
      const message = await prisma.ticketMessage.create({
        data: {
          ticketId,
          content: validated.content,
          isAdmin: false,
        },
      });

      // Update ticket timestamp
      await prisma.supportTicket.update({
        where: { id: ticketId },
        data: { updatedAt: new Date() },
      });

      console.log(`[SUPPORT] Message added to ticket ${ticketId} by coach`);

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

// POST /api/support/tickets/:id/reopen - Reopen a resolved ticket
router.post(
  '/tickets/:id/reopen',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.coach) {
        return res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: 'Non authentifié' },
        });
      }

      const ticketId = req.params.id;

      // Verify ticket belongs to coach and is resolved
      const ticket = await prisma.supportTicket.findFirst({
        where: {
          id: ticketId,
          coachId: req.coach.coachId,
        },
      });

      if (!ticket) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Ticket non trouvé' },
        });
      }

      if (ticket.status !== TICKET_STATUS.RESOLVED) {
        return res.status(400).json({
          error: { code: 'INVALID_STATUS', message: 'Seuls les tickets résolus peuvent être rouverts' },
        });
      }

      // Reopen ticket
      const updated = await prisma.supportTicket.update({
        where: { id: ticketId },
        data: { status: TICKET_STATUS.OPEN },
      });

      console.log(`[SUPPORT] Ticket ${ticketId} reopened by coach`);

      return res.json({
        data: {
          ticket: {
            id: updated.id,
            status: updated.status,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
