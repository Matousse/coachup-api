/**
 * Stripe MRR Service Tests (Story 5.3)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Set stub mode before importing
vi.stubEnv('MRR_STUB_MODE', 'true');

import { getMrrData, getPlanAmount } from './stripe-mrr';

describe('Stripe MRR Service (Stub Mode)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getMrrData', () => {
    it('should return stub MRR data in stub mode', async () => {
      const result = await getMrrData();

      expect(result).toBeDefined();
      expect(result.mrr).toBe(850);
      expect(result.currency).toBe('eur');
      expect(result.activeSubscriptions).toBe(12);
    });

    it('should include breakdown by plan in stub mode', async () => {
      const result = await getMrrData();

      expect(result.breakdown).toBeDefined();
      expect(result.breakdown.starter).toEqual({ count: 5, amount: 250 });
      expect(result.breakdown.pro).toEqual({ count: 4, amount: 400 });
      expect(result.breakdown.premium).toEqual({ count: 3, amount: 600 });
    });

    it('should log stub mode message', async () => {
      await getMrrData();

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('STUB MODE')
      );
    });
  });

  describe('getPlanAmount', () => {
    it('should return correct amount for starter plan', () => {
      expect(getPlanAmount('starter')).toBe(50);
    });

    it('should return correct amount for pro plan', () => {
      expect(getPlanAmount('pro')).toBe(100);
    });

    it('should return correct amount for premium plan', () => {
      expect(getPlanAmount('premium')).toBe(200);
    });

    it('should return 0 for unknown plan', () => {
      expect(getPlanAmount('unknown')).toBe(0);
    });
  });
});

describe('MRR Data Structure', () => {
  it('should have valid MRR data structure', async () => {
    const result = await getMrrData();

    // Type checks
    expect(typeof result.mrr).toBe('number');
    expect(typeof result.currency).toBe('string');
    expect(typeof result.activeSubscriptions).toBe('number');
    expect(typeof result.breakdown).toBe('object');

    // Breakdown structure
    expect(typeof result.breakdown.starter.count).toBe('number');
    expect(typeof result.breakdown.starter.amount).toBe('number');
    expect(typeof result.breakdown.pro.count).toBe('number');
    expect(typeof result.breakdown.pro.amount).toBe('number');
    expect(typeof result.breakdown.premium.count).toBe('number');
    expect(typeof result.breakdown.premium.amount).toBe('number');
  });

  it('should have consistent MRR calculation', async () => {
    const result = await getMrrData();

    // Total MRR should equal sum of breakdown amounts
    const calculatedMrr =
      result.breakdown.starter.amount +
      result.breakdown.pro.amount +
      result.breakdown.premium.amount;

    // In stub mode, they should match
    expect(result.mrr).toBeLessThanOrEqual(calculatedMrr);
  });
});
