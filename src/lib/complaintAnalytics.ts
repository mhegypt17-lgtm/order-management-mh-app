export type ComplaintStatus = 'open' | 'in-progress' | 'closed'

export interface ComplaintAnalyticsRecord {
  id: string
  channel: string
  reason: string
  status: ComplaintStatus
  compensationAmount: number
  openedAt: string
  closedAt: string | null
  productIds?: string[]
}

export interface ProductLookupEntry {
  id: string
  productName: string
}

function pct(value: number, total: number) {
  if (!total) return 0
  return Number(((value / total) * 100).toFixed(1))
}

function toMs(dateValue: string | null | undefined) {
  if (!dateValue) return 0
  const ms = new Date(dateValue).getTime()
  return Number.isFinite(ms) ? ms : 0
}

function formatDuration(hours: number) {
  if (!Number.isFinite(hours) || hours <= 0) return '0س 0د'

  const totalMinutes = Math.round(hours * 60)
  const days = Math.floor(totalMinutes / 1440)
  const remainingMinutesAfterDays = totalMinutes % 1440
  const h = Math.floor(remainingMinutesAfterDays / 60)
  const m = remainingMinutesAfterDays % 60

  if (days > 0) {
    return `${days}ي ${h}س ${m}د`
  }

  return `${h}س ${m}د`
}

function rankByCount(values: string[], total: number) {
  const map = new Map<string, number>()
  values
    .map((value) => value?.trim() || 'غير محدد')
    .forEach((value) => {
      map.set(value, (map.get(value) || 0) + 1)
    })

  return Array.from(map.entries())
    .map(([name, count]) => ({ name, count, share: pct(count, total) }))
    .sort((a, b) => b.count - a.count)
}

export function calculateComplaintAnalytics(
  complaints: ComplaintAnalyticsRecord[],
  dateFrom: string,
  dateTo: string,
  currentDate = new Date(),
  products: ProductLookupEntry[] = []
) {
  const filtered = complaints.filter((complaint) => {
    const openedDate = complaint.openedAt.slice(0, 10)
    if (dateFrom && openedDate < dateFrom) return false
    if (dateTo && openedDate > dateTo) return false
    return true
  })

  const totalTickets = filtered.length
  const resolvedTickets = filtered.filter((complaint) => complaint.status === 'closed').length
  const inProgressTickets = filtered.filter((complaint) => complaint.status === 'in-progress').length
  const openTickets = filtered.filter((complaint) => complaint.status === 'open').length

  const slaHoursValues = filtered.map((complaint) => {
    const openedMs = toMs(complaint.openedAt)
    const endMs = complaint.closedAt ? toMs(complaint.closedAt) : currentDate.getTime()

    if (!openedMs || !endMs || endMs < openedMs) return 0
    return (endMs - openedMs) / (1000 * 60 * 60)
  })

  const averageSlaHours =
    slaHoursValues.length > 0
      ? Number((slaHoursValues.reduce((sum, value) => sum + value, 0) / slaHoursValues.length).toFixed(2))
      : 0

  const monthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`
  const monthLabel = currentDate.toLocaleDateString('ar-EG', {
    month: 'long',
    year: 'numeric',
  })

  const monthlyCompensation = complaints
    .filter((complaint) => complaint.openedAt.slice(0, 7) === monthKey)
    .reduce((sum, complaint) => sum + Number(complaint.compensationAmount || 0), 0)

  // ── Top products (only complaints that have at least one productId) ──
  const productNameById = new Map(products.map((p) => [p.id, p.productName || 'منتج بدون اسم']))
  const productAgg = new Map<string, { count: number; compensation: number; reasons: Map<string, number> }>()
  const complaintsWithProducts = filtered.filter((c) => Array.isArray(c.productIds) && c.productIds.length > 0).length

  filtered.forEach((complaint) => {
    const ids = Array.isArray(complaint.productIds) ? complaint.productIds : []
    ids.forEach((id) => {
      const name = productNameById.get(id) || 'منتج محذوف'
      const bucket = productAgg.get(name) || { count: 0, compensation: 0, reasons: new Map<string, number>() }
      bucket.count += 1
      // Split compensation evenly across products on the ticket so totals don't double-count
      bucket.compensation += Number(complaint.compensationAmount || 0) / Math.max(ids.length, 1)
      const reasonKey = complaint.reason?.trim() || 'غير محدد'
      bucket.reasons.set(reasonKey, (bucket.reasons.get(reasonKey) || 0) + 1)
      productAgg.set(name, bucket)
    })
  })

  const topProducts = Array.from(productAgg.entries())
    .map(([name, b]) => {
      let topReason = 'غير محدد'
      let topReasonCount = 0
      b.reasons.forEach((cnt, key) => {
        if (cnt > topReasonCount) {
          topReasonCount = cnt
          topReason = key
        }
      })
      return {
        name,
        count: b.count,
        share: pct(b.count, complaintsWithProducts),
        compensation: Math.round(b.compensation),
        topReason,
      }
    })
    .sort((a, b) => b.count - a.count)

  return {
    totalTickets,
    resolvedTickets,
    inProgressTickets,
    openTickets,
    resolutionRate: pct(resolvedTickets, totalTickets),
    averageSlaHours,
    averageSlaLabel: formatDuration(averageSlaHours),
    monthlyCompensation,
    monthLabel,
    topReasons: rankByCount(filtered.map((complaint) => complaint.reason), totalTickets),
    topChannels: rankByCount(filtered.map((complaint) => complaint.channel), totalTickets),
    topProducts,
    complaintsWithProducts,
  }
}
