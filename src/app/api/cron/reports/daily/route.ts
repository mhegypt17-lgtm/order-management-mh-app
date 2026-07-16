import { NextRequest, NextResponse } from 'next/server'
import { render } from '@react-email/render'
import DailyOpsReport from '@/emails/DailyOpsReport'
import { getDailyReportData, formatDailyReportSummary } from '@/lib/reports/daily'
import { sendReportEmail } from '@/lib/reports/mailer'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/cron/reports/daily
 *
 * Called by Vercel Cron every morning at 03:00 UTC. Verifies the shared
 * secret, generates yesterday's report, renders it via @react-email/render,
 * and sends via Gmail SMTP to every address in REPORT_RECIPIENTS.
 *
 * Also callable manually with:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://.../api/cron/reports/daily
 */
export async function GET(request: NextRequest) {
  try {
    // ─── Auth ───────────────────────────────────────────────
    const authHeader = request.headers.get('authorization') || ''
    const cronSecret = process.env.CRON_SECRET
    if (!cronSecret) {
      return NextResponse.json(
        { error: 'CRON_SECRET is not configured' },
        { status: 500 },
      )
    }
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : ''
    if (token !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ─── Recipients ─────────────────────────────────────────
    const recipients = (process.env.REPORT_RECIPIENTS || '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    if (recipients.length === 0) {
      return NextResponse.json(
        { error: 'REPORT_RECIPIENTS is empty' },
        { status: 500 },
      )
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''
    const browserUrl = appUrl
      ? `${appUrl.replace(/\/$/, '')}/admin/reports/preview`
      : undefined

    // ─── Build report ───────────────────────────────────────
    const data = await getDailyReportData()
    const html = await render(DailyOpsReport({ data, browserUrl }))
    const subject = `📊 Daily Ops · ${data.reportDate} · ${formatDailyReportSummary(data)}`

    // ─── Send via Gmail SMTP ────────────────────────────────
    const result = await sendReportEmail({ to: recipients, subject, html })

    return NextResponse.json({
      ok: true,
      reportDate: data.reportDate,
      recipients: recipients.length,
      accepted: result.accepted.length,
      rejected: result.rejected.length,
      messageId: result.messageId,
      summary: formatDailyReportSummary(data),
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unexpected error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
