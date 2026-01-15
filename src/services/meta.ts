/**
 * Meta Business Manager API Service (Story 4.1, 4.2)
 *
 * Stub implementation for MVP - simulates Meta API calls
 * Will be replaced with real Meta Marketing API integration
 */

// Types - Account Management (Story 4.1)
export interface CreateAdAccountParams {
  coachId: string
  coachName: string
}

export interface CreateAdAccountResult {
  success: boolean
  adAccountId?: string
  error?: string
}

export interface AccountLimitResult {
  currentCount: number
  limit: number
  available: number
}

// Types - Campaign Management (Story 4.2)
export interface CampaignConfig {
  coachId: string
  adAccountId: string
  videoUrl: string
  coachName: string
  city: string
  radius: number
  targetUrl: string // Instagram ou site
  dailyBudget: number
}

export interface UploadVideoResult {
  success: boolean
  videoId?: string
  error?: string
}

export interface CreateCampaignResult {
  success: boolean
  campaignId?: string
  adSetId?: string
  adId?: string
  error?: string
}

export interface CampaignStatusResult {
  status: 'pending_review' | 'active' | 'rejected' | 'paused' | 'unknown'
  rejectReason?: string
}

export interface PauseCampaignResult {
  success: boolean
  error?: string
}

// Types - Campaign Insights (Story 5.1)
export interface CampaignInsightsResult {
  success: boolean
  stats?: {
    impressions: number
    clicks: number
    reach: number
    spend: number
  }
  error?: string
}

export interface MetaService {
  // Account management (Story 4.1)
  createAdAccount(params: CreateAdAccountParams): Promise<CreateAdAccountResult>
  getAccountLimit(): Promise<AccountLimitResult>
  // Campaign management (Story 4.2)
  uploadVideo(videoPath: string, adAccountId: string): Promise<UploadVideoResult>
  createCampaign(config: CampaignConfig): Promise<CreateCampaignResult>
  getCampaignStatus(campaignId: string): Promise<CampaignStatusResult>
  pauseCampaign(campaignId: string): Promise<PauseCampaignResult>
  // Campaign insights (Story 5.1)
  getCampaignInsights(campaignId: string): Promise<CampaignInsightsResult>
}

// Environment configuration
const META_ACCOUNT_LIMIT = parseInt(process.env.META_ACCOUNT_LIMIT || '5', 10)
const META_STUB_MODE = process.env.META_STUB_MODE !== 'false' // Default to stub mode

/**
 * Stub implementation for MVP
 * Simulates Meta API behavior without real API calls
 */
class MetaServiceStub implements MetaService {
  private stubAccountCount = 3 // Simulates 3 existing accounts
  private campaignStatuses: Map<string, CampaignStatusResult> = new Map()

  async createAdAccount(params: CreateAdAccountParams): Promise<CreateAdAccountResult> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500))

    // Generate fake account ID
    const fakeId = `act_${Date.now()}`

    console.log(`[META STUB] Created ad account ${fakeId} for coach ${params.coachId} (${params.coachName})`)

    // Increment stub counter
    this.stubAccountCount++

    return {
      success: true,
      adAccountId: fakeId,
    }
  }

  async getAccountLimit(): Promise<AccountLimitResult> {
    return {
      currentCount: this.stubAccountCount,
      limit: META_ACCOUNT_LIMIT,
      available: META_ACCOUNT_LIMIT - this.stubAccountCount,
    }
  }

  // Campaign Management Methods (Story 4.2)

  async uploadVideo(videoPath: string, adAccountId: string): Promise<UploadVideoResult> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 300))

    const videoId = `vid_${Date.now()}`
    console.log(`[META STUB] Uploaded video ${videoId} to account ${adAccountId} from ${videoPath}`)

    return {
      success: true,
      videoId,
    }
  }

  async createCampaign(config: CampaignConfig): Promise<CreateCampaignResult> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500))

    const campaignId = `camp_${Date.now()}`
    const adSetId = `adset_${Date.now()}`
    const adId = `ad_${Date.now()}`

    console.log(`[META STUB] Created campaign ${campaignId} for coach ${config.coachId}`)
    console.log(`[META STUB]   - Ad Set: ${adSetId}`)
    console.log(`[META STUB]   - Ad: ${adId}`)
    console.log(`[META STUB]   - Targeting: ${config.city} (${config.radius}km radius)`)
    console.log(`[META STUB]   - Daily Budget: ${config.dailyBudget}EUR`)

    // Store initial status as pending_review
    this.campaignStatuses.set(campaignId, { status: 'pending_review' })

    return {
      success: true,
      campaignId,
      adSetId,
      adId,
    }
  }

  async getCampaignStatus(campaignId: string): Promise<CampaignStatusResult> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 200))

    const status = this.campaignStatuses.get(campaignId)
    if (!status) {
      console.log(`[META STUB] Campaign ${campaignId} not found, returning unknown`)
      return { status: 'unknown' }
    }

    console.log(`[META STUB] Campaign ${campaignId} status: ${status.status}`)
    return status
  }

  async pauseCampaign(campaignId: string): Promise<PauseCampaignResult> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 300))

    console.log(`[META STUB] Paused campaign ${campaignId}`)
    this.campaignStatuses.set(campaignId, { status: 'paused' })

    return { success: true }
  }

  // Helper method for testing - allows simulating campaign approval/rejection
  simulateCampaignStatusChange(campaignId: string, status: CampaignStatusResult): void {
    console.log(`[META STUB] Simulating campaign ${campaignId} status change to ${status.status}`)
    this.campaignStatuses.set(campaignId, status)
  }

  // Campaign Insights Methods (Story 5.1)

  async getCampaignInsights(campaignId: string): Promise<CampaignInsightsResult> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 300))

    // Generate random but realistic stats for stub mode
    const impressions = Math.floor(Math.random() * 20000) + 5000
    const clicks = Math.floor(Math.random() * (impressions * 0.05)) + 50
    const reach = Math.floor(impressions * 0.7)
    const spend = Math.round((Math.random() * 50 + 10) * 100) / 100

    console.log(`[META STUB] Retrieved insights for campaign ${campaignId}`)
    console.log(`[META STUB]   - Impressions: ${impressions}`)
    console.log(`[META STUB]   - Clicks: ${clicks}`)
    console.log(`[META STUB]   - Reach: ${reach}`)
    console.log(`[META STUB]   - Spend: ${spend}EUR`)

    return {
      success: true,
      stats: {
        impressions,
        clicks,
        reach,
        spend,
      },
    }
  }
}

