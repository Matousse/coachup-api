/**
 * Campaign Orchestration Service (Story 4.2)
 *
 * Orchestrates the campaign launch flow:
 * 1. Verify prerequisites (Meta account, validated video, active subscription)
 * 2. Calculate daily budget based on subscription plan
 * 3. Upload video to Meta
 * 4. Create campaign + ad set + ad
 * 5. Save campaign record to database
 */

import { prisma } from '../lib/prisma'
import { metaService, CampaignConfig } from './meta'
import { createMetaApiErrorAlert } from './alert'

// Daily budget by plan (monthly budget / 30 days)
const DAILY_BUDGETS: Record<string, number> = {
  starter: 25 / 30,   // 0.83 EUR
  pro: 50 / 30,       // 1.67 EUR
  premium: 100 / 30,  // 3.33 EUR
}

export interface LaunchResult {
  success: boolean
  campaign?: {
    id: string
    status: string
    metaCampaignId: string
  }
  error?: string
}

export interface PauseResult {
  success: boolean
  error?: string
}

/**
 * Launch a campaign for a coach
 * Called after video validation when Meta account is ready
 */
export async function launchCampaign(coachId: string): Promise<LaunchResult> {
  console.log(`[CAMPAIGN] Launching campaign for coach ${coachId}`)

  try {
    // 1. Fetch coach with all required relations
    const coach = await prisma.coach.findUnique({
      where: { id: coachId },
      include: {
        subscription: true,
        videoJobs: {
          where: { status: 'validated' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        campaign: true,
      },
    })

    if (!coach) {
      return { success: false, error: 'Coach not found' }
    }

    // 2. Verify prerequisites
    if (!coach.metaAdAccountId) {
      return { success: false, error: 'No Meta ad account. Run account provisioning first.' }
    }

    if (!coach.subscription || coach.subscription.status !== 'active') {
      return { success: false, error: 'No active subscription' }
    }

    const validatedVideo = coach.videoJobs[0]
    if (!validatedVideo || !validatedVideo.videoUrl) {
      return { success: false, error: 'No validated video found' }
    }

    // 3. Check if campaign already exists
    if (coach.campaign) {
      console.log(`[CAMPAIGN] Campaign already exists for coach ${coachId}: ${coach.campaign.id}`)
      return {
        success: true,
        campaign: {
          id: coach.campaign.id,
          status: coach.campaign.status,
          metaCampaignId: coach.campaign.metaCampaignId || '',
        },
      }
    }

    // 4. Calculate daily budget based on plan
    const dailyBudget = DAILY_BUDGETS[coach.subscription.plan] || DAILY_BUDGETS.starter
    console.log(`[CAMPAIGN] Daily budget for ${coach.subscription.plan}: ${dailyBudget.toFixed(2)} EUR`)

    // 5. Upload video to Meta
    const videoUploadResult = await metaService.uploadVideo(
      validatedVideo.videoUrl,
      coach.metaAdAccountId
    )

    if (!videoUploadResult.success || !videoUploadResult.videoId) {
      console.error(`[CAMPAIGN] Video upload failed: ${videoUploadResult.error}`)
      return { success: false, error: `Video upload failed: ${videoUploadResult.error}` }
    }

    // 6. Prepare campaign config
    const targetUrl = coach.instagramUrl || coach.websiteUrl || 'https://instagram.com'
    const campaignConfig: CampaignConfig = {
      coachId,
      adAccountId: coach.metaAdAccountId,
      videoUrl: validatedVideo.videoUrl,
      coachName: coach.name,
      city: coach.city || 'Paris',
      radius: coach.radius || 10,
      targetUrl,
      dailyBudget,
    }

    // 7. Create campaign on Meta
    const campaignResult = await metaService.createCampaign(campaignConfig)

    if (!campaignResult.success || !campaignResult.campaignId) {
      console.error(`[CAMPAIGN] Campaign creation failed: ${campaignResult.error}`)
      return { success: false, error: `Campaign creation failed: ${campaignResult.error}` }
    }

    // 8. Save campaign to database
    const campaign = await prisma.campaign.create({
      data: {
        coachId,
        metaCampaignId: campaignResult.campaignId,
        metaAdSetId: campaignResult.adSetId,
        metaAdId: campaignResult.adId,
        metaVideoId: videoUploadResult.videoId,
        status: 'pending_review',
        dailyBudget,
        submittedAt: new Date(),
      },
    })

    console.log(`[CAMPAIGN] Campaign created: ${campaign.id} (Meta: ${campaign.metaCampaignId})`)

    return {
      success: true,
      campaign: {
        id: campaign.id,
        status: campaign.status,
        metaCampaignId: campaign.metaCampaignId || '',
      },
    }
  } catch (error) {
    console.error('[CAMPAIGN] Launch failed:', error)

    // Create alert and send email notification (Story 5.2)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    await createMetaApiErrorAlert(coachId, errorMessage)

    return {
      success: false,
      error: errorMessage,
    }
  }
}

/**
 * Pause a campaign for a coach
 * Called when subscription is cancelled
 */
export async function pauseCampaign(coachId: string): Promise<PauseResult> {
  console.log(`[CAMPAIGN] Pausing campaign for coach ${coachId}`)

  try {
    // Find campaign for coach
    const campaign = await prisma.campaign.findUnique({
      where: { coachId },
    })

    if (!campaign) {
      console.log(`[CAMPAIGN] No campaign found for coach ${coachId}`)
      return { success: true } // Nothing to pause
    }

    if (campaign.status === 'paused') {
      console.log(`[CAMPAIGN] Campaign ${campaign.id} already paused`)
      return { success: true }
    }

    // Pause on Meta if we have a campaign ID
    if (campaign.metaCampaignId) {
      const pauseResult = await metaService.pauseCampaign(campaign.metaCampaignId)
      if (!pauseResult.success) {
        console.error(`[CAMPAIGN] Failed to pause on Meta: ${pauseResult.error}`)
        // Continue to update local status anyway
      }
    }

    // Update local status
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: 'paused' },
    })

    console.log(`[CAMPAIGN] Campaign ${campaign.id} paused`)
    return { success: true }
  } catch (error) {
    console.error('[CAMPAIGN] Pause failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Get campaign status for a coach
 */
export async function getCampaignForCoach(coachId: string) {
  return prisma.campaign.findUnique({
    where: { coachId },
  })
}

/**
 * Update campaign status from Meta polling
 */
export async function updateCampaignStatus(
  campaignId: string,
  status: 'active' | 'rejected' | 'paused',
  rejectReason?: string
): Promise<void> {
  const updateData: {
    status: string
    rejectReason?: string
    launchedAt?: Date
  } = { status }

  if (status === 'rejected' && rejectReason) {
    updateData.rejectReason = rejectReason
  }

  if (status === 'active') {
    updateData.launchedAt = new Date()
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: updateData,
  })

  console.log(`[CAMPAIGN] Updated campaign ${campaignId} status to ${status}`)
}
