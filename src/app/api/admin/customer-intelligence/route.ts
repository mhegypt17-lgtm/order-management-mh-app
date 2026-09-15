import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { recomputeCustomerIntelligence } from '@/lib/customerIntelligenceRecompute'

// Tier 1 "Customer Intelligence" — hidden feature (2026-09), not linked from
// any nav yet. Pure read from customer_intelligence_scores — scores are
// computed nightly by /api/cron/customer-intelligence (see vercel.json),
// NOT recalculated here. Every page view is a single indexed table select,
// zero live recomputation cost (2026-09-15 — moved off in-request compute
// + ephemeral cache per explicit request: persisted table, not calc-on-load).
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('customer_intelligence_scores')
      .select('*')
      .order('healthScore', { ascending: true })

    if (error) {
      console.error('[customer-intelligence] read failed:', error)
      return NextResponse.json({ error: 'Failed to read customer intelligence' }, { status: 500 })
    }

    const rows = data || []
    const customers = rows.map((row: any) => ({
      id: row.customerId,
      customerName: row.customerName,
      phone: row.phone,
      rfm: { r: row.r, f: row.f, m: row.m, label: row.rfmLabel },
      lifecycleStage: row.lifecycleStage,
      healthScore: row.healthScore,
      healthBreakdown: row.healthBreakdown,
      churnRisk: row.churnRisk,
      retentionPct: row.retentionPct,
      daysSinceLastOrder: row.daysSinceLastOrder,
      typicalIntervalDays: row.typicalIntervalDays,
      totalOrders: row.totalOrders,
      totalRevenue: row.totalRevenue,
      cohortMonth: row.cohortMonth,
      isReactivatedOpportunity: Boolean(row.isReactivatedOpportunity),
      isSpendingUp: Boolean(row.isSpendingUp),
    }))

    const opportunities = {
      atRisk: rows.filter((r: any) => r.lifecycleStage === 'في خطر').length,
      reactivated: rows.filter((r: any) => r.isReactivatedOpportunity).length,
      spendingUp: rows.filter((r: any) => r.isSpendingUp).length,
    }

    const computedAt = rows.length > 0 ? rows[0].computedAt : null

    return NextResponse.json({ generatedAt: computedAt, opportunities, customers }, { status: 200 })
  } catch (err) {
    console.error('[customer-intelligence] failed:', err)
    return NextResponse.json({ error: 'Failed to read customer intelligence' }, { status: 500 })
  }
}

// POST — manual "تحديث الآن" trigger from the admin page. Runs the exact
// same recompute the nightly cron does; lets an admin refresh on demand
// without waiting for the 2am job, without making every normal page view
// pay that cost.
export async function POST() {
  try {
    const result = await recomputeCustomerIntelligence()
    return NextResponse.json(result, { status: 200 })
  } catch (err: any) {
    console.error('[customer-intelligence] manual recompute failed:', err)
    return NextResponse.json({ error: err?.message || 'Recompute failed' }, { status: 500 })
  }
}
