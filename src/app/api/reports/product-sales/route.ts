import { NextRequest, NextResponse } from 'next/server'
import {
  readProducts,
  readOrders,
  readOrderItems,
  readOrderDelivery,
} from '@/lib/omsData'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// Product Sales Report — units sold per product within a date range.
// Counts an order when it's either:
//   - orderStatus === 'تم' (CS marked it completed), OR
//   - the branch has marked it 'تم التوصيل' in order_delivery
// Matches the same definition used by /api/products/targeted-stats so
// the two reports agree on what "sold" means.
//
// Query params:
//   from=YYYY-MM-DD   (required)  inclusive
//   to=YYYY-MM-DD     (required)  inclusive
//   category=<name>   (optional)  filter by product category
//   targetedOnly=1    (optional)  only targeted products
//   activeOnly=1      (optional)  only currently active products
//   debug=1           (optional)  include diagnostic counters in response
//
// Response:
// {
//   from, to, orderCount, totalUnits, totalRevenue,
//   rows: [{ productId, productName, productCategory, isTargeted, isActive,
//            units, revenue, orderCount, sharePct }],
//   categories: string[],
//   debug?: { ... }
// }
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const from = (searchParams.get('from') || '').slice(0, 10)
    const to = (searchParams.get('to') || '').slice(0, 10)
    const category = (searchParams.get('category') || '').trim()
    const targetedOnly = searchParams.get('targetedOnly') === '1'
    const activeOnly = searchParams.get('activeOnly') === '1'
    const debug = searchParams.get('debug') === '1'

    if (!from || !to) {
      return NextResponse.json({ error: 'from and to are required (YYYY-MM-DD)' }, { status: 400 })
    }

    const [products, orders, items, deliveries] = await Promise.all([
      readProducts(),
      readOrders(),
      readOrderItems(),
      readOrderDelivery(),
    ])

    // Build product lookup. NOTE: even when a product is filtered out we
    // still need to know it exists for diagnostics & for the "missing
    // product" tally — keep a separate full lookup.
    const productByIdAll = new Map<string, any>()
    const productById = new Map<string, any>()
    const categoriesSet = new Set<string>()
    for (const p of products) {
      const cat = (p as any).productCategory || (p as any).category || ''
      if (cat) categoriesSet.add(cat)
      const enriched = { ...p, productCategory: cat }
      productByIdAll.set(p.id, enriched)
      if (targetedOnly && !(p as any).isTargeted) continue
      if (activeOnly && (p as any).isActive === false) continue
      if (category && cat !== category) continue
      productById.set(p.id, enriched)
    }

    // Delivered-fallback set so an order counts even when CS forgot to set
    // orderStatus='تم' but the branch already delivered it.
    const deliveredOrderIds = new Set<string>()
    for (const d of deliveries) {
      if (d.deliveryStatus === 'تم التوصيل') deliveredOrderIds.add(d.orderId)
    }

    // Filter orders to the date range AND (status === 'تم' OR delivered).
    // orderDate is stored as 'YYYY-MM-DD' (Cairo wall clock) so string
    // comparison is safe and avoids any timezone drift.
    const rangeOrders = orders.filter((o: any) => {
      const d = String(o.orderDate || '').slice(0, 10)
      if (!(d >= from && d <= to)) return false
      const status = String(o.orderStatus || '').trim()
      return status === 'تم' || deliveredOrderIds.has(o.id)
    })
    const orderById = new Map<string, any>()
    for (const o of rangeOrders) orderById.set(o.id, o)

    // Aggregate per product.
    type Agg = { units: number; revenue: number; orderIds: Set<string> }
    const aggByProduct = new Map<string, Agg>()
    let totalUnits = 0
    let totalRevenue = 0
    let itemsLinkedToOrder = 0
    let itemsMissingProduct = 0
    let itemsFilteredOut = 0

    for (const it of items) {
      const o = orderById.get(it.orderId)
      if (!o) continue
      itemsLinkedToOrder++
      const product = productById.get(it.productId)
      if (!product) {
        if (productByIdAll.has(it.productId)) itemsFilteredOut++
        else itemsMissingProduct++
        continue
      }
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

    const payload: any = {
      from,
      to,
      orderCount: rangeOrders.length,
      totalUnits,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      rows,
      categories: Array.from(categoriesSet).sort(),
    }
    if (debug) {
      payload.debug = {
        totalOrdersInDb: orders.length,
        totalItemsInDb: items.length,
        totalProductsInDb: products.length,
        productsAfterFilter: productById.size,
        ordersInRangeAndStatus: rangeOrders.length,
        itemsLinkedToRangeOrders: itemsLinkedToOrder,
        itemsSkippedBecauseProductFilteredOut: itemsFilteredOut,
        itemsSkippedBecauseProductMissingFromCatalogue: itemsMissingProduct,
        sampleOrderDates: orders.slice(0, 3).map((o: any) => o.orderDate),
        sampleOrderStatuses: Array.from(new Set(orders.slice(0, 30).map((o: any) => o.orderStatus))),
      }
    }
    return NextResponse.json(payload)
  } catch (e: any) {
    console.error('GET /api/reports/product-sales failed:', e)
    return NextResponse.json({ error: e?.message || 'فشل تحميل التقرير' }, { status: 500 })
  }
}

