import { NextRequest, NextResponse } from 'next/server'
import {
  OrderItemRecord,
  OrderRecord,
  appendEditHistory,
  generateAppOrderNo,
  generateId,
  readAddresses,
  readDeliveryZones,
  readOrderItems,
  readOrders,
  readProducts,
  writeOrderItems,
  writeOrders,
} from '@/lib/omsData'

async function computeDeliveryFeeByArea(subtotal: number, area?: string) {
  const zones = await readDeliveryZones()
  const matchedZone = zones.find((z) => String(z.area || '').trim() === String(area || '').trim())
  if (!matchedZone) return subtotal > 1800 ? 0 : 95
  const freeValue = Number(matchedZone.freeDeliveryValue) || 0
  const customerFee = Number(matchedZone.customerDeliveryFee) || 0
  if (freeValue > 0 && subtotal >= freeValue) return 0
  return customerFee
}

/**
 * One-click duplicate. Creates a new order from the source order's data
 * with fresh date/time, fresh order number, repriced items, default status.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json().catch(() => ({} as any))
    const createdBy = body.createdBy || 'unknown'

    const orders = await readOrders()
    const source = orders.find((o) => o.id === params.id)
    if (!source) {
      return NextResponse.json({ error: 'Source order not found' }, { status: 404 })
    }

    const allItems = await readOrderItems()
    const sourceItems = allItems.filter((i) => i.orderId === source.id)
    const products = await readProducts()
    const addresses = await readAddresses()
    const address = addresses.find((a) => a.id === source.deliveryAddressId) || null

    const now = new Date()
    const orderDate = now.toISOString().slice(0, 10)
    const orderTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const nowISO = now.toISOString()

    // Re-price items from current catalog. Skip rows whose product is gone.
    let inactiveCount = 0
    let priceChanges = 0
    const newItems: OrderItemRecord[] = []
    const newOrderId = generateId('ord')

    for (const it of sourceItems) {
      const product = products.find((p: any) => p.id === it.productId)
      if (!product) continue
      const unitPrice = Number(product.offerPrice ?? product.basePrice) || Number(it.unitPrice) || 0
      const quantity = Number(it.quantity) || 1
      if (!product.isActive) inactiveCount += 1
      if (Math.abs(Number(it.unitPrice || 0) - unitPrice) > 0.001) priceChanges += 1
      newItems.push({
        id: generateId('item'),
        orderId: newOrderId,
        productId: it.productId,
        quantity,
        weightGrams: Number(it.weightGrams) || 0,
        unitPrice,
        lineTotal: quantity * unitPrice,
        specialInstructions: it.specialInstructions || '',
        createdAt: nowISO,
      })
    }

    const subtotal = newItems.reduce((sum, i) => sum + i.lineTotal, 0)
    const deliveryFee = await computeDeliveryFeeByArea(subtotal, address?.area)
    const orderTotal = subtotal + deliveryFee
    const appOrderNo = generateAppOrderNo(orderDate, source.orderType, orders)

    const newOrder: OrderRecord = {
      id: newOrderId,
      appOrderNo,
      orderDate,
      orderTime,
      orderType: source.orderType,
      orderReceiver: source.orderReceiver,
      orderMethod: source.orderMethod,
      customerType: 'عائد',
      customerSource: source.customerSource,
      orderStatus: 'ساري',
      cancellationReason: null,
      paymentMethod: source.paymentMethod,
      customerId: source.customerId,
      deliveryAddressId: source.deliveryAddressId,
      notes: '',
      followUp: false,
      followUpNotes: '',
      subtotal,
      deliveryFee,
      orderTotal,
      createdBy,
      createdAt: nowISO,
      updatedAt: nowISO,
    }

    orders.push(newOrder)
    await writeOrders(orders)
    await writeOrderItems([...allItems, ...newItems])

    appendEditHistory({
      entityType: 'order',
      entityId: newOrder.id,
      orderId: newOrder.id,
      action: 'created',
      changedBy: createdBy,
      summary: `تم إنشاء طلب جديد ${appOrderNo} (نسخة من ${source.appOrderNo})`,
      details: {
        duplicatedFromOrderId: source.id,
        duplicatedFromAppOrderNo: source.appOrderNo,
        itemCount: newItems.length,
        inactiveProductCount: inactiveCount,
        priceChangedCount: priceChanges,
        orderTotal,
      },
    })

    return NextResponse.json(
      {
        order: newOrder,
        warnings: {
          inactiveProductCount: inactiveCount,
          priceChangedCount: priceChanges,
          skippedItemCount: sourceItems.length - newItems.length,
        },
      },
      { status: 201 }
    )
  } catch (err) {
    console.error('duplicate order error', err)
    return NextResponse.json({ error: 'Failed to duplicate order' }, { status: 500 })
  }
}
