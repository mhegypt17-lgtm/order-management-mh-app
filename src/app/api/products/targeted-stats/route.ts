import { NextRequest, NextResponse } from 'next/server'
import {
  readOrderSettings,
  fetchRowsIn,
} from '@/lib/omsData'
import { supabase } from '@/lib/supabase'
import { addDays, cairoDateString, cairoFirstDayOfMonth, cairoLastDayOfMonth, cairoYMD } from '@/lib/cairoTime'

// This aggregate changes slowly (once per order edit, which is minutes apart)
// so a 5-minute cache is safe and dramatically reduces DB reads when multiple
// dashboards refresh in the same window.
export const revalidate = 300

// Aggregates units sold of targeted products in the CURRENT calendar month.
// An order counts in the month (Cairo time) in which the branch marked it
// 'تم التوصيل' (order_delivery.deliveredAt) — NOT the month it was placed. So
// an order placed on 31 Oct and delivered on 1 Nov belongs to November.
// Orders that are cancelled (لاغي) never count.
// Query params:
//   ?scope=cs|admin (default admin)
//   ?agent=<name>   (CS view: filter to one agent)
//
// Response:
// {
//   monthLabel: string,
//   totalUnits: number,         // CS agents only — excludes الفرع (branch) AND
//                                // Instashop (indirect/marketplace channel).
//                                // This is the number achievementPct is based on.
//   branchUnits: number,        // units attributed to orderReceiver === 'الفرع'
//                                // (walk-in/Branch-type orders + Instashop,
//                                // which is always auto-received by الفرع).
//                                // Never folded into totalUnits/perAgent.
//   bySource: [{ orderType, units }],  // ALL effective orders, every channel
//                                       // (including Instashop/Branch) — for
//                                       // admin segmentation views only.
//   productCount: number,       // # of products currently flagged
//   targetedProducts: [{ id, productName }],
//   perAgent: [{ agent, units }],    // real CS agents only, الفرع excluded
//   myUnits: number                  // only when ?agent= passed
// }
//
// Egress note (Phase 2C.2): previously read FOUR entire tables (all products,
// all orders, all items, all deliveries) then filtered in JS. New flow uses
// scoped fetches keyed off (targeted product ids) + (current-month order ids)
// so egress is bounded by the current month + targeted-product count rather
// than by lifetime history.
const BRANCH_RECEIVER = 'الفرع'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    // scope param kept for backwards-compat with callers even though we no
    // longer branch on it — agent scoping is driven by ?agent alone.
    void (searchParams.get('scope') || 'admin').toLowerCase()
    const agent = (searchParams.get('agent') || '').trim()

    const { year, month } = cairoYMD()
    const firstDay = cairoFirstDayOfMonth()
    const lastDay = cairoLastDayOfMonth()
    const monthLabel = `${String(month).padStart(2, '0')}/${year}`

    // 1) Targeted products, this month's deliveries, settings — parallel.
    // Counting is by DELIVERY date, so instead of selecting orders by
    // orderDate we select the order_delivery rows delivered this month (3
    // small columns) and fetch just those orders afterwards. Fetches EVERY
    // channel (no Instashop/Branch exclusion here) so bySource can segment
    // the full picture for admin — the agent-vs-branch split happens below,
    // in the aggregation step, not at the query level.
    //
    // The query window is padded by a day each side (UTC) and then narrowed
    // exactly by Cairo calendar date below, so Cairo/UTC offsets and DST
    // can never push a delivery into the wrong month.
    const [targetedRes, deliveriesRes, settings] = await Promise.all([
      supabase.from('products').select('id,productName').eq('isTargeted', true),
      supabase
        .from('order_delivery')
        .select('orderId,deliveredAt')
        .eq('deliveryStatus', 'تم التوصيل')
        .gte('deliveredAt', `${addDays(firstDay, -1)}T00:00:00.000Z`)
        .lte('deliveredAt', `${addDays(lastDay, 1)}T23:59:59.999Z`),
      readOrderSettings(),
    ])

    const monthlyGoal = Math.max(0, Number((settings as any)?.monthlyTargetedUnitsGoal) || 0)
    const targeted = ((targetedRes.data as unknown as { id: string; productName: string }[]) || [])
    const targetedIds = new Set(targeted.map((p) => p.id))

    const emptyResponse = (productCount: number) =>
      NextResponse.json({
        monthLabel,
        totalUnits: 0,
        branchUnits: 0,
        bySource: [],
        productCount,
        targetedProducts: targeted.map((p) => ({ id: p.id, productName: p.productName })),
        perAgent: [],
        myUnits: 0,
        monthlyGoal,
        achievementPct: 0,
      })

    if (targetedIds.size === 0) return emptyResponse(0)

    // Orders delivered within this Cairo calendar month.
    const deliveredThisMonthIds = ((deliveriesRes.data as any[]) || [])
      .filter((d) => {
        if (!d.deliveredAt) return false
        const day = cairoDateString(d.deliveredAt)
        return day >= firstDay && day <= lastDay
      })
      .map((d) => String(d.orderId))
    if (deliveredThisMonthIds.length === 0) return emptyResponse(targeted.length)

    // 2) Those orders + items for targeted products — parallel. fetchRowsIn
    //    chunks the ID list to stay under the URL length limit.
    const [monthOrders, targetedItems] = await Promise.all([
      fetchRowsIn<{ id: string; orderStatus: string; orderReceiver: string; createdBy: string; orderType: string }>(
        'orders',
        'id',
        deliveredThisMonthIds,
        'id,orderStatus,orderReceiver,createdBy,orderType',
      ),
      fetchRowsIn<{ orderId: string; productId: string; quantity: number }>(
        'order_items',
        'productId',
        Array.from(targetedIds),
        'orderId,productId,quantity',
      ),
    ])

    // Effective orders = delivered this month and not cancelled. Every
    // aggregation below (agents, branch, bySource) is scoped to
    // effectiveById only, so nothing counts an undelivered order.
    const effectiveById = new Map<string, any>()
    for (const o of monthOrders) {
      if (o.orderStatus !== 'لاغي') effectiveById.set(o.id, o)
    }

    // Sum quantities of targeted items linked to those orders.
    // Group by orderReceiver (the متلقي الطلب field on the order), falling back
    // to createdBy for legacy orders missing the receiver. الفرع (branch —
    // covers both orderType='Branch' walk-ins and Instashop, which is always
    // auto-received by الفرع) is tracked separately and NEVER folded into
    // totalUnits/perAgent/achievementPct — those must reflect CS agents only.
    let totalUnits = 0
    let branchUnits = 0
    const perAgentMap: Record<string, number> = {}
    const bySourceMap: Record<string, number> = {}
    let myUnits = 0

    for (const it of targetedItems) {
      const o = effectiveById.get(it.orderId)
      if (!o) continue
      const qty = Number(it.quantity) || 0
      if (qty <= 0) continue

      const channel = String(o.orderType || '').trim() || 'غير محدد'
      bySourceMap[channel] = (bySourceMap[channel] || 0) + qty

      const who =
        String(o.orderReceiver || '').trim() ||
        String(o.createdBy || '').trim() ||
        'غير معروف'
      if (who === BRANCH_RECEIVER) {
        branchUnits += qty
        continue
      }

      totalUnits += qty
      perAgentMap[who] = (perAgentMap[who] || 0) + qty
      if (agent && who === agent) myUnits += qty
    }

    const perAgent = Object.entries(perAgentMap)
      .map(([a, u]) => ({ agent: a, units: u }))
      .sort((a, b) => b.units - a.units)

    const bySource = Object.entries(bySourceMap)
      .map(([orderType, units]) => ({ orderType, units }))
      .sort((a, b) => b.units - a.units)

    return NextResponse.json({
      monthLabel,
      totalUnits,
      branchUnits,
      bySource,
      productCount: targeted.length,
      targetedProducts: targeted.map((p) => ({
        id: p.id,
        productName: p.productName,
      })),
      perAgent, // always include: small list, useful for both admin and CS
      myUnits,
      monthlyGoal,
      achievementPct: monthlyGoal > 0 ? Math.round((totalUnits / monthlyGoal) * 1000) / 10 : 0,
    })
  } catch (err) {
    console.error('targeted-stats error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
