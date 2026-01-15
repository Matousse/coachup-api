/**
 * Campaign Stats Sync Job (Story 5.1)
 *
 * Syncs campaign statistics from Meta API daily
 * Updates CampaignStats records in database with latest metrics
 */

import { prisma } from '../lib/prisma';
import { metaService } from '../services/meta';

// Sync interval in milliseconds (default: 24 hours)
const STATS_SYNC_INTERVAL = parseInt(process.env.STATS_SYNC_INTERVAL || '86400000', 10);
const STATS_SYNC_ENABLED = process.env.STATS_SYNC_ENABLED !== 'false';

let isRunning = false;
let syncInterval: NodeJS.Timeout | null = null;

/**
 * Calculate CTR (Click-Through Rate)
 * @returns CTR as percentage or null if no impressions
 */
function calculateCtr(impressions: number, clicks: number): number | null {
  if (impressions <= 0) return null;
  return Math.round((clicks / impressions) * 10000) / 100; // 2 decimal places
}

/**
 * Calculate CPC (Cost Per Click)
 * @returns CPC in EUR or null if no clicks
 */
function calculateCpc(spend: number, clicks: number): number | null {
  if (clicks <= 0) return null;
  return Math.round((spend / clicks) * 100) / 100; // 2 decimal places
}

/**
 * Sync stats for all active campaigns
 */
async function syncAllCampaignStats(): Promise<void> {
  if (isRunning) {
    console.log('[STATS SYNC] Already running, skipping...');
    return;
  }

  isRunning = true;
  console.log('[STATS SYNC] Starting stats sync...');

  try {
    // Find all active campaigns with Meta campaign IDs
    const activeCampaigns = await prisma.campaign.findMany({
      where: {
        status: 'active',
        metaCampaignId: { not: null },
      },
      include: {
        stats: true,
        coach: {
          select: { id: true, name: true },
        },
      },
    });

    if (activeCampaigns.length === 0) {
      console.log('[STATS SYNC] No active campaigns to sync');
      return;
    }

    console.log(`[STATS SYNC] Syncing stats for ${activeCampaigns.length} campaign(s)`);

    let successCount = 0;
    let errorCount = 0;

    for (const campaign of activeCampaigns) {
      if (!campaign.metaCampaignId) continue;

      try {
        // Fetch insights from Meta API
        const insightsResult = await metaService.getCampaignInsights(campaign.metaCampaignId);

        if (!insightsResult.success || !insightsResult.stats) {
          console.error(`[STATS SYNC] Failed to get insights for campaign ${campaign.id}: ${insightsResult.error}`);
          errorCount++;
          continue;
        }

        const { impressions, clicks, reach, spend } = insightsResult.stats;

        // Calculate derived metrics
        const ctr = calculateCtr(impressions, clicks);
        const cpc = calculateCpc(spend, clicks);

        // Upsert CampaignStats record
        await prisma.campaignStats.upsert({
          where: { campaignId: campaign.id },
          create: {
            campaignId: campaign.id,
            impressions,
            clicks,
            reach,
            spend,
            ctr,
            cpc,
            lastSyncedAt: new Date(),
          },
          update: {
            impressions,
            clicks,
            reach,
            spend,
            ctr,
            cpc,
            lastSyncedAt: new Date(),
          },
        });

        console.log(`[STATS SYNC] Updated stats for campaign ${campaign.id} (Coach: ${campaign.coach.name})`);
        console.log(`[STATS SYNC]   - Impressions: ${impressions}, Clicks: ${clicks}, Reach: ${reach}`);
        console.log(`[STATS SYNC]   - Spend: ${spend}EUR, CTR: ${ctr}%, CPC: ${cpc}EUR`);

        successCount++;
      } catch (error) {
        console.error(`[STATS SYNC] Error syncing campaign ${campaign.id}:`, error);
        errorCount++;
      }
    }

    console.log(`[STATS SYNC] Sync complete: ${successCount} success, ${errorCount} errors`);
  } catch (error) {
    console.error('[STATS SYNC] Error in stats sync:', error);
  } finally {
    isRunning = false;
    console.log('[STATS SYNC] Stats sync finished');
  }
}

/**
 * Start the campaign stats sync job
 */
export function startCampaignStatsSync(): void {
  if (!STATS_SYNC_ENABLED) {
    console.log('[STATS SYNC] Stats sync is disabled (STATS_SYNC_ENABLED=false)');
    return;
  }

  if (syncInterval) {
    console.log('[STATS SYNC] Already started');
    return;
  }

  console.log(`[STATS SYNC] Starting with ${STATS_SYNC_INTERVAL / 1000 / 60 / 60}h interval`);

  // Run immediately on startup
  syncAllCampaignStats();

  // Then run at regular intervals
  syncInterval = setInterval(syncAllCampaignStats, STATS_SYNC_INTERVAL);
}

/**
 * Stop the campaign stats sync job
 */
export function stopCampaignStatsSync(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    console.log('[STATS SYNC] Stopped');
  }
}

/**
 * Manually trigger a stats sync (useful for testing)
 */
export async function triggerStatsSync(): Promise<void> {
  await syncAllCampaignStats();
}

/**
 * Sync stats for a single campaign by ID
 * Used when a campaign becomes active or for on-demand refresh
 */
export async function syncSingleCampaignStats(campaignId: string): Promise<boolean> {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        coach: { select: { name: true } },
      },
    });

    if (!campaign || !campaign.metaCampaignId) {
      console.error(`[STATS SYNC] Campaign ${campaignId} not found or missing Meta campaign ID`);
      return false;
    }

    const insightsResult = await metaService.getCampaignInsights(campaign.metaCampaignId);

    if (!insightsResult.success || !insightsResult.stats) {
      console.error(`[STATS SYNC] Failed to get insights for campaign ${campaignId}`);
      return false;
    }

    const { impressions, clicks, reach, spend } = insightsResult.stats;
    const ctr = calculateCtr(impressions, clicks);
    const cpc = calculateCpc(spend, clicks);

    await prisma.campaignStats.upsert({
      where: { campaignId },
      create: {
        campaignId,
        impressions,
        clicks,
        reach,
        spend,
        ctr,
        cpc,
        lastSyncedAt: new Date(),
      },
      update: {
        impressions,
        clicks,
        reach,
        spend,
        ctr,
        cpc,
        lastSyncedAt: new Date(),
      },
    });

    console.log(`[STATS SYNC] Single sync complete for campaign ${campaignId}`);
    return true;
  } catch (error) {
    console.error(`[STATS SYNC] Error syncing single campaign ${campaignId}:`, error);
    return false;
  }
}
