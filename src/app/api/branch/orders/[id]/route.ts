import { NextRequest, NextResponse } from 'next/server'
import {
  OrderDeliveryRecord,
  appendEditHistory,
  generateId,
  readAddresses,
  readCustomers,
  readOrderDelivery,
  readOrderItems,
  readOrders,
  readProducts,
  writeOrderDelivery,
} from '@/lib/omsData'

async function enrich(orderId: string) {
  const [orders, customers, addresses, items, products, deliveryRows] = await Promise.all([
    readOrders(),
    readCustomers(),
    readAddresses(),
    readOrderItems(),
    readProducts(),
    readOrderDelivery(),
  ])

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
      deliveryStatus: 'قبول',
      branchComments: '',
      productPhotos: [],
      invoicePhoto: '',
      deliveredAt: null,
      updatedBy: '',
      updatedAt: order.updatedAt,
    }
    deliveryRows.push(delivery)
    await writeOrderDelivery(deliveryRows)
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
            deliveryStatus: 'قبول',
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
      rows[index] = updated
    } else {
      rows.push(updated)
    }

    await writeOrderDelivery(rows)

    appendEditHistory({
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

    const order = await enrich(params.id)
    return NextResponse.json({ order }, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Failed to update delivery data' }, { status: 500 })
  }
}
