import { NextRequest, NextResponse } from 'next/server'
import { recomputeCustomerIntelligence } from '@/lib/customerIntelligenceRecompute'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/cron/customer-intelligence
 *
 * Called by Vercel Cron nightly (see vercel.json). Recomputes RFM/lifecycle/
 * health-score for every customer and upserts into
 * customer_intelligence_scores — the admin page only ever reads that table,
 * it never recomputes on page load.
 *
 * Also callable manually with:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://.../api/cron/customer-intelligence
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

    const result = await recomputeCustomerIntelligence()
    return NextResponse.json(result, { status: 200 })
  } catch (err: any) {
    console.error('[cron/customer-intelligence] failed:', err)
    return NextResponse.json({ error: err?.message || 'Recompute failed' }, { status: 500 })
  }
}
