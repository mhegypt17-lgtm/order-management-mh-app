import { NextRequest, NextResponse } from 'next/server'
import {
  readOrderSettings,
  fetchRowsIn,
} from '@/lib/omsData'
import { supabase } from '@/lib/supabase'
import { cairoFirstDayOfMonth, cairoLastDayOfMonth, cairoYMD } from '@/lib/cairoTime'

// This aggregate changes slowly (once per order edit, which is minutes apart)
// so a 5-minute cache is safe and dramatically reduces DB reads when multiple
// dashboards refresh in the same window.
export const revalidate = 300

// Aggregates units sold of targeted products in the CURRENT calendar month.
// Successful orders only (orderStatus === 'تم' OR branch delivered).
// Query params:
//   ?scope=cs|admin (default admin)
//   ?agent=<name>   (CS view: filter to one agent)
//
// Response:
// {
//   monthLabel: string,
//   totalUnits: number,         // ALL agents (admin/global view)
//   productCount: number,       // # of products currently flagged
//   targetedProducts: [{ id, productName }],
//   perAgent: [{ agent, units }],    // admin only
//   myUnits: number                  // only when ?agent= passed
// }
//
// Egress note (Phase 2C.2): previously read FOUR entire tables (all products,
// all orders, all items, all deliveries) then filtered in JS. New flow uses
// scoped fetches keyed off (targeted product ids) + (current-month order ids)
// so egress is bounded by the current month + targeted-product count rather
// than by lifetime history.
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

    // 1) Targeted products, month orders, settings — parallel.
    const [targetedRes, monthOrdersRes, settings] = await Promise.all([
      supabase.from('products').select('id,productName').eq('isTargeted', true),
      supabase
        .from('orders')
        .select('id,orderDate,orderStatus,orderReceiver,createdBy')
        .gte('orderDate', firstDay)
        .lte('orderDate', lastDay),
      readOrderSettings(),
    ])

    const monthlyGoal = Math.max(0, Number((settings as any)?.monthlyTargetedUnitsGoal) || 0)
    const targeted = ((targetedRes.data as unknown as { id: string; productName: string }[]) || [])
    const targetedIds = new Set(targeted.map((p) => p.id))

    const emptyResponse = (productCount: number) =>
      NextResponse.json({
        monthLabel,
        totalUnits: 0,
        productCount,
        targetedProducts: targeted.map((p) => ({ id: p.id, productName: p.productName })),
        perAgent: [],
        myUnits: 0,
        monthlyGoal,
        achievementPct: 0,
      })

    if (targetedIds.size === 0) return emptyResponse(0)

    const monthOrders = (monthOrdersRes.data as any[]) || []
    if (monthOrders.length === 0) return emptyResponse(targeted.length)
    const monthOrderIds = monthOrders.map((o) => o.id)

    // 2) Deliveries for month orders + items for targeted products — parallel.
    //    fetchRowsIn chunks the ID list to stay under the URL length limit.
    const [deliveryRows, targetedItems] = await Promise.all([
      fetchRowsIn<{ orderId: string; deliveryStatus: string }>(
        'order_delivery',
        'orderId',
        monthOrderIds,
        'orderId,deliveryStatus',
      ),
      fetchRowsIn<{ orderId: string; productId: string; quantity: number }>(
        'order_items',
        'productId',
        Array.from(targetedIds),
        'orderId,productId,quantity',
      ),
    ])

    const deliveredOrderIds = new Set<string>()
    for (const d of deliveryRows) {
      if (d.deliveryStatus === 'تم التوصيل') deliveredOrderIds.add(d.orderId)
    }

    // Effective month orders = completed OR branch-delivered.
    const effectiveById = new Map<string, any>()
    for (const o of monthOrders) {
      if (o.orderStatus === 'تم' || deliveredOrderIds.has(o.id)) {
        effectiveById.set(o.id, o)
      }
    }

    // Sum quantities of targeted items linked to those orders.
    // Group by orderReceiver (the متلقي الطلب field on the order), falling back
    // to createdBy for legacy orders missing the receiver.
    let totalUnits = 0
    const perAgentMap: Record<string, number> = {}
    let myUnits = 0

    for (const it of targetedItems) {
      const o = effectiveById.get(it.orderId)
      if (!o) continue
      const qty = Number(it.quantity) || 0
      if (qty <= 0) continue
      totalUnits += qty
      const who =
        String(o.orderReceiver || '').trim() ||
        String(o.createdBy || '').trim() ||
        'غير معروف'
      perAgentMap[who] = (perAgentMap[who] || 0) + qty
      if (agent && who === agent) myUnits += qty
    }

    const perAgent = Object.entries(perAgentMap)
      .map(([a, u]) => ({ agent: a, units: u }))
      .sort((a, b) => b.units - a.units)

    return NextResponse.json({
      monthLabel,
      totalUnits,
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
