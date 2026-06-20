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
        }
      })
      .sort((a, b) => (b.lastOrderDate || '').localeCompare(a.lastOrderDate || ''))

    return NextResponse.json(result)
  } catch (err) {
    console.error('CRM customers list error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
