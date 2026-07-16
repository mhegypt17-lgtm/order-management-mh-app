import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { render } from '@react-email/render'
import DailyOpsReport from '@/emails/DailyOpsReport'
import { getDailyReportData, formatDailyReportSummary } from '@/lib/reports/daily'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/cron/reports/daily
 *
 * Called by Vercel Cron every morning. Verifies the shared secret,
 * generates yesterday's report, renders it via @react-email/render,
 * and sends via Resend to every address in REPORT_RECIPIENTS.
 *
 * Also callable manually with:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://.../api/cron/reports/daily
 * for testing without waiting for the scheduled fire.
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

    // ─── Config ─────────────────────────────────────────────
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

    // ─── Build report ───────────────────────────────────────
    const data = await getDailyReportData()
    const html = await render(
      DailyOpsReport({ data, browserUrl }),
    )
    const subject = `📊 Daily Ops · ${data.reportDate} · ${formatDailyReportSummary(data)}`

    // ─── Send ───────────────────────────────────────────────
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
