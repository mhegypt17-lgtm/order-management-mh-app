// Pure logic for the CS retention queue ("اتصل بهم اليوم") and for measuring
// what happened after each call. No I/O: everything here is unit-tested.

import { churnRank, overdueRatio, type RetentionRow } from '@/lib/retentionView'

// ───────────────────────── contact results ─────────────────────────
export type ContactResult = 'no_answer' | 'wrong_number' | 'answered' | 'promised' | 'ordered' | 'not_interested'

export const CONTACT_RESULTS: Array<{
  key: ContactResult
  label: string
  /** The customer actually spoke to us. */
  reached: boolean
  /** Default days until the next call (0 = never call again). */
  nextCallDays: number
}> = [
  { key: 'no_answer', label: 'لم يرد', reached: false, nextCallDays: 1 },
  { key: 'wrong_number', label: 'رقم خاطئ', reached: false, nextCallDays: 0 },
  { key: 'answered', label: 'رد — بدون التزام', reached: true, nextCallDays: 14 },
  { key: 'promised', label: 'وعد بالطلب', reached: true, nextCallDays: 5 },
  { key: 'ordered', label: 'طلب أثناء المكالمة', reached: true, nextCallDays: 30 },
  { key: 'not_interested', label: 'غير مهتم', reached: true, nextCallDays: 90 },
]

export const NOT_INTERESTED_REASONS: Array<{ key: string; label: string }> = [
  { key: 'price', label: 'السعر' },
  { key: 'quality', label: 'الجودة' },
  { key: 'delivery', label: 'التوصيل' },
  { key: 'service', label: 'الخدمة' },
  { key: 'moved', label: 'انتقل / خارج التغطية' },
  { key: 'other', label: 'سبب آخر' },
]

export const isContactResult = (v: unknown): v is ContactResult => CONTACT_RESULTS.some((r) => r.key === v)
export const resultMeta = (key: string) => CONTACT_RESULTS.find((r) => r.key === key)
export const resultLabel = (key: string) => resultMeta(key)?.label || key
export const reasonLabel = (key: string | null | undefined) =>
  NOT_INTERESTED_REASONS.find((r) => r.key === key)?.label || (key ? String(key) : '')

/** ISO timestamp of the next call: an explicit valid date wins, else today + the result's default. */
export function nextCallAt(result: ContactResult, now: number, explicit?: unknown): string | null {
  if (explicit) {
    const t = new Date(String(explicit)).getTime()
    if (Number.isFinite(t) && t >= now - 86_400_000) return new Date(t).toISOString()
  }
  const days = resultMeta(result)?.nextCallDays ?? 0
  return days > 0 ? new Date(now + days * 86_400_000).toISOString() : null
}

// ───────────────────────── queue rules ─────────────────────────
export interface QueueConfig {
  /** Lowest stage (1–3) that can enter the queue. */
  minStage: 1 | 2 | 3
  /** Customers whose past spend is below this are not queued. */
  minSpend: number
  /** Win-back calls shown at once (the service lane is not capped). */
  dailySize: number
}

export const DEFAULT_QUEUE_CONFIG: QueueConfig = { minStage: 1, minSpend: 0, dailySize: 25 }

export function sanitizeQueueConfig(raw: any): QueueConfig {
  const stage = Math.floor(Number(raw?.minStage))
  return {
    minStage: stage === 2 || stage === 3 ? stage : 1,
    minSpend: Math.max(0, Math.floor(Number(raw?.minSpend) || 0)),
    dailySize: Math.min(200, Math.max(1, Math.floor(Number(raw?.dailySize) || DEFAULT_QUEUE_CONFIG.dailySize))),
  }
}

const num = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Higher = call first: value tier, then lateness against the customer's own rhythm, then churn risk. */
export function priorityScore(row: RetentionRow): number {
  const spend = row.intel ? num(row.intel.totalRevenue) : 0
  const tier = spend >= 10_000 ? 3 : spend >= 3_000 ? 2 : spend >= 1_000 ? 1 : 0
  const ratio = row.intel ? overdueRatio(row.days, row.intel.typicalIntervalDays) ?? 0 : 0
  return tier * 1000 + Math.min(ratio, 10) * 50 + churnRank(row.intel?.churnRisk) * 10 + Math.min(row.days, 365) / 365
}

export interface QueueCandidate extends RetentionRow {
  stage: 1 | 2 | 3
  doNotFollowUp: boolean
  snoozeUntilMs: number | null
  /** nextCallAt of the customer's latest logged contact, if any. */
  nextCallMs: number | null
}

export interface BuiltQueue {
  service: QueueCandidate[]
  winback: QueueCandidate[]
  /** Eligible win-back customers beyond today's limit. */
  moreWaiting: number
}

