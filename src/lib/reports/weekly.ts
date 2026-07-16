import 'server-only'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import {
  REPORT_TIMEZONE,
  cairoYesterdayString,
  pctChange,
  formatCurrency,
  formatNumber,
} from './format'
import { ORDER_STATUS } from './daily'

/**
 * Weekly ops digest — covers the 7 days ending "yesterday" (Cairo).
 * When fired by the Sunday cron at 06:00 UTC, it therefore covers
 * Sunday → Saturday of the prior week — a natural "week just ended"
 * for Sunday-morning planning.
 */

export interface WeeklyReportData {
  /** Cairo YYYY-MM-DD, first day of the covered window (inclusive). */
  weekStart: string
  /** Cairo YYYY-MM-DD, last day of the covered window (inclusive). */
  weekEnd: string
  /** Same 7-day window one week earlier — used for WoW % deltas. */
  prevWeekStart: string
  prevWeekEnd: string

  revenue: {
    totalSales: number
    ordersCount: number
    deliveredCount: number
    avgOrderValue: number
    salesPctChange: ReturnType<typeof pctChange>
    ordersPctChange: ReturnType<typeof pctChange>
    aovPctChange: ReturnType<typeof pctChange>
  }

  orders: {
    total: number
    delivered: number
    cancelled: number
    postponed: number
    scheduled: number
    other: number
    cancellationRatePct: number
    prevCancellationRatePct: number
  }

  /** Day-by-day series for the covered week. Length = 7. */
  daily: Array<{
    date: string // YYYY-MM-DD
    orders: number
    delivered: number
    revenue: number
  }>

  revenueByOrderType: Array<{
    orderType: string
    orders: number
    delivered: number
    revenue: number
    sharePct: number
    revenuePctChange: ReturnType<typeof pctChange>
  }>

  topProducts: Array<{
    productName: string
    quantity: number
    revenue: number
    prevRank: number | null // rank last week, or null if not in top last week
    rankDelta: 'up' | 'down' | 'flat' | 'new'
  }>

  customers: {
    newCustomers: number
    newCustomersPctChange: ReturnType<typeof pctChange>
    /** Suspended = customers in warning/suspended status right now (not week-scoped). */
    warningCount: number
    suspendedCount: number
    /** Top 5 buyers this week by revenue. */
    topBuyers: Array<{ customerName: string; ordersCount: number; revenue: number }>
  }

  complaints: {
    opened: number
    closed: number
    openedPctChange: ReturnType<typeof pctChange>
    /** Currently open across the whole system, regardless of open date. */
    stillOpen: number
    topReasons: Array<{ reason: string; count: number }>
    compensationPaid: number
  }

  staff: Array<{
    receiver: string
    orders: number
    delivered: number
    cancelled: number
    revenue: number
    completionRatePct: number
  }>

  inventory: {
    outOfStock: number
    /** Products active but sold zero units this week (up to 10 names). */
    zeroSalesProducts: string[]
    zeroSalesTotal: number
    missingPrices: number
  }

  redFlags: {
    overdueScheduledOrders: number
    openComplaintsOver3Days: number
    outOfStockProducts: number
    productsWithMissingPrices: number
  }
}

// ─── Helpers ────────────────────────────────────────────────────

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

function daysBetween(a: string, b: string): string[] {
  const out: string[] = []
  let cur = a
  while (cur <= b) {
    out.push(cur)
    cur = addDays(cur, 1)
  }
  return out
}

// ─── Main aggregator ────────────────────────────────────────────

