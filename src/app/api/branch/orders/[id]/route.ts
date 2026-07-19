import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import {
  OrderDeliveryRecord,
  OrderItemRecord,
  appendEditHistory,
  computeDeliveryFee,
  evaluateDiscountCode,
  generateId,
  readAddresses,
  readCustomers,
  readOrderDelivery,
  readOrderItems,
  readOrders,
  readOrderSettings,
  ORDER_COLUMNS,
  ORDER_COLUMNS_LIST,
  CUSTOMER_COLUMNS,
  ADDRESS_COLUMNS,
  ORDER_ITEM_COLUMNS,
  DELIVERY_COLUMNS_FULL,
  DELIVERY_COLUMNS_LIST,
  PRODUCT_COLUMNS,
  readOrderItemsByOrderIds,
  readOrderDeliveryByOrderIds,
  readProductsByIds,
} from '@/lib/omsData'

async function readProducts() {
  try {
    // Name-matching + pricing only — skip image/description blobs.
    const { data: products, error } = await supabase
      .from('products')
      .select('id, productName, productCategory, pricingMode, basePrice, offerPrice')
    
    if (error) return []
    return Array.isArray(products) ? products : []
  } catch {
    return []
  }
}

export const dynamic = 'force-dynamic'
// Short server-side cache — branch users need fresher data than the CS
// dashboard (they may refresh after every status flip), so keep this at
// 30s instead of the 60s used by /api/orders.
export const revalidate = 30

