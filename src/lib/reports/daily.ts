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

export interface DailyReportData {
  /** Cairo YYYY-MM-DD the report covers (yesterday). */
  reportDate: string
  /** Same-weekday-last-week YYYY-MM-DD used for the delta. */
  comparisonDate: string

  revenue: {
    totalSales: number
    ordersCount: number
    salesPctChange: ReturnType<typeof pctChange>
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
  }

  topProducts: Array<{
    productName: string
    quantity: number
    revenue: number
  }>

  redFlags: {
    openComplaintsOver24h: number
    ordersPastScheduledDate: number
    outOfStockProducts: number
    productsWithMissingPrices: number
  }
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
    { count: newCustomersCount, error: newCustomersErr },
    { count: openComplaintsCount, error: complaintsErr },
    { data: overdueOrders, error: overdueErr },
    { count: outOfStockCount, error: stockErr },
    { count: missingPricesCount, error: missingPriceErr },
  ] = await Promise.all([
    supabase
      .from('orders')
      .select(
        'id,"orderStatus","orderTotal","orderDate", order_items:order_items(id,"productId",quantity,"lineTotal")',
      )
      .eq('orderDate', reportDate),

    supabase
      .from('orders')
      .select('id,"orderStatus","orderTotal","orderDate"')
      .eq('orderDate', comparisonDate),

    supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
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
  const yesterdayRevenue = (reportOrders ?? [])
    .filter((o) => o.orderStatus === ORDER_STATUS.DELIVERED)
    .reduce((sum, o) => sum + Number(o.orderTotal ?? 0), 0)
  const yesterdayOrders = (reportOrders ?? []).length

  const lastWeekRevenue = (comparisonOrders ?? [])
    .filter((o) => o.orderStatus === ORDER_STATUS.DELIVERED)
    .reduce((sum, o) => sum + Number(o.orderTotal ?? 0), 0)
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
  const productAgg = new Map<string, { quantity: number; revenue: number }>()
  for (const o of reportOrders ?? []) {
    if (o.orderStatus !== ORDER_STATUS.DELIVERED) continue
    const items = (o as { order_items?: Array<{ productId?: string; quantity?: number; lineTotal?: number }> }).order_items ?? []
    for (const item of items) {
      const pid = item.productId
      if (!pid) continue
      const existing = productAgg.get(pid) ?? { quantity: 0, revenue: 0 }
      existing.quantity += Number(item.quantity ?? 0)
      existing.revenue += Number(item.lineTotal ?? 0)
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

  return {
    reportDate,
    comparisonDate,
    revenue: {
      totalSales: yesterdayRevenue,
      ordersCount: yesterdayOrders,
      salesPctChange: pctChange(yesterdayRevenue, lastWeekRevenue),
      ordersPctChange: pctChange(yesterdayOrders, lastWeekOrders),
    },
    orders: statuses,
    customers: {
      newCustomers: newCustomersCount ?? 0,
    },
    topProducts,
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
    `Revenue: ${formatCurrency(d.revenue.totalSales)} (${d.revenue.salesPctChange.text})`,
    `Orders: ${formatNumber(d.orders.total)} (${d.revenue.ordersPctChange.text})`,
    `New customers: ${d.customers.newCustomers}`,
  ].join(' · ')
}
