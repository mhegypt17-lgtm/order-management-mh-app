import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import {
  OrderDeliveryRecord,
  OrderItemRecord,
  OrderRecord,
  generateId,
  readAddresses,
  readCustomers,
  readOrderDelivery,
  readOrderItems,
  readOrders,
  readOrdersWindow,
  readCustomersByIds,
  readAddressesByIds,
  readOrderItemsByOrderIds,
  readOrderDeliveryByOrderIds,
  readProductsByIds,
  ORDER_COLUMNS_LIST,
  DELIVERY_COLUMNS_LIST,
} from '@/lib/omsData'

export const dynamic = 'force-dynamic'
export const revalidate = 0

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
    const from = searchParams.get('from') || ''
    const to = searchParams.get('to') || ''
    const deliveryStatus = searchParams.get('deliveryStatus') || 'all'

    // ─── Push date window to the DB where possible ────────────────────
    // Previously read the ENTIRE orders table + csAttachments blobs.
    // ORDER_COLUMNS_LIST drops csAttachments; a fromDate/toDate window
    // trims 90 %+ of rows for the common "today"/"this month" cases.
    let fromDate: string | undefined
    let toDate: string | undefined
    if (date) {
      fromDate = date
      toDate = date
    } else if (month) {
      fromDate = `${month}-01`
      toDate = `${month}-31`
    } else {
      if (from) fromDate = from
      if (to) toDate = to
    }
    const allOrders = await readOrdersWindow({
      fromDate,
      toDate,
      columns: ORDER_COLUMNS_LIST,
    })

    // ─── Belt-and-suspenders JS filter (behaviour preserved exactly) ──
    let filteredOrders = allOrders
    if (date) {
      filteredOrders = filteredOrders.filter((o) => o.orderDate === date)
    }
    if (month) {
      filteredOrders = filteredOrders.filter((o) =>
        String(o.orderDate || '').startsWith(`${month}-`),
      )
    }
    if (from) {
      filteredOrders = filteredOrders.filter((o) => String(o.orderDate || '') >= from)
    }
    if (to) {
      filteredOrders = filteredOrders.filter((o) => String(o.orderDate || '') <= to)
    }

    // ─── Scoped Promise.all — no more full-table scans ────────────────
    // Only fetch customers / addresses / items / deliveries / products
    // that are actually referenced by the surviving orders. In the
    // typical "today" case this drops the payload from megabytes to KBs.
    const orderIds = filteredOrders.map((o) => o.id)
    const customerIds = Array.from(
      new Set(filteredOrders.map((o) => o.customerId).filter((v): v is string => Boolean(v))),
    )
    const addressIds = Array.from(
      new Set(
        filteredOrders.map((o) => o.deliveryAddressId).filter((v): v is string => Boolean(v)),
      ),
    )
    const [customers, addresses, items, deliveryRows] = await Promise.all([
      customerIds.length > 0 ? readCustomersByIds(customerIds) : Promise.resolve([]),
      addressIds.length > 0 ? readAddressesByIds(addressIds) : Promise.resolve([]),
      orderIds.length > 0 ? readOrderItemsByOrderIds(orderIds) : Promise.resolve([]),
      // DELIVERY_COLUMNS_LIST drops the base64 productPhotos + invoicePhoto
      // blobs; list view only needs status + timestamps.
      orderIds.length > 0
        ? readOrderDeliveryByOrderIds(orderIds, DELIVERY_COLUMNS_LIST)
        : Promise.resolve([]),
    ])
    const productIds = Array.from(
      new Set(
        (items as OrderItemRecord[])
          .map((i) => i.productId)
          .filter((v): v is string => Boolean(v)),
      ),
    )
    const products = productIds.length > 0 ? await readProductsByIds(productIds) : []

    // ─── Build Map lookups so enrichment is O(1) ──────────────────────
    const customerById = new Map<string, any>()
    for (const c of customers) customerById.set(c.id, c)
    const addressById = new Map<string, any>()
    for (const a of addresses) addressById.set(a.id, a)
    const productById = new Map<string, any>()
    for (const p of products) productById.set(p.id, p)
    const deliveryByOrderId = new Map<string, OrderDeliveryRecord>()
    for (const d of deliveryRows) deliveryByOrderId.set(d.orderId, d)
    const itemsByOrderId = new Map<string, any[]>()
    for (const it of items) {
      const list = itemsByOrderId.get(it.orderId) || []
      list.push(it)
      itemsByOrderId.set(it.orderId, list)
    }

    // ─── Lazy-insert missing delivery rows (only for what survived) ───
    // Most orders will already have a delivery row; only newly-created
    // orders ever need this fallback insert. Doing it in batch keeps
    // the hot path fast even when 100 orders all lack a delivery row.
    const missingDeliveryFallbacks: OrderDeliveryRecord[] = []
    for (const o of filteredOrders) {
      if (deliveryByOrderId.has(o.id)) continue
      const fb: OrderDeliveryRecord = {
        id: generateId('del'),
        orderId: o.id,
        deliveryStatus: 'لم يخرج بعد',
        branchComments: '',
        productPhotos: [],
        invoicePhoto: '',
        deliveredAt: null,
        updatedBy: '',
        updatedAt: o.updatedAt,
      }
      deliveryByOrderId.set(o.id, fb)
      missingDeliveryFallbacks.push(fb)
    }
    if (missingDeliveryFallbacks.length > 0) {
      // Fire-and-forget so a slow insert doesn't block the response;
      // the in-memory fallback above is what we return to the client.
      supabase
        .from('order_delivery')
        .insert(missingDeliveryFallbacks)
        .then((res) => {
          if (res.error) console.warn('lazy-insert delivery fallbacks failed:', res.error.message)
        })
    }

    let enriched = filteredOrders.map((order) => {
      const customer = customerById.get(order.customerId) || null
      const address = addressById.get(order.deliveryAddressId) || null
      const orderItems = (itemsByOrderId.get(order.id) || []).map((item) => {
        const product = productById.get(item.productId)
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
        delivery: deliveryByOrderId.get(order.id)!,
      }
    })

    if (deliveryStatus !== 'all') {
      enriched = enriched.filter((o) => o.delivery.deliveryStatus === deliveryStatus)
    }

    enriched = enriched.sort((a, b) => (a.orderTime < b.orderTime ? 1 : -1))

    return NextResponse.json({ orders: enriched }, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch branch orders' }, { status: 500 })
  }
}
