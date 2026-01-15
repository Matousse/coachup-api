/**
 * Campaign Stats Sync Job Tests (Story 5.1)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock prisma
vi.mock('../lib/prisma', () => ({
  prisma: {
    campaign: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    campaignStats: {
      upsert: vi.fn(),
    },
  },
}));

// Mock meta service
vi.mock('../services/meta', () => ({
  metaService: {
    getCampaignInsights: vi.fn(),
  },
}));

import { prisma } from '../lib/prisma';
import { metaService } from '../services/meta';
import {
  triggerStatsSync,
  syncSingleCampaignStats,
} from './campaign-stats-sync';

describe('campaign-stats-sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('triggerStatsSync', () => {
    it('should sync stats for all active campaigns', async () => {
      const mockCampaigns = [
        {
          id: 'campaign-1',
          coachId: 'coach-1',
          metaCampaignId: 'meta-camp-1',
          status: 'active',
          stats: null,
          coach: { id: 'coach-1', name: 'Coach 1' },
        },
        {
          id: 'campaign-2',
          coachId: 'coach-2',
          metaCampaignId: 'meta-camp-2',
          status: 'active',
          stats: { id: 'stats-1' },
          coach: { id: 'coach-2', name: 'Coach 2' },
        },
      ];

      vi.mocked(prisma.campaign.findMany).mockResolvedValue(mockCampaigns as unknown as never[]);
      vi.mocked(metaService.getCampaignInsights).mockResolvedValue({
        success: true,
        stats: {
          impressions: 15000,
          clicks: 300,
          reach: 12000,
          spend: 25.50,
        },
      });
      vi.mocked(prisma.campaignStats.upsert).mockResolvedValue({} as unknown as never);

      await triggerStatsSync();

      // Should find active campaigns
      expect(prisma.campaign.findMany).toHaveBeenCalledWith({
        where: {
          status: 'active',
          metaCampaignId: { not: null },
        },
        include: {
          stats: true,
          coach: { select: { id: true, name: true } },
        },
      });

      // Should fetch insights for each campaign
      expect(metaService.getCampaignInsights).toHaveBeenCalledTimes(2);
      expect(metaService.getCampaignInsights).toHaveBeenCalledWith('meta-camp-1');
      expect(metaService.getCampaignInsights).toHaveBeenCalledWith('meta-camp-2');

      // Should upsert stats for each campaign
      expect(prisma.campaignStats.upsert).toHaveBeenCalledTimes(2);
    });

    it('should skip campaigns without Meta campaign ID', async () => {
      const mockCampaigns = [
        {
          id: 'campaign-1',
          coachId: 'coach-1',
          metaCampaignId: null, // No Meta ID
          status: 'active',
          stats: null,
          coach: { id: 'coach-1', name: 'Coach 1' },
        },
      ];

      vi.mocked(prisma.campaign.findMany).mockResolvedValue(mockCampaigns as unknown as never[]);

      await triggerStatsSync();

      // Should not call getCampaignInsights for campaigns without Meta ID
      expect(metaService.getCampaignInsights).not.toHaveBeenCalled();
    });

    it('should handle API errors gracefully', async () => {
      const mockCampaigns = [
        {
          id: 'campaign-1',
          coachId: 'coach-1',
          metaCampaignId: 'meta-camp-1',
          status: 'active',
          stats: null,
          coach: { id: 'coach-1', name: 'Coach 1' },
        },
      ];

      vi.mocked(prisma.campaign.findMany).mockResolvedValue(mockCampaigns as unknown as never[]);
      vi.mocked(metaService.getCampaignInsights).mockResolvedValue({
        success: false,
        error: 'API error',
      });

      // Should not throw
      await expect(triggerStatsSync()).resolves.not.toThrow();

      // Should not upsert stats on error
      expect(prisma.campaignStats.upsert).not.toHaveBeenCalled();
    });

    it('should do nothing when no active campaigns exist', async () => {
      vi.mocked(prisma.campaign.findMany).mockResolvedValue([]);

      await triggerStatsSync();

      expect(metaService.getCampaignInsights).not.toHaveBeenCalled();
      expect(prisma.campaignStats.upsert).not.toHaveBeenCalled();
    });
  });

  describe('syncSingleCampaignStats', () => {
    it('should sync stats for a single campaign', async () => {
      const mockCampaign = {
        id: 'campaign-1',
        metaCampaignId: 'meta-camp-1',
        coach: { name: 'Test Coach' },
      };

      vi.mocked(prisma.campaign.findUnique).mockResolvedValue(mockCampaign as unknown as null);
      vi.mocked(metaService.getCampaignInsights).mockResolvedValue({
        success: true,
        stats: {
          impressions: 10000,
          clicks: 200,
          reach: 8000,
          spend: 20.00,
        },
      });
      vi.mocked(prisma.campaignStats.upsert).mockResolvedValue({} as unknown as never);

      const result = await syncSingleCampaignStats('campaign-1');

      expect(result).toBe(true);
      expect(prisma.campaign.findUnique).toHaveBeenCalledWith({
        where: { id: 'campaign-1' },
        include: { coach: { select: { name: true } } },
      });
      expect(metaService.getCampaignInsights).toHaveBeenCalledWith('meta-camp-1');
      expect(prisma.campaignStats.upsert).toHaveBeenCalled();
    });

    it('should return false for non-existent campaign', async () => {
      vi.mocked(prisma.campaign.findUnique).mockResolvedValue(null);

      const result = await syncSingleCampaignStats('non-existent');

      expect(result).toBe(false);
      expect(metaService.getCampaignInsights).not.toHaveBeenCalled();
    });

    it('should return false for campaign without Meta ID', async () => {
      const mockCampaign = {
        id: 'campaign-1',
        metaCampaignId: null,
        coach: { name: 'Test Coach' },
      };

      vi.mocked(prisma.campaign.findUnique).mockResolvedValue(mockCampaign as unknown as null);

      const result = await syncSingleCampaignStats('campaign-1');

      expect(result).toBe(false);
      expect(metaService.getCampaignInsights).not.toHaveBeenCalled();
    });

    it('should calculate CTR and CPC correctly', async () => {
      const mockCampaign = {
        id: 'campaign-1',
        metaCampaignId: 'meta-camp-1',
        coach: { name: 'Test Coach' },
      };

      vi.mocked(prisma.campaign.findUnique).mockResolvedValue(mockCampaign as unknown as null);
      vi.mocked(metaService.getCampaignInsights).mockResolvedValue({
        success: true,
        stats: {
          impressions: 10000,
          clicks: 200,
          reach: 8000,
          spend: 20.00,
        },
      });
      vi.mocked(prisma.campaignStats.upsert).mockResolvedValue({} as unknown as never);

      await syncSingleCampaignStats('campaign-1');

      // Check that upsert was called with calculated CTR and CPC
      const upsertCall = vi.mocked(prisma.campaignStats.upsert).mock.calls[0][0];
      expect(upsertCall.create.ctr).toBe(2); // (200/10000) * 100 = 2%
      expect(upsertCall.create.cpc).toBe(0.1); // 20/200 = 0.1 EUR
    });

    it('should handle zero impressions for CTR calculation', async () => {
      const mockCampaign = {
        id: 'campaign-1',
        metaCampaignId: 'meta-camp-1',
        coach: { name: 'Test Coach' },
      };

      vi.mocked(prisma.campaign.findUnique).mockResolvedValue(mockCampaign as unknown as null);
      vi.mocked(metaService.getCampaignInsights).mockResolvedValue({
        success: true,
        stats: {
          impressions: 0,
          clicks: 0,
          reach: 0,
          spend: 0,
        },
      });
      vi.mocked(prisma.campaignStats.upsert).mockResolvedValue({} as unknown as never);

      await syncSingleCampaignStats('campaign-1');

      const upsertCall = vi.mocked(prisma.campaignStats.upsert).mock.calls[0][0];
      expect(upsertCall.create.ctr).toBeNull();
      expect(upsertCall.create.cpc).toBeNull();
    });
  });
});
