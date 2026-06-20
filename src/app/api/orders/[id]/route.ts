import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import {
  CustomerAddressRecord,
  OrderItemRecord,
  OrderRecord,
  appendEditHistory,
  evaluateDiscountCode,
  generateId,
  readAddresses,
  readCustomers,
  readOrderItems,
  readOrderDelivery,
  readOrders,
  readDeliveryZones,
} from '@/lib/omsData'

// Disable Next.js fetch caching — Supabase queries here must always
// return fresh data, otherwise a just-created order can 404 on its
// own edit page until the cache expires.
export const dynamic = 'force-dynamic'
export const revalidate = 0

type OrderUpdateItem = {
  productId: string
  productNameInput?: string
  quantity: number
  weightGrams: number
  unitPrice: number
  specialInstructions: string
}

function normalizeProductName(value: string) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function findMatchedProduct(products: any[], productNameInput?: string) {
  const normalizedInput = normalizeProductName(productNameInput || '')
  if (!normalizedInput) return null

  const exact = products.find((p: any) => normalizeProductName(p.productName || '') === normalizedInput)
  if (exact) return exact

  return (
    products.find((p: any) => {
      const normalizedProductName = normalizeProductName(p.productName || '')
      return normalizedProductName.includes(normalizedInput) || normalizedInput.includes(normalizedProductName)
    }) || null
  )
}

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

async function computeDeliveryFeeByArea(subtotal: number, area?: string, subArea?: string) {
  const { computeDeliveryFee } = await import('@/lib/omsData')
  return computeDeliveryFee(subtotal, area, subArea)
}