export async function getWeeklyReportData(
  now: Date = new Date(),
): Promise<WeeklyReportData> {
  // The last day of the report window = yesterday Cairo. Window is
  // the 7 days ending on and including that date.
  const weekEnd = cairoYesterdayString(now)
  const weekStart = addDays(weekEnd, -6)
  const prevWeekEnd = addDays(weekStart, -1)
  const prevWeekStart = addDays(prevWeekEnd, -6)

  const supabase = getSupabaseAdmin()

  // Fetch this-week + previous-week orders in parallel; also the
  // small aux queries (customer status counts, complaints breakdown,
  // stock/price counts).
  const [
    { data: thisWeekOrders, error: thisWeekErr },
    { data: prevWeekOrders, error: prevWeekErr },
    { count: newCustomersThis, error: newCustThisErr },
    { count: newCustomersPrev, error: newCustPrevErr },
    { count: warningCount, error: warningErr },
    { count: suspendedCount, error: suspendedErr },
    { data: openedThisWeekComplaints, error: openedComplaintsErr },
    { count: openedPrevWeekCount, error: openedPrevErr },
    { count: closedThisWeekCount, error: closedComplaintsErr },
    { data: stillOpenComplaints, error: stillOpenErr },
    { data: overdueOrders, error: overdueErr },
    { count: outOfStockCount, error: stockErr },
    { count: missingPricesCount, error: missingPriceErr },
    { data: allActiveProducts, error: activeProdErr },
  ] = await Promise.all([
    supabase
      .from('orders')
      .select('id,"orderStatus","orderTotal","orderDate","orderType","orderReceiver","customerId"')
      .gte('orderDate', weekStart)
      .lte('orderDate', weekEnd),

    supabase
      .from('orders')
      .select('id,"orderStatus","orderTotal","orderDate","orderType"')
      .gte('orderDate', prevWeekStart)
      .lte('orderDate', prevWeekEnd),

    supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .gte('createdAt', `${weekStart}T00:00:00+02:00`)
      .lte('createdAt', `${weekEnd}T23:59:59+02:00`),

    supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .gte('createdAt', `${prevWeekStart}T00:00:00+02:00`)
      .lte('createdAt', `${prevWeekEnd}T23:59:59+02:00`),

    supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'warning'),

    supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'suspended'),

    supabase
      .from('complaints')
      .select('id,reason,"compensationAmount"')
      .gte('openedAt', `${weekStart}T00:00:00+02:00`)
      .lte('openedAt', `${weekEnd}T23:59:59+02:00`),

    supabase
      .from('complaints')
      .select('id', { count: 'exact', head: true })
      .gte('openedAt', `${prevWeekStart}T00:00:00+02:00`)
      .lte('openedAt', `${prevWeekEnd}T23:59:59+02:00`),

    supabase
      .from('complaints')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'closed')
      .gte('closedAt', `${weekStart}T00:00:00+02:00`)
      .lte('closedAt', `${weekEnd}T23:59:59+02:00`),

    supabase
      .from('complaints')
      .select('id')
      .neq('status', 'closed')
      .lt('openedAt', new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString()),

    supabase
      .from('orders')
      .select('id,"scheduledDate","orderStatus"')
      .not('scheduledDate', 'is', null)
      .lt('scheduledDate', weekEnd)
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

    supabase
      .from('products')
      .select('id,"productName"')
      .eq('isActive', true),
  ])

  const errs = [
    thisWeekErr,
    prevWeekErr,
    newCustThisErr,
    newCustPrevErr,
    warningErr,
    suspendedErr,
    openedComplaintsErr,
    openedPrevErr,
    closedComplaintsErr,
    stillOpenErr,
    overdueErr,
    stockErr,
    missingPriceErr,
    activeProdErr,
  ].filter(Boolean)
  if (errs.length > 0) {
    throw new Error(`Supabase query failed: ${errs[0]!.message}`)
  }

  // ─── Revenue + orders ─────────────────────────────────────
  const totalRevenue = (thisWeekOrders ?? [])
    .filter((o) => o.orderStatus === ORDER_STATUS.DELIVERED)
    .reduce((s, o) => s + Number(o.orderTotal ?? 0), 0)
  const totalOrders = (thisWeekOrders ?? []).length
  const deliveredCount = (thisWeekOrders ?? []).filter(
    (o) => o.orderStatus === ORDER_STATUS.DELIVERED,
  ).length
  const avgOrderValue = deliveredCount > 0 ? totalRevenue / deliveredCount : 0

  const prevRevenue = (prevWeekOrders ?? [])
    .filter((o) => o.orderStatus === ORDER_STATUS.DELIVERED)
    .reduce((s, o) => s + Number(o.orderTotal ?? 0), 0)
  const prevOrders = (prevWeekOrders ?? []).length
  const prevDelivered = (prevWeekOrders ?? []).filter(
    (o) => o.orderStatus === ORDER_STATUS.DELIVERED,
  ).length
  const prevAov = prevDelivered > 0 ? prevRevenue / prevDelivered : 0

  const statuses = {
    total: totalOrders,
    delivered: 0,
    cancelled: 0,
    postponed: 0,
    scheduled: 0,
    other: 0,
    cancellationRatePct: 0,
    prevCancellationRatePct: 0,
  }
  for (const o of thisWeekOrders ?? []) {
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
  statuses.cancellationRatePct =
    totalOrders > 0 ? Math.round((statuses.cancelled / totalOrders) * 100) : 0
  const prevCancelled = (prevWeekOrders ?? []).filter(
    (o) => o.orderStatus === ORDER_STATUS.CANCELLED,
  ).length
  statuses.prevCancellationRatePct =
    prevOrders > 0 ? Math.round((prevCancelled / prevOrders) * 100) : 0

  // ─── Day-by-day trend ─────────────────────────────────────
  const dayMap = new Map<string, { orders: number; delivered: number; revenue: number }>()
  for (const d of daysBetween(weekStart, weekEnd)) {
    dayMap.set(d, { orders: 0, delivered: 0, revenue: 0 })
  }
  for (const o of thisWeekOrders ?? []) {
    const key = String(o.orderDate)
    const entry = dayMap.get(key)
    if (!entry) continue
    entry.orders += 1
    if (o.orderStatus === ORDER_STATUS.DELIVERED) {
      entry.delivered += 1
      entry.revenue += Number(o.orderTotal ?? 0)
    }
  }
  const daily = [...dayMap.entries()].map(([date, v]) => ({ date, ...v }))

  // ─── Revenue by order type + WoW ───────────────────────────
  const typeAgg = new Map<string, { orders: number; delivered: number; revenue: number }>()
  for (const o of thisWeekOrders ?? []) {
    const key = ((o as { orderType?: string }).orderType || '').trim() || 'غير محدد'
    const entry = typeAgg.get(key) ?? { orders: 0, delivered: 0, revenue: 0 }
    entry.orders += 1
    if (o.orderStatus === ORDER_STATUS.DELIVERED) {
      entry.delivered += 1
      entry.revenue += Number(o.orderTotal ?? 0)
    }
    typeAgg.set(key, entry)
  }
  const prevTypeRevenue = new Map<string, number>()
  for (const o of prevWeekOrders ?? []) {
    if (o.orderStatus !== ORDER_STATUS.DELIVERED) continue
    const key = ((o as { orderType?: string }).orderType || '').trim() || 'غير محدد'
    prevTypeRevenue.set(key, (prevTypeRevenue.get(key) ?? 0) + Number(o.orderTotal ?? 0))
  }
  const totalTypeRev = [...typeAgg.values()].reduce((s, v) => s + v.revenue, 0)
  const revenueByOrderType = [...typeAgg.entries()]
    .map(([orderType, v]) => ({
      orderType,
      orders: v.orders,
      delivered: v.delivered,
      revenue: v.revenue,
      sharePct: totalTypeRev > 0 ? Math.round((v.revenue / totalTypeRev) * 100) : 0,
      revenuePctChange: pctChange(v.revenue, prevTypeRevenue.get(orderType) ?? 0),
    }))
    .sort((a, b) => b.revenue - a.revenue)

  // ─── Top products (this week vs last week rank) ────────────
  const deliveredIdsThis = (thisWeekOrders ?? [])
    .filter((o) => o.orderStatus === ORDER_STATUS.DELIVERED)
    .map((o) => String(o.id))
  const deliveredIdsPrev = (prevWeekOrders ?? [])
    .filter((o) => o.orderStatus === ORDER_STATUS.DELIVERED)
    .map((o) => String(o.id))

  async function loadItemAgg(orderIds: string[]) {
    if (orderIds.length === 0) return new Map<string, { qty: number; rev: number }>()
    const { data } = await supabase
      .from('order_items')
      .select('"orderId","productId",quantity,"lineTotal"')
      .in('orderId', orderIds)
    const m = new Map<string, { qty: number; rev: number }>()
    for (const it of data ?? []) {
      const pid = (it as { productId?: string }).productId
      if (!pid) continue
      const existing = m.get(pid) ?? { qty: 0, rev: 0 }
      existing.qty += Number((it as { quantity?: number }).quantity ?? 0)
      existing.rev += Number((it as { lineTotal?: number }).lineTotal ?? 0)
      m.set(pid, existing)
    }
    return m
  }

  const [thisAgg, prevAgg] = await Promise.all([
    loadItemAgg(deliveredIdsThis),
    loadItemAgg(deliveredIdsPrev),
  ])

  const rankThis = [...thisAgg.entries()]
    .sort((a, b) => b[1].rev - a[1].rev)
    .slice(0, 10)
  const rankPrev = [...prevAgg.entries()].sort((a, b) => b[1].rev - a[1].rev)
  const prevRankMap = new Map<string, number>()
  rankPrev.forEach(([pid], i) => prevRankMap.set(pid, i + 1))

  const topProductIds = rankThis.map(([id]) => id)
  const productNamesMap = new Map<string, string>()
  if (topProductIds.length > 0) {
    const { data: prods } = await supabase
      .from('products')
      .select('id,"productName"')
      .in('id', topProductIds)
    for (const p of prods ?? []) {
      productNamesMap.set(String(p.id), String((p as { productName?: string }).productName))
    }
  }
  const topProducts = rankThis.map(([id, v], i) => {
    const prevRank = prevRankMap.get(id) ?? null
    let rankDelta: 'up' | 'down' | 'flat' | 'new' = 'new'
    if (prevRank === null) rankDelta = 'new'
    else if (prevRank > i + 1) rankDelta = 'up'
    else if (prevRank < i + 1) rankDelta = 'down'
    else rankDelta = 'flat'
    return {
      productName: productNamesMap.get(id) ?? `(${id})`,
      quantity: v.qty,
      revenue: v.rev,
      prevRank,
      rankDelta,
    }
  })

  // ─── Top buyers this week ──────────────────────────────────
  const buyerAgg = new Map<string, { orders: number; revenue: number }>()
  for (const o of thisWeekOrders ?? []) {
    if (o.orderStatus !== ORDER_STATUS.DELIVERED) continue
    const cid = (o as { customerId?: string }).customerId
    if (!cid) continue
    const e = buyerAgg.get(cid) ?? { orders: 0, revenue: 0 }
    e.orders += 1
    e.revenue += Number(o.orderTotal ?? 0)
    buyerAgg.set(cid, e)
  }
  const topBuyerIds = [...buyerAgg.entries()]
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 5)
    .map(([id]) => id)
  const buyerNameMap = new Map<string, string>()
  if (topBuyerIds.length > 0) {
    const { data: custs } = await supabase
      .from('customers')
      .select('id,"customerName"')
      .in('id', topBuyerIds)
    for (const c of custs ?? []) {
      buyerNameMap.set(String(c.id), String((c as { customerName?: string }).customerName || 'مجهول'))
    }
  }
  const topBuyers = topBuyerIds.map((id) => ({
    customerName: buyerNameMap.get(id) ?? '(?)',
    ordersCount: buyerAgg.get(id)!.orders,
    revenue: buyerAgg.get(id)!.revenue,
  }))

  // ─── Complaints breakdown ─────────────────────────────────
  const openedRows = openedThisWeekComplaints ?? []
  const reasonMap = new Map<string, number>()
  let compensationPaid = 0
  for (const c of openedRows) {
    const reason = String((c as { reason?: string }).reason || 'غير محدد')
    reasonMap.set(reason, (reasonMap.get(reason) ?? 0) + 1)
    compensationPaid += Number((c as { compensationAmount?: number }).compensationAmount ?? 0)
  }
  const topReasons = [...reasonMap.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  // ─── Staff activity ───────────────────────────────────────
  const staffAgg = new Map<string, { orders: number; delivered: number; cancelled: number; revenue: number }>()
  for (const o of thisWeekOrders ?? []) {
    const rec = (o as { orderReceiver?: string }).orderReceiver || 'غير محدد'
    const e = staffAgg.get(rec) ?? { orders: 0, delivered: 0, cancelled: 0, revenue: 0 }
    e.orders += 1
    if (o.orderStatus === ORDER_STATUS.DELIVERED) {
      e.delivered += 1
      e.revenue += Number(o.orderTotal ?? 0)
    }
    if (o.orderStatus === ORDER_STATUS.CANCELLED) {
      e.cancelled += 1
    }
    staffAgg.set(rec, e)
  }
  const staff = [...staffAgg.entries()]
    .map(([receiver, v]) => ({
      receiver,
      orders: v.orders,
      delivered: v.delivered,
      cancelled: v.cancelled,
      revenue: v.revenue,
      completionRatePct: v.orders > 0 ? Math.round((v.delivered / v.orders) * 100) : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue)

  // ─── Inventory: zero-sales active products ─────────────────
  const soldPidsThisWeek = new Set(thisAgg.keys())
  const zeroSalesActive = (allActiveProducts ?? [])
    .filter((p) => !soldPidsThisWeek.has(String(p.id)))
    .map((p) => String((p as { productName?: string }).productName || ''))
    .filter(Boolean)
  const zeroSalesTotal = zeroSalesActive.length
  const zeroSalesProducts = zeroSalesActive.slice(0, 10)

  return {
    weekStart,
    weekEnd,
    prevWeekStart,
    prevWeekEnd,
    revenue: {
      totalSales: totalRevenue,
      ordersCount: totalOrders,
      deliveredCount,
      avgOrderValue,
      salesPctChange: pctChange(totalRevenue, prevRevenue),
      ordersPctChange: pctChange(totalOrders, prevOrders),
      aovPctChange: pctChange(avgOrderValue, prevAov),
    },
    orders: statuses,
    daily,
    revenueByOrderType,
    topProducts,
    customers: {
      newCustomers: newCustomersThis ?? 0,
      newCustomersPctChange: pctChange(newCustomersThis ?? 0, newCustomersPrev ?? 0),
      warningCount: warningCount ?? 0,
      suspendedCount: suspendedCount ?? 0,
      topBuyers,
    },
    complaints: {
      opened: openedRows.length,
      closed: closedThisWeekCount ?? 0,
      openedPctChange: pctChange(openedRows.length, openedPrevWeekCount ?? 0),
      stillOpen: (stillOpenComplaints ?? []).length,
      topReasons,
      compensationPaid,
    },
    staff,
    inventory: {
      outOfStock: outOfStockCount ?? 0,
      zeroSalesProducts,
      zeroSalesTotal,
      missingPrices: missingPricesCount ?? 0,
    },
    redFlags: {
      overdueScheduledOrders: (overdueOrders ?? []).length,
      openComplaintsOver3Days: (stillOpenComplaints ?? []).length,
      outOfStockProducts: outOfStockCount ?? 0,
      productsWithMissingPrices: missingPricesCount ?? 0,
    },
  }
}

/** Short one-line summary for the email subject / log line. */
export function formatWeeklyReportSummary(d: WeeklyReportData): string {
  return `Sales ${formatCurrency(d.revenue.totalSales)} · ${formatNumber(d.revenue.deliveredCount)} delivered · ${formatNumber(d.customers.newCustomers)} new`
}

// Suppress unused-import warnings for constants exported for other modules.
void REPORT_TIMEZONE
