// Server-side reads shared by the admin Retention page, the CS queue and the
// outcomes page. Every read pages past PostgREST's silent 1000-row cap.

import { supabase } from '@/lib/supabase'
import { readAllPages } from '@/lib/pagedRead'
import { instashopOnlyCustomerIds, stageForDays, type ComplaintBrief, type RetentionRow } from '@/lib/retentionView'
import type { ContactRecord, OrderPoint, QueueCandidate } from '@/lib/retentionQueue'

const DAY = 86_400_000

/** Rows whose `column` is in `ids`, in chunks of 100 ids, each chunk read page by page. */
export async function readRowsIn<T>(
  table: string,
  column: string,
  ids: string[],
  columns: string,
  orderCol: string,
  modify: (q: any) => any = (q) => q,
): Promise<{ rows: T[]; error: string | null }> {
  const uniq = Array.from(new Set(ids.filter((v) => v != null && v !== '')))
  const rows: T[] = []
  let error: string | null = null
  for (let i = 0; i < uniq.length; i += 100) {
    const chunk = uniq.slice(i, i + 100)
    const res = await readAllPages<T>(
      (from, to) =>
        modify(supabase.from(table).select(columns).in(column, chunk)).order(orderCol, { ascending: true }).range(from, to) as any,
    )
    rows.push(...res.rows)
    if (res.error) error = res.error
  }
  return { rows, error }
}

export interface IntelDbRow {
  customerId: string
  lifecycleStage: string | null
  churnRisk: string | null
  healthScore: number | null
  totalOrders: number | null
  totalRevenue: number | null
  typicalIntervalDays: number | null
  computedAt: string | null
}

export interface CustomerBasics {
  id: string
  customerName: string | null
  phone: string | null
  doNotFollowUp?: boolean | null
  followUpSnoozeUntil?: string | null
}

export interface StageRow extends RetentionRow {
  stage: 1 | 2 | 3
}

export interface Staging {
  ordersInWindow: number
  customersWithOrders: number
  /** Instashop-only customers left out of the retention lists. */
  instashopExcluded: number
  /** Customers in a stage, grouped by stage (unfiltered). */
  byStage: Record<1 | 2 | 3, StageRow[]>
  customerById: Map<string, CustomerBasics>
  intelCount: number
  scoresUpdatedAt: string
  missingFollowUpColumns: boolean
  error: string | null
}

const INTEL_COLUMNS = 'customerId,lifecycleStage,churnRisk,healthScore,totalOrders,totalRevenue,typicalIntervalDays,computedAt'

/**
 * Customers currently inactive long enough to be in a retention stage, with
 * their score snapshot and open complaints. Details are read only for the
 * customers in a stage; the full customer list is never downloaded.
 */
export async function readRetentionStaging(retention: {
  stage1: { days: number }
  stage2: { days: number }
  stage3: { days: number }
}): Promise<Staging> {
  const nowMs = Date.now()
  const cutoffISO = new Date(nowMs - 400 * DAY).toISOString()
  const ordersRead = await readAllPages<{ customerId: string | null; createdAt: string; orderType: string | null }>(
    (from, to) =>
      supabase
        .from('orders')
        .select('customerId,createdAt,orderType')
        .gte('createdAt', cutoffISO)
        .not('customerId', 'is', null)
        .neq('orderStatus', 'لاغي')
        .order('id', { ascending: true })
        .range(from, to) as any,
  )

  // Instashop-only customers are Instashop's, not ours to win back.
  const instashopOnly = instashopOnlyCustomerIds(ordersRead.rows)
  const lastOrderMs = new Map<string, number>()
  for (const o of ordersRead.rows) {
    if (!o.customerId || instashopOnly.has(o.customerId)) continue
    const ts = new Date(o.createdAt).getTime()
    if (!isFinite(ts)) continue
    if (ts > (lastOrderMs.get(o.customerId) || 0)) lastOrderMs.set(o.customerId, ts)
  }

  const staged: Array<{ id: string; days: number; lastMs: number; stage: 1 | 2 | 3 }> = []
  for (const [id, lastMs] of lastOrderMs) {
    const days = Math.floor((nowMs - lastMs) / DAY)
    const stage = stageForDays(days, retention)
    if (stage !== 0) staged.push({ id, days, lastMs, stage })
  }
  const ids = staged.map((s) => s.id)

  let customersRead = await readRowsIn<CustomerBasics>('customers', 'id', ids, 'id,customerName,phone,doNotFollowUp,followUpSnoozeUntil', 'id')
  let missingFollowUpColumns = false
  if (customersRead.error && /doNotFollowUp|followUpSnoozeUntil|column .* does not exist/i.test(customersRead.error)) {
    missingFollowUpColumns = true
    customersRead = await readRowsIn<CustomerBasics>('customers', 'id', ids, 'id,customerName,phone', 'id')
  }
  const [intelRead, complaintsRead] = await Promise.all([
    readRowsIn<IntelDbRow>('customer_intelligence_scores', 'customerId', ids, INTEL_COLUMNS, 'customerId'),
    readRowsIn<{ customerId: string; status: string; subject: string | null; reason: string | null; openedAt: string | null }>(
      'complaints', 'customerId', ids, 'id,customerId,status,subject,reason,openedAt', 'id',
    ),
  ])

  const customerById = new Map(customersRead.rows.map((c) => [c.id, c]))
  const intelById = new Map(intelRead.rows.map((r) => [r.customerId, r]))
  const openComplaints = new Map<string, number>()
  const complaintsBy = new Map<string, ComplaintBrief[]>()
  for (const cp of complaintsRead.rows) {
    if (cp.status !== 'closed') openComplaints.set(cp.customerId, (openComplaints.get(cp.customerId) || 0) + 1)
    const list = complaintsBy.get(cp.customerId) || []
    list.push({ date: cp.openedAt || null, title: String(cp.subject || cp.reason || '').trim() || 'شكوى', status: cp.status })
    complaintsBy.set(cp.customerId, list)
  }
  for (const list of complaintsBy.values()) list.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())

  const byStage: Record<1 | 2 | 3, StageRow[]> = { 1: [], 2: [], 3: [] }
  for (const s of staged) {
    const c = customerById.get(s.id)
    if (!c) continue
    const intel = intelById.get(s.id)
    byStage[s.stage].push({
      id: s.id,
      stage: s.stage,
      name: c.customerName || '',
      phone: c.phone || '',
      days: s.days,
      lastMs: s.lastMs,
      intel: intel
        ? {
            lifecycleStage: intel.lifecycleStage,
            churnRisk: intel.churnRisk,
            healthScore: intel.healthScore,
            totalOrders: intel.totalOrders,
            totalRevenue: intel.totalRevenue,
            typicalIntervalDays: intel.typicalIntervalDays,
          }
        : null,
      openComplaints: openComplaints.get(s.id) || 0,
      complaints: complaintsBy.get(s.id) || [],
    })
  }

  return {
    ordersInWindow: ordersRead.rows.length,
    customersWithOrders: lastOrderMs.size,
    instashopExcluded: instashopOnly.size,
    byStage,
    customerById,
    intelCount: intelRead.rows.length,
    scoresUpdatedAt: intelRead.rows.reduce((latest, r) => (r.computedAt && r.computedAt > latest ? r.computedAt : latest), ''),
    missingFollowUpColumns,
    error: ordersRead.error || customersRead.error || intelRead.error || complaintsRead.error || null,
  }
}

