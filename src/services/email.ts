/**
 * Email Service (Story 5.2)
 * Handles all email notifications via Resend API
 * Supports stub mode for development (no real emails sent)
 */

// Resend type definitions (avoid requiring npm install during implementation)
interface ResendEmailData {
  from: string
  to: string
  subject: string
  html: string
}

interface ResendResponse {
  id?: string
  error?: { message: string }
}

// Email service types
export interface WeeklyStats {
  impressionsThisWeek: number
  clicksThisWeek: number
  status: string
  weekStart: Date
  weekEnd: Date
}

export type AlertType =
  | 'meta_rejection'
  | 'payment_failed'
  | 'video_failed'
  | 'meta_account_limit'
  | 'meta_api_error'

interface CoachEmailInfo {
  email: string
  name: string
}

interface AlertData {
  type: AlertType
  message: string
  reason?: string
}

interface EmailResult {
  success: boolean
  messageId?: string
  error?: string
}

// Configuration from environment
const EMAIL_STUB_MODE = process.env.EMAIL_STUB_MODE === 'true'
const RESEND_API_KEY = process.env.RESEND_API_KEY || ''
const EMAIL_FROM = process.env.EMAIL_FROM || 'CoachUp <notifications@coachup.com>'
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://app.coachup.com'

// Alert configuration: subject, message template, next steps
const ALERT_CONFIG: Record<AlertType, { subject: string; message: string; nextSteps: string }> = {
  meta_rejection: {
    subject: 'Pub rejetée par Meta',
    message: 'Votre publicité a été rejetée par Meta.',
    nextSteps: 'Vérifiez que votre contenu respecte les règles publicitaires de Meta, puis resoumettez votre vidéo.',
  },
  payment_failed: {
    subject: 'Problème de paiement',
    message: 'Le paiement de votre abonnement a échoué.',
    nextSteps: 'Mettez à jour vos informations de paiement dans votre espace client.',
  },
  video_failed: {
    subject: 'Échec génération vidéo',
    message: 'La génération de votre vidéo a échoué.',
    nextSteps: 'Nous travaillons à résoudre le problème. Vous serez notifié dès que votre vidéo sera prête.',
  },
  meta_account_limit: {
    subject: 'Limite de comptes Meta atteinte',
    message: 'Nous avons atteint la limite de comptes publicitaires Meta.',
    nextSteps: 'Votre demande a été mise en attente et sera traitée automatiquement dès qu\'une place se libère.',
  },
  meta_api_error: {
    subject: 'Erreur technique Meta',
    message: 'Une erreur technique est survenue avec Meta.',
    nextSteps: 'Notre équipe a été notifiée et travaille à résoudre le problème.',
  },
}

/**
 * Generate HTML email template - Campaign Live
 */
