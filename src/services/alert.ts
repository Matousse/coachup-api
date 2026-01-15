/**
 * Alert Service (Story 5.2)
 *
 * Centralized service for creating alerts and sending email notifications
 * Alert emails are always sent (cannot be disabled by user preferences)
 */

import { prisma } from '../lib/prisma'
import { sendAlertEmail, AlertType } from './email'

export interface CreateAlertData {
  type: AlertType
  coachId: string | null
  message: string
  reason?: string
}

/**
 * Create an alert and send email notification to the coach
 * This is the central function for all alert creation
 */
export async function createAlert(data: CreateAlertData): Promise<string> {
  // Create the alert in the database
  const alert = await prisma.alert.create({
    data: {
      type: data.type,
      coachId: data.coachId,
      message: data.message,
    },
  })

  console.log(`[ALERT SERVICE] Created alert ${alert.id}: ${data.type}`)

  // If there's a coach, send them an email notification
  if (data.coachId) {
    const coach = await prisma.coach.findUnique({
      where: { id: data.coachId },
      select: { email: true, name: true },
    })

    if (coach) {
      try {
        await sendAlertEmail(
          { email: coach.email, name: coach.name },
          data.type,
          data.reason
        )
        console.log(`[ALERT SERVICE] Alert email sent to ${coach.email}`)
      } catch (error) {
        console.error(`[ALERT SERVICE] Failed to send alert email to ${coach.email}:`, error)
        // Don't throw - alert was created successfully, email is best-effort
      }
    }
  }

  return alert.id
}

/**
 * Create a payment failed alert
 */
export async function createPaymentFailedAlert(coachId: string, reason?: string): Promise<string> {
  return createAlert({
    type: 'payment_failed',
    coachId,
    message: `Paiement echoue${reason ? `: ${reason}` : ''}`,
    reason,
  })
}

/**
 * Create a video generation failed alert
 */
export async function createVideoFailedAlert(coachId: string, reason?: string): Promise<string> {
  return createAlert({
    type: 'video_failed',
    coachId,
    message: `Generation video echouee${reason ? `: ${reason}` : ''}`,
    reason,
  })
}

/**
 * Create a Meta rejection alert
 */
export async function createMetaRejectionAlert(coachId: string, reason?: string): Promise<string> {
  return createAlert({
    type: 'meta_rejection',
    coachId,
    message: `Campagne rejetee par Meta${reason ? `: ${reason}` : ''}`,
    reason,
  })
}

/**
 * Create a Meta account limit alert
 */
export async function createMetaAccountLimitAlert(coachId: string | null): Promise<string> {
  return createAlert({
    type: 'meta_account_limit',
    coachId,
    message: 'Limite de comptes publicitaires Meta atteinte',
  })
}

/**
 * Create a Meta API error alert
 */
export async function createMetaApiErrorAlert(coachId: string | null, reason?: string): Promise<string> {
  return createAlert({
    type: 'meta_api_error',
    coachId,
    message: `Erreur API Meta${reason ? `: ${reason}` : ''}`,
    reason,
  })
}
