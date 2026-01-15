import { z } from 'zod';

export const PlanSchema = z.enum(['starter', 'pro', 'premium']);

export const SelectPlanSchema = z.object({
  plan: PlanSchema,
});

export type SelectPlanInput = z.infer<typeof SelectPlanSchema>;
