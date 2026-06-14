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
} from '@/lib/omsData'

async function readProducts() {
  try {
    const { data: products, error } = await supabase
      .from('products')
      .select('*')
    
    if (error) return []
    return Array.isArray(products) ? products : []
  } catch {
    return []
  }
}

export const dynamic = 'force-dynamic'
export const revalidate = 0

async function enrich(orderId: string) {
  const orders = await readOrders()
  const customers = await readCustomers()
  const addresses = await readAddresses()
  const items = await readOrderItems()
  const products = await readProducts()
  const deliveryRows = await readOrderDelivery()

  const order = orders.find((o) => o.id === orderId)
  if (!order) return null

  const customer = customers.find((c) => c.id === order.customerId) || null
  const address = addresses.find((a) => a.id === order.deliveryAddressId) || null

  const orderItems = items
    .filter((i) => i.orderId === order.id)
    .map((item) => {
      const product = products.find((p: any) => p.id === item.productId)
      const pricingMode: 'unit' | 'weight' =
        product?.pricingMode === 'weight' ? 'weight' : 'unit'
      const pricePerKg =
        pricingMode === 'weight'
          ? Number(product?.offerPrice && Number(product.offerPrice) > 0
              ? product.offerPrice
              : product?.basePrice || 0)
          : 0
      return {
        ...item,
        productName: product?.productName || 'منتج محذوف',
        pricingMode,
        pricePerKg,
      }
    })

  let delivery = deliveryRows.find((d) => d.orderId === order.id)
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

  return {
    ...order,
    customer,
    address,
    items: orderItems,
    delivery,
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const order = await enrich(params.id)
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

    const rows = await readOrderDelivery()
    const index = rows.findIndex((r) => r.orderId === params.id)

    const existing: OrderDeliveryRecord =
      index >= 0
        ? rows[index]
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

      const allItems = await readOrderItems()
      const orderItemRows = allItems.filter((i) => i.orderId === params.id)

      // Pull products for pricingMode + pricePerKg.
      const { data: productRows } = await supabase.from('products').select('*')
      const products: any[] = Array.isArray(productRows) ? productRows : []

      for (const edit of body.items) {
        const existingItem = orderItemRows.find((r) => r.id === edit.id)
        if (!existingItem) continue

        const product = products.find((p) => p.id === existingItem.productId)
        const pricingMode: 'unit' | 'weight' =
          product?.pricingMode === 'weight' ? 'weight' : 'unit'
        const pricePerKg =
          pricingMode === 'weight'
            ? Number(
                product?.offerPrice && Number(product.offerPrice) > 0
                  ? product.offerPrice
                  : product?.basePrice || 0
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
        const ordersAll = await readOrders()
        const orderRow = ordersAll.find((o) => o.id === params.id)
        const addressesAll = await readAddresses()
        const addr = addressesAll.find((a) => a.id === orderRow?.deliveryAddressId)
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

    const order = await enrich(params.id)
    return NextResponse.json({ order }, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Failed to update delivery data' }, { status: 500 })
  }
}

async function runAutoActivateRule(orderId: string) {
  const settings = await readOrderSettings()
  if (settings.autoActivateEnabled === false) return
  const threshold = Math.max(1, Number(settings.autoActivateThreshold) || 3)

  const orders = await readOrders()
  const order = orders.find((o) => o.id === orderId)
  if (!order || !order.customerId) return

  const customers = await readCustomers()
  const customer = customers.find((c) => c.id === order.customerId)
  if (!customer || (customer as any).status !== 'warning') return

  const since = (customer as any).statusUpdatedAt || (customer as any).createdAt
  const sinceMs = since ? new Date(since).getTime() : 0

  const customerOrders = orders.filter(
    (o) => o.customerId === customer.id && new Date(o.createdAt).getTime() >= sinceMs,
  )
  const orderIds = new Set(customerOrders.map((o) => o.id))
  const deliveries = await readOrderDelivery()
  const cleanCount = deliveries.filter((d) => {
    if (!orderIds.has(d.orderId)) return false
    if (d.deliveryStatus !== 'تم التوصيل') return false
    const o = customerOrders.find((co) => co.id === d.orderId)
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
