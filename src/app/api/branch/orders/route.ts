import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import {
  OrderDeliveryRecord,
  OrderRecord,
  generateId,
  readAddresses,
  readCustomers,
  readOrderDelivery,
  readOrderItems,
  readOrders,
  writeOrderDelivery,
} from '@/lib/omsData'

const PRODUCTS_FILE = path.join(process.cwd(), 'data', 'products.json')

function readProducts() {
  try {
    const raw = fs.readFileSync(PRODUCTS_FILE, 'utf-8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function ensureDelivery(order: OrderRecord): OrderDeliveryRecord {
  const deliveryRows = readOrderDelivery()
  const existing = deliveryRows.find((d) => d.orderId === order.id)

  if (existing) return existing

  const fallback: OrderDeliveryRecord = {
    id: generateId('del'),
    orderId: order.id,
    deliveryStatus: 'قبول',
    branchComments: '',
    productPhotos: [],
    invoicePhoto: '',
    deliveredAt: null,
    updatedBy: '',
    updatedAt: order.updatedAt,
  }

  deliveryRows.push(fallback)
  writeOrderDelivery(deliveryRows)
  return fallback
}

function enrichOrderForBranch(order: OrderRecord) {
  const customers = readCustomers()
  const addresses = readAddresses()
  const items = readOrderItems()
  const products = readProducts()

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
    delivery: ensureDelivery(order),
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date') || ''
    const month = searchParams.get('month') || ''
    const deliveryStatus = searchParams.get('deliveryStatus') || 'all'
    const view = searchParams.get('view') || '' // '', 'today', 'scheduled', 'upcoming'

    let orders = readOrders().map(enrichOrderForBranch)

    const _now = new Date()
    const today = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-${String(_now.getDate()).padStart(2, '0')}`

    if (view === 'upcoming') {
      // Future-scheduled orders only
      orders = orders.filter((o) => o.isScheduled && o.scheduledDate && o.scheduledDate > today)
    } else if (view === 'scheduled') {
      // All scheduled orders (past, today, future)
      orders = orders.filter((o) => !!o.isScheduled)
    } else if (view === 'today') {
      // Effective date today (same-day orders + scheduled-for-today)
      orders = orders.filter((o) => {
        const effectiveDate = o.isScheduled && o.scheduledDate ? o.scheduledDate : o.orderDate
        return effectiveDate === today
      })
    } else if (date) {
      // Specific date: match effective date (don't hide future-scheduled here)
      orders = orders.filter((o) => {
        const effectiveDate = o.isScheduled && o.scheduledDate ? o.scheduledDate : o.orderDate
        return effectiveDate === date
      })
    } else {
      // Default: hide future-scheduled (they appear on their scheduled date)
      orders = orders.filter((o) => {
        if (!o.isScheduled || !o.scheduledDate) return true
        return o.scheduledDate <= today
      })
    }

    if (month) {
      orders = orders.filter((o) => String(o.orderDate || '').startsWith(`${month}-`))
    }

    if (deliveryStatus !== 'all') {
      orders = orders.filter((o) => o.delivery.deliveryStatus === deliveryStatus)
    }

    orders = orders.sort((a, b) => (a.orderTime < b.orderTime ? 1 : -1))

    return NextResponse.json({ orders }, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch branch orders' }, { status: 500 })
  }
}
