// CS edits to an order the branch has already prepared ("جاهز") or sent out.
// The branch must hear about them: the invoice/receipt was produced from the
// earlier quantities (order 131126online1: CS raised a line from 1 to 2 after
// the branch marked it ready, and the receipt no longer matched the system).
//
// The line-level detail rides on the edit_history row the save already writes
// (details.lateEdit = true), so this adds no extra write; the notification bell
// reads it through the history query it already runs.

/** Delivery statuses after which a CS edit has to be announced to the branch. */
export const LATE_EDIT_STATUSES = ['جاهز', 'في الطريق']

export const isLateEditStatus = (status: unknown) => LATE_EDIT_STATUSES.includes(String(status ?? ''))

export interface LineSnapshot {
  quantity: number
  weightGrams: number
  unitPrice: number
}

export interface LineChange {
  itemId: string | null
  productName: string
  pricingMode?: 'unit' | 'weight'
  added?: boolean
  removed?: boolean
  qtyChange?: { from: number; to: number }
  weightChange?: { fromGrams: number; toGrams: number; newUnitPrice?: number }
  priceChange?: { from: number; to: number }
}

const n = (v: unknown) => {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}
const differs = (a: unknown, b: unknown, tol = 0.0005) => Math.abs(n(a) - n(b)) > tol

export interface LinePair {
  itemId: string | null
  productName: string
  isWeightMode: boolean
  /** The saved line this one replaces; null for a line CS just added. */
  prior: LineSnapshot | null
  next: LineSnapshot
}

/** What CS changed per line: quantity, weight (weight-priced lines only), price, added and removed lines. */
export function diffOrderLines(
  pairs: LinePair[],
  removed: Array<{ itemId: string | null; productName: string; prior: LineSnapshot }>,
): LineChange[] {
  const out: LineChange[] = []
  for (const p of pairs) {
    const base = { itemId: p.itemId, productName: p.productName, pricingMode: (p.isWeightMode ? 'weight' : 'unit') as 'unit' | 'weight' }
    if (!p.prior) {
      out.push({ ...base, added: true, qtyChange: { from: 0, to: n(p.next.quantity) } })
      continue
    }
    const change: LineChange = { ...base }
    if (differs(p.prior.quantity, p.next.quantity)) change.qtyChange = { from: n(p.prior.quantity), to: n(p.next.quantity) }
    if (p.isWeightMode && differs(p.prior.weightGrams, p.next.weightGrams)) {
      change.weightChange = { fromGrams: n(p.prior.weightGrams), toGrams: n(p.next.weightGrams), newUnitPrice: n(p.next.unitPrice) }
    } else if (differs(p.prior.unitPrice, p.next.unitPrice, 0.005)) {
      change.priceChange = { from: n(p.prior.unitPrice), to: n(p.next.unitPrice) }
    }
    if (change.qtyChange || change.weightChange || change.priceChange) out.push(change)
  }
  for (const r of removed) {
    out.push({ itemId: r.itemId, productName: r.productName, pricingMode: undefined, removed: true, qtyChange: { from: n(r.prior.quantity), to: 0 } })
  }
  return out
}

const kg = (g: number) => `${(g / 1000).toFixed(2)} كج`

/** One short Arabic line for the bell, e.g. «لحم مفروم: الكمية 1 → 2». */
export function describeLineChange(c: LineChange): string {
  const name = c.productName || 'منتج'
  if (c.added) return `${name}: أُضيف (الكمية ${c.qtyChange?.to ?? ''})`
  if (c.removed) return `${name}: حُذف`
  const parts: string[] = []
  if (c.qtyChange) parts.push(`الكمية ${c.qtyChange.from} → ${c.qtyChange.to}`)
  if (c.weightChange) parts.push(`الوزن ${kg(c.weightChange.fromGrams)} → ${kg(c.weightChange.toGrams)}`)
  if (c.priceChange) parts.push(`السعر ${c.priceChange.from} → ${c.priceChange.to}`)
  return `${name}: ${parts.join('، ')}`
}

export function describeLateEdit(changes: LineChange[], max = 3): string {
  const lines = changes.slice(0, max).map(describeLineChange)
  const more = changes.length - lines.length
  return lines.join(' · ') + (more > 0 ? ` · +${more} أخرى` : '')
}
