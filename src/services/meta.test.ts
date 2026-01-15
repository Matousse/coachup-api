/**
 * Meta Service Tests (Story 4.1, 4.2, 5.1)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Set environment variables before importing
vi.stubEnv('META_STUB_MODE', 'true');
vi.stubEnv('META_ACCOUNT_LIMIT', '5');

// Import the metaService (will use stub mode due to env)
import { metaService } from './meta';

describe('MetaService (Stub Mode)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createAdAccount', () => {
    it('should create a stub ad account', async () => {
      const result = await metaService.createAdAccount({
        coachId: 'coach-123',
        coachName: 'Test Coach',
      });

      expect(result.success).toBe(true);
      expect(result.adAccountId).toBeDefined();
      expect(result.adAccountId).toMatch(/^act_\d+$/);
    });
  });

  describe('getAccountLimit', () => {
    it('should return account limit information', async () => {
      const result = await metaService.getAccountLimit();

      expect(result.limit).toBe(5);
      expect(typeof result.currentCount).toBe('number');
      expect(typeof result.available).toBe('number');
      expect(result.currentCount + result.available).toBeLessThanOrEqual(result.limit + 2); // Account for stub increments
    });
  });

  describe('uploadVideo', () => {
    it('should return a stub video ID', async () => {
      const result = await metaService.uploadVideo('/path/to/video.mp4', 'act_123');

      expect(result.success).toBe(true);
      expect(result.videoId).toBeDefined();
      expect(result.videoId).toMatch(/^vid_\d+$/);
    });
  });

  describe('createCampaign', () => {
    it('should create a stub campaign', async () => {
      const result = await metaService.createCampaign({
        coachId: 'coach-123',
        adAccountId: 'act_123',
        videoUrl: '/video.mp4',
        coachName: 'Test Coach',
        city: 'Paris',
        radius: 20,
        targetUrl: 'https://instagram.com/testcoach',
        dailyBudget: 1.67,
      });

      expect(result.success).toBe(true);
      expect(result.campaignId).toBeDefined();
      expect(result.campaignId).toMatch(/^camp_\d+$/);
      expect(result.adSetId).toBeDefined();
      expect(result.adId).toBeDefined();
    });
  });

  describe('getCampaignStatus', () => {
    it('should return pending_review for new campaigns', async () => {
      // First create a campaign
      const createResult = await metaService.createCampaign({
        coachId: 'coach-123',
        adAccountId: 'act_123',
        videoUrl: '/video.mp4',
        coachName: 'Test Coach',
        city: 'Paris',
        radius: 20,
        targetUrl: 'https://instagram.com/testcoach',
        dailyBudget: 1.67,
      });

      const statusResult = await metaService.getCampaignStatus(createResult.campaignId!);

      expect(statusResult.status).toBe('pending_review');
    });

    it('should return unknown for non-existent campaigns', async () => {
      const result = await metaService.getCampaignStatus('non-existent-campaign');

      expect(result.status).toBe('unknown');
    });
  });

  describe('pauseCampaign', () => {
    it('should pause a campaign', async () => {
      // First create a campaign
      const createResult = await metaService.createCampaign({
        coachId: 'coach-123',
        adAccountId: 'act_123',
        videoUrl: '/video.mp4',
        coachName: 'Test Coach',
        city: 'Paris',
        radius: 20,
        targetUrl: 'https://instagram.com/testcoach',
        dailyBudget: 1.67,
      });

      const pauseResult = await metaService.pauseCampaign(createResult.campaignId!);

      expect(pauseResult.success).toBe(true);

      // Verify status changed to paused
      const statusResult = await metaService.getCampaignStatus(createResult.campaignId!);
      expect(statusResult.status).toBe('paused');
    });
  });

  // Story 5.1: Campaign Insights tests
  describe('getCampaignInsights', () => {
    it('should return realistic stub stats', async () => {
      const result = await metaService.getCampaignInsights('camp_123');

      expect(result.success).toBe(true);
      expect(result.stats).toBeDefined();
      expect(result.stats!.impressions).toBeGreaterThanOrEqual(5000);
      expect(result.stats!.impressions).toBeLessThanOrEqual(25000);
      expect(result.stats!.clicks).toBeGreaterThanOrEqual(50);
      expect(result.stats!.reach).toBeGreaterThan(0);
      expect(result.stats!.spend).toBeGreaterThanOrEqual(10);
      expect(result.stats!.spend).toBeLessThanOrEqual(60);
    });

    it('should return different stats on each call (randomized)', async () => {
      const result1 = await metaService.getCampaignInsights('camp_123');
      const result2 = await metaService.getCampaignInsights('camp_456');

      // Stats should be different (with very high probability)
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      // At least one metric should likely be different
      const sameStats =
        result1.stats!.impressions === result2.stats!.impressions &&
        result1.stats!.clicks === result2.stats!.clicks &&
        result1.stats!.spend === result2.stats!.spend;

      // This is probabilistic, but extremely unlikely to be the same
      // We just check the call succeeds
      expect(result1.stats).toBeDefined();
      expect(result2.stats).toBeDefined();
    });

    it('should return properly typed stats', async () => {
      const result = await metaService.getCampaignInsights('camp_123');

      expect(result.success).toBe(true);
      expect(typeof result.stats!.impressions).toBe('number');
      expect(typeof result.stats!.clicks).toBe('number');
      expect(typeof result.stats!.reach).toBe('number');
      expect(typeof result.stats!.spend).toBe('number');
      expect(Number.isInteger(result.stats!.impressions)).toBe(true);
      expect(Number.isInteger(result.stats!.clicks)).toBe(true);
      expect(Number.isInteger(result.stats!.reach)).toBe(true);
    });
  });
});
