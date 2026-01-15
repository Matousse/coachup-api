import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('Warning: STRIPE_SECRET_KEY not configured');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-12-15.clover',
});

export const STRIPE_PRICES: Record<string, string> = {
  starter: process.env.STRIPE_PRICE_STARTER || '',
  pro: process.env.STRIPE_PRICE_PRO || '',
  premium: process.env.STRIPE_PRICE_PREMIUM || '',
  regeneration: process.env.STRIPE_PRICE_REGENERATION || '',
};

export function getStripePriceId(plan: string): string | null {
  return STRIPE_PRICES[plan] || null;
}
