import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import {
  CustomerAddressRecord,
  OrderItemRecord,
  OrderRecord,
  appendEditHistory,
  generateAppOrderNo,
  normalizePhone,
  readAddresses,
  readCustomers,
  readOrderItems,
  readOrderDelivery,
  readOrders,
  readDeliveryZones,
} from '@/lib/omsData'

function generateTextId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

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

async function readProducts() {
  try {
    const { data, error } = await supabase.from('products').select('*')
    if (error) return []
    return Array.isArray(data) ? data : []
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

export async function GET() {
  try {
    const { data: orders, error } = await supabase.from('orders').select('*').order('createdAt', { ascending: false })
    
    if (error) {
      return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 })
    }
    
    const enriched = await Promise.all((orders || []).map(enrichOrder))
    return NextResponse.json({ orders: enriched }, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const now = new Date().toISOString()

    // 1. Find or create customer (select-then-insert to preserve stable FK id)
    const normalizedPhone = normalizePhone(body.phone)
    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('*')
      .eq('phone', normalizedPhone)
      .maybeSingle()

    let customerId: string
    if (existingCustomer) {
      customerId = existingCustomer.id
      // Update name in case it changed
      await supabase
        .from('customers')
        .update({ customerName: body.customerName, updatedAt: now })
        .eq('id', customerId)
    } else {
      customerId = generateTextId('cust')
      const { error: customerError } = await supabase
        .from('customers')
        .insert({
          id: customerId,
          phone: normalizedPhone,
          customerName: body.customerName,
          createdAt: now,
          updatedAt: now,
        })
      if (customerError) {
        console.error('Error inserting customer:', customerError)
      }
    }

    // 2. Insert address
    const addressId = generateTextId('addr')
    const deliveryAddress: CustomerAddressRecord = {
      id: addressId,
      customerId: customerId,
      addressLabel: body.addressLabel || 'Home',
      area: body.deliveryArea || '',
      streetAddress: body.streetAddress,
      googleMapsLink: body.googleMapsLink || '',
      createdAt: now,
    }

    const { error: addressError } = await supabase
      .from('customer_addresses')
      .insert([deliveryAddress])

    if (addressError) {
      console.error('Error inserting address:', addressError)
    }

    // Get products and normalize items
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
    const orderTotal = subtotal + deliveryFee

    // Get existing orders for appOrderNo generation
    const { data: existingOrders = [] } = await supabase.from('orders').select('*')
    const appOrderNo = await generateAppOrderNo(body.orderDate, body.orderType, existingOrders as OrderRecord[])

    // 3. Insert order
    const orderId = generateTextId('ord')
    const order: OrderRecord = {
      id: orderId,
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
      customerId: customerId,
      deliveryAddressId: addressId,
      notes: body.notes || '',
      followUp: Boolean(body.followUp),
      followUpNotes: body.followUpNotes || '',
      subtotal,
      deliveryFee,
      orderTotal,
      createdBy: body.createdBy || 'unknown',
      createdAt: now,
      updatedAt: now,
    }

    const { data: createdOrder, error: orderError } = await supabase
      .from('orders')
      .insert([order])
      .select()
      .single()

    if (orderError) {
      console.error('Error inserting order:', orderError)
      return NextResponse.json({ error: 'Failed to create order' }, { status: 500 })
    }

    // 4. Insert order items
    const newItems: OrderItemRecord[] = normalizedItems.map((i) => ({
      id: generateTextId('item'),
      orderId: orderId,
      productId: i.productId,
      quantity: i.quantity,
      weightGrams: i.weightGrams,
      unitPrice: i.unitPrice,
      lineTotal: i.lineTotal,
      specialInstructions: i.specialInstructions || '',
      createdAt: now,
    }))

    if (newItems.length > 0) {
      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(newItems)

      if (itemsError) {
        console.error('Error inserting order items:', itemsError)
      }
    }

    // 5. Insert delivery record
    const { error: deliveryError } = await supabase
      .from('order_delivery')
      .insert([{
        id: generateTextId('del'),
        orderId: orderId,
        deliveryStatus: 'لم يخرج بعد',
        branchComments: '',
        productPhotos: [],
        invoicePhoto: '',
        deliveredAt: null,
        updatedBy: '',
        updatedAt: now,
      }])

    if (deliveryError) {
      console.error('Error inserting delivery:', deliveryError)
    }

    // Log edit history
    await appendEditHistory({
      entityType: 'order',
      entityId: orderId,
      orderId: orderId,
      action: 'created',
      changedBy: body.createdBy || 'unknown',
      summary: `تم إنشاء الطلب ${appOrderNo}`,
      details: {
        orderNo: appOrderNo,
        orderTotal,
        itemCount: newItems.length,
      },
    })

    // Return enriched order
    const enrichedOrder = await enrichOrder(createdOrder || order)
    return NextResponse.json({ order: enrichedOrder }, { status: 201 })
  } catch (error) {
    console.error('Error creating order:', error)
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 })
  }
}
