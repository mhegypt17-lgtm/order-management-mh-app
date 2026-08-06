import 'server-only'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import {
  REPORT_TIMEZONE,
  cairoDateString,
  pctChange,
  formatCurrency,
  formatNumber,
} from './format'
import { ORDER_STATUS, attachFirstOrderDetails, type NewCustomerDetail } from './daily'

/**
 * Monthly ops report — covers the most recently *completed* calendar month
 * (Cairo time), e.g. if run any time in August it covers all of July.
 * This keeps the report stable no matter which day of the month it's
 * previewed or sent on, mirroring the weekly report's "week that just
 * ended" behavior.
 */

export interface MonthlyReportData {
  /** Cairo YYYY-MM-DD, first day of the covered month (inclusive). */
  monthStart: string
  /** Cairo YYYY-MM-DD, last day of the covered month (inclusive). */
  monthEnd: string
  /** The calendar month immediately before `monthStart` — used for MoM deltas. */
  prevMonthStart: string
  prevMonthEnd: string

  revenue: {
    /** Total value of ALL orders placed this month (any status) — gross bookings. */
    totalSales: number
    /** Net amount actually collected from customers on DELIVERED orders
     *  (orderTotal minus discount/wallet, i.e. `netTotal`). */
    revenueCollected: number
    ordersCount: number
    deliveredCount: number
    avgOrderValue: number
    salesPctChange: ReturnType<typeof pctChange>
    revenueCollectedPctChange: ReturnType<typeof pctChange>
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

  /** Week-by-week series within the covered month (7-day chunks from monthStart). */
  weeks: Array<{
    label: string
    weekStart: string
    weekEnd: string
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
    prevRank: number | null // rank last month, or null if not in top last month
    rankDelta: 'up' | 'down' | 'flat' | 'new'
  }>

  customers: {
    newCustomers: number
    newCustomersPctChange: ReturnType<typeof pctChange>
    /** Suspended = customers in warning/suspended status right now (not month-scoped). */
    warningCount: number
    suspendedCount: number
    /** Top 5 buyers this month by revenue. */
    topBuyers: Array<{ customerName: string; ordersCount: number; revenue: number }>
    /** Admin-only detail: each new customer this month, their acquisition
     *  source (from their first order), and first-order revenue. */
    newCustomersDetail: NewCustomerDetail[]
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
    /** Products active but sold zero units this month (up to 10 names). */
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

function lastDayOfMonth(year: number, month: number): string {
  // Day 0 of the *next* month = last day of `month`.
  const dt = new Date(Date.UTC(year, month, 0))
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/** Returns { monthStart, monthEnd } for the calendar month immediately
 *  before the Cairo "today" of `now`. */
function previousCalendarMonth(now: Date): { start: string; end: string } {
  const today = cairoDateString(now)
  const [ty, tm] = today.split('-').map(Number)
  let y = ty
  let m = tm - 1
  if (m === 0) {
    m = 12
    y -= 1
  }
  return { start: `${y}-${String(m).padStart(2, '0')}-01`, end: lastDayOfMonth(y, m) }
}

// ─── Main aggregator ────────────────────────────────────────────

export async function getMonthlyReportData(
  now: Date = new Date(),
): Promise<MonthlyReportData> {
  const { start: monthStart, end: monthEnd } = previousCalendarMonth(now)
  // "now" shifted back a month lands us in the same relative day of the
  // previous month, which previousCalendarMonth() then steps back once
  // more from — giving us the month before monthStart.
  const midMonthStart = new Date(`${monthStart}T12:00:00Z`)
  const { start: prevMonthStart, end: prevMonthEnd } = previousCalendarMonth(midMonthStart)

  const supabase = getSupabaseAdmin()

  const [
    { data: thisMonthOrders, error: thisMonthErr },
    { data: prevMonthOrders, error: prevMonthErr },
    { data: newCustomerRowsThis, error: newCustThisErr },
    { count: newCustomersPrev, error: newCustPrevErr },
    { count: warningCount, error: warningErr },
    { count: suspendedCount, error: suspendedErr },
    { data: openedThisMonthComplaints, error: openedComplaintsErr },
    { count: openedPrevMonthCount, error: openedPrevErr },
    { count: closedThisMonthCount, error: closedComplaintsErr },
    { data: stillOpenComplaints, error: stillOpenErr },
    { data: overdueOrders, error: overdueErr },
    { count: outOfStockCount, error: stockErr },
    { count: missingPricesCount, error: missingPriceErr },
    { data: allActiveProducts, error: activeProdErr },
  ] = await Promise.all([
    supabase
      .from('orders')
      .select('id,"orderStatus","orderTotal","netTotal","orderDate","orderType","orderReceiver","customerId"')
      .gte('orderDate', monthStart)
      .lte('orderDate', monthEnd),

    supabase
      .from('orders')
      .select('id,"orderStatus","orderTotal","netTotal","orderDate","orderType"')
      .gte('orderDate', prevMonthStart)
      .lte('orderDate', prevMonthEnd),

    supabase
      .from('customers')
      .select('id,"customerName","createdAt"')
      .gte('createdAt', `${monthStart}T00:00:00+02:00`)
      .lte('createdAt', `${monthEnd}T23:59:59+02:00`),

    supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .gte('createdAt', `${prevMonthStart}T00:00:00+02:00`)
      .lte('createdAt', `${prevMonthEnd}T23:59:59+02:00`),

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
      .gte('openedAt', `${monthStart}T00:00:00+02:00`)
      .lte('openedAt', `${monthEnd}T23:59:59+02:00`),

    supabase
      .from('complaints')
      .select('id', { count: 'exact', head: true })
      .gte('openedAt', `${prevMonthStart}T00:00:00+02:00`)
      .lte('openedAt', `${prevMonthEnd}T23:59:59+02:00`),

    supabase
      .from('complaints')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'closed')
      .gte('closedAt', `${monthStart}T00:00:00+02:00`)
      .lte('closedAt', `${monthEnd}T23:59:59+02:00`),

    supabase
      .from('complaints')
      .select('id')
      .neq('status', 'closed')
      .lt('openedAt', new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString()),

    supabase
      .from('orders')
      .select('id,"scheduledDate","orderStatus"')
      .not('scheduledDate', 'is', null)
      .lt('scheduledDate', monthEnd)
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
    thisMonthErr,
    prevMonthErr,
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
  // "Sales" = gross value of ALL orders placed this month, any status.
  // "Revenue collected" = net amount actually collected (netTotal, falls
  // back to orderTotal) — DELIVERED orders only.
  const salesPlaced = (thisMonthOrders ?? []).reduce((s, o) => s + Number(o.orderTotal ?? 0), 0)
  const deliveredGrossRevenue = (thisMonthOrders ?? [])
    .filter((o) => o.orderStatus === ORDER_STATUS.DELIVERED)
    .reduce((s, o) => s + Number(o.orderTotal ?? 0), 0)
  const revenueCollected = (thisMonthOrders ?? [])
    .filter((o) => o.orderStatus === ORDER_STATUS.DELIVERED)
    .reduce((s, o) => s + Number((o as { netTotal?: number }).netTotal ?? o.orderTotal ?? 0), 0)
  const totalOrders = (thisMonthOrders ?? []).length
  const deliveredCount = (thisMonthOrders ?? []).filter(
    (o) => o.orderStatus === ORDER_STATUS.DELIVERED,
  ).length
  const avgOrderValue = deliveredCount > 0 ? deliveredGrossRevenue / deliveredCount : 0

  const prevSalesPlaced = (prevMonthOrders ?? []).reduce((s, o) => s + Number(o.orderTotal ?? 0), 0)
  const prevDeliveredGrossRevenue = (prevMonthOrders ?? [])
    .filter((o) => o.orderStatus === ORDER_STATUS.DELIVERED)
    .reduce((s, o) => s + Number(o.orderTotal ?? 0), 0)
  const prevRevenueCollected = (prevMonthOrders ?? [])
    .filter((o) => o.orderStatus === ORDER_STATUS.DELIVERED)
    .reduce((s, o) => s + Number((o as { netTotal?: number }).netTotal ?? o.orderTotal ?? 0), 0)
  const prevOrders = (prevMonthOrders ?? []).length
  const prevDelivered = (prevMonthOrders ?? []).filter(
    (o) => o.orderStatus === ORDER_STATUS.DELIVERED,
  ).length
  const prevAov = prevDelivered > 0 ? prevDeliveredGrossRevenue / prevDelivered : 0

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
  for (const o of thisMonthOrders ?? []) {
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
  const prevCancelled = (prevMonthOrders ?? []).filter(
    (o) => o.orderStatus === ORDER_STATUS.CANCELLED,
  ).length
  statuses.prevCancellationRatePct =
    prevOrders > 0 ? Math.round((prevCancelled / prevOrders) * 100) : 0

  // ─── Week-by-week trend (7-day chunks from monthStart) ─────
  const weeks: MonthlyReportData['weeks'] = []
  {
    let chunkStart = monthStart
    let weekNo = 1
    while (chunkStart <= monthEnd) {
      const chunkEnd = addDays(chunkStart, 6) > monthEnd ? monthEnd : addDays(chunkStart, 6)
      weeks.push({
        label: `Week ${weekNo}`,
        weekStart: chunkStart,
        weekEnd: chunkEnd,
        orders: 0,
        delivered: 0,
        revenue: 0,
      })
      chunkStart = addDays(chunkEnd, 1)
      weekNo += 1
    }
  }
  for (const o of thisMonthOrders ?? []) {
    const key = String(o.orderDate)
    const bucket = weeks.find((w) => key >= w.weekStart && key <= w.weekEnd)
    if (!bucket) continue
    bucket.orders += 1
    if (o.orderStatus === ORDER_STATUS.DELIVERED) {
      bucket.delivered += 1
      bucket.revenue += Number(o.orderTotal ?? 0)
    }
  }

  // ─── Revenue by order type + MoM ───────────────────────────
  const typeAgg = new Map<string, { orders: number; delivered: number; revenue: number }>()
  for (const o of thisMonthOrders ?? []) {
    const key = ((o as { orderType?: string }).orderType || '').trim() || 'غير محدد'
    const entry = typeAgg.get(key) ?? { orders: 0, delivered: 0, revenue: 0 }
    entry.orders += 1
    if (o.orderStatus === ORDER_STATUS.DELIVERED) {
      entry.delivered += 1
      entry.revenue += Number((o as { netTotal?: number }).netTotal ?? o.orderTotal ?? 0)
    }
    typeAgg.set(key, entry)
  }
  const prevTypeRevenue = new Map<string, number>()
  for (const o of prevMonthOrders ?? []) {
    if (o.orderStatus !== ORDER_STATUS.DELIVERED) continue
    const key = ((o as { orderType?: string }).orderType || '').trim() || 'غير محدد'
    prevTypeRevenue.set(key, (prevTypeRevenue.get(key) ?? 0) + Number((o as { netTotal?: number }).netTotal ?? o.orderTotal ?? 0))
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

  // ─── Top products (this month vs last month rank) ──────────
  const deliveredIdsThis = (thisMonthOrders ?? [])
    .filter((o) => o.orderStatus === ORDER_STATUS.DELIVERED)
    .map((o) => String(o.id))
  const deliveredIdsPrev = (prevMonthOrders ?? [])
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

  // ─── Top buyers this month ──────────────────────────────────
  const buyerAgg = new Map<string, { orders: number; revenue: number }>()
  for (const o of thisMonthOrders ?? []) {
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
  const openedRows = openedThisMonthComplaints ?? []
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
  for (const o of thisMonthOrders ?? []) {
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
  const soldPidsThisMonth = new Set(thisAgg.keys())
  const zeroSalesActive = (allActiveProducts ?? [])
    .filter((p) => !soldPidsThisMonth.has(String(p.id)))
    .map((p) => String((p as { productName?: string }).productName || ''))
    .filter(Boolean)
  const zeroSalesTotal = zeroSalesActive.length
  const zeroSalesProducts = zeroSalesActive.slice(0, 10)

  const newCustomersDetail = await attachFirstOrderDetails(supabase, newCustomerRowsThis ?? [])

  return {
    monthStart,
    monthEnd,
    prevMonthStart,
    prevMonthEnd,
    revenue: {
      totalSales: salesPlaced,
      revenueCollected,
      ordersCount: totalOrders,
      deliveredCount,
      avgOrderValue,
      salesPctChange: pctChange(salesPlaced, prevSalesPlaced),
      revenueCollectedPctChange: pctChange(revenueCollected, prevRevenueCollected),
      ordersPctChange: pctChange(totalOrders, prevOrders),
      aovPctChange: pctChange(avgOrderValue, prevAov),
    },
    orders: statuses,
    weeks,
    revenueByOrderType,
    topProducts,
    customers: {
      newCustomers: (newCustomerRowsThis ?? []).length,
      newCustomersPctChange: pctChange((newCustomerRowsThis ?? []).length, newCustomersPrev ?? 0),
      warningCount: warningCount ?? 0,
      suspendedCount: suspendedCount ?? 0,
      topBuyers,
      newCustomersDetail,
    },
    complaints: {
      opened: openedRows.length,
      closed: closedThisMonthCount ?? 0,
      openedPctChange: pctChange(openedRows.length, openedPrevMonthCount ?? 0),
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
export function formatMonthlyReportSummary(d: MonthlyReportData): string {
  return `Sales ${formatCurrency(d.revenue.totalSales)} · Collected ${formatCurrency(d.revenue.revenueCollected)} · ${formatNumber(d.revenue.deliveredCount)} delivered · ${formatNumber(d.customers.newCustomers)} new`
}

// Suppress unused-import warnings for constants exported for other modules.
void REPORT_TIMEZONE
