import { NextRequest, NextResponse } from 'next/server'
import { render } from '@react-email/render'
import { requireAdmin } from '@/lib/admin-guard'
import DailyOpsReport from '@/emails/DailyOpsReport'
import { getDailyReportData, formatDailyReportSummary } from '@/lib/reports/daily'
import { sendReportEmail } from '@/lib/reports/mailer'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/admin/reports/daily/send-test
 *
 * Admin-only. Sends yesterday's daily-ops report to every address in
 * REPORT_RECIPIENTS right now via Gmail SMTP.
 */
export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdmin(request)
    if (guard instanceof NextResponse) return guard

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

    const data = await getDailyReportData()
    const html = await render(DailyOpsReport({ data, browserUrl }))
    const subject = `📊 [TEST] Daily Ops · ${data.reportDate} · ${formatDailyReportSummary(data)}`

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