function generateCampaignLiveHtml(name: string): string {
  const dashboardUrl = `${FRONTEND_URL}/dashboard`
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 8px 8px 0 0; }
    .header h1 { color: white; margin: 0; font-size: 24px; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
    .button { display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
    .footer { margin-top: 30px; font-size: 12px; color: #6b7280; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🎉 Votre pub est live!</h1>
  </div>
  <div class="content">
    <p>Bonjour ${name},</p>
    <p>Excellente nouvelle! Votre publicité Facebook/Instagram est maintenant <strong>active</strong>.</p>
    <p>Elle est désormais diffusée auprès de votre audience cible. Vous pouvez suivre ses performances en temps réel depuis votre dashboard.</p>
    <a href="${dashboardUrl}" class="button">Voir mon dashboard</a>
  </div>
  <div class="footer">
    <p>CoachUp - La plateforme des coachs sportifs</p>
    <p>Cet email a été envoyé automatiquement. <a href="${FRONTEND_URL}/settings/email">Gérer mes préférences</a></p>
  </div>
</body>
</html>
  `.trim()
}

/**
 * Generate HTML email template - Weekly Recap
 */
function generateWeeklyRecapHtml(name: string, stats: WeeklyStats): string {
  const dashboardUrl = `${FRONTEND_URL}/dashboard`
  const weekStartStr = stats.weekStart.toLocaleDateString('fr-FR')
  const weekEndStr = stats.weekEnd.toLocaleDateString('fr-FR')

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 8px 8px 0 0; }
    .header h1 { color: white; margin: 0; font-size: 24px; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
    .stats-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin: 20px 0; }
    .stat-card { background: white; padding: 20px; border-radius: 8px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .stat-value { font-size: 28px; font-weight: bold; color: #667eea; }
    .stat-label { font-size: 12px; color: #6b7280; text-transform: uppercase; }
    .status-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 14px; font-weight: 500; }
    .status-active { background: #d1fae5; color: #065f46; }
    .button { display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
    .footer { margin-top: 30px; font-size: 12px; color: #6b7280; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <h1>📊 Récap de votre semaine</h1>
  </div>
  <div class="content">
    <p>Bonjour ${name},</p>
    <p>Voici les performances de votre publicité du ${weekStartStr} au ${weekEndStr}:</p>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${stats.impressionsThisWeek.toLocaleString('fr-FR')}</div>
        <div class="stat-label">Vues</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.clicksThisWeek.toLocaleString('fr-FR')}</div>
        <div class="stat-label">Clics</div>
      </div>
    </div>

    <p><strong>Statut:</strong> <span class="status-badge status-active">${stats.status}</span></p>

    <a href="${dashboardUrl}" class="button">Voir les détails</a>
  </div>
  <div class="footer">
    <p>CoachUp - La plateforme des coachs sportifs</p>
    <p>Cet email a été envoyé automatiquement. <a href="${FRONTEND_URL}/settings/email">Gérer mes préférences</a></p>
  </div>
</body>
</html>
  `.trim()
}

/**
 * Generate HTML email template - Alert
 */
function generateAlertHtml(name: string, alert: AlertData): string {
  const dashboardUrl = `${FRONTEND_URL}/dashboard`
  const config = ALERT_CONFIG[alert.type]

  const alertMessage = alert.reason
    ? `${config.message} Raison: ${alert.reason}`
    : config.message

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #fef2f2; border-left: 4px solid #ef4444; padding: 20px; border-radius: 4px; }
    .header h1 { color: #991b1b; margin: 0; font-size: 20px; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; margin-top: 20px; }
    .alert-box { background: white; padding: 20px; border-radius: 8px; border: 1px solid #e5e7eb; margin: 20px 0; }
    .next-steps { background: #f0fdf4; border-left: 4px solid #22c55e; padding: 15px; margin: 20px 0; }
    .next-steps h3 { color: #166534; margin: 0 0 10px 0; font-size: 14px; }
    .button { display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
    .footer { margin-top: 30px; font-size: 12px; color: #6b7280; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <h1>⚠️ ${config.subject}</h1>
  </div>
  <div class="content">
    <p>Bonjour ${name},</p>

    <div class="alert-box">
      <p>${alertMessage}</p>
    </div>

    <div class="next-steps">
      <h3>Prochaines étapes</h3>
      <p>${config.nextSteps}</p>
    </div>

    <a href="${dashboardUrl}" class="button">Accéder à mon compte</a>
  </div>
  <div class="footer">
    <p>CoachUp - La plateforme des coachs sportifs</p>
    <p>Les alertes critiques ne peuvent pas être désactivées.</p>
  </div>
</body>
</html>
  `.trim()
}

/**
 * Send email via Resend API (real mode)
 */
async function sendViaResend(data: ResendEmailData): Promise<EmailResult> {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })

    const result: ResendResponse = await response.json()

    if (!response.ok || result.error) {
      console.error('[EmailService] Resend API error:', result.error)
      return { success: false, error: result.error?.message || 'Unknown error' }
    }

    console.log('[EmailService] Email sent successfully:', result.id)
    return { success: true, messageId: result.id }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[EmailService] Failed to send email:', message)
    return { success: false, error: message }
  }
}

/**
 * Send email in stub mode (log only)
 */
function sendViaStub(data: ResendEmailData): EmailResult {
  console.log('[EmailService] STUB MODE - Email would be sent:')
  console.log('  To:', data.to)
  console.log('  Subject:', data.subject)
  console.log('  From:', data.from)
  return { success: true, messageId: `stub_${Date.now()}` }
}

/**
 * Send email (stub or real based on configuration)
 */
async function sendEmail(data: ResendEmailData): Promise<EmailResult> {
  if (EMAIL_STUB_MODE) {
    return sendViaStub(data)
  }
  return sendViaResend(data)
}

// ============================================================================
// Public Email Service API
// ============================================================================

/**
 * Send "Campaign Live" notification email (AC1)
 */
export async function sendCampaignLive(coach: CoachEmailInfo): Promise<boolean> {
  console.log(`[EmailService] Sending campaign live email to ${coach.email}`)

  const result = await sendEmail({
    from: EMAIL_FROM,
    to: coach.email,
    subject: '🎉 Votre pub est live!',
    html: generateCampaignLiveHtml(coach.name),
  })

  return result.success
}

/**
 * Send weekly recap email (AC2)
 */
export async function sendWeeklyRecap(
  coach: CoachEmailInfo,
  stats: WeeklyStats
): Promise<boolean> {
  console.log(`[EmailService] Sending weekly recap email to ${coach.email}`)

  const result = await sendEmail({
    from: EMAIL_FROM,
    to: coach.email,
    subject: '📊 Récap de votre semaine CoachUp',
    html: generateWeeklyRecapHtml(coach.name, stats),
  })

  return result.success
}

/**
 * Send alert email (AC3)
 * Note: Alert emails are always sent (cannot be disabled by preferences)
 */
export async function sendAlertEmail(
  coach: CoachEmailInfo,
  alertType: AlertType,
  reason?: string
): Promise<boolean> {
  console.log(`[EmailService] Sending alert email (${alertType}) to ${coach.email}`)

  const config = ALERT_CONFIG[alertType]
  const alertData: AlertData = {
    type: alertType,
    message: config.message,
    reason,
  }

  const result = await sendEmail({
    from: EMAIL_FROM,
    to: coach.email,
    subject: `⚠️ ${config.subject}`,
    html: generateAlertHtml(coach.name, alertData),
  })

  return result.success
}

// ============================================================================
// Story 5.4: Support Ticket Email Functions
// ============================================================================

interface NewTicketData {
  ticketId: string
  subject: string
  description: string
  coachName: string
  coachEmail: string
}

interface TicketReplyData {
  ticketId: string
  subject: string
  replyContent: string
  coachName: string
  coachEmail: string
}

// Admin email for ticket notifications
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'damien@coachup.fr'

/**
 * Generate HTML email template - New Ticket Notification (to Admin)
 */
function generateNewTicketHtml(data: NewTicketData): string {
  const ticketUrl = `${FRONTEND_URL}/admin/tickets/${data.ticketId}`
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #4f46e5; padding: 20px; border-radius: 8px 8px 0 0; }
    .header h1 { color: white; margin: 0; font-size: 20px; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
    .info-box { background: white; padding: 15px; border-radius: 8px; border: 1px solid #e5e7eb; margin: 15px 0; }
    .info-label { font-size: 12px; color: #6b7280; text-transform: uppercase; margin-bottom: 4px; }
    .message-box { background: white; padding: 20px; border-left: 4px solid #4f46e5; margin: 20px 0; }
    .button { display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
    .footer { margin-top: 30px; font-size: 12px; color: #6b7280; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🎫 Nouveau ticket de support</h1>
  </div>
  <div class="content">
    <p>Un coach a créé un nouveau ticket de support:</p>

    <div class="info-box">
      <div class="info-label">Coach</div>
      <div><strong>${data.coachName}</strong> (${data.coachEmail})</div>
    </div>

    <div class="info-box">
      <div class="info-label">Sujet</div>
      <div><strong>${data.subject}</strong></div>
    </div>

    <div class="message-box">
      <div class="info-label">Message</div>
      <p>${data.description}</p>
    </div>

    <a href="${ticketUrl}" class="button">Voir le ticket</a>
  </div>
  <div class="footer">
    <p>CoachUp Admin - Notification automatique</p>
  </div>
</body>
</html>
  `.trim()
}

/**
 * Generate HTML email template - Ticket Reply Notification (to Coach)
 */
function generateTicketReplyHtml(data: TicketReplyData): string {
  const ticketUrl = `${FRONTEND_URL}/support/${data.ticketId}`
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 8px 8px 0 0; }
    .header h1 { color: white; margin: 0; font-size: 20px; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
    .subject-box { background: #e0e7ff; padding: 12px 15px; border-radius: 6px; margin: 15px 0; }
    .reply-box { background: white; padding: 20px; border-left: 4px solid #22c55e; margin: 20px 0; }
    .reply-label { font-size: 12px; color: #6b7280; text-transform: uppercase; margin-bottom: 10px; }
    .button { display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
    .footer { margin-top: 30px; font-size: 12px; color: #6b7280; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <h1>💬 Réponse à votre ticket</h1>
  </div>
  <div class="content">
    <p>Bonjour ${data.coachName},</p>
    <p>Nous avons répondu à votre ticket de support:</p>

    <div class="subject-box">
      <strong>${data.subject}</strong>
    </div>

    <div class="reply-box">
      <div class="reply-label">Réponse de l'équipe CoachUp</div>
      <p>${data.replyContent}</p>
    </div>

    <a href="${ticketUrl}" class="button">Voir la conversation</a>
  </div>
  <div class="footer">
    <p>CoachUp - La plateforme des coachs sportifs</p>
    <p><a href="${FRONTEND_URL}/support">Accéder à mes tickets</a></p>
  </div>
</body>
</html>
  `.trim()
}

/**
 * Send notification to admin when new ticket is created
 */
export async function sendNewTicketNotificationToAdmin(data: NewTicketData): Promise<boolean> {
  console.log(`[EmailService] Sending new ticket notification to admin for ticket ${data.ticketId}`)

  const result = await sendEmail({
    from: EMAIL_FROM,
    to: ADMIN_EMAIL,
    subject: `🎫 Nouveau ticket: ${data.subject}`,
    html: generateNewTicketHtml(data),
  })

  return result.success
}

/**
 * Send notification to coach when admin replies to ticket
 */
export async function sendTicketReplyNotification(data: TicketReplyData): Promise<boolean> {
  console.log(`[EmailService] Sending ticket reply notification to ${data.coachEmail}`)

  const result = await sendEmail({
    from: EMAIL_FROM,
    to: data.coachEmail,
    subject: `💬 Réponse à votre ticket: ${data.subject}`,
    html: generateTicketReplyHtml(data),
  })

  return result.success
}

// Export the email service object for easy mocking in tests
export const emailService = {
  sendCampaignLive,
  sendWeeklyRecap,
  sendAlertEmail,
  sendNewTicketNotificationToAdmin,
  sendTicketReplyNotification,
}
