export type ComplaintStatus = 'open' | 'in-progress' | 'closed'

export interface ComplaintAnalyticsRecord {
  id: string
  channel: string
  reason: string
  status: ComplaintStatus
  compensationAmount: number
  openedAt: string
  closedAt: string | null
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
  currentDate = new Date()
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
  }
}