// Fetch a single order + its related rows with scoped queries. Replaces the
// previous implementation that read six ENTIRE tables (readOrders, readCustomers,
// readAddresses, readOrderItems, readProducts, readOrderDelivery) just to
// hydrate one order. New flow: one indexed lookup on orders, then id-scoped
// fetches on each related table. Response JSON shape is preserved exactly —
// including the synthesised default delivery row when no order_delivery row
// exists yet.
//
// Phase 2H — `includePhotos` is off by default. The initial page load returns
// productPhotos=[], invoicePhoto='', csAttachments=[], plus size metadata so
// the UI can show "3 صور محفوظة — اضغط للعرض" without paying the base64
// egress cost. Client lazy-fetches the real bytes via /photos when the user
// actually clicks to view them.
async function enrich(orderId: string, opts: { includePhotos: boolean }) {
  // 1) Fetch the single order with the column allowlist. Fall back gracefully
  //    if the deployment lacks the optional csAttachments column.
  const baseOrderCols = opts.includePhotos ? ORDER_COLUMNS : ORDER_COLUMNS_LIST
  const runOrder = (cols: string) =>
    supabase.from('orders').select(cols).eq('id', orderId).maybeSingle()

  let orderRes = await runOrder(baseOrderCols)
  if (
    orderRes.error &&
    /csAttachments|column .* does not exist/i.test(String(orderRes.error.message || ''))
  ) {
    const fallbackCols = baseOrderCols
      .split(',')
      .filter((c) => c.trim() !== 'csAttachments')
      .join(',')
    orderRes = await runOrder(fallbackCols)
  }
  if (orderRes.error || !orderRes.data) return null
  const order = orderRes.data as any

  // 2) Scoped lookups keyed off THIS order's ids only.
  const customerId: string = order.customerId
  const addressId: string = order.deliveryAddressId

  const [customerRes, addressRes, itemRows, deliveryRows] = await Promise.all([
    customerId
      ? supabase.from('customers').select(CUSTOMER_COLUMNS).eq('id', customerId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    addressId
      ? supabase.from('customer_addresses').select(ADDRESS_COLUMNS).eq('id', addressId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    readOrderItemsByOrderIds([orderId], ORDER_ITEM_COLUMNS),
    // Phase 2H — only pull heavy photo columns when caller asked for them.
    readOrderDeliveryByOrderIds(
      [orderId],
      opts.includePhotos ? DELIVERY_COLUMNS_FULL : DELIVERY_COLUMNS_LIST,
    ),
  ])

  const customer = customerRes.data || null
  const address = addressRes.data || null

  // 3) Products scoped to product ids actually referenced by this order's items.
  const productIds = (itemRows as OrderItemRecord[])
    .map((i) => i.productId)
    .filter((v): v is string => Boolean(v))
  const productRows = await readProductsByIds(productIds, PRODUCT_COLUMNS)
  const productsById = new Map<string, any>()
  for (const p of productRows as any[]) productsById.set(p.id, p)

  const orderItems = (itemRows as OrderItemRecord[]).map((item) => {
    const product = productsById.get(item.productId)
    const pricingMode: 'unit' | 'weight' =
      product?.pricingMode === 'weight' ? 'weight' : 'unit'
    // Prefer the FROZEN snapshot captured at order-creation time. For rows
    // written before price-snapshot-migration.sql (snapshot is null), fall
    // back to the FROZEN unitPrice — NEVER to the current product price.
    // This is what keeps historical orders immune to product-price edits.
    const snapshotBase =
      item.basePriceSnapshot != null ? Number(item.basePriceSnapshot) : null
    const snapshotOffer =
      item.offerPriceSnapshot != null ? Number(item.offerPriceSnapshot) : null
    const originalKg =
      Number(item.originalWeightGrams ?? item.weightGrams ?? 0) / 1000
    const derivedBase =
      pricingMode === 'weight'
        ? originalKg > 0
          ? Math.round((Number(item.unitPrice) / originalKg) * 100) / 100
          : null
        : Number(item.unitPrice)
    const effectiveBase = snapshotBase ?? derivedBase
    // If we only have a derived base (no snapshot), we don't know the
    // original base/offer split — surface it as "no promo" rather than
    // inventing one from the current product row.
    const effectiveOffer = snapshotBase != null ? snapshotOffer : null
    const pricePerKg =
      pricingMode === 'weight'
        ? Number(effectiveOffer && effectiveOffer > 0 ? effectiveOffer : effectiveBase || 0)
        : 0
    return {
      ...item,
      productName: product?.productName || 'منتج محذوف',
      pricingMode,
      pricePerKg,
      basePrice: effectiveBase,
      offerPrice: effectiveOffer,
    }
  })

  // 4) Delivery — auto-create the row on first read (preserved behaviour).
  let delivery = (deliveryRows as OrderDeliveryRecord[])[0]
  if (!delivery) {
    delivery = {
      id: generateId('del'),
      orderId: order.id,
      deliveryStatus: 'لم يخرج بعد',
      branchComments: '',
      productPhotos: [],
      invoicePhoto: '',
      deliveredAt: null,
      updatedBy: '',
      updatedAt: order.updatedAt,
    }
    await supabase.from('order_delivery').insert([delivery])
  }

  // Phase 2H — when photos are NOT included, expose size metadata so the UI
  // can render "3 صور محفوظة — اضغط للعرض" without paying egress. We need to
  // read a cheap count column, which DELIVERY_COLUMNS_LIST includes as
  // `productPhotosCount` if the DB has it; otherwise fall back to 0/false.
  let productPhotosCount = 0
  let hasInvoicePhoto = false
  let hasCsAttachments = false
  if (opts.includePhotos) {
    productPhotosCount = Array.isArray(delivery.productPhotos)
      ? delivery.productPhotos.length
      : 0
    hasInvoicePhoto = Boolean(delivery.invoicePhoto)
    hasCsAttachments = Array.isArray(order.csAttachments) && order.csAttachments.length > 0
  } else {
    // Cheap secondary lookup: count the array lengths server-side using
    // PostgREST's jsonb_array_length so we don't pay to transfer the photos
    // themselves. Two tiny reads (< 1 KB) instead of megabytes.
    try {
      const { data: metaDelivery } = await supabase
        .from('order_delivery')
        .select('productPhotos, invoicePhoto')
        .eq('orderId', orderId)
        .maybeSingle()
      if (metaDelivery) {
        productPhotosCount = Array.isArray((metaDelivery as any).productPhotos)
          ? (metaDelivery as any).productPhotos.length
          : 0
        hasInvoicePhoto = Boolean((metaDelivery as any).invoicePhoto)
      }
    } catch {}
    try {
      const { data: metaOrder } = await supabase
        .from('orders')
        .select('csAttachments')
        .eq('id', orderId)
        .maybeSingle()
      if (metaOrder) {
        hasCsAttachments =
          Array.isArray((metaOrder as any).csAttachments) &&
          (metaOrder as any).csAttachments.length > 0
      }
    } catch {}
    // Ensure the response is photo-free even if the row snuck them in.
    delivery = { ...delivery, productPhotos: [], invoicePhoto: '' }
  }

  // Strip csAttachments from order unless explicitly requested. Add metadata.
  const orderOut: any = { ...order }
  if (!opts.includePhotos) delete orderOut.csAttachments

  return {
    ...orderOut,
    customer,
    address,
    items: orderItems,
    delivery,
    productPhotosCount,
    hasInvoicePhoto,
    hasCsAttachments,
    photosLoaded: opts.includePhotos,
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const url = new URL(request.url)
    const includePhotos = url.searchParams.get('includePhotos') === '1'
    const order = await enrich(params.id, { includePhotos })
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    return NextResponse.json({ order }, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch branch order' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const now = new Date().toISOString()

    // Scoped delivery lookup — previously read the WHOLE order_delivery
    // table (including base64 photos) just to find one row by orderId.
    const { data: existingRow } = await supabase
      .from('order_delivery')
      .select(DELIVERY_COLUMNS_FULL)
      .eq('orderId', params.id)
      .maybeSingle()
    const index = existingRow ? 1 : -1
    const existing: OrderDeliveryRecord =
      existingRow
        ? (existingRow as unknown as OrderDeliveryRecord)
        : {
            id: generateId('del'),
            orderId: params.id,
            deliveryStatus: 'لم يخرج بعد',
            branchComments: '',
            productPhotos: [],
            invoicePhoto: '',
            deliveredAt: null,
            updatedBy: '',
            updatedAt: now,
          }

    const nextStatus = body.deliveryStatus || existing.deliveryStatus

    // ── Branch line edits (qty/weight) ──────────────────────────────────────
    // The branch can amend each line's quantity, and — for weight-mode lines
    // — the actual weighed grams once the product is weighed. We snapshot the
    // original CS-entered values into originalQuantity/originalWeightGrams
    // the first time each is changed so CS can still see what was ordered.
    //
    // Edits are locked once the order is "في الطريق" or "تم التوصيل".
    let itemsRecomputed = false
    let recomputedSubtotal = 0
    let recomputedDeliveryFee = 0
    let recomputedOrderTotal = 0
    let branchLineSummary = ''
    const branchLineDetails: Array<Record<string, unknown>> = []

    if (Array.isArray(body.items) && body.items.length > 0) {
      const lockedStatuses = new Set(['في الطريق', 'تم التوصيل'])
      if (lockedStatuses.has(existing.deliveryStatus)) {
        return NextResponse.json(
          { error: 'لا يمكن تعديل الطلب بعد خروجه للتوصيل' },
          { status: 409 }
        )
      }

      // Scoped items for THIS order (was: read whole order_items table).
      const orderItemRows = await readOrderItemsByOrderIds([params.id], ORDER_ITEM_COLUMNS)

      // Scoped products — only those referenced by this order's items
      // (was: SELECT * FROM products). Uses PRODUCT_COLUMNS allowlist so
      // description/image columns are excluded.
      const productIdsForOrder = Array.from(
        new Set(orderItemRows.map((i) => i.productId).filter((v): v is string => Boolean(v))),
      )
      const products: any[] =
        productIdsForOrder.length > 0 ? await readProductsByIds(productIdsForOrder, PRODUCT_COLUMNS) : []

      for (const edit of body.items) {
        const existingItem = orderItemRows.find((r) => r.id === edit.id)
        if (!existingItem) continue

        const product = products.find((p) => p.id === existingItem.productId)
        const pricingMode: 'unit' | 'weight' =
          product?.pricingMode === 'weight' ? 'weight' : 'unit'
        // Weight-line unitPrice must be recomputed from the FROZEN
        // per-kg price captured at order creation — NEVER from the current
        // product row. Fallback order:
        //   1) offerPriceSnapshot (frozen at order time)
        //   2) basePriceSnapshot  (frozen at order time)
        //   3) unitPrice / originalKg (frozen, derived for pre-migration rows)
        // Only when none of those are available do we fall back to the
        // current product — a genuinely last-resort case for orphan rows.
        const snapshotBase =
          existingItem.basePriceSnapshot != null
            ? Number(existingItem.basePriceSnapshot)
            : null
        const snapshotOffer =
          existingItem.offerPriceSnapshot != null
            ? Number(existingItem.offerPriceSnapshot)
            : null
        const originalKgForDerive =
          Number(existingItem.originalWeightGrams ?? existingItem.weightGrams ?? 0) /
          1000
        const derivedFromUnitPrice =
          pricingMode === 'weight' && originalKgForDerive > 0
            ? Math.round((Number(existingItem.unitPrice) / originalKgForDerive) * 100) / 100
            : null
        const frozenPricePerKg =
          snapshotOffer && snapshotOffer > 0
            ? snapshotOffer
            : snapshotBase != null
            ? snapshotBase
            : derivedFromUnitPrice
        const pricePerKg =
          pricingMode === 'weight'
            ? frozenPricePerKg != null
              ? frozenPricePerKg
              : Number(
                  product?.offerPrice && Number(product.offerPrice) > 0
                    ? product.offerPrice
                    : product?.basePrice || 0,
                )
            : 0

        const nextQty = Number(edit.quantity)
        const nextWeightGrams = Number(edit.weightGrams)

        const qtyChanged =
          Number.isFinite(nextQty) && nextQty > 0 && nextQty !== Number(existingItem.quantity)
        const weightChanged =
          pricingMode === 'weight' &&
          Number.isFinite(nextWeightGrams) &&
          nextWeightGrams >= 0 &&
          nextWeightGrams !== Number(existingItem.weightGrams || 0)

        if (!qtyChanged && !weightChanged) continue

        const updatedItem: OrderItemRecord = { ...existingItem }

        if (qtyChanged) {
          if (updatedItem.originalQuantity == null) {
            updatedItem.originalQuantity = Number(existingItem.quantity)
          }
          updatedItem.quantity = nextQty
        }
        if (weightChanged) {
          if (updatedItem.originalWeightGrams == null) {
            updatedItem.originalWeightGrams = Number(existingItem.weightGrams || 0)
          }
          updatedItem.weightGrams = nextWeightGrams
          // Recompute unitPrice from pricePerKg × new weight (kg).
          const kg = nextWeightGrams / 1000
          updatedItem.unitPrice = Math.round(pricePerKg * kg * 100) / 100
        }
        updatedItem.lineTotal =
          Math.round(Number(updatedItem.quantity) * Number(updatedItem.unitPrice) * 100) / 100

        const { error: updErr } = await supabase
          .from('order_items')
          .update({
            quantity: updatedItem.quantity,
            weightGrams: updatedItem.weightGrams,
            unitPrice: updatedItem.unitPrice,
            lineTotal: updatedItem.lineTotal,
            originalQuantity: updatedItem.originalQuantity ?? null,
            originalWeightGrams: updatedItem.originalWeightGrams ?? null,
          })
          .eq('id', updatedItem.id)

        if (updErr) {
          console.error('branch PUT: order_items update failed', updErr)
          continue
        }

        // Mirror change into local cache so subtotal calc reflects the edit.
        const idx = orderItemRows.findIndex((r) => r.id === updatedItem.id)
        if (idx >= 0) orderItemRows[idx] = updatedItem

        branchLineDetails.push({
          itemId: updatedItem.id,
          productName: product?.productName || '?',
          pricingMode,
          qtyChange: qtyChanged
            ? { from: existingItem.quantity, to: updatedItem.quantity }
            : undefined,
          weightChange: weightChanged
            ? {
                fromGrams: existingItem.weightGrams,
                toGrams: updatedItem.weightGrams,
                newUnitPrice: updatedItem.unitPrice,
              }
            : undefined,
        })
      }

      if (branchLineDetails.length > 0) {
        itemsRecomputed = true
        recomputedSubtotal = orderItemRows.reduce(
          (sum, r) => sum + Number(r.lineTotal || 0),
          0
        )
        // Scoped order + address lookup (was: two full-table scans).
        const { data: orderRow } = (await supabase
          .from('orders')
          .select(ORDER_COLUMNS_LIST)
          .eq('id', params.id)
          .maybeSingle()) as { data: any }
        let addr: any = null
        if (orderRow?.deliveryAddressId) {
          const { data: addrData } = await supabase
            .from('customer_addresses')
            .select(ADDRESS_COLUMNS)
            .eq('id', orderRow.deliveryAddressId)
            .maybeSingle()
          addr = addrData
        }
        recomputedDeliveryFee = await computeDeliveryFee(
          recomputedSubtotal,
          addr?.area,
          addr?.subArea
        )
        recomputedOrderTotal = recomputedSubtotal + recomputedDeliveryFee

        // Re-apply the saved voucher against the new gross so the customer
        // still gets the same code's discount on the amended basket.
        let nextDiscountAmount = Number(orderRow?.discountAmount) || 0
        if (orderRow?.discountCode) {
          const evald = await evaluateDiscountCode(
            String(orderRow.discountCode),
            recomputedOrderTotal,
          )
          nextDiscountAmount = evald.ok
            ? Math.min(Number(evald.discount) || 0, recomputedOrderTotal)
            : Math.min(nextDiscountAmount, recomputedOrderTotal)
        }
        const nextNetTotal = Math.max(0, recomputedOrderTotal - nextDiscountAmount)

        const updRes = await supabase
          .from('orders')
          .update({
            subtotal: recomputedSubtotal,
            deliveryFee: recomputedDeliveryFee,
            orderTotal: recomputedOrderTotal,
            discountAmount: nextDiscountAmount,
            netTotal: nextNetTotal,
            updatedAt: now,
          })
          .eq('id', params.id)
        if (updRes.error && /discountCode|discountAmount|netTotal|column .* does not exist/i.test(updRes.error.message || '')) {
          console.warn('[branch PUT] discount columns missing in DB, retrying without them')
          await supabase
            .from('orders')
            .update({
              subtotal: recomputedSubtotal,
              deliveryFee: recomputedDeliveryFee,
              orderTotal: recomputedOrderTotal,
              updatedAt: now,
            })
            .eq('id', params.id)
        }

        branchLineSummary = `تم تعديل ${branchLineDetails.length} بند من الفرع`
        await appendEditHistory({
          entityType: 'order',
          entityId: params.id,
          orderId: params.id,
          action: 'updated',
          changedBy: body.updatedBy || 'branch',
          summary: branchLineSummary,
          details: {
            source: 'branch',
            changes: branchLineDetails,
            newSubtotal: recomputedSubtotal,
            newDeliveryFee: recomputedDeliveryFee,
            newOrderTotal: recomputedOrderTotal,
          },
        })
      }
    }

    const updated: OrderDeliveryRecord = {
      ...existing,
      deliveryStatus: nextStatus,
      branchComments: body.branchComments ?? existing.branchComments,
      productPhotos: Array.isArray(body.productPhotos) ? body.productPhotos : existing.productPhotos,
      invoicePhoto: body.invoicePhoto ?? existing.invoicePhoto,
      // Stage-transition timestamps — set the FIRST time the order reaches
      // each stage and never overwritten thereafter, so durations stay
      // truthful even if the branch toggles statuses while correcting a
      // mistake. `acceptedAt` covers any move off "لم يخرج بعد" since the
      // branch effectively acknowledged the order at that point.
      acceptedAt:
        existing.acceptedAt ||
        (nextStatus !== 'لم يخرج بعد' && existing.deliveryStatus === 'لم يخرج بعد'
          ? now
          : null),
      readyAt:
        existing.readyAt ||
        (nextStatus === 'جاهز' && existing.deliveryStatus !== 'جاهز' ? now : null),
      outForDeliveryAt:
        existing.outForDeliveryAt ||
        (nextStatus === 'في الطريق' && existing.deliveryStatus !== 'في الطريق'
          ? now
          : null),
      deliveredAt: nextStatus === 'تم التوصيل' ? existing.deliveredAt || now : null,
      updatedBy: body.updatedBy || existing.updatedBy || 'branch',
      updatedAt: now,
    }

    if (index >= 0) {
      const updRes = await supabase
        .from('order_delivery')
        .update(updated)
        .eq('id', updated.id)
      if (
        updRes.error &&
        /acceptedAt|readyAt|outForDeliveryAt|column .* does not exist/i.test(
          updRes.error.message || '',
        )
      ) {
        console.warn(
          '[branch PUT] timing columns missing in DB, retrying without them',
        )
        const { acceptedAt: _a, readyAt: _r, outForDeliveryAt: _o, ...safe } =
          updated
        await supabase.from('order_delivery').update(safe).eq('id', updated.id)
      }
    } else {
      const insRes = await supabase.from('order_delivery').insert([updated])
      if (
        insRes.error &&
        /acceptedAt|readyAt|outForDeliveryAt|column .* does not exist/i.test(
          insRes.error.message || '',
        )
      ) {
        console.warn(
          '[branch PUT] timing columns missing in DB, retrying without them',
        )
        const { acceptedAt: _a, readyAt: _r, outForDeliveryAt: _o, ...safe } =
          updated
        await supabase.from('order_delivery').insert([safe])
      }
    }

    await appendEditHistory({
      entityType: 'delivery',
      entityId: updated.id,
      orderId: params.id,
      action: body.deliveryStatus && body.deliveryStatus !== existing.deliveryStatus ? 'status_changed' : 'updated',
      changedBy: body.updatedBy || existing.updatedBy || 'branch',
      summary:
        body.deliveryStatus && body.deliveryStatus !== existing.deliveryStatus
          ? `تم تغيير حالة التوصيل إلى ${updated.deliveryStatus}`
          : 'تم تحديث بيانات التوصيل',
      details: {
        fromStatus: existing.deliveryStatus,
        toStatus: updated.deliveryStatus,
        hasBranchComments: Boolean(updated.branchComments),
        productPhotosCount: updated.productPhotos.length,
        hasInvoicePhoto: Boolean(updated.invoicePhoto),
      },
    })

    // Auto-activate rule: if this order just became "delivered", count clean
    // orders for the customer since their status was set to "warning". If the
    // threshold is reached, flip them back to "active" and post a chat alert.
    if (
      body.deliveryStatus === 'تم التوصيل' &&
      existing.deliveryStatus !== 'تم التوصيل'
    ) {
      try {
        await runAutoActivateRule(params.id)
      } catch (err) {
        console.error('auto-activate rule failed:', err)
      }
    }

    // Phase 2H — PUT no longer echoes photos in the response. The client
    // just sent them, so it already has them in state. No point paying
    // egress to hand them back. The lazy-load endpoint is available when
    // the client needs to re-fetch.
    const order = await enrich(params.id, { includePhotos: false })
    return NextResponse.json({ order }, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Failed to update delivery data' }, { status: 500 })
  }
}

async function runAutoActivateRule(orderId: string) {
  const settings = await readOrderSettings()
  if (settings.autoActivateEnabled === false) return
  const threshold = Math.max(1, Number(settings.autoActivateThreshold) || 3)

  // Scoped order lookup (was: full orders table).
  const { data: order } = (await supabase
    .from('orders')
    .select(ORDER_COLUMNS_LIST)
    .eq('id', orderId)
    .maybeSingle()) as { data: any }
  if (!order || !order.customerId) return

  // Scoped customer lookup (was: full customers table).
  const { data: customer } = (await supabase
    .from('customers')
    .select(CUSTOMER_COLUMNS)
    .eq('id', order.customerId)
    .maybeSingle()) as { data: any }
  if (!customer || (customer as any).status !== 'warning') return

  const since = (customer as any).statusUpdatedAt || (customer as any).createdAt
  const sinceMs = since ? new Date(since).getTime() : 0

  // Scoped: only this customer's orders since the warning was set.
  const { data: custOrderRows } = await supabase
    .from('orders')
    .select('id, customerId, createdAt, compensationAmount')
    .eq('customerId', customer.id)
    .gte('createdAt', new Date(sinceMs).toISOString())
  const customerOrders = (custOrderRows || []) as any[]
  const orderIdsList = customerOrders.map((o) => o.id)

  // Scoped deliveries — only for the customer's orders, and only the
  // small LIST columns (no photo blobs needed for status counting).
  const deliveries =
    orderIdsList.length > 0
      ? await readOrderDeliveryByOrderIds(orderIdsList, DELIVERY_COLUMNS_LIST)
      : []
  const cleanCount = deliveries.filter((d: any) => {
    if (d.deliveryStatus !== 'تم التوصيل') return false
    const o = customerOrders.find((co: any) => co.id === d.orderId)
    const comp = Number((o as any)?.compensationAmount || 0)
    return comp <= 0
  }).length

  if (cleanCount < threshold) return

  const now = new Date().toISOString()
  await supabase
    .from('customers')
    .update({
      status: 'active',
      statusReason: `تم التفعيل تلقائياً بعد ${cleanCount} طلب نظيف`,
      statusUpdatedAt: now,
      statusUpdatedBy: 'system',
      updatedAt: now,
    })
    .eq('id', customer.id)

  await supabase.from('chat_messages').insert([
    {
      id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      role: 'admin',
      author: 'النظام (تنبيه)',
      text:
        `✅ إعادة تفعيل تلقائي\n` +
        `العميل: ${(customer as any).customerName} (${(customer as any).phone || '—'})\n` +
        `تحذير → نشط بعد ${cleanCount} طلب نظيف`,
      createdAt: now,
    },
  ])

  try {
    await appendEditHistory({
      entityType: 'customer' as any,
      entityId: customer.id,
      orderId: null as any,
      action: 'status_changed',
      changedBy: 'system',
      summary: `تفعيل تلقائي للعميل بعد ${cleanCount} طلب نظيف`,
      details: { from: 'warning', to: 'active', threshold, cleanCount },
    })
  } catch {
    /* non-fatal */
  }
}
