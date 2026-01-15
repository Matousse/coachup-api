/**
 * Weekly Recap Job (Story 5.2)
 *
 * Sends weekly recap emails to all coaches with active campaigns
 * Runs every Sunday at 20:00 CET
 */

import { prisma } from '../lib/prisma'
import { sendWeeklyRecap, WeeklyStats } from '../services/email'

// Interval between recap runs (default: 7 days = 604800000ms)
// In production, this should be triggered by cron, but we use interval as fallback
const WEEKLY_INTERVAL = parseInt(process.env.WEEKLY_RECAP_INTERVAL || '604800000', 10)

// Day and hour to run (Sunday = 0, 20:00 CET)
const RECAP_DAY = 0 // Sunday
const RECAP_HOUR = 20

let isRunning = false
let recapInterval: NodeJS.Timeout | null = null
let checkInterval: NodeJS.Timeout | null = null

/**
 * Calculate weekly stats delta for a campaign
 * Since we don't have historical snapshots, we use total stats
 * and estimate weekly stats based on launchedAt date
 */
async function calculateWeeklyStats(campaignId: string): Promise<WeeklyStats | null> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      stats: true,
    },
  })

  if (!campaign || !campaign.stats) {
    return null
  }

  // Calculate week boundaries
  const now = new Date()
  const weekEnd = new Date(now)
  const weekStart = new Date(now)
  weekStart.setDate(weekStart.getDate() - 7)

  // For simplicity, we use total stats as weekly stats
  // In a production system, you'd track weekly snapshots
  // or use Meta's time-based insights API
  return {
    impressionsThisWeek: campaign.stats.impressions,
    clicksThisWeek: campaign.stats.clicks,
    status: campaign.status,
    weekStart,
    weekEnd,
  }
}

/**
 * Send weekly recap emails to all eligible coaches
 */
async function sendWeeklyRecaps(): Promise<void> {
  if (isRunning) {
    console.log('[WEEKLY RECAP] Already running, skipping...')
    return
  }

  isRunning = true
  console.log('[WEEKLY RECAP] Starting weekly recap job...')

  try {
    // Find all coaches with active campaigns and weekly recap preference enabled
    const coaches = await prisma.coach.findMany({
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
    })

    if (coaches.length === 0) {
      console.log('[WEEKLY RECAP] No eligible coaches for weekly recap')
      return
    }

    console.log(`[WEEKLY RECAP] Sending recaps to ${coaches.length} coach(es)`)

    let sentCount = 0
    let errorCount = 0

    for (const coach of coaches) {
      if (!coach.campaign) {
        continue
      }

      try {
        const weeklyStats = await calculateWeeklyStats(coach.campaign.id)

        if (!weeklyStats) {
          console.log(`[WEEKLY RECAP] No stats available for coach ${coach.id}`)
          continue
        }

        const success = await sendWeeklyRecap(
          { email: coach.email, name: coach.name },
          weeklyStats
        )

        if (success) {
          sentCount++
          console.log(`[WEEKLY RECAP] Sent recap to ${coach.email}`)
        } else {
          errorCount++
          console.error(`[WEEKLY RECAP] Failed to send recap to ${coach.email}`)
        }
      } catch (error) {
        errorCount++
        console.error(`[WEEKLY RECAP] Error sending recap to ${coach.email}:`, error)
      }
    }

    console.log(`[WEEKLY RECAP] Completed: ${sentCount} sent, ${errorCount} errors`)
  } catch (error) {
    console.error('[WEEKLY RECAP] Error in weekly recap job:', error)
  } finally {
    isRunning = false
  }
}

/**
 * Check if it's time to run the weekly recap
 * Runs every hour to check if it's Sunday 20:00
 */
function checkAndRunRecap(): void {
  const now = new Date()
  const day = now.getDay() // 0 = Sunday
  const hour = now.getHours()

  if (day === RECAP_DAY && hour === RECAP_HOUR) {
    console.log('[WEEKLY RECAP] It\'s Sunday 20:00 - triggering weekly recap')
    sendWeeklyRecaps()
  }
}

/**
 * Start the weekly recap job
 */
export function startWeeklyRecap(): void {
  if (checkInterval) {
    console.log('[WEEKLY RECAP] Already started')
    return
  }

  console.log('[WEEKLY RECAP] Starting weekly recap scheduler')
  console.log(`[WEEKLY RECAP] Will run every Sunday at ${RECAP_HOUR}:00`)

  // Check every hour if it's time to run
  const ONE_HOUR = 60 * 60 * 1000
  checkInterval = setInterval(checkAndRunRecap, ONE_HOUR)

  // Also check immediately on startup
  checkAndRunRecap()
}

/**
 * Stop the weekly recap job
 */
export function stopWeeklyRecap(): void {
  if (checkInterval) {
    clearInterval(checkInterval)
    checkInterval = null
    console.log('[WEEKLY RECAP] Stopped')
  }
  if (recapInterval) {
    clearInterval(recapInterval)
    recapInterval = null
  }
}

/**
 * Manually trigger the weekly recap (useful for testing)
 */
export async function triggerWeeklyRecap(): Promise<void> {
  await sendWeeklyRecaps()
}
