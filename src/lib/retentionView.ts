// Pure helpers for the admin Retention page: how late a customer is compared to
// their own ordering rhythm, how rows are sorted/searched, and stage totals.

export type RetentionSort = 'days' | 'value' | 'overdue' | 'risk'

export const RETENTION_SORTS: Array<{ key: RetentionSort; label: string }> = [
  { key: 'days', label: 'أيام عدم النشاط' },
  { key: 'value', label: 'الإنفاق' },
  { key: 'overdue', label: 'نسبة التأخير' },
  { key: 'risk', label: 'خطر الفقد' },
]

export function parseSort(value: unknown): RetentionSort {
  return RETENTION_SORTS.some((s) => s.key === value) ? (value as RetentionSort) : 'days'
}

export interface IntelSnapshot {
  lifecycleStage: string | null
  churnRisk: string | null
  healthScore: number | null
  totalOrders: number | null
  totalRevenue: number | null
  typicalIntervalDays: number | null
}

export interface RetentionRow {
  id: string
  name: string
  phone: string
  days: number
  lastMs: number
  intel: IntelSnapshot | null
  openComplaints: number
}

/** Days inactive ÷ the customer's usual gap between orders (1 decimal), or null for one-order customers. */
export function overdueRatio(days: number, typicalIntervalDays: number | null | undefined): number | null {
  const typical = Number(typicalIntervalDays)
  if (!Number.isFinite(typical) || typical <= 0) return null
  return Math.round((days / typical) * 10) / 10
}

const RISK_RANK: Record<string, number> = { High: 3, Medium: 2, Low: 1 }
export const churnRank = (risk: string | null | undefined) => RISK_RANK[String(risk)] || 0

const num = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Highest first; rows without a value for the chosen key go last. Ties fall back to days inactive. */
export function sortRows(rows: RetentionRow[], key: RetentionSort): RetentionRow[] {
  const score = (r: RetentionRow): number => {
    if (key === 'value') return r.intel ? num(r.intel.totalRevenue) : -1
    if (key === 'risk') return r.intel ? churnRank(r.intel.churnRisk) : -1
    if (key === 'overdue') return r.intel ? (overdueRatio(r.days, r.intel.typicalIntervalDays) ?? -1) : -1
    return r.days
  }
  return rows.slice().sort((a, b) => score(b) - score(a) || b.days - a.days)
}

const digitsOnly = (s: string) =>
  s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/\D/g, '')

/** Case-insensitive name match, or a phone match on digits (Arabic digits accepted). */
export function matchesQuery(row: Pick<RetentionRow, 'name' | 'phone'>, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (row.name.toLowerCase().includes(q)) return true
  const qDigits = digitsOnly(q)
  return qDigits.length > 0 && digitsOnly(row.phone).includes(qDigits)
}

export function stageTotals(rows: RetentionRow[]): { count: number; revenue: number; withoutScore: number } {
  let revenue = 0
  let withoutScore = 0
  for (const r of rows) {
    if (r.intel) revenue += num(r.intel.totalRevenue)
    else withoutScore++
  }
  return { count: rows.length, revenue, withoutScore }
}

export const LIFECYCLE_LABELS: Record<string, string> = {
  VIP: 'VIP',
  Active: 'نشط',
  Developing: 'في نمو',
  New: 'جديد',
  'At Risk': 'معرّض للفقد',
  Dormant: 'خامل',
  Reactivated: 'عاد للنشاط',
}

export const CHURN_LABELS: Record<string, string> = { High: 'مرتفع', Medium: 'متوسط', Low: 'منخفض' }

/** Retention stage (0 = still active) for a number of days without a (non-cancelled) order. */
export function stageForDays(
  days: number,
  ret: { stage1: { days: number }; stage2: { days: number }; stage3: { days: number } },
): 0 | 1 | 2 | 3 {
  if (days >= ret.stage3.days) return 3
  if (days >= ret.stage2.days) return 2
  if (days >= ret.stage1.days) return 1
  return 0
}
