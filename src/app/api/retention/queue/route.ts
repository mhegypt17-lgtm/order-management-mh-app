import { NextResponse } from 'next/server'
import { DEFAULT_RETENTION_CONFIG, readOrderSettings, type RetentionConfig } from '@/lib/omsData'
import { cairoDateString } from '@/lib/cairoTime'
import {
  latestNextCall,
  readContactsForCustomers,
  readContactsSince,
  readRetentionStaging,
  toCandidates,
} from '@/lib/retentionData'
import {
  bucketEdges,
  bucketIndex,
  buildQueue,
  countBuckets,
  reasonTag,
  sanitizeActions,
  sanitizeMessages,
  sanitizeQueueConfig,
  type QueueCandidate,
} from '@/lib/retentionQueue'
import { overdueRatio } from '@/lib/retentionView'

// The CS "Retention" list. Limited on purpose: only what is needed to decide
// who to call and why — no revenue totals, no health breakdowns.
export const dynamic = 'force-dynamic'

// Pool cap: this goes to the browser (not Supabase), it only bounds payload size.
const MAX_POOL = 400

export async function GET() {
  try {
    const settings = await readOrderSettings()
    const retention: RetentionConfig = settings.retention || DEFAULT_RETENTION_CONFIG
    const config = sanitizeQueueConfig(retention.queue)
    const actions = sanitizeActions(retention.actions)
    const messages = sanitizeMessages(retention.messages)
    const edges = bucketEdges(retention)
    const now = Date.now()

    const card = (c: QueueCandidate) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      days: c.days,
      stage: c.stage,
      bucket: bucketIndex(c.days, edges),
      tag: reasonTag(c),
      orders: c.intel ? Number(c.intel.totalOrders) || 0 : null,
      spend: c.intel ? Math.round(Number(c.intel.totalRevenue) || 0) : null,
      segment: c.intel?.lifecycleStage || null,
      usualGapDays: c.intel?.typicalIntervalDays != null ? Math.round(Number(c.intel.typicalIntervalDays)) : null,
      lateBy: c.intel ? overdueRatio(c.days, c.intel.typicalIntervalDays) : null,
      openComplaints: c.openComplaints,
      complaints: (c.complaints || []).slice(0, 5),
    })

    const staging = await readRetentionStaging(retention)
    const rows = [...staging.byStage[1], ...staging.byStage[2], ...staging.byStage[3]]
    const [contacts, recent] = await Promise.all([
      readContactsForCustomers(rows.map((r) => r.id)),
      readContactsSince(new Date(now - 36 * 3_600_000).toISOString()),
    ])

    const tableReady = !contacts.tableMissing && !recent.tableMissing
    const candidates = toCandidates(rows, staging.customerById, latestNextCall(contacts.rows))
    const queue = buildQueue(candidates, config, now)

    const today = cairoDateString()
    const doneToday = recent.rows.filter((c) => cairoDateString(c.contactedAt) === today)
    const byAgent: Record<string, number> = {}
    for (const c of doneToday) byAgent[c.agent] = (byAgent[c.agent] || 0) + 1

    return NextResponse.json({
      tableReady,
      error: staging.error,
      config,
      actions,
      messages,
      edges,
      // Everyone who still needs a call (both lanes), by days without an order.
      bucketCounts: countBuckets([...queue.service, ...queue.pool], edges),
      service: queue.service.map(card),
      winback: queue.pool.slice(0, MAX_POOL).map(card),
      dailySize: config.dailySize,
      moreWaiting: queue.moreWaiting,
      doneToday: doneToday.length,
      doneTodayByAgent: byAgent,
      instashopExcluded: staging.instashopExcluded,
      scoresUpdatedAt: staging.scoresUpdatedAt || null,
    })
  } catch (err) {
    console.error('[retention] queue failed:', err)
    return NextResponse.json({ error: 'Failed to build the call list' }, { status: 500 })
  }
}
