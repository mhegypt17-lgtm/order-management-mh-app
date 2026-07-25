'use client'

import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'

// Read-only "published board" of discount / voucher codes. Mirrors the
// delivery section pattern (DeliveryZonesTable rendered with editable=false in
// branch / CS): the admin creates & manages codes in Settings, and this board
// simply publishes them so branch and CS staff can see every code, what
// discount it produces, and its conditions at a glance.
//
// Source of truth is /api/discount-codes — exactly the same data the admin
// edits — so nothing here is hard-coded; it always reflects the admin
// settings.

interface DiscountCode {
  id: string
  code: string
  type: 'percent' | 'value'
  amount: number
  maxDiscount?: number | null
  minOrderTotal?: number | null
  isActive: boolean
  expiresAt?: string | null
  usageLimit?: number | null
  usedCount: number
  createdAt: string
  updatedAt: string
}

function describeDiscount(c: DiscountCode): string {
  const base =
    c.type === 'percent'
      ? `خصم ${c.amount}% على إجمالي الطلب`
      : `خصم ${c.amount.toLocaleString()} ج.م على الطلب`
  const parts: string[] = [base]
  if (c.type === 'percent' && c.maxDiscount != null && c.maxDiscount > 0) {
    parts.push(`بحد أقصى ${c.maxDiscount.toLocaleString()} ج.م`)
  }
  if (c.minOrderTotal != null && c.minOrderTotal > 0) {
    parts.push(`للطلبات من ${c.minOrderTotal.toLocaleString()} ج.م فأكثر`)
  }
  return parts.join(' — ')
}

// A code is "live" (usable right now) only when it is active, not past its
// expiry date, and hasn't hit its usage limit. This matches the server-side
// rules in evaluateDiscountCode so the board never shows a code as usable that
// the order form would then reject.
function codeState(c: DiscountCode): { live: boolean; label: string; tone: string } {
  if (!c.isActive) return { live: false, label: 'غير مفعّل', tone: 'bg-gray-100 text-gray-600 border-gray-300' }
  if (c.expiresAt && new Date(c.expiresAt) < new Date()) {
    return { live: false, label: 'منتهي الصلاحية', tone: 'bg-red-100 text-red-700 border-red-300' }
  }
  if (c.usageLimit != null && c.usedCount >= c.usageLimit) {
    return { live: false, label: 'اكتمل الاستخدام', tone: 'bg-amber-100 text-amber-800 border-amber-300' }
  }
  return { live: true, label: 'نشط', tone: 'bg-green-100 text-green-700 border-green-300' }
}

function formatDate(iso?: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return '—'
  }
}

export default function DiscountCodesBoard() {
  const [codes, setCodes] = useState<DiscountCode[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [onlyActive, setOnlyActive] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/discount-codes', { cache: 'no-store' })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setCodes(Array.isArray(data) ? data : [])
    } catch {
      toast.error('تعذر تحميل الأكواد')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return codes
      .filter((c) => {
        if (onlyActive && !codeState(c).live) return false
        if (q && !c.code.toLowerCase().includes(q)) return false
        return true
      })
      .sort((a, b) => {
        // Live codes first, then by code name.
        const la = codeState(a).live ? 0 : 1
        const lb = codeState(b).live ? 0 : 1
        if (la !== lb) return la - lb
        return a.code.localeCompare(b.code)
      })
  }, [codes, search, onlyActive])

  const liveCount = useMemo(() => codes.filter((c) => codeState(c).live).length, [codes])

  return (
    <div className="max-w-5xl mx-auto px-4 py-6" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🏷️ أكواد الخصم والقسائم</h1>
          <p className="text-sm text-gray-500 mt-1">
            كل الأكواد المعتمدة من الإدارة — الاسم والخصم الذي يطبّقه وشروطه. للعرض فقط.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 border border-green-200 rounded-lg px-3 py-1.5 text-sm font-semibold">
            {liveCount} كود نشط
          </span>
          <button
            type="button"
            onClick={load}
            className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold"
          >
            🔄 تحديث
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث بالكود (مثال: OWN10)"
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 text-right"
        />
        <label className="inline-flex items-center gap-2 text-sm text-gray-700 select-none">
          <input
            type="checkbox"
            checked={onlyActive}
            onChange={(e) => setOnlyActive(e.target.checked)}
          />
          الأكواد النشطة فقط
        </label>
      </div>

      {loading ? (
        <div className="p-8 text-center text-gray-500">⏳ جاري تحميل الأكواد...</div>
      ) : filtered.length === 0 ? (
        <div className="p-8 text-center text-gray-500 bg-white border border-gray-200 rounded-xl">
          لا توجد أكواد {onlyActive ? 'نشطة ' : ''}للعرض
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((c) => {
            const state = codeState(c)
            return (
              <div
                key={c.id}
                className={`border rounded-xl p-4 bg-white ${
                  state.live ? 'border-amber-200' : 'border-gray-200 opacity-80'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="font-mono text-lg font-bold tracking-wide text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1">
                    {c.code}
                  </span>
                  <span className={`text-xs font-semibold rounded-full px-2.5 py-1 border ${state.tone}`}>
                    {state.label}
                  </span>
                </div>
                <p className="text-sm text-gray-800 font-medium">{describeDiscount(c)}</p>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                  <span>ينتهي: {formatDate(c.expiresAt)}</span>
                  {c.usageLimit != null && (
                    <span>
                      الاستخدام: {c.usedCount} / {c.usageLimit}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
