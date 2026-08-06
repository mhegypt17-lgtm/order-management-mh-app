import 'server-only'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import {
  cairoYesterdayString,
  sameWeekdayLastWeek,
  pctChange,
  formatCurrency,
  formatNumber,
} from './format'

/**
 * Arabic status labels used by the orders table.
 * تم = delivered, لاغي = cancelled, مؤجل = postponed, حجز = scheduled/reservation.
 * Any other status is bucketed as "other" (usually means in-progress or new).
 */
export const ORDER_STATUS = {
  DELIVERED: 'تم',
  CANCELLED: 'لاغي',
  POSTPONED: 'مؤجل',
  SCHEDULED: 'حجز',
} as const

export interface NewCustomerDetail {
  customerId: string
  customerName: string
  createdAt: string
  /** orders.customerSource of the customer's first-ever order, if any. */
  source: string
  /** orderTotal/netTotal of the customer's first-ever order, or null if they have none yet. */
  firstOrderRevenue: number | null
}

export interface DailyReportData {
  /** Cairo YYYY-MM-DD the report covers (yesterday). */
  reportDate: string
  /** Same-weekday-last-week YYYY-MM-DD used for the delta. */
  comparisonDate: string

  revenue: {
    /** Total value of ALL orders placed (any status) — gross bookings. */
    totalSales: number
    /** Net amount actually collected from customers on DELIVERED orders
     *  (orderTotal minus discount/wallet, i.e. `netTotal`). */
    revenueCollected: number
    ordersCount: number
    salesPctChange: ReturnType<typeof pctChange>
    revenueCollectedPctChange: ReturnType<typeof pctChange>
    ordersPctChange: ReturnType<typeof pctChange>
  }

  orders: {
    total: number
    delivered: number
    cancelled: number
    postponed: number
    scheduled: number
    other: number
  }

  customers: {
    newCustomers: number
    /** Admin-only detail: each new customer this period, their acquisition
     *  source (from their first order), and first-order revenue. */
    newCustomersDetail: NewCustomerDetail[]
  }

  topProducts: Array<{
    productName: string
    quantity: number
    revenue: number
  }>

  /**
   * Revenue split by نوع الطلب (order type: B2B / Online / Instashop / App / …).
   * Only delivered orders contribute to `revenue`; `count` includes all statuses.
   */
  revenueByOrderType: Array<{
    orderType: string
    count: number
    delivered: number
    revenue: number
    sharePct: number
  }>

  redFlags: {
    openComplaintsOver24h: number
    ordersPastScheduledDate: number
    outOfStockProducts: number
    productsWithMissingPrices: number
  }
}

/**
 * Given rows of newly-created customers (id/customerName/createdAt), looks
 * up each one's *first-ever* order to surface acquisition source
 * (`orders.customerSource`) and first-order revenue. A single batched
 * `.in('customerId', ids)` query keeps this to one extra round-trip no
 * matter how many new customers there are (egress-friendly).
 */
