import { NextRequest, NextResponse } from 'next/server'
import {
  readCustomers,
  readAddresses,
  readOrders,
  readOrderItems,
  readOrderSettings,
  readProducts,
  resolveCustomerTier,
  DEFAULT_LOYALTY_CONFIG,
} from '@/lib/omsData'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { searchParams } = new URL(req.url)
    const role = searchParams.get('role') || 'cs' // 'cs' | 'admin'

    const customerId = params.id
    const customers = await readCustomers()
    const customer = customers.find((c) => c.id === customerId)

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    const allAddresses = await readAddresses()
    const addresses = allAddresses.filter((a) => a.customerId === customerId)

    const allOrders = await readOrders()
    let customerOrders = allOrders
      .filter((o) => o.customerId === customerId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    // CS sees only last 6 months
    if (role === 'cs') {
      const sixMonthsAgo = new Date()
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
      customerOrders = customerOrders.filter(
        (o) => new Date(o.createdAt) >= sixMonthsAgo
      )
    }

    const allOrderItems = await readOrderItems()
    const products = await readProducts()

    // Gather all-time order items for top-5 (use ALL history regardless of role)
    const allCustomerOrderIds = allOrders
      .filter((o) => o.customerId === customerId)
      .map((o) => o.id)

    const allCustomerItems = allOrderItems.filter((i) =>
      allCustomerOrderIds.includes(i.orderId)
    )

    // Aggregate top-5 products by total quantity
    const productMap: Record<string, { productId: string; productName: string; category: string; totalQty: number; totalSpend: number; orderCount: number }> = {}
    for (const item of allCustomerItems) {
      if (!item.productId) continue
      const prod = products.find((p) => p.id === item.productId)
      const name = prod?.productName || item.productId
      const cat = prod?.productCategory || ''
      if (!productMap[item.productId]) {
        productMap[item.productId] = { productId: item.productId, productName: name, category: cat, totalQty: 0, totalSpend: 0, orderCount: 0 }
      }
      productMap[item.productId].totalQty += item.quantity
      productMap[item.productId].totalSpend += item.lineTotal
      productMap[item.productId].orderCount += 1
    }

    const top5Products = Object.values(productMap)
      .sort((a, b) => b.totalQty - a.totalQty)
      .slice(0, 5)

    // All-time stats
    const allCustOrders = allOrders.filter((o) => o.customerId === customerId)
    const completedOrders = allCustOrders.filter((o) => o.orderStatus === 'تم')
    const cancelledOrders = allCustOrders.filter((o) => o.orderStatus === 'لاغي')
    const totalRevenue = completedOrders.reduce((sum, o) => sum + (o.orderTotal || 0), 0)
    const avgOrderValue = completedOrders.length > 0 ? totalRevenue / completedOrders.length : 0

    // Loyalty stats: any non-cancelled order counts toward tier (more intuitive than waiting for delivery)
    const loyaltyOrders = allCustOrders.filter((o) => o.orderStatus !== 'لاغي')
    const loyaltyRevenue = loyaltyOrders.reduce((sum, o) => sum + (o.orderTotal || 0), 0)

    const lastOrder = allCustOrders[0] // already sorted desc
    const firstOrder = allCustOrders[allCustOrders.length - 1]

    const daysSinceLastOrder = lastOrder
      ? Math.floor((Date.now() - new Date(lastOrder.createdAt).getTime()) / (1000 * 60 * 60 * 24))
      : null

    // Customer lifetime in months
    const lifetimeMonths = firstOrder
      ? Math.max(
          1,
          Math.ceil(
            (new Date(lastOrder?.createdAt || Date.now()).getTime() - new Date(firstOrder.createdAt).getTime()) /
              (1000 * 60 * 60 * 24 * 30)
          )
        )
      : 1

    const ordersPerMonth = allCustOrders.length / lifetimeMonths

    // Preferred payment method
    const paymentCounts: Record<string, number> = {}
    for (const o of allCustOrders) {
      paymentCounts[o.paymentMethod] = (paymentCounts[o.paymentMethod] || 0) + 1
    }
    const preferredPayment = Object.entries(paymentCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null

    // Preferred order channel
    const methodCounts: Record<string, number> = {}
    for (const o of allCustOrders) {
      methodCounts[o.orderMethod] = (methodCounts[o.orderMethod] || 0) + 1
    }
    const preferredChannel = Object.entries(methodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null

    // Customer tier (driven by configured loyalty rule)
    const settings = await readOrderSettings()
    const loyalty = settings.loyalty || DEFAULT_LOYALTY_CONFIG
    const tierConfig = resolveCustomerTier(loyalty, {
      completedOrderCount: loyaltyOrders.length,
      totalRevenue: loyaltyRevenue,
    })
    const tier = tierConfig.name
    // Determine progress to next tier
    const sortedTiers = [...loyalty.tiers].sort((a, b) => a.threshold - b.threshold)
    const currentIdx = sortedTiers.findIndex((t) => t.name === tierConfig.name)
    const nextTier = currentIdx >= 0 && currentIdx < sortedTiers.length - 1 ? sortedTiers[currentIdx + 1] : null
    const currentValue = loyalty.mode === 'revenue' ? loyaltyRevenue : loyaltyOrders.length
    const nextThreshold = nextTier?.threshold ?? null
    const remainingToNext = nextThreshold !== null ? Math.max(0, nextThreshold - currentValue) : null

    // Cancellation rate
    const cancellationRate = allCustOrders.length > 0 ? (cancelledOrders.length / allCustOrders.length) * 100 : 0

    // Upsell opportunities: products bought only once
    const singleOrderProducts = Object.values(productMap)
      .filter((p) => p.orderCount === 1)
      .map((p) => p.productName)

    // Cross-sell: product categories this customer hasn't ordered yet
    const orderedCategories = new Set(Object.values(productMap).map((p) => p.category).filter(Boolean))
    const allCategories = Array.from(new Set(products.map((p) => p.productCategory).filter(Boolean)))
    const unorderedCategories = allCategories.filter((cat) => !orderedCategories.has(cat))

    // Recent activity alert
    let activityAlert: string | null = null
    if (daysSinceLastOrder !== null) {
      if (daysSinceLastOrder > 90) activityAlert = `لم يطلب منذ ${daysSinceLastOrder} يوم — عميل خامل`
      else if (daysSinceLastOrder > 30) activityAlert = `آخر طلب منذ ${daysSinceLastOrder} يوم`
    }

    // Customer source (from first order)
    const customerSource = firstOrder?.customerSource || null

    // Inactivity stage (30/60/90+ days since last order)
    let inactivityStage: 30 | 60 | 90 | null = null
    if (daysSinceLastOrder != null) {
      if (daysSinceLastOrder >= 90) inactivityStage = 90
      else if (daysSinceLastOrder >= 60) inactivityStage = 60
      else if (daysSinceLastOrder >= 30) inactivityStage = 30
    }

    // Favorite product (top-1) — used as agent tip
    const favoriteProduct = top5Products[0]
      ? {
          name: top5Products[0].productName,
          category: top5Products[0].category,
          totalQty: top5Products[0].totalQty,
          orderCount: top5Products[0].orderCount,
        }
      : null

    const insights = {
      tier,
      tierIcon: tierConfig.icon,
      tierColor: tierConfig.color,
      loyaltyMode: loyalty.mode,
      nextTierName: nextTier?.name || null,
      nextTierThreshold: nextThreshold,
      currentLoyaltyValue: currentValue,
      remainingToNextTier: remainingToNext,
      daysSinceLastOrder,
      inactivityStage,
      activityAlert,
      ordersPerMonth: parseFloat(ordersPerMonth.toFixed(2)),
      preferredPayment,
      preferredChannel,
      cancellationRate: parseFloat(cancellationRate.toFixed(1)),
      singleOrderProducts,
      unorderedCategories,
      customerSource,
      avgOrderValue: parseFloat(avgOrderValue.toFixed(2)),
      favoriteProduct,
    }

    // Enriched orders with items
    const enrichedOrders = customerOrders.map((o) => {
      const items = allOrderItems
        .filter((i) => i.orderId === o.id)
        .map((i) => {
          const prod = products.find((p) => p.id === i.productId)
          return { ...i, productName: prod?.productName || i.productId }
        })
      return { ...o, items }
    })

    // Customer Lifetime Value
    // Historical: total spend so far (delivered orders only)
    // Predicted: avg order value × orders/month × 24-month projection horizon
    const projectionHorizonMonths = 24
    const predictedCLV = avgOrderValue * ordersPerMonth * projectionHorizonMonths
    const totalCLV = totalRevenue + predictedCLV

    return NextResponse.json({
      customer,
      addresses,
      orders: enrichedOrders,
      stats: {
        totalOrders: allCustOrders.length,
        completedOrders: completedOrders.length,
        cancelledOrders: cancelledOrders.length,
        totalRevenue,
        avgOrderValue,
        lifetimeMonths,
        firstOrderDate: firstOrder?.orderDate || null,
        lastOrderDate: lastOrder?.orderDate || null,
        historicalCLV: parseFloat(totalRevenue.toFixed(2)),
        predictedCLV: parseFloat(predictedCLV.toFixed(2)),
        totalCLV: parseFloat(totalCLV.toFixed(2)),
        clvProjectionMonths: projectionHorizonMonths,
      },
      top5Products,
      insights,
    })
  } catch (err) {
    console.error('CRM customer detail error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// Update customer profile fields (name, phone, email, notes, wallet).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json()
    const customers = await readCustomers()
    const idx = customers.findIndex((c) => c.id === params.id)
    if (idx < 0) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

    const current = customers[idx]
    const next: any = { ...current }
    const updates: any = {}

    if (typeof body.customerName === 'string' && body.customerName.trim()) {
      next.customerName = body.customerName.trim()
      updates.customerName = next.customerName
    }
    if (typeof body.phone === 'string' && body.phone.trim()) {
      const { normalizePhone } = await import('@/lib/omsData')
      const newPhone = normalizePhone(body.phone)
      if (!newPhone) {
        return NextResponse.json({ error: 'رقم الهاتف غير صحيح' }, { status: 400 })
      }
      // Block phone collision with a different customer.
      const dup = customers.find((c) => c.id !== params.id && normalizePhone(c.phone) === newPhone)
      if (dup) {
        return NextResponse.json({ error: 'رقم الهاتف مستخدم لعميل آخر' }, { status: 409 })
      }
      next.phone = newPhone
      updates.phone = newPhone
    }
    if (typeof body.email === 'string') {
      next.email = body.email.trim()
      updates.email = next.email
    }
    if (typeof body.notes === 'string') {
      next.notes = body.notes.trim()
      updates.notes = next.notes
    }
    if (body.wallet !== undefined && body.wallet !== null && body.wallet !== '') {
      const w = Number(body.wallet)
      if (!Number.isFinite(w)) {
        return NextResponse.json({ error: 'قيمة المحفظة غير صحيحة' }, { status: 400 })
      }
      next.wallet = w
      updates.wallet = w
    }
    next.updatedAt = new Date().toISOString()
    updates.updatedAt = next.updatedAt

    const { error } = await supabase
      .from('customers')
      .update(updates)
      .eq('id', params.id)

    if (error) {
      console.error('Supabase update error:', error)
      return NextResponse.json({ error: 'تعذر تحديث بيانات العميل', details: error.message }, { status: 500 })
    }

    return NextResponse.json({ customer: next })
  } catch (err) {
    console.error('CRM customer update error:', err)
    return NextResponse.json({ error: 'تعذر تحديث بيانات العميل' }, { status: 500 })
  }
}

// Delete a customer (admin only). Refuses if the customer has any orders or
// adahi orders so the user can review/move them before deletion.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { searchParams } = new URL(req.url)
    const role = searchParams.get('role') || 'cs'
    if (role !== 'admin') {
      return NextResponse.json({ error: 'مسموح للإدارة فقط' }, { status: 403 })
    }

    const customerId = params.id

    // Block delete if the customer has orders to avoid losing history.
    const { count: ordersCount, error: ordersErr } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('customerId', customerId)
    if (ordersErr) {
      console.error('Order count error:', ordersErr)
      return NextResponse.json({ error: 'تعذر التحقق من الطلبات' }, { status: 500 })
    }
    const { count: adahiCount, error: adahiErr } = await supabase
      .from('adahi_orders')
      .select('id', { count: 'exact', head: true })
      .eq('customerId', customerId)
    if (adahiErr) {
      console.error('Adahi count error:', adahiErr)
    }

    if ((ordersCount || 0) > 0 || (adahiCount || 0) > 0) {
      return NextResponse.json(
        {
          error: 'لا يمكن حذف العميل لوجود طلبات مرتبطة',
          ordersCount: ordersCount || 0,
          adahiCount: adahiCount || 0,
        },
        { status: 409 }
      )
    }

    // Clean up addresses first (no FK back to customer assumed).
    await supabase.from('customer_addresses').delete().eq('customerId', customerId)
    const { error: delErr } = await supabase.from('customers').delete().eq('id', customerId)
    if (delErr) {
      console.error('Customer delete error:', delErr)
      return NextResponse.json({ error: 'تعذر حذف العميل', details: delErr.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('CRM customer delete error:', err)
    return NextResponse.json({ error: 'تعذر حذف العميل' }, { status: 500 })
  }
}
}
