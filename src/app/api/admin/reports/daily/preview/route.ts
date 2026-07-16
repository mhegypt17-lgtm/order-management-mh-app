import { NextRequest, NextResponse } from 'next/server'
import { render } from '@react-email/render'
import { requireAdmin } from '@/lib/admin-guard'
import DailyOpsReport from '@/emails/DailyOpsReport'
import { getDailyReportData } from '@/lib/reports/daily'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/admin/reports/daily/preview
 *
 * Admin-only. Returns the rendered daily-report HTML (same content the
 * cron will email) so the admin preview page can iframe it. Never sends
 * an email.
 */
export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdmin(request)
    if (guard instanceof NextResponse) return guard

    const data = await getDailyReportData()
    const html = await render(DailyOpsReport({ data }))
    return new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unexpected error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
