import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import {
  OrderDeliveryRecord,
  OrderRecord,
  generateId,
  readAddresses,
  readCustomers,
  readOrderDelivery,
  readOrderItems,
  readOrders,
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

async function ensureDelivery(order: OrderRecord): Promise<OrderDeliveryRecord> {
  const deliveryRows = await readOrderDelivery()
  const existing = deliveryRows.find((d) => d.orderId === order.id)

  if (existing) return existing

  const fallback: OrderDeliveryRecord = {
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

  // Insert new delivery record to Supabase
  const { data: newDel, error: insertErr } = await supabase
    .from('order_delivery')
    .insert([fallback])
    .select()
    .single()

  if (insertErr) {
    console.error('Error inserting delivery:', insertErr)
  }
  return newDel || fallback
}

async function enrichOrderForBranch(order: OrderRecord) {
  const customers = await readCustomers()
  const addresses = await readAddresses()
  const items = await readOrderItems()
  const products = await readProducts()

  const customer = customers.find((c) => c.id === order.customerId) || null
  const address = addresses.find((a) => a.id === order.deliveryAddressId) || null

  const orderItems = items
    .filter((i) => i.orderId === order.id)
    .map((item) => {
      const product = products.find((p: any) => p.id === item.productId)
      return {
        ...item,
        productName: product?.productName || 'منتج محذوف',
      }
    })

  return {
    ...order,
    customer,
    address,
    items: orderItems,
    delivery: await ensureDelivery(order),
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date') || ''
    const month = searchParams.get('month') || ''
    const deliveryStatus = searchParams.get('deliveryStatus') || 'all'

    let orders = await readOrders()
    const enriched = await Promise.all(orders.map(enrichOrderForBranch))
    let filtered = enriched

    if (date) {
      filtered = filtered.filter((o) => o.orderDate === date)
    }

    if (month) {
      filtered = filtered.filter((o) => String(o.orderDate || '').startsWith(`${month}-`))
    }

    if (deliveryStatus !== 'all') {
      filtered = filtered.filter((o) => o.delivery.deliveryStatus === deliveryStatus)
    }

    filtered = filtered.sort((a, b) => (a.orderTime < b.orderTime ? 1 : -1))

    return NextResponse.json({ orders: filtered }, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch branch orders' }, { status: 500 })
  }
}
