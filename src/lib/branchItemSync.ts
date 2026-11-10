// Keeps the branch order screen in step with changes customer service makes
// to an order's lines after the branch has opened it.
//
// Rules:
//  - The saved lines always come from the server's fresh copy.
//  - A line CS did not change keeps the branch worker's unsaved draft.
//  - A line CS changed (quantity / weight / added / removed) takes the fresh
//    values and discards any unsaved draft on it, and is reported so the
//    screen can tell the branch what changed.

export interface ItemDraft {
  quantity: number
  weightGrams: number
  weightDraft: string
}

interface SyncItem {
  id: string
  productName?: string
  quantity: number
  weightGrams: number
}

export interface CsLineChange {
  kind: 'changed' | 'added' | 'removed'
  productName: string
  fromQuantity?: number
  toQuantity?: number
  fromWeightGrams?: number
  toWeightGrams?: number
  /** The branch had typed an unsaved edit on this line, now replaced. */
  discardedDraft: boolean
}

const EPS = 1e-9
const differs = (a: unknown, b: unknown) => Math.abs((Number(a) || 0) - (Number(b) || 0)) > EPS

export function draftFromItem(it: { quantity: number; weightGrams: number }): ItemDraft {
  return {
    quantity: Number(it.quantity) || 1,
    weightGrams: Number(it.weightGrams) || 0,
    weightDraft: it.weightGrams ? (Number(it.weightGrams) / 1000).toString() : '',
  }
}

export function reconcileItems<T extends SyncItem>(
  prevItems: T[],
  freshItems: T[],
  drafts: Record<string, ItemDraft>,
): { items: T[]; drafts: Record<string, ItemDraft>; changes: CsLineChange[] } {
  const prevById = new Map(prevItems.map((i) => [i.id, i]))
  const freshIds = new Set(freshItems.map((i) => i.id))
  const nextDrafts: Record<string, ItemDraft> = {}
  const changes: CsLineChange[] = []

  for (const f of freshItems) {
    const p = prevById.get(f.id)
    const d = drafts[f.id]
    const hadUnsavedDraft = !!(p && d && (differs(d.quantity, p.quantity) || differs(d.weightGrams, p.weightGrams)))

    if (!p) {
      nextDrafts[f.id] = draftFromItem(f)
      changes.push({
        kind: 'added',
        productName: f.productName || '',
        toQuantity: Number(f.quantity),
        toWeightGrams: Number(f.weightGrams),
        discardedDraft: false,
      })
      continue
    }

    if (differs(p.quantity, f.quantity) || differs(p.weightGrams, f.weightGrams)) {
      nextDrafts[f.id] = draftFromItem(f)
      changes.push({
        kind: 'changed',
        productName: f.productName || p.productName || '',
        fromQuantity: Number(p.quantity),
        toQuantity: Number(f.quantity),
        fromWeightGrams: Number(p.weightGrams),
        toWeightGrams: Number(f.weightGrams),
        discardedDraft: hadUnsavedDraft,
      })
      continue
    }

    nextDrafts[f.id] = d || draftFromItem(f)
  }

  for (const p of prevItems) {
    if (freshIds.has(p.id)) continue
    changes.push({
      kind: 'removed',
      productName: p.productName || '',
      fromQuantity: Number(p.quantity),
      fromWeightGrams: Number(p.weightGrams),
      discardedDraft: false,
    })
  }

  return { items: freshItems, drafts: nextDrafts, changes }
}

/** One-line Arabic description of a change, for the notice on the branch screen. */
export function describeCsChange(c: CsLineChange): string {
  const name = c.productName || 'بند'
  if (c.kind === 'added') return `${name}: بند جديد (الكمية ${c.toQuantity})`
  if (c.kind === 'removed') return `${name}: تم حذف البند`
  const parts: string[] = []
  if (differs(c.fromQuantity, c.toQuantity)) parts.push(`الكمية ${c.fromQuantity} ← ${c.toQuantity}`)
  if (differs(c.fromWeightGrams, c.toWeightGrams)) parts.push('الوزن')
  return `${name}: ${parts.join('، ')}${c.discardedDraft ? ' (استُبدل تعديلك غير المحفوظ)' : ''}`
}
