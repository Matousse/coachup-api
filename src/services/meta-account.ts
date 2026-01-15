/**
 * Meta Account Provisioning Service (Story 4.1)
 *
 * Orchestrates the creation of Meta ad accounts for coaches
 * Handles account limits, queue management, and error recovery
 */

import { prisma } from '../lib/prisma'
import { metaService } from './meta'
import { createMetaAccountLimitAlert, createMetaApiErrorAlert } from './alert'

// Types
export type ProvisionStatus = 'provisioned' | 'queued' | 'error' | 'existing'

export interface ProvisionResult {
  status: ProvisionStatus
  adAccountId?: string
  message: string
}

/**
 * Provisions a Meta ad account for a coach
 *
 * Flow:
 * 1. Check if coach already has an account → reuse
 * 2. Check account limit → queue if reached
 * 3. Create new account via Meta API
 * 4. Handle errors and create alerts
 *
 * @param coachId - The coach's UUID
 * @returns ProvisionResult with status and optional account ID
 */
export async function provisionMetaAccount(coachId: string): Promise<ProvisionResult> {
  // 1. Get coach data
  const coach = await prisma.coach.findUnique({
    where: { id: coachId },
  })

  if (!coach) {
    console.error(`[META-ACCOUNT] Coach not found: ${coachId}`)
    return {
      status: 'error',
      message: 'Coach non trouvé',
    }
  }

  // 2. Check if account already exists → reuse
  if (coach.metaAdAccountId) {
    console.log(`[META-ACCOUNT] Reusing existing account ${coach.metaAdAccountId} for coach ${coachId}`)
    return {
      status: 'existing',
      adAccountId: coach.metaAdAccountId,
      message: 'Compte Meta existant réutilisé',
    }
  }

  // 3. Check account limit
  const limit = await metaService.getAccountLimit()
  console.log(`[META-ACCOUNT] Account limit check: ${limit.currentCount}/${limit.limit} (available: ${limit.available})`)

  if (limit.available <= 0) {
    // Queue the coach
    await prisma.coach.update({
      where: { id: coachId },
      data: { queuedForMeta: true },
    })

    // Create alert and send email notification (Story 5.2)
    await createMetaAccountLimitAlert(coachId)

    console.log(`[META-ACCOUNT] Coach ${coachId} queued - limit reached`)

    return {
      status: 'queued',
      message: 'Limite de comptes atteinte. Vous serez notifié sous 48h.',
    }
  }

  // 4. Create the account
  try {
    const result = await metaService.createAdAccount({
      coachId,
      coachName: coach.name,
    })

    if (result.success && result.adAccountId) {
      // Save account ID
      await prisma.coach.update({
        where: { id: coachId },
        data: {
          metaAdAccountId: result.adAccountId,
          queuedForMeta: false, // Clear queue flag if set
        },
      })

      console.log(`[META-ACCOUNT] Provisioned account ${result.adAccountId} for coach ${coachId}`)

      return {
        status: 'provisioned',
        adAccountId: result.adAccountId,
        message: 'Compte publicitaire créé avec succès',
      }
    }

    // API returned error
    throw new Error(result.error || 'Erreur inconnue lors de la création du compte')
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue'

    console.error(`[META-ACCOUNT] Failed to provision account for coach ${coachId}:`, errorMessage)

    // Create alert and send email notification (Story 5.2)
    await createMetaApiErrorAlert(coachId, errorMessage)

    return {
      status: 'error',
      message: 'Erreur lors de la configuration. Notre équipe a été notifiée.',
    }
  }
}

/**
 * Processes queued coaches when account slots become available
 * Should be called by admin or scheduled job
 *
 * @returns Number of coaches processed
 */
export async function processQueuedCoaches(): Promise<number> {
  const limit = await metaService.getAccountLimit()

  if (limit.available <= 0) {
    console.log('[META-ACCOUNT] No slots available to process queue')
    return 0
  }

  // Get queued coaches (oldest first)
  const queuedCoaches = await prisma.coach.findMany({
    where: { queuedForMeta: true },
    orderBy: { createdAt: 'asc' },
    take: limit.available,
  })

  if (queuedCoaches.length === 0) {
    console.log('[META-ACCOUNT] No coaches in queue')
    return 0
  }

  let processed = 0

  for (const coach of queuedCoaches) {
    const result = await provisionMetaAccount(coach.id)

    if (result.status === 'provisioned') {
      processed++
      console.log(`[META-ACCOUNT] Processed queued coach ${coach.id}: ${result.status}`)

      // TODO: Send notification email (Story 5.2)
      // await sendAccountReadyEmail(coach.email, coach.name)
    }
  }

  console.log(`[META-ACCOUNT] Processed ${processed}/${queuedCoaches.length} queued coaches`)
  return processed
}

/**
 * Gets the current queue status
 *
 * @returns Queue statistics
 */
export async function getQueueStatus(): Promise<{
  queuedCount: number
  availableSlots: number
  limit: number
}> {
  const [queuedCount, accountLimit] = await Promise.all([
    prisma.coach.count({ where: { queuedForMeta: true } }),
    metaService.getAccountLimit(),
  ])

  return {
    queuedCount,
    availableSlots: accountLimit.available,
    limit: accountLimit.limit,
  }
}
