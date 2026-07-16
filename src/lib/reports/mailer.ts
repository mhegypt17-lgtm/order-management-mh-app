import nodemailer from 'nodemailer'

/**
 * Shared Gmail SMTP transport. Reads credentials from env:
 *   GMAIL_USER          — the full Gmail address (e.g. mh.egypt17@gmail.com)
 *   GMAIL_APP_PASSWORD  — a 16-char App Password from
 *                         https://myaccount.google.com/apppasswords
 *   REPORT_FROM_ADDRESS — optional friendly "From" (defaults to GMAIL_USER)
 *
 * Gmail free limits: 500 recipients/day. More than enough for a daily
 * ops report to a handful of admins.
 */

export interface SendOptions {
  to: string[]
  subject: string
  html: string
}

export interface SendResult {
  messageId: string
  accepted: string[]
  rejected: string[]
}

export function getMailerConfig() {
  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD
  const from = process.env.REPORT_FROM_ADDRESS || (user ? `MH Reports <${user}>` : '')
  return { user, pass, from }
}

export async function sendReportEmail(opts: SendOptions): Promise<SendResult> {
  const { user, pass, from } = getMailerConfig()
  if (!user || !pass) {
    throw new Error(
      'Gmail credentials missing. Set GMAIL_USER and GMAIL_APP_PASSWORD env vars.',
    )
  }
  if (opts.to.length === 0) {
    throw new Error('No recipients configured (REPORT_RECIPIENTS is empty).')
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  })

  const info = await transporter.sendMail({
    from,
    to: opts.to.join(', '),
    subject: opts.subject,
    html: opts.html,
  })

  return {
    messageId: info.messageId,
    accepted: (info.accepted ?? []).map(String),
    rejected: (info.rejected ?? []).map(String),
  }
}
