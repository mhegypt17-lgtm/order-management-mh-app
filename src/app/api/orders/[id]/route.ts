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
  writeAddresses,
  writeOrderItems,
  writeOrders,
} from '@/lib/omsData'

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

async function computeDeliveryFeeByArea(subtotal: number, area?: string) {
  const zones = await readDeliveryZones()
  const matchedZone = zones.find((z) => String(z.area || '').trim() === String(area || '').trim())

  if (!matchedZone) {
    return subtotal > 1800 ? 0 : 95
  }

  const freeValue = Number(matchedZone.freeDeliveryValue) || 0
  const customerFee = Number(matchedZone.customerDeliveryFee) || 0

  if (freeValue > 0 && subtotal >= freeValue) {
    return 0
  }

  return customerFee
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

    let deliveryAddress: CustomerAddressRecord | undefined

    if (body.deliveryAddressId && body.deliveryAddressId !== '__new') {
      deliveryAddress = addresses.find((a) => a.id === body.deliveryAddressId)
    }

    if (!deliveryAddress && body.streetAddress) {
      deliveryAddress = {
        id: generateId('addr'),
        customerId: orders[orderIndex].customerId,
        addressLabel: body.addressLabel || 'Home',
        area: body.deliveryArea || '',
        streetAddress: body.streetAddress,
        googleMapsLink: body.googleMapsLink || '',
        createdAt: now,
      }
      addresses.push(deliveryAddress)
    } else if (deliveryAddress) {
      deliveryAddress.area = body.deliveryArea || deliveryAddress.area || ''
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
    const deliveryFee = await computeDeliveryFeeByArea(subtotal, body.deliveryArea || deliveryAddress?.area)
    const orderTotal = subtotal + deliveryFee

    const existing = orders[orderIndex]

    const changedFields: string[] = []
    if (existing.orderStatus !== body.orderStatus) changedFields.push('orderStatus')
    if (existing.paymentMethod !== body.paymentMethod) changedFields.push('paymentMethod')
    if (existing.orderMethod !== body.orderMethod) changedFields.push('orderMethod')
    if (existing.orderReceiver !== body.orderReceiver) changedFields.push('orderReceiver')
    if (existing.customerSource !== body.customerSource) changedFields.push('customerSource')
    if ((existing.notes || '') !== (body.notes || '')) changedFields.push('notes')

    orders[orderIndex] = {
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
      subtotal,
      deliveryFee,
      orderTotal,
      updatedAt: now,
    }

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

    await writeAddresses(addresses)
    await writeOrders(orders)
    await writeOrderItems([...remainingItems, ...rewrittenItems])

    await appendEditHistory({
      entityType: 'order',
      entityId: params.id,
      orderId: params.id,
      action: 'updated',
      changedBy: body.createdBy || 'unknown',
      summary: `تم تعديل الطلب ${orders[orderIndex].appOrderNo}`,
      details: {
        changedFields,
        itemCount: rewrittenItems.length,
        orderTotal,
      },
    })

    return NextResponse.json({ order: await enrichOrder(orders[orderIndex]) }, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Failed to update order' }, { status: 500 })
  }
}
