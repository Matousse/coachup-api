import { z } from 'zod';

export const ProfileSchema = z.object({
  description: z.string().optional().default(''),
  specialty: z.string().min(1, 'Spécialité requise'),
  city: z.string().min(2, 'Ville requise'),
  radius: z.number().min(1, 'Rayon minimum 1km').max(100, 'Rayon maximum 100km'),
  instagramUrl: z.string().url('URL Instagram invalide').nullish().or(z.literal('')),
  websiteUrl: z.string().url('URL site web invalide').nullish().or(z.literal('')),
});

export type ProfileInput = z.infer<typeof ProfileSchema>;

// Email preferences schema (Story 5.2)
export const EmailPreferencesSchema = z.object({
  emailWeeklyRecap: z.boolean().optional(),
  emailCampaignLive: z.boolean().optional(),
});

export type EmailPreferencesInput = z.infer<typeof EmailPreferencesSchema>;
