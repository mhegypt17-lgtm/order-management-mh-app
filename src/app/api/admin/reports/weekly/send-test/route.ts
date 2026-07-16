import { NextRequest, NextResponse } from 'next/server'
import { render } from '@react-email/render'
import { requireAdmin } from '@/lib/admin-guard'
import WeeklyOpsDigest from '@/emails/WeeklyOpsDigest'
import { getWeeklyReportData, formatWeeklyReportSummary } from '@/lib/reports/weekly'
import { sendReportEmail } from '@/lib/reports/mailer'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/admin/reports/weekly/send-test
 * Admin-only. Sends the weekly digest right now to REPORT_RECIPIENTS.
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
      return NextResponse.json({ error: 'REPORT_RECIPIENTS is empty' }, { status: 500 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''
    const browserUrl = appUrl
      ? `${appUrl.replace(/\/$/, '')}/admin/reports/preview`
      : undefined

    const data = await getWeeklyReportData()
    const html = await render(WeeklyOpsDigest({ data, browserUrl }))
    const subject = `📈 [TEST] Weekly Ops · ${data.weekStart} → ${data.weekEnd}`

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
