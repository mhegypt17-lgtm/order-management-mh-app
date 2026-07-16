import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { render } from '@react-email/render'
import { requireAdmin } from '@/lib/admin-guard'
import DailyOpsReport from '@/emails/DailyOpsReport'
import { getDailyReportData, formatDailyReportSummary } from '@/lib/reports/daily'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/admin/reports/daily/send-test
 *
 * Admin-only. Sends yesterday's daily-ops report to every address in
 * REPORT_RECIPIENTS right now. Intended for iterating on the design
 * before waiting for the scheduled cron.
 */
export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdmin(request)
    if (guard instanceof NextResponse) return guard

    const resendKey = process.env.RESEND_API_KEY
    if (!resendKey) {
      return NextResponse.json(
        { error: 'RESEND_API_KEY is not configured' },
        { status: 500 },
      )
    }

    const recipientsRaw = process.env.REPORT_RECIPIENTS || ''
    const recipients = recipientsRaw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    if (recipients.length === 0) {
      return NextResponse.json(
        { error: 'REPORT_RECIPIENTS is empty' },
        { status: 500 },
      )
    }

    const fromAddress =
      process.env.REPORT_FROM_ADDRESS ||
      'MH Reports <onboarding@resend.dev>'
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''
    const browserUrl = appUrl
      ? `${appUrl.replace(/\/$/, '')}/admin/reports/preview`
      : undefined

    const data = await getDailyReportData()
    const html = await render(DailyOpsReport({ data, browserUrl }))
    const subject = `📊 [TEST] Daily Ops · ${data.reportDate} · ${formatDailyReportSummary(data)}`

    const resend = new Resend(resendKey)
    const { data: sent, error } = await resend.emails.send({
      from: fromAddress,
      to: recipients,
      subject,
      html,
    })

    if (error) {
      return NextResponse.json(
        { error: `Resend failed: ${error.message}` },
        { status: 502 },
      )
    }

    return NextResponse.json({
      ok: true,
      reportDate: data.reportDate,
      recipients: recipients.length,
      emailId: sent?.id ?? null,
      summary: formatDailyReportSummary(data),
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unexpected error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
