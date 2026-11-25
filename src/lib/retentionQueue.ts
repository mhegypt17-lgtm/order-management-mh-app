// Pure logic for the CS retention queue ("اتصل بهم اليوم") and for measuring
// what happened after each call. No I/O: everything here is unit-tested.

import { churnRank, overdueRatio, type RetentionRow } from '@/lib/retentionView'

// ───────────────────────── contact actions (admin-configurable) ─────────────────────────
export interface ContactAction {
  /** Stable id stored with each logged call; labels can change without touching history. */
  key: string
  label: string
  /** The customer actually spoke to us (counts towards the contact rate, snoozes the auto engine). */
  reached: boolean
  /** Days until the next call by default (0 = none). */
  nextCallDays: number
  /** The agent must also pick a reason (e.g. why not interested). */
  askReason: boolean
  /** Opt the customer out of follow-ups altogether (e.g. wrong number). */
  stopFollowUp: boolean
}

export const DEFAULT_ACTIONS: ContactAction[] = [
  { key: 'answered', label: 'تم الاتصال', reached: true, nextCallDays: 14, askReason: false, stopFollowUp: false },
  { key: 'no_answer', label: 'لم يرد', reached: false, nextCallDays: 1, askReason: false, stopFollowUp: false },
  { key: 'whatsapp_sent', label: 'أُرسلت رسالة واتساب', reached: false, nextCallDays: 3, askReason: false, stopFollowUp: false },
  { key: 'promised', label: 'وعد بالطلب', reached: true, nextCallDays: 5, askReason: false, stopFollowUp: false },
  { key: 'ordered', label: 'طلب أثناء المكالمة', reached: true, nextCallDays: 30, askReason: false, stopFollowUp: false },
  { key: 'not_interested', label: 'غير مهتم', reached: true, nextCallDays: 90, askReason: true, stopFollowUp: false },
  { key: 'wrong_number', label: 'رقم خاطئ', reached: false, nextCallDays: 0, askReason: false, stopFollowUp: true },
]

export const NOT_INTERESTED_REASONS: Array<{ key: string; label: string }> = [
  { key: 'price', label: 'السعر' },
  { key: 'quality', label: 'الجودة' },
  { key: 'delivery', label: 'التوصيل' },
  { key: 'service', label: 'الخدمة' },
  { key: 'moved', label: 'انتقل / خارج التغطية' },
  { key: 'other', label: 'سبب آخر' },
]

/** Cleans the admin's action list; falls back to the defaults when it is empty or unusable. */
export function sanitizeActions(raw: unknown): ContactAction[] {
  if (!Array.isArray(raw)) return DEFAULT_ACTIONS.map((a) => ({ ...a }))
  const seen = new Set<string>()
  const out: ContactAction[] = []
  for (const a of raw.slice(0, 15) as any[]) {
    const label = String(a?.label ?? '').trim().slice(0, 40)
    if (!label) continue
    let key = String(a?.key ?? '').trim()
    if (!/^[a-z0-9_]{1,40}$/.test(key) || seen.has(key)) key = `custom_${Date.now().toString(36)}${out.length}`
    seen.add(key)
    out.push({
      key,
      label,
      reached: a?.reached === true,
      nextCallDays: Math.min(365, Math.max(0, Math.floor(Number(a?.nextCallDays) || 0))),
      askReason: a?.askReason === true,
      stopFollowUp: a?.stopFollowUp === true,
    })
  }
  return out.length > 0 ? out : DEFAULT_ACTIONS.map((a) => ({ ...a }))
}

const findAction = (key: string, actions: ContactAction[]) =>
  actions.find((a) => a.key === key) || DEFAULT_ACTIONS.find((a) => a.key === key)
export const isKnownAction = (key: unknown, actions: ContactAction[] = DEFAULT_ACTIONS) =>
  typeof key === 'string' && actions.some((a) => a.key === key)
export const resultMeta = (key: string, actions: ContactAction[] = DEFAULT_ACTIONS) => findAction(key, actions)
export const resultLabel = (key: string, actions: ContactAction[] = DEFAULT_ACTIONS) => findAction(key, actions)?.label || key
export const reasonLabel = (key: string | null | undefined) =>
  NOT_INTERESTED_REASONS.find((r) => r.key === key)?.label || (key ? String(key) : '')

/** ISO timestamp of the next call: an explicit valid date wins, else today + the action's default. */
export function nextCallAt(result: string, now: number, explicit?: unknown, actions: ContactAction[] = DEFAULT_ACTIONS): string | null {
  if (explicit) {
    const t = new Date(String(explicit)).getTime()
    if (Number.isFinite(t) && t >= now - 86_400_000) return new Date(t).toISOString()
  }
  const days = resultMeta(result, actions)?.nextCallDays ?? 0
  return days > 0 ? new Date(now + days * 86_400_000).toISOString() : null
}

// ───────────────────────── WhatsApp messages (admin-configurable) ─────────────────────────
export interface RetentionMessages {
  /** Win-back message for customers who stopped ordering. */
  winback: string
  /** Follow-up message for customers with an open complaint. */
  complaint: string
}