// ───────────────────────── contacts and outcomes ─────────────────────────
export interface ContactDbRow extends ContactRecord {
  note: string
  nextCallAt: string | null
}

const CONTACT_COLUMNS = 'id,customerId,agent,contactedAt,result,reason,note,offer,nextCallAt,stage,segment,spendAtContact'

export const isMissingTable = (error: string | null) => !!error && /retention_contacts|schema cache|does not exist/i.test(error)

export async function readContactsForCustomers(ids: string[]) {
  const res = await readRowsIn<ContactDbRow>('retention_contacts', 'customerId', ids, CONTACT_COLUMNS, 'id')
  return { rows: res.rows, error: res.error, tableMissing: isMissingTable(res.error) }
}

export async function readContactsSince(sinceISO: string) {
  const res = await readAllPages<ContactDbRow>(
    (from, to) =>
      supabase
        .from('retention_contacts')
        .select(CONTACT_COLUMNS)
        .gte('contactedAt', sinceISO)
        .order('contactedAt', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to) as any,
  )
  return { rows: res.rows, error: res.error, tableMissing: isMissingTable(res.error) }
}

/** Non-cancelled orders of these customers placed on/after `sinceISO`. */
export async function readOrdersSince(customerIds: string[], sinceISO: string) {
  return readRowsIn<OrderPoint>(
    'orders',
    'customerId',
    customerIds,
    'id,customerId,createdAt,orderTotal',
    'id',
    (q) => q.gte('createdAt', sinceISO).neq('orderStatus', 'لاغي'),
  )
}

/** Turn staged rows plus each customer's latest contact into queue candidates. */
export function toCandidates(
  rows: StageRow[],
  customerById: Map<string, CustomerBasics>,
  latestNextCallMs: Map<string, number | null>,
): QueueCandidate[] {
  return rows.map((r) => {
    const c = customerById.get(r.id)
    const snooze = c?.followUpSnoozeUntil ? new Date(c.followUpSnoozeUntil).getTime() : NaN
    return {
      ...r,
      doNotFollowUp: !!c?.doNotFollowUp,
      snoozeUntilMs: Number.isFinite(snooze) ? snooze : null,
      nextCallMs: latestNextCallMs.get(r.id) ?? null,
    }
  })
}

/** nextCallAt of each customer's most recent contact. */
export function latestNextCall(contacts: Array<{ customerId: string; contactedAt: string; nextCallAt: string | null }>) {
  const latest = new Map<string, { at: number; next: number | null }>()
  for (const c of contacts) {
    const at = new Date(c.contactedAt).getTime()
    const prev = latest.get(c.customerId)
    if (!prev || at > prev.at) latest.set(c.customerId, { at, next: c.nextCallAt ? new Date(c.nextCallAt).getTime() : null })
  }
  return new Map(Array.from(latest, ([id, v]) => [id, v.next]))
}