export function buildQueue(candidates: QueueCandidate[], config: QueueConfig, now: number): BuiltQueue {
  const eligible = candidates.filter((c) => {
    if (c.doNotFollowUp) return false
    if (c.snoozeUntilMs != null && c.snoozeUntilMs > now) return false
    if (c.nextCallMs != null && c.nextCallMs > now) return false
    if (c.stage < config.minStage) return false
    if (config.minSpend > 0 && (!c.intel || num(c.intel.totalRevenue) < config.minSpend)) return false
    return true
  })
  const byPriority = (a: QueueCandidate, b: QueueCandidate) => priorityScore(b) - priorityScore(a)
  // A customer with an open complaint needs a service call before any win-back.
  const service = eligible.filter((c) => c.openComplaints > 0).sort(byPriority)
  const rest = eligible.filter((c) => c.openComplaints === 0).sort(byPriority)
  return { service, winback: rest.slice(0, config.dailySize), moreWaiting: Math.max(0, rest.length - config.dailySize) }
}

/** One short Arabic reason tag explaining why this customer is in the queue. */
export function reasonTag(row: RetentionRow): string {
  const intel = row.intel
  if (row.openComplaints > 0) return 'شكوى مفتوحة — مكالمة خدمة أولاً'
  const ratio = intel ? overdueRatio(row.days, intel.typicalIntervalDays) : null
  const late = ratio != null && ratio >= 1.5 ? ` متأخر ×${ratio}` : ''
  if (intel?.lifecycleStage === 'VIP') return `VIP${late || ` — ${row.days} يوم بدون طلب`}`
  if (intel && num(intel.totalRevenue) >= 3_000) return `عميل مرتفع القيمة${late || ` — ${row.days} يوم بدون طلب`}`
  if (late) return `أطول من عادته${late}`
  return `${row.days} يوم بدون طلب`
}

export interface OpeningInput {
  name: string
  openComplaints: number
  lastComplaintReason?: string | null
  /** Lowest dimension of the last survey, if any. */
  weakDimension?: { label: string; score: number } | null
  favouriteProduct?: string | null
  lifecycleStage?: string | null
  days: number
}

/** A suggested first sentence for the call. */
export function suggestOpening(i: OpeningInput): string {
  const first = (i.name || '').trim().split(/\s+/)[0] || 'حضرتك'
  if (i.openComplaints > 0) return `أهلاً ${first}، بنتابع معاك بخصوص الشكوى${i.lastComplaintReason ? ` (${i.lastComplaintReason})` : ''} — اتحلّت ولا لسه محتاج حاجة؟`
  if (i.weakDimension && i.weakDimension.score <= 2) return `أهلاً ${first}، لاحظنا إن تقييمك لـ${i.weakDimension.label} كان ضعيف آخر مرة وعايزين نعتذر ونصلّحها. إيه اللي حصل؟`
  if (i.favouriteProduct) return `أهلاً ${first}، وحشتنا! تحب نجهزلك ${i.favouriteProduct} زي كل مرة؟`
  if (i.lifecycleStage === 'VIP') return `أهلاً ${first}، حضرتك من أحسن عملائنا ومالقيناكش من ${i.days} يوم — في حاجة نقدر نساعدك بيها؟`
  return `أهلاً ${first}، بنطمّن عليك ومن ${i.days} يوم ما طلبتش — محتاج حاجة النهارده؟`
}

// ───────────────────────── outcome tracking ─────────────────────────
export interface ContactRecord {
  id: string
  customerId: string
  agent: string
  contactedAt: string
  result: string
  reason: string | null
  offer: string | null
  stage: number | null
  segment: string | null
  spendAtContact: number | null
}

export interface OrderPoint {
  customerId: string
  createdAt: string
  orderTotal: number
}

export const WIN_WINDOW_DAYS = 30

export type Outcome = 'won' | 'pending' | 'lost'

export interface EvaluatedContact extends ContactRecord {
  outcome: Outcome
  revenue: number
  reached: boolean
}

/**
 * Orders count towards a contact when placed after it and within the window,
 * or before the same customer's next contact (so one order is never credited
 * to two calls). A contact younger than the window with no order yet is
 * "pending", not lost.
 */
export function evaluateContacts(
  contacts: ContactRecord[],
  orders: OrderPoint[],
  now: number,
  windowDays = WIN_WINDOW_DAYS,
): EvaluatedContact[] {
  const windowMs = windowDays * 86_400_000
  const ordersBy = new Map<string, number[][]>()
  for (const o of orders) {
    const t = new Date(o.createdAt).getTime()
    if (!Number.isFinite(t)) continue
    const list = ordersBy.get(o.customerId) || []
    list.push([t, num(o.orderTotal)])
    ordersBy.set(o.customerId, list)
  }
  const contactsBy = new Map<string, ContactRecord[]>()
  for (const c of contacts) {
    const list = contactsBy.get(c.customerId) || []
    list.push(c)
    contactsBy.set(c.customerId, list)
  }
  const out: EvaluatedContact[] = []
  for (const [customerId, list] of contactsBy) {
    const sorted = list.slice().sort((a, b) => new Date(a.contactedAt).getTime() - new Date(b.contactedAt).getTime())
    const custOrders = ordersBy.get(customerId) || []
    sorted.forEach((c, idx) => {
      const start = new Date(c.contactedAt).getTime()
      const nextStart = idx + 1 < sorted.length ? new Date(sorted[idx + 1].contactedAt).getTime() : Infinity
      const end = Math.min(start + windowMs, nextStart)
      const hits = custOrders.filter(([t]) => t > start && t < end)
      const revenue = hits.reduce((s, [, total]) => s + total, 0)
      const outcome: Outcome = hits.length > 0 ? 'won' : now - start < windowMs && nextStart === Infinity ? 'pending' : 'lost'
      out.push({ ...c, outcome, revenue, reached: !!resultMeta(c.result)?.reached })
    })
  }
  return out
}

