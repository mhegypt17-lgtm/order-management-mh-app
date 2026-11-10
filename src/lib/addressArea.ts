// Delivery area name for an order's address: "المنطقة" (area) plus the
// optional sub-area, e.g. "التجمع الخامس - التجمع". Returns '' when the
// address has no area, so callers can show a placeholder or leave the line out.
const clean = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim()

export function formatAreaName(area?: unknown, subArea?: unknown): string {
  const a = clean(area)
  const s = clean(subArea)
  if (!a) return s
  if (!s || s === a) return a
  return `${a} - ${s}`
}
