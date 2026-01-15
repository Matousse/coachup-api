/**
 * Stripe MRR (Monthly Recurring Revenue) Service (Story 5.3)
 *
 * Calculates MRR from active Stripe subscriptions
 * Supports stub mode for development without real Stripe calls
 */

import { stripe, STRIPE_PRICES } from './stripe';

// Plan amounts in EUR (monthly)
const PLAN_AMOUNTS: Record<string, number> = {
  starter: 50,
  pro: 100,
  premium: 200,
};

export interface MrrBreakdown {
  count: number;
  amount: number;
}

export interface MrrData {
  mrr: number;
  currency: string;
  activeSubscriptions: number;
  breakdown: {
    starter: MrrBreakdown;
    pro: MrrBreakdown;
    premium: MrrBreakdown;
  };
}

// Stub mode flag - when true, returns simulated data
const MRR_STUB_MODE = process.env.MRR_STUB_MODE === 'true';

/**
 * Get MRR data - either from Stripe API or stub data
 */
export async function getMrrData(): Promise<MrrData> {
  if (MRR_STUB_MODE) {
    return getStubMrrData();
  }

  return getRealMrrData();
}

/**
 * Get stub MRR data for development
 */
function getStubMrrData(): MrrData {
  console.log('[MRR Service] STUB MODE: Returning simulated MRR data');

  return {
    mrr: 850,
    currency: 'eur',
    activeSubscriptions: 12,
    breakdown: {
      starter: { count: 5, amount: 250 },
      pro: { count: 4, amount: 400 },
      premium: { count: 3, amount: 600 },
    },
  };
}

/**
 * Get real MRR data from Stripe API
 */
async function getRealMrrData(): Promise<MrrData> {
  console.log('[MRR Service] Fetching MRR from Stripe API...');

  try {
    // Get all active subscriptions
    const subscriptions = await stripe.subscriptions.list({
      status: 'active',
      limit: 100,
      expand: ['data.items.data.price'],
    });

    // Initialize breakdown
    const breakdown: MrrData['breakdown'] = {
      starter: { count: 0, amount: 0 },
      pro: { count: 0, amount: 0 },
      premium: { count: 0, amount: 0 },
    };

    let totalMrr = 0;

    // Process each subscription
    for (const subscription of subscriptions.data) {
      const item = subscription.items.data[0];
      if (!item?.price) continue;

      const priceId = item.price.id;
      let plan: keyof typeof breakdown | null = null;

      // Determine which plan this subscription belongs to
      if (priceId === STRIPE_PRICES.starter) {
        plan = 'starter';
      } else if (priceId === STRIPE_PRICES.pro) {
        plan = 'pro';
      } else if (priceId === STRIPE_PRICES.premium) {
        plan = 'premium';
      }

      if (plan) {
        const amount = PLAN_AMOUNTS[plan];
        breakdown[plan].count++;
        breakdown[plan].amount += amount;
        totalMrr += amount;
      }
    }

    console.log(`[MRR Service] Calculated MRR: ${totalMrr} EUR from ${subscriptions.data.length} subscriptions`);

    return {
      mrr: totalMrr,
      currency: 'eur',
      activeSubscriptions: subscriptions.data.length,
      breakdown,
    };
  } catch (error) {
    console.error('[MRR Service] Error fetching MRR from Stripe:', error);
    throw error;
  }
}

/**
 * Get MRR for a specific plan
 */
export function getPlanAmount(plan: string): number {
  return PLAN_AMOUNTS[plan] || 0;
}
