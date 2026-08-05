import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import {
  ORDER_ITEM_COLUMNS,
  readOrderItemsByOrderIds,
  readOrderSettings,
  refreshOrderItemPriceSnapshots,
} from '@/lib/omsData'
import { DEFAULT_CATALOGUES } from '@/lib/catalogue'

// Manual "تحديث الأسعار" button — only usable on حجز (reserved) orders.
// Forces a price-snapshot refresh on demand (regardless of scheduledDate),
// scoped strictly to this order's own product ids. Mirrors the automatic
// date-based check that runs on GET /api/orders/[id] and
// GET /api/branch/orders/[id] once scheduledDate has arrived.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { data: orderRow, error: orderError } = await supabase
      .from('orders')
      .select('id, orderType, orderStatus')
      .eq('id', params.id)
      .maybeSingle()

    if (orderError || !orderRow) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }
    if ((orderRow as any).orderStatus !== 'حجز') {
      return NextResponse.json(
        { error: 'تحديث الأسعار متاح فقط لطلبات الحجز' },
        { status: 400 },
      )
    }

    const itemRows = await readOrderItemsByOrderIds([params.id], ORDER_ITEM_COLUMNS)
    const orderSettings = await readOrderSettings()

    const refreshed = await refreshOrderItemPriceSnapshots(
      itemRows.map((i) => ({
        id: i.id,
        productId: i.productId,
        basePriceSnapshot: (i as any).basePriceSnapshot,
        offerPriceSnapshot: (i as any).offerPriceSnapshot,
      })),
      (orderRow as any).orderType,
      orderSettings.catalogues || DEFAULT_CATALOGUES,
    )

    return NextResponse.json({ items: refreshed }, { status: 200 })
  } catch (err) {
    console.error('[refresh-prices] failed', err)
    return NextResponse.json({ error: 'Failed to refresh prices' }, { status: 500 })
  }
}
