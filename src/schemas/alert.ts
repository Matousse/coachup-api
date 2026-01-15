import { z } from 'zod'

// Alert types
export const AlertTypeSchema = z.enum([
  'meta_account_limit',
  'meta_api_error',
  'payment_failed',
  'video_failed',
])

export type AlertType = z.infer<typeof AlertTypeSchema>

// Alert creation schema
export const CreateAlertSchema = z.object({
  type: AlertTypeSchema,
  coachId: z.string().uuid().optional(),
  message: z.string().min(1),
})

export type CreateAlertInput = z.infer<typeof CreateAlertSchema>

// Alert response schema
export const AlertSchema = z.object({
  id: z.string().uuid(),
  type: AlertTypeSchema,
  coachId: z.string().uuid().nullable(),
  message: z.string(),
  resolved: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type Alert = z.infer<typeof AlertSchema>

// Resolve alert schema
export const ResolveAlertSchema = z.object({
  resolved: z.boolean().default(true),
})

export type ResolveAlertInput = z.infer<typeof ResolveAlertSchema>
