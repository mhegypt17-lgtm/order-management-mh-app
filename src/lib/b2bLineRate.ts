// B2B negotiated price per kg for weight-priced lines.
//
// A B2B agent may sell a weight line above the catalogue price (e.g. عكاوى at
// 540 per kg when the B2B list says 518). The line's own price per kg is
// therefore `unitPrice / (weightGrams / 1000)` and must survive later weight
// changes; deriving it from the catalogue every time silently dropped the
// negotiated price (order 021126b2b2).

const tidy = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Price per kg implied by a line, or null when it can't be derived. */
export function lineRatePerKg(unitPrice: unknown, weightGrams: unknown): number | null {
  const price = tidy(unitPrice)
  const grams = tidy(weightGrams)
  if (!(price > 0) || !(grams > 0)) return null
  return price / (grams / 1000)
}

/**
 * Price per kg the form should use when the weight of a line changes. B2B lines
 * keep their own agreed rate; everything else follows the catalogue.
 */
export function effectivePricePerKg(opts: {
  isB2B: boolean
  lineRate: number | null | undefined
  catalogueRate: number
}): number {
  const rate = Number(opts.lineRate)
  return opts.isB2B && Number.isFinite(rate) && rate > 0 ? rate : opts.catalogueRate
}

export interface RateGuardLine {
  productName: string
  /** Only weight-priced catalogue lines are checked. */
  isWeightMode: boolean
  incoming: { unitPrice: number; weightGrams: number; priceEdited?: boolean }
  /** The saved line this one replaces, or null for a brand-new line. */
  prior: { unitPrice: number; weightGrams: number } | null
}

export interface LoweredRate {
  productName: string
  priorPerKg: number
  incomingPerKg: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Lines of an existing B2B order whose price per kg would DROP in this save
 * without the agent having edited the price (the client sets `priceEdited`
 * when the agent types a new price, changes the product or refreshes prices).
 * The tolerance covers the 2-decimal rounding of both stored line prices.
 */
export function findLoweredB2BRates(
  existingOrderType: string,
  incomingOrderType: string,
  lines: RateGuardLine[],
): LoweredRate[] {
  if (existingOrderType !== 'B2B' || incomingOrderType !== 'B2B') return []
  const lowered: LoweredRate[] = []
  for (const line of lines) {
    if (!line.isWeightMode || !line.prior || line.incoming.priceEdited === true) continue
    const priorRate = lineRatePerKg(line.prior.unitPrice, line.prior.weightGrams)
    const incomingKg = tidy(line.incoming.weightGrams) / 1000
    if (priorRate == null || !(incomingKg > 0)) continue
    const priorKg = tidy(line.prior.weightGrams) / 1000
    const expectedUnit = priorRate * incomingKg
    const tolerance = 0.011 + 0.005 * (incomingKg / priorKg)
    const incomingUnit = tidy(line.incoming.unitPrice)
    if (incomingUnit < expectedUnit - tolerance) {
      lowered.push({
        productName: line.productName,
        priorPerKg: round2(priorRate),
        incomingPerKg: round2(incomingUnit / incomingKg),
      })
    }
  }
  return lowered
}

export function describeLoweredRates(lowered: LoweredRate[]): string {
  const parts = lowered.map((l) => `«${l.productName}»: ${l.priorPerKg} ← ${l.incomingPerKg} ج.م/كج`)
  return `سعر الكيلو في بند B2B انخفض عن السعر المتفق عليه (${parts.join('، ')}) — لم يتم حفظ الطلب. أعد السعر المتفق عليه، أو اكتب السعر الجديد يدويًا في خانة سعر الوحدة لتأكيد التخفيض`
}