export interface GroupSummary {
  key: string
  contacts: number
  reached: number
  won: number
  lost: number
  pending: number
  /** won ÷ (won + lost); null until at least one contact has matured. */
  winRate: number | null
  revenue: number
}

export function summarize(items: EvaluatedContact[], keyOf: (c: EvaluatedContact) => string): GroupSummary[] {
  const groups = new Map<string, GroupSummary>()
  for (const c of items) {
    const key = keyOf(c) || '—'
    const g = groups.get(key) || { key, contacts: 0, reached: 0, won: 0, lost: 0, pending: 0, winRate: null, revenue: 0 }
    g.contacts++
    if (c.reached) g.reached++
    if (c.outcome === 'won') g.won++
    else if (c.outcome === 'lost') g.lost++
    else g.pending++
    g.revenue += c.revenue
    groups.set(key, g)
  }
  return Array.from(groups.values())
    .map((g) => ({ ...g, winRate: g.won + g.lost > 0 ? Math.round((g.won / (g.won + g.lost)) * 100) : null }))
    .sort((a, b) => b.contacts - a.contacts)
}

// ───────────────────────── recommendations ─────────────────────────
export const MIN_SAMPLE = 15

/** Rule-based Arabic insights; only speaks when a group has enough matured contacts. */
export function buildInsights(items: EvaluatedContact[], stageLabel: (s: string) => string): string[] {
  const matured = items.filter((c) => c.outcome !== 'pending')
  if (matured.length < MIN_SAMPLE) {
    return [`البيانات غير كافية بعد: ${matured.length} من ${MIN_SAMPLE} مكالمة مكتملة المدة (${WIN_WINDOW_DAYS} يوم) — تظهر التوصيات تلقائياً بعد ذلك.`]
  }
  const insights: string[] = []
  const overall = matured.filter((c) => c.outcome === 'won').length / matured.length
  const pct = (n: number) => `${Math.round(n * 100)}%`
  const rate = (g: GroupSummary) => (g.winRate == null ? 0 : g.winRate / 100)
  const solid = (list: GroupSummary[]) => list.filter((g) => g.won + g.lost >= 8 && g.key !== '—')

  const byStage = solid(summarize(matured, (c) => String(c.stage ?? '')))
  if (byStage.length >= 2) {
    const best = byStage.reduce((a, b) => (rate(b) > rate(a) ? b : a))
    const worst = byStage.reduce((a, b) => (rate(b) < rate(a) ? b : a))
    if (rate(best) - rate(worst) >= 0.1) {
      insights.push(`أفضل استرجاع في ${stageLabel(best.key)} (${best.winRate}%) وأضعفه في ${stageLabel(worst.key)} (${worst.winRate}%) — ركّز الجهد حسب ذلك.`)
    }
  }
  const bySegment = solid(summarize(matured, (c) => c.segment || ''))
  for (const g of bySegment) {
    if (g.winRate != null && rate(g) <= Math.max(0.05, overall / 2)) {
      insights.push(`شريحة «${g.key}»: نسبة الاسترجاع ${g.winRate}% فقط مقابل ${pct(overall)} عامةً — الاتصال بها قليل الجدوى.`)
    } else if (g.winRate != null && rate(g) >= overall + 0.15) {
      insights.push(`شريحة «${g.key}»: ${g.winRate}% استرجاع مقابل ${pct(overall)} عامةً — أعطها أولوية أعلى.`)
    }
  }
  const byAgent = solid(summarize(matured, (c) => c.agent))
  if (byAgent.length >= 2) {
    const worst = byAgent.reduce((a, b) => (rate(b) < rate(a) ? b : a))
    if (rate(worst) <= overall - 0.15) insights.push(`${worst.key}: نسبة الاسترجاع ${worst.winRate}% مقابل ${pct(overall)} للفريق — تحتاج مراجعة أسلوب المكالمة.`)
  }
  const reasons = summarize(items.filter((c) => c.result === 'not_interested' && c.reason), (c) => reasonLabel(c.reason))
  const topReason = reasons[0]
  if (topReason && topReason.contacts >= 5) {
    insights.push(`أكثر سبب لرفض العملاء: «${topReason.key}» (${topReason.contacts} مكالمة) — راجع هذا الجانب في المنتج أو الخدمة.`)
  }
  const reachedRate = items.length > 0 ? items.filter((c) => c.reached).length / items.length : 0
  if (reachedRate < 0.4) insights.push(`نسبة الرد ${pct(reachedRate)} فقط — جرّب تغيير توقيت الاتصال أو إعادة المحاولة في يوم آخر.`)
  if (insights.length === 0) insights.push('لا توجد فروق واضحة بين المراحل أو الشرائح أو الموظفين حتى الآن.')
  return insights
}
