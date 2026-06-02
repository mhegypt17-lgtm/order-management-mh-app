import { NextRequest, NextResponse } from 'next/server'
import {
  readProducts,
  readOrders,
  readOrderItems,
  readOrderDelivery,
} from '@/lib/omsData'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// Aggregates units sold of targeted products in the CURRENT calendar month.
// Successful orders only (orderStatus === 'تم').
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
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const scope = (searchParams.get('scope') || 'admin').toLowerCase()
    const agent = (searchParams.get('agent') || '').trim()

    const now = new Date()
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .slice(0, 10)
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      .toISOString()
      .slice(0, 10)
    const monthLabel = `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`

    const [products, orders, items, deliveries] = await Promise.all([
      readProducts(),
      readOrders(),
      readOrderItems(),
      readOrderDelivery(),
    ])

    const targeted = products.filter((p: any) => Boolean(p.isTargeted))
    const targetedIds = new Set(targeted.map((p) => p.id))

    if (targetedIds.size === 0) {
      return NextResponse.json({
        monthLabel,
        totalUnits: 0,
        productCount: 0,
        targetedProducts: [],
        perAgent: [],
        myUnits: 0,
      })
    }

    // Build delivered set: orderId -> true when branch marked as 'تم التوصيل'.
    const deliveredOrderIds = new Set<string>()
    for (const d of deliveries) {
      if (d.deliveryStatus === 'تم التوصيل') deliveredOrderIds.add(d.orderId)
    }

    // An order COUNTS if:
    //   - it is in the current calendar month, AND
    //   - orderStatus === 'تم'  OR  branch marked it 'تم التوصيل'.
    const monthOrders = orders.filter((o: any) => {
      const d = String(o.orderDate || '').slice(0, 10)
      if (!(d >= firstDay && d <= lastDay)) return false
      return o.orderStatus === 'تم' || deliveredOrderIds.has(o.id)
    })
    const orderById = new Map<string, any>()
    for (const o of monthOrders) orderById.set(o.id, o)

    // Sum quantities of targeted items linked to those orders.
    // Group by orderReceiver (the متلقي الطلب field on the order), falling back
    // to createdBy for legacy orders missing the receiver.
    let totalUnits = 0
    const perAgentMap: Record<string, number> = {}
    let myUnits = 0

    for (const it of items) {
      if (!targetedIds.has(it.productId)) continue
      const o = orderById.get(it.orderId)
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
    })
  } catch (err) {
    console.error('targeted-stats error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
