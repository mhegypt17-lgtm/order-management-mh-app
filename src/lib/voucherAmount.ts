// The voucher discount shown on the CS order form must follow the live basket.
// The order row stores only the discount *amount* from the last time it was
// calculated; if the lines changed afterwards (e.g. the branch re-weighed) that
// amount is stale, and the form showed a stored discount next to a live
// subtotal (order 111126app1: 220.73 shown, 222.10 is 5% of 4,442.03).
// This mirrors the server's evaluateDiscountCode() so the screen matches what
// a save will store.

export interface VoucherRule {
  type: 'percent' | 'value'
  amount: number
  maxDiscount?: number | null
  minOrderTotal?: number | null
  /** Active, not expired and not used up. When false the stored amount is kept (the server decides on save). */
  usable?: boolean
}

export function liveVoucherDiscount(rule: VoucherRule | null | undefined, gross: number, storedAmount: number): number {
  if (!rule || rule.usable === false || !(rule.amount > 0)) return storedAmount
  if (rule.minOrderTotal != null && gross < rule.minOrderTotal) return storedAmount
  let discount = rule.type === 'percent' ? (gross * rule.amount) / 100 : rule.amount
  if (rule.maxDiscount != null) discount = Math.min(discount, rule.maxDiscount)
  discount = Math.min(discount, gross)
  return parseFloat(Math.max(0, discount).toFixed(2))
}
