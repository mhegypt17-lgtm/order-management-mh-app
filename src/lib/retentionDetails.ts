// Assembles the "talking points" drawer for one customer from already-read
// rows. Pure: the API route does the reads (on demand, when a drawer opens).

import { FEEDBACK_DIMENSIONS, findOption } from '@/lib/feedbackDimensions'
import { reasonLabel, resultLabel, suggestOpening, type ContactAction } from '@/lib/retentionQueue'

const num = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export interface DetailsInput {
  name: string
  days: number
  customer: { wallet?: number | null; status?: string | null; statusReason?: string | null; isB2B?: boolean | null } | null
  /** Non-cancelled orders of this customer. */
  orders: Array<{ id: string; createdAt: string; orderTotal: number; orderType?: string | null }>
  items: Array<{ orderId: string; productId: string | null; quantity: number; isCustomItem?: boolean | null; customItemName?: string | null }>
  productNames: Map<string, string>
  feedback: Array<Record<string, any>>
  complaints: Array<{ reason?: string | null; subject?: string | null; status: string; compensationAmount?: number | null; openedAt?: string | null }>
  intel: Record<string, any> | null
  contacts: Array<{ contactedAt: string; agent: string; result: string; reason: string | null; note?: string | null }>
  /** The admin's configured action list, to label earlier calls. */
  actions?: ContactAction[]
}

const itemName = (i: DetailsInput['items'][number], names: Map<string, string>) =>
  i.isCustomItem ? i.customItemName || 'منتج مخصص' : (i.productId && names.get(i.productId)) || ''

export function buildCustomerDetails(input: DetailsInput) {
  // Favourites: total quantity per product across the customer's orders.
  const totals = new Map<string, number>()
  for (const it of input.items) {
    const name = itemName(it, input.productNames)
    if (!name) continue
    totals.set(name, (totals.get(name) || 0) + (num(it.quantity) || 1))
  }
  const favourites = Array.from(totals, ([name, quantity]) => ({ name, quantity }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 3)

  const orders = input.orders.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  const last = orders[0] || null
  const lastOrder = last
    ? {
        date: last.createdAt,
        total: num(last.orderTotal),
        type: last.orderType || null,
        items: input.items
          .filter((i) => i.orderId === last.id)
          .map((i) => ({ name: itemName(i, input.productNames), quantity: num(i.quantity) || 1 }))
          .filter((i) => i.name),
      }
    : null

  const fb = input.feedback.slice().sort((a, b) => new Date(b.collectedAt || b.createdAt || 0).getTime() - new Date(a.collectedAt || a.createdAt || 0).getTime())
  const lastFb = fb[0] || null
  const dimensions = lastFb
    ? FEEDBACK_DIMENSIONS.map((dim) => {
        const option = findOption(dim, lastFb[dim.key])
        return option && option.score != null ? { label: dim.label, score: option.score } : null
      }).filter((d): d is { label: string; score: number } => d !== null)
    : []
  const weakDimension = dimensions.length ? dimensions.reduce((a, b) => (b.score < a.score ? b : a)) : null
  const ratings = fb.map((f) => num(f.rating)).filter((r) => r > 0)
  const survey = lastFb
    ? {
        count: fb.length,
        avg: ratings.length ? Math.round((ratings.reduce((s, r) => s + r, 0) / ratings.length) * 10) / 10 : null,
        lastRating: num(lastFb.rating) || null,
        lastComment: String(lastFb.comment || '').trim() || null,
        lastDate: lastFb.collectedAt || lastFb.createdAt || null,
        dimensions,
        weakDimension: weakDimension && weakDimension.score <= 2 ? weakDimension : null,
        recommend: lastFb.recommendToFriends ? String(lastFb.recommendToFriends) : null,
        followUpRequired: !!lastFb.followUpRequired,
      }
    : null

  const complaintsSorted = input.complaints.slice().sort((a, b) => new Date(b.openedAt || 0).getTime() - new Date(a.openedAt || 0).getTime())
  const openComplaints = input.complaints.filter((c) => c.status !== 'closed').length
  const lastComplaint = complaintsSorted[0] || null
  const complaints = lastComplaint
    ? {
        count: input.complaints.length,
        open: openComplaints,
        totalCompensation: input.complaints.reduce((s, c) => s + num(c.compensationAmount), 0),
        last: { reason: lastComplaint.reason || null, subject: lastComplaint.subject || null, status: lastComplaint.status, date: lastComplaint.openedAt || null },
        list: complaintsSorted.slice(0, 5).map((c) => ({
          date: c.openedAt || null,
          title: String(c.subject || c.reason || '').trim() || 'شكوى',
          status: c.status,
        })),
      }
    : null

  // "Retention %" is how close the customer is to their own ordering rhythm,
  // so it only means something once there is a rhythm (2+ orders). A one-order
  // customer is scored 100 by default — showing that would be misleading.
  const hasRhythm = num(input.intel?.typicalIntervalDays) > 0
  const intel = input.intel
    ? {
        lifecycleStage: input.intel.lifecycleStage ?? null,
        r: input.intel.r ?? null,
        f: input.intel.f ?? null,
        m: input.intel.m ?? null,
        healthScore: input.intel.healthScore ?? null,
        healthBreakdown: input.intel.healthBreakdown
          ? { ...input.intel.healthBreakdown, retention: hasRhythm ? input.intel.healthBreakdown.retention ?? null : null }
          : null,
        totalOrders: num(input.intel.totalOrders),
        typicalIntervalDays: hasRhythm ? num(input.intel.typicalIntervalDays) : null,
        retentionPct: hasRhythm ? input.intel.retentionPct ?? null : null,
        cohortMonth: input.intel.cohortMonth ?? null,
        isReactivated: !!input.intel.isReactivatedOpportunity,
        isSpendingUp: !!input.intel.isSpendingUp,
      }
    : null

  const contacts = input.contacts
    .slice()
    .sort((a, b) => new Date(b.contactedAt).getTime() - new Date(a.contactedAt).getTime())
    .slice(0, 5)
    .map((c) => ({
      at: c.contactedAt,
      agent: c.agent,
      result: resultLabel(c.result, input.actions),
      reason: c.reason ? reasonLabel(c.reason) : null,
      note: String(c.note || '').trim() || null,
    }))

  const opening = suggestOpening({
    name: input.name,
    openComplaints,
    lastComplaintReason: complaints?.last.reason,
    weakDimension: survey?.weakDimension || null,
    favouriteProduct: favourites[0]?.name || null,
    lifecycleStage: intel?.lifecycleStage,
    days: input.days,
  })

  return {
    favourites,
    lastOrder,
    isB2B: !!input.customer?.isB2B || lastOrder?.type === 'B2B',
    wallet: num(input.customer?.wallet),
    status: input.customer?.status || 'active',
    statusReason: input.customer?.statusReason || null,
    survey,
    complaints,
    intel,
    contacts,
    opening,
  }
}
