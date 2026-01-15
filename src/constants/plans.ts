export interface Plan {
  id: string;
  name: string;
  price: number;
  adBudget: number;
  features: string[];
  recommended?: boolean;
}

export const PLANS: Record<string, Plan> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    price: 50,
    adBudget: 25,
    features: ['1 video publicitaire', 'Ciblage geographique', 'Dashboard basique'],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: 100,
    adBudget: 50,
    features: [
      '1 video publicitaire',
      'Ciblage geographique',
      'Dashboard complet',
      'Support prioritaire',
    ],
    recommended: true,
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    price: 200,
    adBudget: 100,
    features: [
      '1 video publicitaire',
      'Ciblage geographique etendu',
      'Dashboard complet',
      'Support VIP',
      'Regeneration offerte',
    ],
  },
};

export const PLAN_IDS = ['starter', 'pro', 'premium'] as const;
export type PlanId = (typeof PLAN_IDS)[number];
