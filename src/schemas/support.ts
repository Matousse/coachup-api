/**
 * Support Ticket Schemas (Story 5.4)
 *
 * Zod validation schemas for support ticket endpoints
 */

import { z } from 'zod';

// Schema for creating a new ticket
export const CreateTicketSchema = z.object({
  subject: z.string().min(5, 'Le sujet doit contenir au moins 5 caractères').max(200),
  description: z.string().min(10, 'La description doit contenir au moins 10 caractères').max(5000),
});

// Schema for adding a message to a ticket
export const AddMessageSchema = z.object({
  content: z.string().min(1, 'Le message ne peut pas être vide').max(5000),
});

// Schema for updating ticket status (admin only)
export const UpdateStatusSchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved'], {
    errorMap: () => ({ message: 'Statut invalide' }),
  }),
});

// Query schema for listing tickets
export const TicketsQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
  status: z.enum(['open', 'in_progress', 'resolved', 'all']).optional(),
});

// Ticket status constants
export const TICKET_STATUS = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  RESOLVED: 'resolved',
} as const;

export type TicketStatus = (typeof TICKET_STATUS)[keyof typeof TICKET_STATUS];
