import { z } from 'zod';

export const RegisterSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères'),
  name: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
  phone: z.string().min(10, 'Numéro de téléphone invalide'),
});

export const LoginSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
