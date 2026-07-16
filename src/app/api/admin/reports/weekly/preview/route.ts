import { NextRequest, NextResponse } from 'next/server'
import { render } from '@react-email/render'
import { requireAdmin } from '@/lib/admin-guard'
import WeeklyOpsDigest from '@/emails/WeeklyOpsDigest'
import { getWeeklyReportData } from '@/lib/reports/weekly'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/admin/reports/weekly/preview
 * Admin-only. Returns rendered weekly digest HTML. Never sends email.
 */
export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdmin(request)
    if (guard instanceof NextResponse) return guard

    const data = await getWeeklyReportData()
    const html = await render(WeeklyOpsDigest({ data }))
    return new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unexpected error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
