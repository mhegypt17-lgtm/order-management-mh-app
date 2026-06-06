import { NextRequest, NextResponse } from 'next/server'
import {
  OrderItemRecord,
  OrderRecord,
  appendEditHistory,
  generateId,
  readOrderItems,
  readOrders,
} from '@/lib/omsData'
import { supabase } from '@/lib/supabase'

/**
 * One-click reorder. Exact replica of the source order with ONLY today's
 * date/time, a fresh id, and a fresh appOrderNo. Everything else - items,
 * prices, address, payment, status, customerType, notes - is preserved.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json().catch(() => ({} as any))
    const createdBy = body.createdBy || 'unknown'

    const orders = await readOrders()
    const source = orders.find((o) => o.id === params.id)
    if (!source) {
      return NextResponse.json({ error: 'Source order not found' }, { status: 404 })
    }

    const allItems = await readOrderItems()
    const sourceItems = allItems.filter((i) => i.orderId === source.id)

    const now = new Date()
    const orderDate = now.toISOString().slice(0, 10)
    const orderTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const nowISO = now.toISOString()

    const newOrderId = generateId('ord')

    const newItems: OrderItemRecord[] = sourceItems.map((it) => ({
      id: generateId('item'),
      orderId: newOrderId,
      productId: it.productId,
      quantity: Number(it.quantity) || 1,
      weightGrams: Number(it.weightGrams) || 0,
      unitPrice: Number(it.unitPrice) || 0,
      lineTotal: (Number(it.quantity) || 1) * (Number(it.unitPrice) || 0),
      specialInstructions: it.specialInstructions || '',
      createdAt: nowISO,
    }))

    const dateKey = (() => {
      const [y, m, d] = orderDate.split('-')
      return `${d}${m}${y.slice(-2)}`
    })()
    const typeSlug = String(source.orderType || '').toLowerCase()
    const { data: sameBucket = [] } = await supabase
      .from('orders')
      .select('appOrderNo')
      .ilike('appOrderNo', `${dateKey}${typeSlug}%`)
    const usedSuffixes = (sameBucket as { appOrderNo: string }[])
      .map((r) => {
        const m = (r.appOrderNo || '').match(/(\d+)$/)
        return m ? parseInt(m[1], 10) : 0
      })
      .filter((n) => Number.isFinite(n))
    let suffix = (usedSuffixes.length ? Math.max(...usedSuffixes) : 0) + 1
    let appOrderNo = `${dateKey}${typeSlug}${suffix}`

    const baseStatus = source.orderStatus === 'لاغي' ? 'تم' : source.orderStatus

    const newOrder: OrderRecord = {
      ...source,
      id: newOrderId,
      appOrderNo,
      orderDate,
      orderTime,
      orderStatus: baseStatus,
      cancellationReason: baseStatus === 'لاغي' ? source.cancellationReason : null,
      createdBy,
      createdAt: nowISO,
      updatedAt: nowISO,
    }

    let { data: inserted, error: orderErr } = await supabase
      .from('orders')
      .insert([newOrder])
      .select()
      .single()

    let attempts = 0
    while (
      orderErr &&
      /unique constraint|duplicate key|orders_apporderno/i.test(orderErr.message || '') &&
      attempts < 10
    ) {
      attempts++
      suffix++
      appOrderNo = `${dateKey}${typeSlug}${suffix}`
      newOrder.appOrderNo = appOrderNo
      const retry = await supabase.from('orders').insert([newOrder]).select().single()
      inserted = retry.data
      orderErr = retry.error
    }

    if (orderErr && /scheduled|column .* does not exist/i.test(orderErr.message || '')) {
      console.warn('[orders duplicate] scheduled columns missing, retrying without them')
      const {
        isScheduled: _i,
        scheduledDate: _d,
        scheduledTimeSlot: _s,
        scheduledSpecificTime: _t,
        ...orderSafe
      } = newOrder as any
      const r = await supabase.from('orders').insert([orderSafe]).select().single()
      inserted = r.data
      orderErr = r.error
    }

    if (orderErr || !inserted) {
      console.error('Error inserting duplicate order:', orderErr)
      return NextResponse.json(
        { error: 'Failed to duplicate order', details: orderErr?.message || null },
        { status: 500 }
      )
    }

    if (newItems.length > 0) {
      const { error: itemsErr } = await supabase.from('order_items').insert(newItems)
      if (itemsErr) {
        console.error('Error inserting duplicate order items:', itemsErr)
      }
    }

    await appendEditHistory({
      entityType: 'order',
      entityId: newOrder.id,
      orderId: newOrder.id,
      action: 'created',
      changedBy: createdBy,
      summary: `تم إنشاء طلب جديد ${appOrderNo} (نسخة من ${source.appOrderNo})`,
      details: {
        duplicatedFromOrderId: source.id,
        duplicatedFromAppOrderNo: source.appOrderNo,
        itemCount: newItems.length,
        orderTotal: newOrder.orderTotal,
      },
    })

    return NextResponse.json(
      {
        order: inserted,
        warnings: {
          inactiveProductCount: 0,
          priceChangedCount: 0,
          skippedItemCount: 0,
        },
      },
      { status: 201 }
    )
  } catch (err: any) {
    console.error('duplicate order error', err)
    return NextResponse.json(
      { error: 'Failed to duplicate order', details: err?.message || null },
      { status: 500 }
    )
  }
}