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

    // Aggregate insights accumulated while building each customer's summary
    // below — reuses the SAME `customers`/`orders`/`addresses` arrays already
    // fetched above (no extra Supabase reads). Computed over the FULL
    // customer base (before the `search` text filter) so the numbers don't
    // shift as the admin types in the search box; the `segment` (B2B/retail)
    // toggle is still applied client-side in CRMView the same way it always
    // was, so these totals intentionally reflect "all customers" as the
    // baseline picture.
    let customersWithOrders = 0
    let totalOrdersAll = 0
    let totalCompletedOrdersAll = 0
    let totalRevenueAll = 0
    let b2bCount = 0
    const tierCounts: Record<string, number> = {}
    const sourceCounts: Record<string, number> = {}
    const zoneCounts: Record<string, number> = {}

    const allSummaries = customers.map((c) => {
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
      // B2B if EITHER the manual admin-set flag is on, OR any order was
      // placed with orderType === 'B2B' — manual flag covers brand-new
      // corporate accounts that don't have order history yet.
      const isB2B = Boolean((c as any).isB2B) || custOrders.some((o) => o.orderType === 'B2B')

      // Acquisition source = the customerSource recorded on the customer's
      // very FIRST order (already present on every order row — no join/read
      // needed). Falls back to "غير محدد" for customers with zero orders.
      const firstOrder = custOrders.length
        ? custOrders.reduce((earliest, o) =>
            new Date(o.createdAt).getTime() < new Date(earliest.createdAt).getTime() ? o : earliest
          )
        : null
      const acquisitionSource = firstOrder?.customerSource || 'غير محدد'

      // Zone(s) = distinct delivery areas across the customer's saved
      // addresses (already loaded via `addresses` above — no extra read).
      // A customer with addresses in two areas counts toward both zones,
      // same convention as loyalty tiers only ever counting once per customer.
      const zones = Array.from(
        new Set(custAddresses.map((a) => (a.area || '').trim()).filter(Boolean))
      )

      // Accumulate aggregate counters (side effect, single pass).
      if (custOrders.length > 0) customersWithOrders += 1
      totalOrdersAll += custOrders.length
      totalCompletedOrdersAll += completedOrders.length
      totalRevenueAll += totalRevenue
      if (isB2B) b2bCount += 1
      tierCounts[tier] = (tierCounts[tier] || 0) + 1
      sourceCounts[acquisitionSource] = (sourceCounts[acquisitionSource] || 0) + 1
      for (const z of zones) zoneCounts[z] = (zoneCounts[z] || 0) + 1

      return {
        id: c.id,
        customerName: c.customerName,
        phone: c.phone,
        wallet: typeof c.wallet === 'number' ? c.wallet : 0,
        createdAt: c.createdAt,
        addressCount: custAddresses.length,
        acquisitionSource,
        zones,
        totalOrders: custOrders.length,
        completedOrders: completedOrders.length,
        totalRevenue,
        lastOrderDate: lastOrder?.orderDate || null,
        daysSinceLastOrder,
        tier,
        isB2B,
      }
    })

    const result = allSummaries
      .filter((c) => {
        if (!search) return true
        const q = search.toLowerCase()
        return (
          c.customerName.toLowerCase().includes(q) ||
          c.phone.includes(q)
        )
      })
      .filter((c) => {
        if (segment === 'b2b') return c.isB2B
        if (segment === 'retail') return !c.isB2B
        return true
      })
      .sort((a, b) => (b.lastOrderDate || '').localeCompare(a.lastOrderDate || ''))

    const stats = {
      totalCustomers: customers.length,
      customersWithOrders,
      avgOrdersPerCustomer: customers.length ? Number((totalOrdersAll / customers.length).toFixed(1)) : 0,
      avgOrdersPerActiveCustomer: customersWithOrders
        ? Number((totalOrdersAll / customersWithOrders).toFixed(1))
        : 0,
      avgOrderValue: totalCompletedOrdersAll ? Math.round(totalRevenueAll / totalCompletedOrdersAll) : 0,
      totalRevenue: totalRevenueAll,
      b2bCount,
      retailCount: customers.length - b2bCount,
      byTier: tierCounts,
      bySource: sourceCounts,
      byZone: zoneCounts,
    }

    return NextResponse.json({ customers: result, stats })
  } catch (err) {
    console.error('CRM customers list error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
