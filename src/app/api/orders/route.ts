import { NextRequest, NextResponse } from 'next/server'
import {
  CustomerAddressRecord,
  CustomerRecord,
  OrderItemRecord,
  OrderRecord,
  appendEditHistory,
  generateAppOrderNo,
  generateId,
  normalizePhone,
  readAddresses,
  readCustomers,
  readOrderItems,
  readOrderDelivery,
  readOrders,
  readDeliveryZones,
  readProducts,
  writeAddresses,
  writeCustomers,
  writeOrderItems,
  writeOrders,
  evaluateDiscountCode,
  readDiscountCodes,
  writeDiscountCodes,
} from '@/lib/omsData'

type OrderInputItem = {
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
  const [customers, addresses, orderItems, orderDelivery, products] = await Promise.all([
    readCustomers(),
    readAddresses(),
    readOrderItems(),
    readOrderDelivery(),
    readProducts(),
  ])

  const customer = customers.find((c) => c.id === order.customerId) || null
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
      deliveryStatus: 'قبول',
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

export async function GET() {
  try {
    const rawOrders = (await readOrders()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    const orders = await Promise.all(rawOrders.map(enrichOrder))

    return NextResponse.json({ orders }, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const now = new Date().toISOString()

    const [customers, addresses, orders, orderItems] = await Promise.all([
      readCustomers(),
      readAddresses(),
      readOrders(),
      readOrderItems(),
    ])

    const normalizedPhone = normalizePhone(body.phone)
    let customer = customers.find((c) => normalizePhone(c.phone) === normalizedPhone) as CustomerRecord | undefined

    if (!customer) {
      customer = {
        id: generateId('cust'),
        phone: normalizedPhone,
        customerName: body.customerName,
        createdAt: now,
        updatedAt: now,
      }
      customers.push(customer)
    } else {
      customer.customerName = body.customerName
      customer.updatedAt = now
    }

    let deliveryAddress: CustomerAddressRecord | undefined

    if (body.deliveryAddressId && body.deliveryAddressId !== '__new') {
      deliveryAddress = addresses.find((a) => a.id === body.deliveryAddressId)
    }

    if (!deliveryAddress) {
      deliveryAddress = {
        id: generateId('addr'),
        customerId: customer.id,
        addressLabel: body.addressLabel || 'Home',
        area: body.deliveryArea || '',
        streetAddress: body.streetAddress,
        googleMapsLink: body.googleMapsLink || '',
        createdAt: now,
      }
      addresses.push(deliveryAddress)
    } else {
      deliveryAddress.area = body.deliveryArea || deliveryAddress.area || ''
    }

    const products = await readProducts()
    const items: OrderInputItem[] = Array.isArray(body.items) ? body.items : []
    const normalizedItems = items
      .map((i) => {
        const matchedProduct = findMatchedProduct(products, i.productNameInput)

        return {
          ...i,
          productId: i.productId || matchedProduct?.id || '',
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
    const deliveryFee = await computeDeliveryFeeByArea(subtotal, body.deliveryArea || deliveryAddress.area)
    const grossTotal = subtotal + deliveryFee

    // Discount code (validated server-side)
    let discountApplied = 0
    let discountCodeUsed: string | null = null
    let discountCodeId: string | null = null
    if (body.discountCode) {
      const evalResult = await evaluateDiscountCode(String(body.discountCode), grossTotal)
      if (evalResult.ok && evalResult.code) {
        discountApplied = evalResult.discount
        discountCodeUsed = evalResult.code.code
        discountCodeId = evalResult.code.id
      }
    }
    const afterDiscount = Math.max(0, grossTotal - discountApplied)

    // Wallet credit (capped by remaining payable)
    const requestedWallet = Math.max(0, Number(body.walletApplied) || 0)
    const customerWallet = Math.max(0, Number(customer.wallet) || 0)
    const walletApplied = Math.min(requestedWallet, customerWallet, afterDiscount)
    const orderTotal = afterDiscount - walletApplied
    if (walletApplied > 0) {
      customer.wallet = customerWallet - walletApplied
      customer.updatedAt = now
    }

    const appOrderNo = generateAppOrderNo(body.orderDate, body.orderType, orders)

    const order: OrderRecord = {
      id: generateId('ord'),
      appOrderNo,
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
      customerId: customer.id,
      deliveryAddressId: deliveryAddress.id,
      notes: body.notes || '',
      followUp: Boolean(body.followUp),
      followUpNotes: body.followUpNotes || '',
      isScheduled: Boolean(body.isScheduled),
      scheduledDate: body.isScheduled ? (body.scheduledDate || null) : null,
      scheduledTimeSlot: body.isScheduled ? (body.scheduledTimeSlot || null) : null,
      scheduledSpecificTime: body.isScheduled && body.scheduledTimeSlot === 'ساعة محددة'
        ? (body.scheduledSpecificTime || null) : null,
      isPriority: Boolean(body.isPriority),
      priorityReason: body.isPriority ? (body.priorityReason || null) : null,
      subtotal,
      deliveryFee,
      walletApplied,
      discountCode: discountCodeUsed,
      discountApplied,
      orderTotal,
      createdBy: body.createdBy || 'unknown',
      createdAt: now,
      updatedAt: now,
    }

    orders.push(order)

    const newItems: OrderItemRecord[] = normalizedItems.map((i) => ({
      id: generateId('item'),
      orderId: order.id,
      productId: i.productId,
      quantity: i.quantity,
      weightGrams: i.weightGrams,
      unitPrice: i.unitPrice,
      lineTotal: i.lineTotal,
      specialInstructions: i.specialInstructions || '',
      createdAt: now,
    }))

    await writeCustomers(customers)
    await writeAddresses(addresses)
    await writeOrders(orders)
    await writeOrderItems([...orderItems, ...newItems])

    if (discountCodeId) {
      const allCodes = await readDiscountCodes()
      const ci = allCodes.findIndex((c) => c.id === discountCodeId)
      if (ci >= 0) {
        allCodes[ci] = { ...allCodes[ci], usedCount: (allCodes[ci].usedCount || 0) + 1, updatedAt: now }
        await writeDiscountCodes(allCodes)
      }
    }

    appendEditHistory({
      entityType: 'order',
      entityId: order.id,
      orderId: order.id,
      action: 'created',
      changedBy: body.createdBy || 'unknown',
      summary: `تم إنشاء الطلب ${order.appOrderNo}`,
      details: {
        orderNo: order.appOrderNo,
        orderTotal,
        itemCount: newItems.length,
        isPriority: Boolean(body.isPriority),
      },
    })

    return NextResponse.json({ order: await enrichOrder(order) }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 })
  }
}
