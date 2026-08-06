import { NextRequest, NextResponse } from 'next/server'
import { render } from '@react-email/render'
import { requireAdmin } from '@/lib/admin-guard'
import MonthlyOpsReport from '@/emails/MonthlyOpsReport'
import { getMonthlyReportData } from '@/lib/reports/monthly'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/admin/reports/monthly/preview
 * Admin-only. Returns rendered monthly report HTML. Never sends email.
 *
 * No cron/send-test route exists yet for this report — content-only
 * while it's being finalized (per explicit request: don't schedule
 * sending until the content is done).
 */
export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdmin(request)
    if (guard instanceof NextResponse) return guard

    const data = await getMonthlyReportData()
    const html = await render(MonthlyOpsReport({ data }))
    return new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unexpected error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