export async function attachFirstOrderDetails(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  customerRows: Array<{ id: string; customerName?: string | null; createdAt: string }>,
): Promise<NewCustomerDetail[]> {
  if (customerRows.length === 0) return []
  const ids = customerRows.map((c) => c.id)
  const { data: firstOrders, error } = await supabase
    .from('orders')
    .select('"customerId","customerSource","orderTotal","netTotal","createdAt"')
    .in('customerId', ids)
    .order('createdAt', { ascending: true })
  if (error) throw new Error(`Supabase query failed: ${error.message}`)

  // Rows are ascending by createdAt, so the first hit per customerId is
  // their earliest order.
  const firstByCustomer = new Map<string, { source: string; revenue: number }>()
  for (const o of firstOrders ?? []) {
    const cid = (o as { customerId?: string }).customerId
    if (!cid || firstByCustomer.has(cid)) continue
    firstByCustomer.set(cid, {
      source: (o as { customerSource?: string }).customerSource || 'غير محدد',
      revenue: Number(
        (o as { netTotal?: number }).netTotal ?? (o as { orderTotal?: number }).orderTotal ?? 0,
      ),
    })
  }

  return customerRows
    .map((c) => {
      const first = firstByCustomer.get(c.id)
      return {
        customerId: c.id,
        customerName: c.customerName || '(بدون اسم)',
        createdAt: c.createdAt,
        source: first?.source ?? 'لا يوجد طلب بعد',
        firstOrderRevenue: first ? first.revenue : null,
      }
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/**
 * Runs the daily-report queries against Supabase and returns a shaped
 * result. This is the single source of truth for daily KPI values —
 * both the cron/email path and the /admin/reports/preview page call it.
 */
export async function getDailyReportData(
  now: Date = new Date(),
): Promise<DailyReportData> {
  const reportDate = cairoYesterdayString(now)
  const comparisonDate = sameWeekdayLastWeek(reportDate)
  const supabase = getSupabaseAdmin()

  // Pull yesterday's orders (with items) and last-week's orders in parallel.
  // We fetch items via nested select so a single request covers both revenue
  // and the top-products aggregation.
  const [
    { data: reportOrders, error: reportOrdersErr },
    { data: comparisonOrders, error: comparisonOrdersErr },
    { data: newCustomerRows, error: newCustomersErr },
    { count: openComplaintsCount, error: complaintsErr },
    { data: overdueOrders, error: overdueErr },
    { count: outOfStockCount, error: stockErr },
    { count: missingPricesCount, error: missingPriceErr },
  ] = await Promise.all([
    supabase
      .from('orders')
      .select('id,"orderStatus","orderTotal","netTotal","orderDate","orderType"')
      .eq('orderDate', reportDate),

    supabase
      .from('orders')
      .select('id,"orderStatus","orderTotal","netTotal","orderDate"')
      .eq('orderDate', comparisonDate),

    supabase
      .from('customers')
      .select('id,"customerName","createdAt"')
      .gte('createdAt', `${reportDate}T00:00:00+02:00`)
      .lte('createdAt', `${reportDate}T23:59:59+03:00`),

    supabase
      .from('complaints')
      .select('id', { count: 'exact', head: true })
      .neq('status', 'closed')
      .lt('openedAt', new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()),

    supabase
      .from('orders')
      .select('id,"scheduledDate","orderStatus"')
      .not('scheduledDate', 'is', null)
      .lt('scheduledDate', reportDate)
      .neq('orderStatus', ORDER_STATUS.DELIVERED)
      .neq('orderStatus', ORDER_STATUS.CANCELLED),

    supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('isActive', true)
      .eq('stockStatus', 'out'),

    supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('isActive', true)
      .or('basePrice.is.null,basePrice.eq.0'),
  ])

  const errors = [
    reportOrdersErr,
    comparisonOrdersErr,
    newCustomersErr,
    complaintsErr,
    overdueErr,
    stockErr,
    missingPriceErr,
  ].filter(Boolean)
  if (errors.length > 0) {
    const first = errors[0]!
    throw new Error(`Supabase query failed: ${first.message}`)
  }

  // ─── Revenue ────────────────────────────────────────────────
  // "Sales" = gross value of ALL orders placed yesterday, any status.
  // "Revenue collected" = net amount actually collected (netTotal, falls
  // back to orderTotal) — DELIVERED orders only.
  const yesterdaySalesPlaced = (reportOrders ?? []).reduce(
    (sum, o) => sum + Number(o.orderTotal ?? 0),
    0,
  )
  const yesterdayRevenueCollected = (reportOrders ?? [])
    .filter((o) => o.orderStatus === ORDER_STATUS.DELIVERED)
    .reduce(
      (sum, o) => sum + Number((o as { netTotal?: number }).netTotal ?? o.orderTotal ?? 0),
      0,
    )
  const yesterdayOrders = (reportOrders ?? []).length

  const lastWeekSalesPlaced = (comparisonOrders ?? []).reduce(
    (sum, o) => sum + Number(o.orderTotal ?? 0),
    0,
  )
  const lastWeekRevenueCollected = (comparisonOrders ?? [])
    .filter((o) => o.orderStatus === ORDER_STATUS.DELIVERED)
    .reduce(
      (sum, o) => sum + Number((o as { netTotal?: number }).netTotal ?? o.orderTotal ?? 0),
      0,
    )
  const lastWeekOrders = (comparisonOrders ?? []).length

  // ─── Order status breakdown ─────────────────────────────────
  const statuses = { total: yesterdayOrders, delivered: 0, cancelled: 0, postponed: 0, scheduled: 0, other: 0 }
  for (const o of reportOrders ?? []) {
    switch (o.orderStatus) {
      case ORDER_STATUS.DELIVERED:
        statuses.delivered += 1
        break
      case ORDER_STATUS.CANCELLED:
        statuses.cancelled += 1
        break
      case ORDER_STATUS.POSTPONED:
        statuses.postponed += 1
        break
      case ORDER_STATUS.SCHEDULED:
        statuses.scheduled += 1
        break
      default:
        statuses.other += 1
    }
  }

  // ─── Top 5 products by revenue ──────────────────────────────
  // No FK is declared on order_items.orderId, so PostgREST cannot embed
  // the child rows via a nested select. Fetch them in a second query.
  const deliveredOrderIds = (reportOrders ?? [])
    .filter((o) => o.orderStatus === ORDER_STATUS.DELIVERED)
    .map((o) => String(o.id))

  const productAgg = new Map<string, { quantity: number; revenue: number }>()
  if (deliveredOrderIds.length > 0) {
    const { data: itemRows, error: itemsErr } = await supabase
      .from('order_items')
      .select('"orderId","productId",quantity,"lineTotal"')
      .in('orderId', deliveredOrderIds)
    if (itemsErr) {
      throw new Error(`Supabase query failed: ${itemsErr.message}`)
    }
    for (const item of itemRows ?? []) {
      const pid = (item as { productId?: string }).productId
      if (!pid) continue
      const existing = productAgg.get(pid) ?? { quantity: 0, revenue: 0 }
      existing.quantity += Number((item as { quantity?: number }).quantity ?? 0)
      existing.revenue += Number((item as { lineTotal?: number }).lineTotal ?? 0)
      productAgg.set(pid, existing)
    }
  }

  // Look up product names for the top rows
  const topIds = [...productAgg.entries()]
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 5)
    .map(([id]) => id)

  let productNames = new Map<string, string>()
  if (topIds.length > 0) {
    const { data: prodRows } = await supabase
      .from('products')
      .select('id,"productName"')
      .in('id', topIds)
    productNames = new Map(
      (prodRows ?? []).map((p) => [String(p.id), String(p.productName)]),
    )
  }

  const topProducts = [...productAgg.entries()]
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 5)
    .map(([id, stats]) => ({
      productName: productNames.get(id) ?? `(${id})`,
      quantity: stats.quantity,
      revenue: stats.revenue,
    }))

  // ─── Revenue by order type (نوع الطلب) ──────────────────────
  // Delivered orders contribute to revenue; all statuses contribute to count.
  const typeAgg = new Map<string, { count: number; delivered: number; revenue: number }>()
  for (const o of reportOrders ?? []) {
    const key = ((o as { orderType?: string }).orderType || '').trim() || 'غير محدد'
    const entry = typeAgg.get(key) ?? { count: 0, delivered: 0, revenue: 0 }
    entry.count += 1
    if (o.orderStatus === ORDER_STATUS.DELIVERED) {
      entry.delivered += 1
      entry.revenue += Number((o as { netTotal?: number }).netTotal ?? o.orderTotal ?? 0)
    }
    typeAgg.set(key, entry)
  }
  const totalTypeRevenue = [...typeAgg.values()].reduce((s, v) => s + v.revenue, 0)
  const revenueByOrderType = [...typeAgg.entries()]
    .map(([orderType, v]) => ({
      orderType,
      count: v.count,
      delivered: v.delivered,
      revenue: v.revenue,
      sharePct: totalTypeRevenue > 0 ? Math.round((v.revenue / totalTypeRevenue) * 100) : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue)

  const newCustomersDetail = await attachFirstOrderDetails(supabase, newCustomerRows ?? [])

  return {
    reportDate,
    comparisonDate,
    revenue: {
      totalSales: yesterdaySalesPlaced,
      revenueCollected: yesterdayRevenueCollected,
      ordersCount: yesterdayOrders,
      salesPctChange: pctChange(yesterdaySalesPlaced, lastWeekSalesPlaced),
      revenueCollectedPctChange: pctChange(yesterdayRevenueCollected, lastWeekRevenueCollected),
      ordersPctChange: pctChange(yesterdayOrders, lastWeekOrders),
    },
    orders: statuses,
    customers: {
      newCustomers: (newCustomerRows ?? []).length,
      newCustomersDetail,
    },
    topProducts,
    revenueByOrderType,
    redFlags: {
      openComplaintsOver24h: openComplaintsCount ?? 0,
      ordersPastScheduledDate: (overdueOrders ?? []).length,
      outOfStockProducts: outOfStockCount ?? 0,
      productsWithMissingPrices: missingPricesCount ?? 0,
    },
  }
}

/** Convenience formatter used by both email + preview page. */
export function formatDailyReportSummary(d: DailyReportData): string {
  return [
    `Sales: ${formatCurrency(d.revenue.totalSales)} (${d.revenue.salesPctChange.text})`,
    `Collected: ${formatCurrency(d.revenue.revenueCollected)} (${d.revenue.revenueCollectedPctChange.text})`,
    `Orders: ${formatNumber(d.orders.total)} (${d.revenue.ordersPctChange.text})`,
    `New customers: ${d.customers.newCustomers}`,
  ].join(' · ')
}
