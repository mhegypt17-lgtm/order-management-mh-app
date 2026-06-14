import { NextRequest, NextResponse } from 'next/server'
import {
  readProducts,
  readOrders,
  readOrderItems,
} from '@/lib/omsData'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// Product Sales Report — units sold per product within a date range.
// Successful orders only (orderStatus === 'تم').
//
// Query params:
//   from=YYYY-MM-DD   (required)  inclusive
//   to=YYYY-MM-DD     (required)  inclusive
//   category=<name>   (optional)  filter by product category
//   targetedOnly=1    (optional)  only targeted products
//   activeOnly=1      (optional)  only currently active products
//
// Response:
// {
//   from, to, orderCount, totalUnits, totalRevenue,
//   rows: [{ productId, productName, productCategory, isTargeted, isActive,
//            units, revenue, orderCount, sharePct }],
//   categories: string[]   // distinct categories present in the catalogue
// }
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const from = (searchParams.get('from') || '').slice(0, 10)
    const to = (searchParams.get('to') || '').slice(0, 10)
    const category = (searchParams.get('category') || '').trim()
    const targetedOnly = searchParams.get('targetedOnly') === '1'
    const activeOnly = searchParams.get('activeOnly') === '1'

    if (!from || !to) {
      return NextResponse.json({ error: 'from and to are required (YYYY-MM-DD)' }, { status: 400 })
    }

    const [products, orders, items] = await Promise.all([
      readProducts(),
      readOrders(),
      readOrderItems(),
    ])

    // Build product lookup (apply catalogue-level filters here so a row only
    // exists in the report if its product matches the filter).
    const productById = new Map<string, any>()
    const categoriesSet = new Set<string>()
    for (const p of products) {
      const cat = (p as any).productCategory || (p as any).category || ''
      if (cat) categoriesSet.add(cat)
      if (targetedOnly && !(p as any).isTargeted) continue
      if (activeOnly && (p as any).isActive === false) continue
      if (category && cat !== category) continue
      productById.set(p.id, { ...p, productCategory: cat })
    }

    // Filter orders to the date range AND successful status.
    // orderDate is stored as 'YYYY-MM-DD' (Cairo wall clock) so string
    // comparison is safe and avoids any timezone drift.
    const rangeOrders = orders.filter((o: any) => {
      const d = String(o.orderDate || '').slice(0, 10)
      if (!(d >= from && d <= to)) return false
      return o.orderStatus === 'تم'
    })
    const orderById = new Map<string, any>()
    for (const o of rangeOrders) orderById.set(o.id, o)

    // Aggregate per product.
    type Agg = { units: number; revenue: number; orderIds: Set<string> }
    const aggByProduct = new Map<string, Agg>()
    let totalUnits = 0
    let totalRevenue = 0

    for (const it of items) {
      const o = orderById.get(it.orderId)
      if (!o) continue
      const product = productById.get(it.productId)
      if (!product) continue // product filtered out
      const qty = Number(it.quantity) || 0
      const lineTotal = Number(it.lineTotal) || qty * (Number(it.unitPrice) || 0)
      if (qty <= 0) continue
      let agg = aggByProduct.get(it.productId)
      if (!agg) {
        agg = { units: 0, revenue: 0, orderIds: new Set() }
        aggByProduct.set(it.productId, agg)
      }
      agg.units += qty
      agg.revenue += lineTotal
      agg.orderIds.add(it.orderId)
      totalUnits += qty
      totalRevenue += lineTotal
    }

    const rows = Array.from(aggByProduct.entries())
      .map(([productId, agg]) => {
        const p = productById.get(productId) || {}
        return {
          productId,
          productName: p.productName || '(محذوف)',
          productCategory: p.productCategory || '',
          isTargeted: !!p.isTargeted,
          isActive: p.isActive !== false,
          units: agg.units,
          revenue: Math.round(agg.revenue * 100) / 100,
          orderCount: agg.orderIds.size,
          sharePct: totalUnits > 0 ? Math.round((agg.units / totalUnits) * 1000) / 10 : 0,
        }
      })
      .sort((a, b) => b.units - a.units)

    return NextResponse.json({
      from,
      to,
      orderCount: rangeOrders.length,
      totalUnits,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      rows,
      categories: Array.from(categoriesSet).sort(),
    })
  } catch (e: any) {
    console.error('GET /api/reports/product-sales failed:', e)
    return NextResponse.json({ error: e?.message || 'فشل تحميل التقرير' }, { status: 500 })
  }
}
