import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// GET /api/crm/reports/top-customers-by-product?productId=...&from=YYYY-MM-DD&to=YYYY-MM-DD
//
// "Which customers ordered this product, and how many times?" — sorted by
// order count desc. Counts an order the same way /api/reports/product-sales
// does: orderStatus === 'تم' OR the branch marked it delivered.
//
// LOW EGRESS BY DESIGN: reads from the `product_order_customers_v1` view
// (order_items ⋈ orders ⋈ order_delivery ⋈ customers, pre-filtered to
// completed orders only at the Postgres level — see
// data/product-order-customers-view.sql) and ALWAYS scopes with
// `.eq('productId', …)` (order_items already has an index on productId).
// Only the order lines for the ONE requested product ever cross the wire —
// never a full-table read of order_items/orders. The optional from/to
// range narrows it further via `.gte`/`.lte` on orderDate.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const productId = (searchParams.get('productId') || '').trim()
    const from = (searchParams.get('from') || '').slice(0, 10)
    const to = (searchParams.get('to') || '').slice(0, 10)

    if (!productId) {
      return NextResponse.json({ error: 'productId is required' }, { status: 400 })
    }

    let query = supabase
      .from('product_order_customers_v1')
      .select('orderId, quantity, orderDate, customerId, customerName, customerPhone')
      .eq('productId', productId)

    if (from) query = query.gte('orderDate', from)
    if (to) query = query.lte('orderDate', to)

    const { data, error } = await query
    if (error) {
      // View not created yet — tell the admin exactly what to run.
      if (/relation .* does not exist|schema cache/i.test(error.message || '')) {
        return NextResponse.json(
          {
            error:
              'التقرير غير متاح بعد — يجب تشغيل ملف data/product-order-customers-view.sql في Supabase أولاً',
          },
          { status: 503 },
        )
      }
      throw error
    }

    type Agg = {
      customerId: string
      customerName: string
      customerPhone: string
      totalQuantity: number
      orderIds: Set<string>
    }
    const byCustomer = new Map<string, Agg>()
    for (const row of (data || []) as any[]) {
      if (!row.customerId) continue
      let agg = byCustomer.get(row.customerId)
      if (!agg) {
        agg = {
          customerId: row.customerId,
          customerName: row.customerName || '(محذوف)',
          customerPhone: row.customerPhone || '',
          totalQuantity: 0,
          orderIds: new Set(),
        }
        byCustomer.set(row.customerId, agg)
      }
      agg.orderIds.add(row.orderId)
      agg.totalQuantity += Number(row.quantity) || 0
    }

    const rows = Array.from(byCustomer.values())
      .map(({ orderIds, ...rest }) => ({ ...rest, orderCount: orderIds.size }))
      .sort((a, b) => b.orderCount - a.orderCount || b.totalQuantity - a.totalQuantity)

    return NextResponse.json({
      productId,
      from: from || null,
      to: to || null,
      customerCount: rows.length,
      rows,
    })
  } catch (e: any) {
    console.error('GET /api/crm/reports/top-customers-by-product failed:', e)
    return NextResponse.json({ error: e?.message || 'فشل تحميل التقرير' }, { status: 500 })
  }
}
