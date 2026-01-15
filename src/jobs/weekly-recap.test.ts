/**
 * Weekly Recap Job Tests (Story 5.2)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock prisma
vi.mock('../lib/prisma', () => ({
  prisma: {
    coach: {
      findMany: vi.fn(),
    },
    campaign: {
      findUnique: vi.fn(),
    },
  },
}));

// Mock email service
vi.mock('../services/email', () => ({
  sendWeeklyRecap: vi.fn(),
}));

import { prisma } from '../lib/prisma';
import { sendWeeklyRecap } from '../services/email';
import { triggerWeeklyRecap } from './weekly-recap';

describe('weekly-recap job', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('triggerWeeklyRecap', () => {
    it('should send recap emails to coaches with active campaigns', async () => {
      const mockCoaches = [
        {
          id: 'coach-1',
          email: 'coach1@test.com',
          name: 'Coach 1',
          emailWeeklyRecap: true,
          campaign: {
            id: 'campaign-1',
            status: 'active',
            stats: {
              impressions: 10000,
              clicks: 200,
              reach: 8000,
              spend: 25.50,
            },
          },
        },
        {
          id: 'coach-2',
          email: 'coach2@test.com',
          name: 'Coach 2',
          emailWeeklyRecap: true,
          campaign: {
            id: 'campaign-2',
            status: 'active',
            stats: {
              impressions: 5000,
              clicks: 100,
              reach: 4000,
              spend: 15.00,
            },
          },
        },
      ];

      vi.mocked(prisma.coach.findMany).mockResolvedValue(mockCoaches as unknown as never[]);
      vi.mocked(prisma.campaign.findUnique).mockImplementation(({ where }) => {
        const campaign = mockCoaches.find(c => c.campaign?.id === where.id)?.campaign;
        return Promise.resolve(campaign as unknown as null);
      });
      vi.mocked(sendWeeklyRecap).mockResolvedValue(true);

      await triggerWeeklyRecap();

      // Should query for coaches with active campaigns and email preference
      expect(prisma.coach.findMany).toHaveBeenCalledWith({
        where: {
          emailWeeklyRecap: true,
          campaign: {
            status: 'active',
          },
        },
        include: {
          campaign: {
            include: {
              stats: true,
            },
          },
        },
      });

      // Should send recap to each coach
      expect(sendWeeklyRecap).toHaveBeenCalledTimes(2);
    });

    it('should not send recap to coaches with emailWeeklyRecap disabled', async () => {
      // No coaches match because the query filters by emailWeeklyRecap: true
      vi.mocked(prisma.coach.findMany).mockResolvedValue([]);

      await triggerWeeklyRecap();

      expect(sendWeeklyRecap).not.toHaveBeenCalled();
    });

    it('should not send recap when no active campaigns exist', async () => {
      vi.mocked(prisma.coach.findMany).mockResolvedValue([]);

      await triggerWeeklyRecap();

      expect(sendWeeklyRecap).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('No eligible coaches')
      );
    });

    it('should handle email send failures gracefully', async () => {
      const mockCoaches = [
        {
          id: 'coach-1',
          email: 'coach1@test.com',
          name: 'Coach 1',
          emailWeeklyRecap: true,
          campaign: {
            id: 'campaign-1',
            status: 'active',
            stats: {
              impressions: 10000,
              clicks: 200,
              reach: 8000,
              spend: 25.50,
            },
          },
        },
      ];

      vi.mocked(prisma.coach.findMany).mockResolvedValue(mockCoaches as unknown as never[]);
      vi.mocked(prisma.campaign.findUnique).mockResolvedValue(
        mockCoaches[0].campaign as unknown as null
      );
      vi.mocked(sendWeeklyRecap).mockResolvedValue(false);

      // Should not throw
      await expect(triggerWeeklyRecap()).resolves.not.toThrow();

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send recap')
      );
    });

    it('should skip coaches without campaign stats', async () => {
      const mockCoaches = [
        {
          id: 'coach-1',
          email: 'coach1@test.com',
          name: 'Coach 1',
          emailWeeklyRecap: true,
          campaign: {
            id: 'campaign-1',
            status: 'active',
            stats: null, // No stats
          },
        },
      ];

      vi.mocked(prisma.coach.findMany).mockResolvedValue(mockCoaches as unknown as never[]);
      vi.mocked(prisma.campaign.findUnique).mockResolvedValue({
        ...mockCoaches[0].campaign,
        stats: null,
      } as unknown as null);

      await triggerWeeklyRecap();

      // Should log that no stats are available
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('No stats available')
      );
    });

    it('should calculate weekly stats correctly', async () => {
      const mockCoaches = [
        {
          id: 'coach-1',
          email: 'coach1@test.com',
          name: 'Coach 1',
          emailWeeklyRecap: true,
          campaign: {
            id: 'campaign-1',
            status: 'active',
            stats: {
              impressions: 15000,
              clicks: 300,
              reach: 12000,
              spend: 35.00,
            },
          },
        },
      ];

      vi.mocked(prisma.coach.findMany).mockResolvedValue(mockCoaches as unknown as never[]);
      vi.mocked(prisma.campaign.findUnique).mockResolvedValue(
        mockCoaches[0].campaign as unknown as null
      );
      vi.mocked(sendWeeklyRecap).mockResolvedValue(true);

      await triggerWeeklyRecap();

      // Verify sendWeeklyRecap was called with correct stats structure
      expect(sendWeeklyRecap).toHaveBeenCalledWith(
        { email: 'coach1@test.com', name: 'Coach 1' },
        expect.objectContaining({
          impressionsThisWeek: expect.any(Number),
          clicksThisWeek: expect.any(Number),
          status: 'active',
          weekStart: expect.any(Date),
          weekEnd: expect.any(Date),
        })
      );
    });
  });
});
