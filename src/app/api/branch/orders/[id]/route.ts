import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import {
  OrderDeliveryRecord,
  appendEditHistory,
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
      return {
        ...item,
        productName: product?.productName || 'منتج محذوف',
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

    const updated: OrderDeliveryRecord = {
      ...existing,
      deliveryStatus: nextStatus,
      branchComments: body.branchComments ?? existing.branchComments,
      productPhotos: Array.isArray(body.productPhotos) ? body.productPhotos : existing.productPhotos,
      invoicePhoto: body.invoicePhoto ?? existing.invoicePhoto,
      deliveredAt: nextStatus === 'تم التوصيل' ? existing.deliveredAt || now : null,
      updatedBy: body.updatedBy || existing.updatedBy || 'branch',
      updatedAt: now,
    }

    if (index >= 0) {
      await supabase
        .from('order_delivery')
        .update(updated)
        .eq('id', updated.id)
    } else {
      await supabase.from('order_delivery').insert([updated])
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