export const MESSAGE_PLACEHOLDERS: Array<{ key: string; label: string }> = [
  { key: 'name', label: 'الاسم الأول للعميل' },
  { key: 'agent', label: 'اسم الموظف' },
  { key: 'days', label: 'عدد أيام عدم الطلب' },
  { key: 'product', label: 'المنتج الأكثر طلباً' },
  { key: 'complaint', label: 'عنوان آخر شكوى' },
]

export const DEFAULT_MESSAGES: RetentionMessages = {
  winback:
    'أهلاً {name} 👋\nمعاك {agent} من Meat House 🐮\nوحشتنا! بقالك {days} يوم من آخر طلب.\nتحب نجهزلك {product} زي كل مرة؟ 🥩\nنشرف بطلبك في أي وقت 🙏',
  complaint:
    'أهلاً {name} 👋\nمعاك {agent} من Meat House 🐮\nبنتابع معاك بخصوص شكوى «{complaint}» — اتحلّت ولا لسه محتاج حاجة؟ 🙏',
}

export function sanitizeMessages(raw: any): RetentionMessages {
  const pick = (v: unknown, fallback: string) => {
    const s = String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, 800)
    return s || fallback
  }
  return { winback: pick(raw?.winback, DEFAULT_MESSAGES.winback), complaint: pick(raw?.complaint, DEFAULT_MESSAGES.complaint) }
}

/**
 * Fills {placeholders}. A line whose placeholder has no value (e.g. no known
 * favourite product) is dropped instead of sent half-empty; unknown
 * placeholders are left as typed so a typo is visible before sending.
 */
export function renderMessage(template: string, vars: Record<string, string | number | null | undefined>): string {
  const lines = String(template || '').replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  for (const line of lines) {
    let missing = false
    const filled = line.replace(/\{(\w+)\}/g, (whole, key: string) => {
      if (!(key in vars)) return whole
      const v = vars[key]
      if (v == null || String(v).trim() === '') {
        missing = true
        return ''
      }
      return String(v).trim()
    })
    if (!missing) out.push(filled)
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

export const firstName = (name: string) => (name || '').trim().split(/\s+/)[0] || ''

/** wa.me link (Egyptian numbers: leading 0 becomes 20); null when there is no usable phone. */
export function whatsappUrl(phone: string, text: string): string | null {
  const digits = String(phone || '').replace(/\D/g, '')
  if (!digits) return null
  const intl = digits.startsWith('20') ? digits : digits.startsWith('0') ? `20${digits.slice(1)}` : digits
  return `https://wa.me/${intl}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}

// ───────────────────────── days-inactive buckets ─────────────────────────
/** Day thresholds for the "calls needed" chart: the three stages, then finer steps beyond stage 3. */
export function bucketEdges(stages: { stage1: { days: number }; stage2: { days: number }; stage3: { days: number } }): number[] {
  const s3 = stages.stage3.days
  const raw = [stages.stage1.days, stages.stage2.days, s3, s3 + 30, s3 + 90, s3 + 180]
  return Array.from(new Set(raw.filter((d) => Number.isFinite(d) && d > 0))).sort((a, b) => a - b)
}

/** Index of the bucket a customer falls in, or -1 below the first threshold. */
export function bucketIndex(days: number, edges: number[]): number {
  let idx = -1
  for (let i = 0; i < edges.length; i++) if (days >= edges[i]) idx = i
  return idx
}

export function bucketLabel(i: number, edges: number[]): string {
  return i >= edges.length - 1 ? `${edges[i]}+ يوم` : `${edges[i]}–${edges[i + 1] - 1} يوم`
}

export function countBuckets(items: Array<{ days: number }>, edges: number[]): number[] {
  const counts = edges.map(() => 0)
  for (const it of items) {
    const i = bucketIndex(it.days, edges)
    if (i >= 0) counts[i]++
  }
  return counts
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
  /** Today's win-back calls (capped by the admin's daily size). */
  winback: QueueCandidate[]
  /** Every eligible win-back customer in priority order (for the days-inactive chart and filters). */
  pool: QueueCandidate[]
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
  return { service, winback: rest.slice(0, config.dailySize), pool: rest, moreWaiting: Math.max(0, rest.length - config.dailySize) }
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
  actions: ContactAction[] = DEFAULT_ACTIONS,
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
      out.push({ ...c, outcome, revenue, reached: !!resultMeta(c.result, actions)?.reached })
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
  // A reason is only stored for actions that ask for one (e.g. "not interested").
  const reasons = summarize(items.filter((c) => c.reason), (c) => reasonLabel(c.reason))
  const topReason = reasons[0]
  if (topReason && topReason.contacts >= 5) {
    insights.push(`أكثر سبب لرفض العملاء: «${topReason.key}» (${topReason.contacts} مكالمة) — راجع هذا الجانب في المنتج أو الخدمة.`)
  }
  const reachedRate = items.length > 0 ? items.filter((c) => c.reached).length / items.length : 0
  if (reachedRate < 0.4) insights.push(`نسبة الرد ${pct(reachedRate)} فقط — جرّب تغيير توقيت الاتصال أو إعادة المحاولة في يوم آخر.`)
  if (insights.length === 0) insights.push('لا توجد فروق واضحة بين المراحل أو الشرائح أو الموظفين حتى الآن.')
  return insights
}
