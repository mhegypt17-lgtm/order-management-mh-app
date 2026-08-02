import { NextRequest, NextResponse } from 'next/server'
import {
  readCustomers,
  readAddresses,
  readOrders,
  readOrderItems,
  readOrderSettings,
  resolveCustomerTier,
  DEFAULT_LOYALTY_CONFIG,
} from '@/lib/omsData'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search') || ''
    // 'all' (default) | 'b2b' | 'retail'. A customer is considered B2B if
    // ANY of their orders was placed with orderType === 'B2B' — derived live
    // from the orders table (no extra column/migration needed, always in
    // sync with reality, matches how order.orderType already drives which
    // product-price catalogue an order uses — see src/lib/catalogue.ts).
    const segment = (searchParams.get('segment') || 'all').toLowerCase()

    const customers = await readCustomers()
    const addresses = await readAddresses()
    const orders = await readOrders()
    // Tier formula must match the customer-profile endpoint so the sidebar
    // chip never disagrees with the profile header. Both use the loyalty
    // config and count any non-cancelled order toward the tier.
    const settings = await readOrderSettings()
    const loyalty = settings.loyalty || DEFAULT_LOYALTY_CONFIG

    const result = customers
      .filter((c) => {
        if (!search) return true
        const q = search.toLowerCase()
        return (
          c.customerName.toLowerCase().includes(q) ||
          c.phone.includes(q)
        )
      })
      .map((c) => {
        const custOrders = orders.filter((o) => o.customerId === c.id)
        const custAddresses = addresses.filter((a) => a.customerId === c.id)

        const completedOrders = custOrders.filter((o) => o.orderStatus === 'تم')
        const loyaltyOrders = custOrders.filter((o) => o.orderStatus !== 'لاغي')
        const totalRevenue = completedOrders.reduce((sum, o) => sum + (o.orderTotal || 0), 0)
        const loyaltyRevenue = loyaltyOrders.reduce((sum, o) => sum + (o.orderTotal || 0), 0)
        const lastOrder = custOrders
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]

        const daysSinceLastOrder = lastOrder
          ? Math.floor((Date.now() - new Date(lastOrder.createdAt).getTime()) / (1000 * 60 * 60 * 24))
          : null

        // Tier resolved via shared loyalty config (matches profile endpoint).
        const tierConfig = resolveCustomerTier(loyalty, {
          completedOrderCount: loyaltyOrders.length,
          totalRevenue: loyaltyRevenue,
        })
        const tier = tierConfig.name
        const isB2B = custOrders.some((o) => o.orderType === 'B2B')

        return {
          id: c.id,
          customerName: c.customerName,
          phone: c.phone,
          wallet: typeof c.wallet === 'number' ? c.wallet : 0,
          createdAt: c.createdAt,
          addressCount: custAddresses.length,
          totalOrders: custOrders.length,
          completedOrders: completedOrders.length,
          totalRevenue,
          lastOrderDate: lastOrder?.orderDate || null,
          daysSinceLastOrder,
          tier,
          isB2B,
        }
      })
      .filter((c) => {
        if (segment === 'b2b') return c.isB2B
        if (segment === 'retail') return !c.isB2B
        return true
      })
      .sort((a, b) => (b.lastOrderDate || '').localeCompare(a.lastOrderDate || ''))

    return NextResponse.json(result)
  } catch (err) {
    console.error('CRM customers list error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
