import { NextRequest, NextResponse } from 'next/server'
import {
  OrderItemRecord,
  OrderRecord,
  appendEditHistory,
  generateId,
  readOrderItemsByOrderIds,
  ORDER_COLUMNS,
  ORDER_ITEM_COLUMNS,
} from '@/lib/omsData'
import { cairoDateString, cairoTimeString } from '@/lib/cairoTime'
import { supabase } from '@/lib/supabase'

/**
 * One-click reorder. Exact replica of the source order with ONLY today's
 * date/time, a fresh id, and a fresh appOrderNo. Everything else - items,
 * prices, address, payment, status, customerType, notes - is preserved
 * (except walletUsed/netTotal — see the reset block below).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json().catch(() => ({} as any))
    const createdBy = body.createdBy || 'unknown'

    // Egress fix — previous version read the entire orders + order_items
    // tables to find one source. Now: single indexed order lookup, scoped
    // items fetch by orderId. Falls back gracefully if the deployment
    // predates the csAttachments column.
    const runSource = (cols: string) =>
      supabase.from('orders').select(cols).eq('id', params.id).maybeSingle()
    let sourceRes = await runSource(ORDER_COLUMNS)
    if (
      sourceRes.error &&
      /csAttachments|column .* does not exist/i.test(String(sourceRes.error.message || ''))
    ) {
      const fallbackCols = ORDER_COLUMNS
        .split(',')
        .filter((c) => c.trim() !== 'csAttachments')
        .join(',')
      sourceRes = await runSource(fallbackCols)
    }
    if (sourceRes.error || !sourceRes.data) {
      return NextResponse.json({ error: 'Source order not found' }, { status: 404 })
    }
    const source = sourceRes.data as unknown as OrderRecord

    const sourceItems = (await readOrderItemsByOrderIds(
      [source.id],
      ORDER_ITEM_COLUMNS,
    )) as OrderItemRecord[]

    const now = new Date()
    const orderDate = cairoDateString(now)
    const orderTime = cairoTimeString(now)
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

    // A reorder is a *fresh* charge to the customer. The wallet deduction
    // from the source order was already debited on that order — reusing it
    // here would silently apply credit the customer no longer has and pin
    // the new order to a stale wallet balance. Reset wallet fields to zero
    // and recompute netTotal from the surviving orderTotal / discount so
    // the agent can apply wallet fresh from the customer's current balance
    // when they open the reorder for review.
    const sourceOrderTotal = Number(source.orderTotal) || 0
    const sourceDiscount = Number(source.discountAmount) || 0
    const recomputedNetTotal = Math.max(0, sourceOrderTotal - sourceDiscount)

    const newOrder: OrderRecord = {
      ...source,
      id: newOrderId,
      appOrderNo,
      orderDate,
      orderTime,
      orderStatus: baseStatus,
      cancellationReason: (baseStatus as string) === 'لاغي' ? source.cancellationReason : null,
      walletUsed: 0,
      netTotal: recomputedNetTotal,
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