async function enrichOrder(order: OrderRecord) {
  const customers = await readCustomers()
  const addresses = await readAddresses()
  const orderItems = await readOrderItems()
  const orderDelivery = await readOrderDelivery()
  const products = await readProducts()

  const customer = customers.find((c: any) => c.id === order.customerId) || null
  const address = addresses.find((a) => a.id === order.deliveryAddressId) || null
  const items = orderItems
    .filter((i) => i.orderId === order.id)
    .map((item) => {
      const product = products.find((p: any) => p.id === item.productId)
      return {
        ...item,
        productName: product?.productName || 'منتج محذوف',
      }
    })

  const delivery =
    orderDelivery.find((d) => d.orderId === order.id) ||
    {
      id: '',
      orderId: order.id,
      deliveryStatus: 'لم يخرج بعد',
      branchComments: '',
      productPhotos: [],
      invoicePhoto: '',
      deliveredAt: null,
      updatedBy: '',
      updatedAt: order.updatedAt,
    }

  return {
    ...order,
    customer,
    address,
    items,
    delivery,
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const orders = await readOrders()
    const order = orders.find((o) => o.id === params.id)

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    return NextResponse.json({ order: await enrichOrder(order) }, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch order' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const now = new Date().toISOString()

    const orders = await readOrders()
    const orderItems = await readOrderItems()
    const addresses = await readAddresses()

    const orderIndex = orders.findIndex((o) => o.id === params.id)

    if (orderIndex === -1) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // 🔒 Lock edits once branch starts delivery (unless admin)
    const requesterRole = String(body.role || new URL(request.url).searchParams.get('role') || '').toLowerCase()
    if (requesterRole !== 'admin') {
      const deliveryRows = await readOrderDelivery()
      const currentDelivery = deliveryRows.find((d) => d.orderId === params.id)
      const lockingStatuses = ['في الطريق', 'تم التوصيل']
      if (currentDelivery && lockingStatuses.includes(currentDelivery.deliveryStatus)) {
        // Exception: CS may still add/edit attachments (proof of payment,
        // post-delivery receipts, etc.) on a locked order. The client sends
        // `attachmentsOnly: true` to opt into this narrow patch; nothing
        // else on the order is touched.
        if (body.attachmentsOnly === true) {
          const incomingAttachments = Array.isArray(body.csAttachments) ? body.csAttachments : []
          const attUpd = await supabase
            .from('orders')
            .update({ csAttachments: incomingAttachments, updatedAt: now })
            .eq('id', params.id)
          if (attUpd.error) {
            const msg = (attUpd.error.message || '').toLowerCase()
            if (attUpd.error.code === '42703' || msg.includes('csattachments')) {
              return NextResponse.json(
                {
                  error:
                    'تعذّر حفظ المرفقات — العمود csAttachments غير موجود في قاعدة البيانات. شغّل data/cs-attachments-migration.sql',
                },
                { status: 500 },
              )
            }
            console.error('[orders PUT attachmentsOnly] update failed:', attUpd.error)
            return NextResponse.json(
              { error: 'فشل حفظ المرفقات', details: attUpd.error.message || null },
              { status: 500 },
            )
          }
          await appendEditHistory({
            entityType: 'order',
            entityId: params.id,
            orderId: params.id,
            action: 'updated',
            changedBy: body.createdBy || 'unknown',
            summary: 'تم تحديث مرفقات خدمة العملاء (الطلب مقفل بعد التوصيل)',
            details: { attachmentCount: incomingAttachments.length, lockedStatus: currentDelivery.deliveryStatus },
          })
          const refreshed = { ...orders[orderIndex], csAttachments: incomingAttachments, updatedAt: now } as OrderRecord
          return NextResponse.json(
            { order: await enrichOrder(refreshed), warning: null },
            { status: 200 },
          )
        }
        return NextResponse.json(
          {
            error: 'الطلب مقفل — الفرع بدأ التوصيل ولا يمكن التعديل',
            deliveryStatus: currentDelivery.deliveryStatus,
            locked: true,
          },
          { status: 423 }
        )
      }
    }

    let deliveryAddress: CustomerAddressRecord | undefined

    if (body.deliveryAddressId && body.deliveryAddressId !== '__new') {
      deliveryAddress = addresses.find((a) => a.id === body.deliveryAddressId)
    }

    // Dedupe by (customerId, addressLabel) — never create a second "Home" for the same customer.
    if (!deliveryAddress && body.streetAddress) {
      const customerId = orders[orderIndex].customerId
      const incomingLabel = (body.addressLabel || 'Home').toString().trim()
      const normalizedLabel = incomingLabel.toLowerCase()
      const sameLabel = addresses.find(
        (a) =>
          a.customerId === customerId &&
          String(a.addressLabel || '').trim().toLowerCase() === normalizedLabel
      )
      if (sameLabel) {
        deliveryAddress = sameLabel
      }
    }

    if (!deliveryAddress && body.streetAddress) {
      deliveryAddress = {
        id: generateId('addr'),
        customerId: orders[orderIndex].customerId,
        addressLabel: body.addressLabel || 'Home',
        area: body.deliveryArea || '',
        subArea: body.deliverySubArea || '',
        streetAddress: body.streetAddress,
        googleMapsLink: body.googleMapsLink || '',
        createdAt: now,
      }
      // Insert new address into Supabase
      await supabase.from('customer_addresses').insert([deliveryAddress])
    } else if (deliveryAddress) {
      const updatedLabel = (body.addressLabel || deliveryAddress.addressLabel || 'Home').toString().trim()
      const updatedArea = body.deliveryArea || deliveryAddress.area || ''
      const updatedSubArea =
        body.deliverySubArea !== undefined
          ? String(body.deliverySubArea || '')
          : deliveryAddress.subArea || ''
      const updatedStreet =
        body.streetAddress !== undefined && body.streetAddress !== ''
          ? String(body.streetAddress)
          : deliveryAddress.streetAddress
      const updatedMaps =
        body.googleMapsLink !== undefined
          ? String(body.googleMapsLink || '')
          : deliveryAddress.googleMapsLink || ''
      deliveryAddress.addressLabel = updatedLabel
      deliveryAddress.area = updatedArea
      deliveryAddress.subArea = updatedSubArea
      deliveryAddress.streetAddress = updatedStreet
      deliveryAddress.googleMapsLink = updatedMaps
      await supabase
        .from('customer_addresses')
        .update({
          addressLabel: updatedLabel,
          area: updatedArea,
          subArea: updatedSubArea,
          streetAddress: updatedStreet,
          googleMapsLink: updatedMaps,
        })
        .eq('id', deliveryAddress.id)
    }

    const products = await readProducts()
    const items: OrderUpdateItem[] = Array.isArray(body.items) ? body.items : []
    const normalizedItems = items
      .map((i) => {
        const matchedProduct = findMatchedProduct(products, i.productNameInput)
        return {
          ...i,
          productId: i.productId || (matchedProduct ? matchedProduct.id : ''),
        }
      })
      .filter((i) => i.productId && Number(i.quantity) > 0)
      .map((i) => {
        const quantity = Number(i.quantity) || 1
        const unitPrice = Number(i.unitPrice) || 0
        const weightGrams = Number(i.weightGrams) || 0
        return {
          ...i,
          quantity,
          unitPrice,
          weightGrams,
          lineTotal: quantity * unitPrice,
        }
      })

    const subtotal = normalizedItems.reduce((sum, i) => sum + i.lineTotal, 0)
    const deliveryFee = await computeDeliveryFeeByArea(
      subtotal,
      body.deliveryArea || deliveryAddress?.area,
      body.deliverySubArea || deliveryAddress?.subArea
    )
    const orderTotal = subtotal + deliveryFee

    const existing = orders[orderIndex]

    // Re-evaluate the discount against the new gross total. The client sends
    // `discountCode` only when CS explicitly applies/removes a voucher; when
    // the field is omitted we preserve whatever was previously saved (so a
    // partial PUT for branch comments/status doesn't accidentally wipe the
    // voucher). `discountCode: null` explicitly clears the voucher.
    let nextDiscountCode: string | null = existing.discountCode ?? null
    let nextDiscountAmount = Number(existing.discountAmount) || 0
    if (Object.prototype.hasOwnProperty.call(body, 'discountCode')) {
      if (body.discountCode) {
        const evald = await evaluateDiscountCode(String(body.discountCode), orderTotal)
        if (evald.ok && evald.code) {
          nextDiscountCode = evald.code.code
          nextDiscountAmount = Math.min(Number(evald.discount) || 0, orderTotal)
        } else {
          nextDiscountCode = null
          nextDiscountAmount = 0
        }
      } else {
        nextDiscountCode = null
        nextDiscountAmount = 0
      }
    } else if (nextDiscountCode) {
      // Voucher was unchanged by the client but the basket may have shifted.
      // Re-validate it against the new gross to keep the saved amount honest.
      const evald = await evaluateDiscountCode(nextDiscountCode, orderTotal)
      if (evald.ok) {
        nextDiscountAmount = Math.min(Number(evald.discount) || 0, orderTotal)
      } else {
        nextDiscountAmount = Math.min(nextDiscountAmount, orderTotal)
      }
    }
    const nextNetTotal = Math.max(0, orderTotal - nextDiscountAmount)

    const changedFields: string[] = []
    if (existing.orderStatus !== body.orderStatus) changedFields.push('orderStatus')
    if (existing.paymentMethod !== body.paymentMethod) changedFields.push('paymentMethod')
    if (existing.orderMethod !== body.orderMethod) changedFields.push('orderMethod')
    if (existing.orderReceiver !== body.orderReceiver) changedFields.push('orderReceiver')
    if (existing.customerSource !== body.customerSource) changedFields.push('customerSource')
    if ((existing.notes || '') !== (body.notes || '')) changedFields.push('notes')

    const remainingItems = orderItems.filter((i) => i.orderId !== params.id)
    // Existing items for this order, used to preserve branch-amend snapshots
    // (originalQuantity / originalWeightGrams) across a CS save. We match
    // surviving lines by productId since CS regenerates item ids on save.
    const existingForOrder = orderItems.filter((i) => i.orderId === params.id)
    const rewrittenItems: OrderItemRecord[] = normalizedItems.map((i) => {
      const prior = existingForOrder.find((p) => p.productId === i.productId)
      return {
        id: generateId('item'),
        orderId: params.id,
        productId: i.productId,
        quantity: i.quantity,
        weightGrams: i.weightGrams,
        unitPrice: i.unitPrice,
        lineTotal: i.lineTotal,
        specialInstructions: i.specialInstructions || '',
        createdAt: now,
        // Preserve branch's "original CS value" snapshot if branch had
        // amended this line before — otherwise stay null.
        originalQuantity: prior?.originalQuantity ?? null,
        originalWeightGrams: prior?.originalWeightGrams ?? null,
      }
    })

    // Update order in Supabase
    const updatedOrder = {
      ...existing,
      orderDate: body.orderDate,
      orderTime: body.orderTime,
      orderType: body.orderType,
      orderReceiver: body.orderReceiver,
      orderMethod: body.orderMethod,
      customerType: body.customerType,
      customerSource: body.customerSource,
      orderStatus: body.orderStatus,
      cancellationReason: body.orderStatus === 'لاغي' ? body.cancellationReason || null : null,
      paymentMethod: body.paymentMethod,
      deliveryAddressId: deliveryAddress?.id || existing.deliveryAddressId,
      notes: body.notes || '',
      followUp: Boolean(body.followUp),
      followUpNotes: body.followUpNotes || '',
      isScheduled: body.orderStatus === 'حجز' || Boolean(body.isScheduled),
      scheduledDate: body.orderStatus === 'حجز' ? (body.scheduledDate || null) : null,
      scheduledTimeSlot: body.orderStatus === 'حجز' ? (body.scheduledTimeSlot || null) : null,
      scheduledSpecificTime: body.orderStatus === 'حجز' ? (body.scheduledSpecificTime || null) : null,
      subtotal,
      deliveryFee,
      orderTotal,
      discountCode: nextDiscountCode,
      discountAmount: nextDiscountAmount,
      netTotal: nextNetTotal,
      csAttachments: Array.isArray(body.csAttachments)
        ? body.csAttachments
        : (existing as any).csAttachments || [],
      updatedAt: now,
    }
    const updRes = await supabase.from('orders').update(updatedOrder).eq('id', params.id)

    // ─── Migration-fallback chain ──────────────────────────────────────
    // If a column referenced in `updatedOrder` doesn't exist yet on this
    // Supabase instance, Postgres returns error code 42703 with a message
    // that names the missing column. We isolate each fallback to its own
    // column set (looking at the actual column name in the message rather
    // than the loose "column does not exist" string) so we don't ever
    // strip an unrelated field. After every retry we capture the NEW
    // error — not the original — so the next fallback only fires when
    // there really is more work to do.
    let lastError = updRes.error
    const stripped = { scheduled: false, discount: false, csAttachments: false }

    const errorMentions = (err: any, ...names: string[]) => {
      if (!err) return false
      if (err.code === '42703') return true // undefined_column — always retry
      const msg = (err.message || '').toLowerCase()
      return names.some((n) => msg.includes(n.toLowerCase()))
    }

    if (lastError && errorMentions(lastError, 'isScheduled', 'scheduledDate', 'scheduledTimeSlot', 'scheduledSpecificTime')) {
      console.warn('[orders PUT] scheduled columns missing, retrying without them')
      const { isScheduled: _i, scheduledDate: _d, scheduledTimeSlot: _s, scheduledSpecificTime: _t, ...safe } = updatedOrder as any
      const retry = await supabase.from('orders').update(safe).eq('id', params.id)
      lastError = retry.error
      stripped.scheduled = true
    }
    if (lastError && errorMentions(lastError, 'discountCode', 'discountAmount', 'netTotal')) {
      console.warn('[orders PUT] discount columns missing, retrying without them')
      const { discountCode: _dc, discountAmount: _da, netTotal: _nt, ...safe } = updatedOrder as any
      const retry = await supabase.from('orders').update(safe).eq('id', params.id)
      lastError = retry.error
      stripped.discount = true
    }
    if (lastError && errorMentions(lastError, 'csAttachments')) {
      // csAttachments column hasn't been added yet — retry without it.
      // The order will save but the uploaded photos are LOST. We capture
      // a warning so the response can tell the client to run
      // data/cs-attachments-migration.sql; the client surfaces a toast
      // so the operator never thinks the photos were persisted.
      console.warn('[orders PUT] csAttachments column missing in DB, retrying without it')
      const { csAttachments: _ca, ...safe } = updatedOrder as any
      const retry = await supabase.from('orders').update(safe).eq('id', params.id)
      lastError = retry.error
      stripped.csAttachments = (updatedOrder as any).csAttachments && (updatedOrder as any).csAttachments.length > 0
    }
    if (lastError) {
      console.error('[orders PUT] update failed after fallbacks:', lastError)
      return NextResponse.json(
        { error: 'Failed to update order', details: lastError.message || null },
        { status: 500 },
      )
    }

    // Replace order items: delete old, insert new
    await supabase.from('order_items').delete().eq('orderId', params.id)
    if (rewrittenItems.length > 0) {
      await supabase.from('order_items').insert(rewrittenItems)
    }

    await appendEditHistory({
      entityType: 'order',
      entityId: params.id,
      orderId: params.id,
      action: 'updated',
      changedBy: body.createdBy || 'unknown',
      summary: `تم تعديل الطلب ${updatedOrder.appOrderNo}`,
      details: {
        changedFields,
        itemCount: rewrittenItems.length,
        orderTotal,
      },
    })

    return NextResponse.json(
      {
        order: await enrichOrder(updatedOrder as OrderRecord),
        warning: stripped.csAttachments
          ? 'تم حفظ الطلب بدون مرفقات خدمة العملاء — العمود csAttachments غير موجود في قاعدة البيانات. شغّل data/cs-attachments-migration.sql'
          : null,
      },
      { status: 200 },
    )
  } catch {
    return NextResponse.json({ error: 'Failed to update order' }, { status: 500 })
  }
}

// Delete an order (CS or admin). Cascade-removes related items, delivery,
// and any edit-history rows tied to the order. Returns 404 if not found.
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const url = new URL(request.url)
    const role = String(url.searchParams.get('role') || '').toLowerCase()
    const deletedBy = String(url.searchParams.get('by') || 'unknown')

    const allowed = role === 'admin' || role === 'cs'
    if (!allowed) {
      return NextResponse.json(
        { error: 'صلاحية غير كافية لحذف الطلب' },
        { status: 403 }
      )
    }

    // Confirm the order exists first so we can return a clean 404.
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('id, "appOrderNo"')
      .eq('id', params.id)
      .maybeSingle()

    if (fetchError) {
      console.error('DELETE /orders: fetch failed', fetchError)
      return NextResponse.json({ error: 'Failed to delete order' }, { status: 500 })
    }
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Cascade-delete dependents first (best-effort; errors are logged but not fatal
    // so the order row itself still gets removed even if a child table is empty).
    await supabase.from('order_items').delete().eq('orderId', params.id)
    await supabase.from('order_delivery').delete().eq('orderId', params.id)
    // Edit-history table name may differ; ignore failures gracefully.
    try {
      await supabase.from('order_edit_history').delete().eq('orderId', params.id)
    } catch (err) {
      console.warn('order_edit_history cleanup skipped:', err)
    }

    const { error: deleteError } = await supabase
      .from('orders')
      .delete()
      .eq('id', params.id)

    if (deleteError) {
      console.error('DELETE /orders: delete failed', deleteError)
      return NextResponse.json({ error: 'Failed to delete order' }, { status: 500 })
    }

    // Best-effort audit entry (do not fail the delete if history write errors).
    try {
      await appendEditHistory({
        entityType: 'order',
        entityId: params.id,
        orderId: params.id,
        action: 'deleted',
        changedBy: deletedBy,
        summary: `تم حذف الطلب ${(order as any).appOrderNo || params.id}`,
        details: { role },
      })
    } catch (err) {
      console.warn('appendEditHistory after delete failed:', err)
    }

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (err) {
    console.error('DELETE /orders unexpected:', err)
    return NextResponse.json({ error: 'Failed to delete order' }, { status: 500 })
  }
}
