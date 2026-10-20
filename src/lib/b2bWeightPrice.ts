export function committedB2BPricePerKg(
  orderType: string,
  item: { unitPrice: number; weightGrams: number },
): number | null {
  if (orderType !== 'B2B') return null
  const weight = Number(item.weightGrams)
  const price = Number(item.unitPrice)
  if (!Number.isFinite(weight) || weight <= 0 || !Number.isFinite(price) || price < 0) {
    throw new Error('تعذر تحديد سعر الكيلو المتفق عليه — يجب مراجعة سعر ووزن بند B2B من خدمة العملاء')
  }
  // unitPrice already includes this line's current weight, not its original
  // pre-branch weight. Catalogue snapshots are reference prices, not consent.
  return price / (weight / 1000)
}
