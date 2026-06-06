import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import {
  CustomerAddressRecord,
  OrderItemRecord,
  OrderRecord,
  appendEditHistory,
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

    const changedFields: string[] = []
    if (existing.orderStatus !== body.orderStatus) changedFields.push('orderStatus')
    if (existing.paymentMethod !== body.paymentMethod) changedFields.push('paymentMethod')
    if (existing.orderMethod !== body.orderMethod) changedFields.push('orderMethod')
    if (existing.orderReceiver !== body.orderReceiver) changedFields.push('orderReceiver')
    if (existing.customerSource !== body.customerSource) changedFields.push('customerSource')
    if ((existing.notes || '') !== (body.notes || '')) changedFields.push('notes')

    const remainingItems = orderItems.filter((i) => i.orderId !== params.id)
    const rewrittenItems: OrderItemRecord[] = normalizedItems.map((i) => ({
      id: generateId('item'),
      orderId: params.id,
      productId: i.productId,
      quantity: i.quantity,
      weightGrams: i.weightGrams,
      unitPrice: i.unitPrice,
      lineTotal: i.lineTotal,
      specialInstructions: i.specialInstructions || '',
      createdAt: now,
    }))

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
      updatedAt: now,
    }
    await supabase.from('orders').update(updatedOrder).eq('id', params.id)

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

    return NextResponse.json({ order: await enrichOrder(updatedOrder as OrderRecord) }, { status: 200 })
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
