/**
 * Campaign Status Checker Job (Story 4.2)
 *
 * Polls Meta API every 5 minutes to check status of pending_review campaigns
 * Updates campaign status when approved or rejected by Meta
 */

import { prisma } from '../lib/prisma';
import { metaService } from '../services/meta';
import { sendCampaignLive } from '../services/email';
import { createMetaRejectionAlert } from '../services/alert';

// Check interval in milliseconds (default: 5 minutes)
const CHECK_INTERVAL = parseInt(process.env.CAMPAIGN_STATUS_CHECK_INTERVAL || '300000', 10);

let isRunning = false;
let checkInterval: NodeJS.Timeout | null = null;

/**
 * Check and update status for all pending_review campaigns
 */
async function checkPendingCampaigns(): Promise<void> {
  if (isRunning) {
    console.log('[CAMPAIGN CHECKER] Already running, skipping...');
    return;
  }

  isRunning = true;
  console.log('[CAMPAIGN CHECKER] Starting status check...');

  try {
    // Find all campaigns in pending_review status
    const pendingCampaigns = await prisma.campaign.findMany({
      where: { status: 'pending_review' },
      include: {
        coach: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (pendingCampaigns.length === 0) {
      console.log('[CAMPAIGN CHECKER] No pending campaigns to check');
      return;
    }

    console.log(`[CAMPAIGN CHECKER] Checking ${pendingCampaigns.length} pending campaign(s)`);

    for (const campaign of pendingCampaigns) {
      if (!campaign.metaCampaignId) {
        console.log(`[CAMPAIGN CHECKER] Campaign ${campaign.id} has no Meta campaign ID, skipping`);
        continue;
      }

      try {
        // Get current status from Meta
        const statusResult = await metaService.getCampaignStatus(campaign.metaCampaignId);

        console.log(`[CAMPAIGN CHECKER] Campaign ${campaign.id} Meta status: ${statusResult.status}`);

        // Handle status changes
        if (statusResult.status === 'active') {
          // Campaign approved and launched
          await prisma.campaign.update({
            where: { id: campaign.id },
            data: {
              status: 'active',
              launchedAt: new Date(),
            },
          });

          console.log(`[CAMPAIGN CHECKER] Campaign ${campaign.id} is now ACTIVE`);

          // Send email notification to coach (Story 5.2)
          // Check coach email preference before sending
          const coachPrefs = await prisma.coach.findUnique({
            where: { id: campaign.coachId },
            select: { emailCampaignLive: true, email: true, name: true },
          });

          if (coachPrefs?.emailCampaignLive) {
            await sendCampaignLive({
              email: coachPrefs.email,
              name: coachPrefs.name,
            });
            console.log(`[CAMPAIGN CHECKER] Campaign live email sent to ${coachPrefs.email}`);
          } else {
            console.log(`[CAMPAIGN CHECKER] Campaign live email skipped (preference disabled)`);
          }

        } else if (statusResult.status === 'rejected') {
          // Campaign rejected by Meta
          await prisma.campaign.update({
            where: { id: campaign.id },
            data: {
              status: 'rejected',
              rejectReason: statusResult.rejectReason || 'Rejete par Meta',
            },
          });

          console.log(`[CAMPAIGN CHECKER] Campaign ${campaign.id} was REJECTED: ${statusResult.rejectReason}`);

          // Create alert and send email notification (Story 5.2)
          // Uses centralized alert service which handles both DB and email
          await createMetaRejectionAlert(campaign.coachId, statusResult.rejectReason);
        }
        // If still pending_review or unknown, no action needed

      } catch (error) {
        console.error(`[CAMPAIGN CHECKER] Error checking campaign ${campaign.id}:`, error);
      }
    }
  } catch (error) {
    console.error('[CAMPAIGN CHECKER] Error in status check:', error);
  } finally {
    isRunning = false;
    console.log('[CAMPAIGN CHECKER] Status check complete');
  }
}

/**
 * Start the campaign status checker job
 */
export function startCampaignStatusChecker(): void {
  if (checkInterval) {
    console.log('[CAMPAIGN CHECKER] Already started');
    return;
  }

  console.log(`[CAMPAIGN CHECKER] Starting with ${CHECK_INTERVAL / 1000}s interval`);

  // Run immediately on startup
  checkPendingCampaigns();

  // Then run at regular intervals
  checkInterval = setInterval(checkPendingCampaigns, CHECK_INTERVAL);
}

/**
 * Stop the campaign status checker job
 */
export function stopCampaignStatusChecker(): void {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
    console.log('[CAMPAIGN CHECKER] Stopped');
  }
}

/**
 * Manually trigger a status check (useful for testing)
 */
export async function triggerStatusCheck(): Promise<void> {
  await checkPendingCampaigns();
}
