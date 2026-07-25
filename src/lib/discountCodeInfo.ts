'use client'

import { useEffect, useState } from 'react'

// Lightweight client-side lookup of discount-code definitions so order views
// can show the *brief* of the discount that was applied (e.g. "خصم 10%" for
// OWN10) — not just the flat EGP amount stored on the order. The order row only
// persists { discountCode, discountAmount }; the percent/value rule lives on
// the discount_codes record, so we fetch the published list (same open GET the
// codes board uses) and map code -> { type, amount }.

export type DiscountCodeBrief = { type: 'percent' | 'value'; amount: number }

export function useDiscountCodeInfo() {
  const [map, setMap] = useState<Record<string, DiscountCodeBrief>>({})

  useEffect(() => {
    let active = true
    fetch('/api/discount-codes', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: any[]) => {
        if (!active || !Array.isArray(data)) return
        const m: Record<string, DiscountCodeBrief> = {}
        for (const c of data) {
          const code = String(c?.code || '').trim().toUpperCase()
          if (!code) continue
          m[code] = {
            type: c?.type === 'value' ? 'value' : 'percent',
            amount: Number(c?.amount) || 0,
          }
        }
        setMap(m)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  return map
}

/**
 * Human-readable brief of the discount a code creates, e.g. "خصم 10%" or
 * "خصم 50 ج.م". Returns '' when the rule is unknown.
 */
export function describeDiscountBrief(info?: DiscountCodeBrief | null): string {
  if (!info || !info.amount) return ''
  return info.type === 'percent'
    ? `خصم ${info.amount}%`
    : `خصم ${info.amount.toLocaleString()} ج.م`
}
