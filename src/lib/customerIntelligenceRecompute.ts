// Recomputes Tier 1 "Customer Intelligence" scores for every customer and
// upserts them into customer_intelligence_scores (see data/customer-
// intelligence-scores-migration.sql). Called nightly by
// /api/cron/customer-intelligence, and on-demand by the admin "تحديث الآن"
// button — never on a normal page load, so the read path is a plain table
// select with zero recomputation cost.
import { supabase } from '@/lib/supabase'
import { readOrderSettings } from '@/lib/omsData'
import {
  computeCustomerIntelligence,
  DEFAULT_CUSTOMER_INTELLIGENCE_CONFIG,
} from '@/lib/customerIntelligence'
import { resolveDimensionScores } from '@/lib/feedbackDimensions'

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export async function recomputeCustomerIntelligence(): Promise<{ count: number; computedAt: string }> {
  const settings = await readOrderSettings()
  const config = (settings as any).customerIntelligence || DEFAULT_CUSTOMER_INTELLIGENCE_CONFIG

  const [customersRes, ordersRes, complaintsRes, feedbackRes] = await Promise.all([
    supabase.from('customers').select('id, customerName, phone'),
    supabase
      .from('orders')
      .select('id, customerId, orderTotal, orderStatus, createdAt')
      .neq('orderStatus', 'لاغي'),
    supabase.from('complaints').select('customerId, priority, status'),
    supabase
      .from('order_feedback')
      .select(
        'customerId, rating, productQuality, packaging, deliveryTimeliness, customerService, pricingValue, appUsability, recommendToFriends',
      ),
  ])

  const customers = customersRes.data || []
  const orders = ordersRes.data || []
  const complaints = complaintsRes.data || []
  const feedback = feedbackRes.data || []

  const ordersByCustomer = new Map<string, typeof orders>()
  for (const o of orders) {
    if (!o.customerId) continue
    const list = ordersByCustomer.get(o.customerId) || []
    list.push(o)
    ordersByCustomer.set(o.customerId, list)
  }
  const complaintsByCustomer = new Map<string, typeof complaints>()
  for (const c of complaints) {
    if (!c.customerId) continue
    const list = complaintsByCustomer.get(c.customerId) || []
    list.push(c)
    complaintsByCustomer.set(c.customerId, list)
  }
  const feedbackByCustomer = new Map<string, typeof feedback>()
  for (const fb of feedback) {
    if (!fb.customerId) continue
    const list = feedbackByCustomer.get(fb.customerId) || []
    list.push(fb)
    feedbackByCustomer.set(fb.customerId, list)
  }

  const computedAt = new Date().toISOString()

  const rows = customers.map((c) => {
    const custOrders = (ordersByCustomer.get(c.id) || [])
      .slice()
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    const custComplaints = complaintsByCustomer.get(c.id) || []
    const custFeedback = (feedbackByCustomer.get(c.id) || []).map((fb) => ({
      rating: Number(fb.rating) || 0,
      dimensionScores: resolveDimensionScores(fb as any),
    }))

    const intel = computeCustomerIntelligence(
      {
        customerId: c.id,
        orders: custOrders.map((o) => ({ createdAt: o.createdAt, orderTotal: Number(o.orderTotal) || 0 })),
        complaints: custComplaints.map((cp) => ({
          priority: (cp.priority as 'low' | 'medium' | 'high') || 'low',
          status: (cp.status as 'open' | 'in-progress' | 'closed') || 'open',
        })),
        feedback: custFeedback,
      },
      config,
    )

    let isSpendingUp = false
    if (custOrders.length >= 4) {
      const trailing = custOrders.slice(-3)
      const prior = custOrders.slice(0, -3)
      const trailingAvg = trailing.reduce((s, o) => s + (Number(o.orderTotal) || 0), 0) / trailing.length
      const priorAvg = prior.reduce((s, o) => s + (Number(o.orderTotal) || 0), 0) / prior.length
      isSpendingUp =
        priorAvg > 0 && ((trailingAvg - priorAvg) / priorAvg) * 100 >= config.opportunities.spendingUpMinIncreasePct
    }
    const isReactivatedOpportunity =
      intel.lifecycleStage === 'تم استرجاعه' &&
      intel.daysSinceLastOrder != null &&
      intel.daysSinceLastOrder <= config.opportunities.reactivationLookbackDays

    return {
      customerId: c.id,
      customerName: c.customerName,
      phone: c.phone,
      r: intel.rfm.r,
      f: intel.rfm.f,
      m: intel.rfm.m,
      rfmLabel: intel.rfm.label,
      lifecycleStage: intel.lifecycleStage,
      healthScore: intel.healthScore,
      healthBreakdown: intel.healthBreakdown,
      churnRisk: intel.churnRisk,
      retentionPct: intel.retentionPct,
      daysSinceLastOrder: intel.daysSinceLastOrder,
      typicalIntervalDays: intel.typicalIntervalDays,
      totalOrders: intel.totalOrders,
      totalRevenue: intel.totalRevenue,
      cohortMonth: intel.cohortMonth,
      isReactivatedOpportunity,
      isSpendingUp,
      computedAt,
    }
  })

  for (const batch of chunk(rows, 500)) {
    const { error } = await supabase.from('customer_intelligence_scores').upsert(batch, { onConflict: 'customerId' })
    if (error) throw new Error(`customer_intelligence_scores upsert failed: ${error.message}`)
  }

  return { count: rows.length, computedAt }
}