/**
 * Real Meta API implementation (for future use)
 * Uses Meta Business Manager API to create ad accounts
 */
class MetaServiceReal implements MetaService {
  private businessId: string
  private accessToken: string

  constructor() {
    this.businessId = process.env.META_BUSINESS_ID || ''
    this.accessToken = process.env.META_ACCESS_TOKEN || ''

    if (!this.businessId || !this.accessToken) {
      console.warn('[META] Missing META_BUSINESS_ID or META_ACCESS_TOKEN - falling back to stub mode')
    }
  }

  async createAdAccount(params: CreateAdAccountParams): Promise<CreateAdAccountResult> {
    try {
      // Real API call would go here
      // POST https://graph.facebook.com/v18.0/{business-id}/adaccounts
      // Body: { name, currency, timezone_id, end_advertiser, media_agency }

      const response = await fetch(
        `https://graph.facebook.com/v18.0/${this.businessId}/adaccounts`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: `CoachUp - ${params.coachName}`,
            currency: 'EUR',
            timezone_id: '37', // Europe/Paris
            end_advertiser: this.businessId,
            media_agency: this.businessId,
          }),
        }
      )

      if (!response.ok) {
        const errorData = await response.json()
        console.error('[META] API error:', errorData)
        return {
          success: false,
          error: errorData.error?.message || 'Meta API error',
        }
      }

      const data = await response.json()
      console.log(`[META] Created ad account ${data.id} for coach ${params.coachId}`)

      return {
        success: true,
        adAccountId: data.id,
      }
    } catch (error) {
      console.error('[META] Failed to create ad account:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  async getAccountLimit(): Promise<AccountLimitResult> {
    try {
      // Real API call to get account count
      // GET /me/adaccounts?fields=account_status

      const response = await fetch(
        `https://graph.facebook.com/v18.0/me/adaccounts?fields=account_status&access_token=${this.accessToken}`
      )

      if (!response.ok) {
        console.error('[META] Failed to get account limit')
        // Return safe default
        return {
          currentCount: 0,
          limit: META_ACCOUNT_LIMIT,
          available: META_ACCOUNT_LIMIT,
        }
      }

      const data = await response.json()
      const activeAccounts = data.data?.filter(
        (acc: { account_status: number }) => acc.account_status === 1
      ).length || 0

      return {
        currentCount: activeAccounts,
        limit: META_ACCOUNT_LIMIT,
        available: META_ACCOUNT_LIMIT - activeAccounts,
      }
    } catch (error) {
      console.error('[META] Failed to get account limit:', error)
      return {
        currentCount: 0,
        limit: META_ACCOUNT_LIMIT,
        available: META_ACCOUNT_LIMIT,
      }
    }
  }

  // Campaign Management Methods (Story 4.2)

  async uploadVideo(videoPath: string, adAccountId: string): Promise<UploadVideoResult> {
    try {
      // Real API: POST https://graph.facebook.com/v18.0/{ad-account-id}/advideos
      // Would need FormData with video file
      console.log(`[META] Uploading video from ${videoPath} to account ${adAccountId}`)

      // TODO: Implement real video upload with FormData
      // For now, return error to indicate not implemented
      return {
        success: false,
        error: 'Real video upload not implemented - use stub mode',
      }
    } catch (error) {
      console.error('[META] Failed to upload video:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  async createCampaign(config: CampaignConfig): Promise<CreateCampaignResult> {
    try {
      // Step 1: Create Campaign
      const campaignResponse = await fetch(
        `https://graph.facebook.com/v18.0/${config.adAccountId}/campaigns`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: `CoachUp - ${config.coachName}`,
            objective: 'OUTCOME_TRAFFIC',
            special_ad_categories: [],
            status: 'PAUSED',
          }),
        }
      )

      if (!campaignResponse.ok) {
        const errorData = await campaignResponse.json()
        console.error('[META] Failed to create campaign:', errorData)
        return {
          success: false,
          error: errorData.error?.message || 'Failed to create campaign',
        }
      }

      const campaignData = await campaignResponse.json()
      const campaignId = campaignData.id

      // Step 2: Create Ad Set (simplified - would need city key lookup)
      // TODO: Implement full ad set creation with targeting
      console.log(`[META] Created campaign ${campaignId}`)

      return {
        success: true,
        campaignId,
        // adSetId and adId would come from subsequent API calls
      }
    } catch (error) {
      console.error('[META] Failed to create campaign:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  async getCampaignStatus(campaignId: string): Promise<CampaignStatusResult> {
    try {
      const response = await fetch(
        `https://graph.facebook.com/v18.0/${campaignId}?fields=effective_status&access_token=${this.accessToken}`
      )

      if (!response.ok) {
        console.error('[META] Failed to get campaign status')
        return { status: 'unknown' }
      }

      const data = await response.json()
      const effectiveStatus = data.effective_status

      // Map Meta status to our status
      switch (effectiveStatus) {
        case 'PENDING_REVIEW':
          return { status: 'pending_review' }
        case 'ACTIVE':
          return { status: 'active' }
        case 'DISAPPROVED':
          return { status: 'rejected', rejectReason: 'Ad disapproved by Meta' }
        case 'PAUSED':
          return { status: 'paused' }
        default:
          return { status: 'unknown' }
      }
    } catch (error) {
      console.error('[META] Failed to get campaign status:', error)
      return { status: 'unknown' }
    }
  }

  async pauseCampaign(campaignId: string): Promise<PauseCampaignResult> {
    try {
      const response = await fetch(
        `https://graph.facebook.com/v18.0/${campaignId}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: 'PAUSED' }),
        }
      )

      if (!response.ok) {
        const errorData = await response.json()
        console.error('[META] Failed to pause campaign:', errorData)
        return {
          success: false,
          error: errorData.error?.message || 'Failed to pause campaign',
        }
      }

      console.log(`[META] Paused campaign ${campaignId}`)
      return { success: true }
    } catch (error) {
      console.error('[META] Failed to pause campaign:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  // Campaign Insights Methods (Story 5.1)

  async getCampaignInsights(campaignId: string): Promise<CampaignInsightsResult> {
    try {
      // GET https://graph.facebook.com/v18.0/{campaign-id}/insights
      // ?fields=impressions,clicks,reach,spend&date_preset=lifetime
      const response = await fetch(
        `https://graph.facebook.com/v18.0/${campaignId}/insights?fields=impressions,clicks,reach,spend&date_preset=lifetime&access_token=${this.accessToken}`
      )

      if (!response.ok) {
        const errorData = await response.json()
        console.error('[META] Failed to get campaign insights:', errorData)
        return {
          success: false,
          error: errorData.error?.message || 'Failed to get campaign insights',
        }
      }

      const data = await response.json()

      // Meta returns data as an array, we want the first (and usually only) entry
      if (!data.data || data.data.length === 0) {
        console.log(`[META] No insights data available for campaign ${campaignId}`)
        return {
          success: true,
          stats: {
            impressions: 0,
            clicks: 0,
            reach: 0,
            spend: 0,
          },
        }
      }

      const insights = data.data[0]
      console.log(`[META] Retrieved insights for campaign ${campaignId}`)

      return {
        success: true,
        stats: {
          impressions: parseInt(insights.impressions || '0', 10),
          clicks: parseInt(insights.clicks || '0', 10),
          reach: parseInt(insights.reach || '0', 10),
          spend: parseFloat(insights.spend || '0'),
        },
      }
    } catch (error) {
      console.error('[META] Failed to get campaign insights:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }
}

// Factory function to get the appropriate service
function createMetaService(): MetaService {
  if (META_STUB_MODE) {
    console.log('[META] Using stub mode (META_STUB_MODE=true)')
    return new MetaServiceStub()
  }

  console.log('[META] Using real Meta API')
  return new MetaServiceReal()
}

// Export singleton instance
export const metaService = createMetaService()
