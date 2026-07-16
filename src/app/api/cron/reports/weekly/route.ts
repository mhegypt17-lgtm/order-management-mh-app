import { NextRequest, NextResponse } from 'next/server'
import { render } from '@react-email/render'
import WeeklyOpsDigest from '@/emails/WeeklyOpsDigest'
import { getWeeklyReportData, formatWeeklyReportSummary } from '@/lib/reports/weekly'
import { sendReportEmail } from '@/lib/reports/mailer'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/cron/reports/weekly
 *
 * Called by Vercel Cron every Sunday at 06:00 UTC (~8 AM Cairo).
 * Covers the 7 days ending yesterday (Sun–Sat). Sends the digest
 * to every address in REPORT_RECIPIENTS via Gmail SMTP.
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') || ''
    const cronSecret = process.env.CRON_SECRET
    if (!cronSecret) {
      return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 })
    }
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
    if (token !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const recipients = (process.env.REPORT_RECIPIENTS || '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    if (recipients.length === 0) {
      return NextResponse.json({ error: 'REPORT_RECIPIENTS is empty' }, { status: 500 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''
    const browserUrl = appUrl
      ? `${appUrl.replace(/\/$/, '')}/admin/reports/preview`
      : undefined

    const data = await getWeeklyReportData()
    const html = await render(WeeklyOpsDigest({ data, browserUrl }))
    const subject = `📈 Weekly Ops · ${data.weekStart} → ${data.weekEnd} · ${formatWeeklyReportSummary(data)}`

    const result = await sendReportEmail({ to: recipients, subject, html })

    return NextResponse.json({
      ok: true,
      weekStart: data.weekStart,
      weekEnd: data.weekEnd,
      recipients: recipients.length,
      accepted: result.accepted.length,
      rejected: result.rejected.length,
      messageId: result.messageId,
      summary: formatWeeklyReportSummary(data),
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unexpected error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
