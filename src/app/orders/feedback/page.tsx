'use client'

// /orders/feedback
// Filterable, searchable list of every customer feedback. Used by CS leads
// and admins for monthly review and trend spotting.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/lib/auth'
import { formatCairoDateTime, cairoFirstDayOfMonth, cairoDateString } from '@/lib/cairoTime'
import {
  FEEDBACK_DIMENSIONS,
  TONE_BADGE,
  findOption,
  getEscalationReasons,
  type FeedbackDimensionKey,
} from '@/lib/feedbackDimensions'

type Feedback = {
  id: string
  orderId: string
  customerId: string | null
  customerName: string | null
  customerPhone: string | null
  rating: number
  comment: string
  collectedBy: string
  collectedAt: string
  contactChannel: string | null
  followUpRequired: boolean
  escalatedComplaintId: string | null
  productQuality: string | null
  packaging: string | null
  packagingOther: string | null
  deliveryTimeliness: string | null
  customerService: string | null
  customerServiceOther: string | null
  pricingValue: string | null
  appUsability: string | null
  recommendToFriends: string | null
}

const RATING_BUCKETS = [
  { value: 'all', label: 'كل التقييمات', ratingMin: undefined, ratingMax: undefined },
  { value: 'positive', label: '😍 إيجابية (4-5)', ratingMin: 4, ratingMax: undefined },
  { value: 'neutral', label: '😐 محايدة (3)', ratingMin: 3, ratingMax: 3 },
  { value: 'negative', label: '😡 سلبية (1-2)', ratingMin: undefined, ratingMax: 2 },
] as const

function ratingTone(rating: number): string {
  if (rating >= 4) return 'bg-emerald-50 border-emerald-300 text-emerald-900'
  if (rating === 3) return 'bg-yellow-50 border-yellow-300 text-yellow-900'
  return 'bg-red-50 border-red-300 text-red-900'
}

function Stars({ rating }: { rating: number }) {
  return (
    <span dir="ltr" className="font-bold tracking-tight">
      <span className="text-yellow-400">{'★'.repeat(rating)}</span>
      <span className="text-gray-300">{'★'.repeat(5 - rating)}</span>
    </span>
  )
}

export default function FeedbackListPage() {
  const { user } = useAuthStore()
  const [rows, setRows] = useState<Feedback[]>([])
  const [loading, setLoading] = useState(true)
  const [from, setFrom] = useState(cairoFirstDayOfMonth())
  const [to, setTo] = useState(cairoDateString())
  const [bucket, setBucket] = useState<(typeof RATING_BUCKETS)[number]['value']>('all')
  const [agentFilter, setAgentFilter] = useState('')
  const [search, setSearch] = useState('')
  // Dimension drill-down: { 'productQuality': 'جودة منخفضة', ... }
  const [dimFilters, setDimFilters] = useState<Partial<Record<FeedbackDimensionKey, string>>>({})
  const [escalatingId, setEscalatingId] = useState<string | null>(null)

  const escalateRow = async (row: Feedback) => {
    if (!confirm('سيتم فتح تذكرة شكوى مرتبطة بهذا التقييم. المتابعة؟')) return
    setEscalatingId(row.id)
    try {
      const res = await fetch('/api/feedback/escalate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedbackId: row.id, by: user.name }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json?.error || 'فشل فتح الشكوى')
        return
      }
      toast.success(json.alreadyExists ? 'الشكوى مفتوحة بالفعل' : 'تم فتح تذكرة الشكوى')
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, escalatedComplaintId: json.complaintId } : r)),
      )
    } catch (e: any) {
      toast.error(e?.message || 'فشل فتح الشكوى')
    } finally {
      setEscalatingId(null)
    }
  }

  const load = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ from, to })
      const b = RATING_BUCKETS.find((b) => b.value === bucket)!
      if (b.ratingMin) params.set('ratingMin', String(b.ratingMin))
      if (b.ratingMax) params.set('ratingMax', String(b.ratingMax))
      if (agentFilter) params.set('collectedBy', agentFilter)
      const res = await fetch(`/api/feedback?${params.toString()}`, { cache: 'no-store' })
      const json = await res.json()
      setRows(Array.isArray(json?.feedback) ? json.feedback : [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, bucket, agentFilter])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    let out = rows
    // Apply dimension drill-down filters client-side (API doesn't support yet)
    const activeDims = Object.entries(dimFilters).filter(([, v]) => v) as Array<[FeedbackDimensionKey, string]>
    if (activeDims.length > 0) {
      out = out.filter((r) =>
        activeDims.every(([k, v]) => (r as Record<string, unknown>)[k] === v),
      )
    }
    if (!term) return out
    return out.filter(
      (r) =>
        r.comment.toLowerCase().includes(term) ||
        r.collectedBy.toLowerCase().includes(term) ||
        r.orderId.toLowerCase().includes(term) ||
        (r.customerName || '').toLowerCase().includes(term) ||
        (r.customerPhone || '').toLowerCase().includes(term),
    )
  }, [rows, search, dimFilters])

  const stats = useMemo(() => {
    if (rows.length === 0) return { count: 0, avg: 0, positivePct: 0 }
    const total = rows.reduce((s, r) => s + (r.rating || 0), 0)
    const positive = rows.filter((r) => r.rating >= 4).length
    return {
      count: rows.length,
      avg: total / rows.length,
      positivePct: (positive / rows.length) * 100,
    }
  }, [rows])

  const agents = useMemo(() => {
    const s = new Set<string>()
    rows.forEach((r) => r.collectedBy && s.add(r.collectedBy))
    return Array.from(s).sort()
  }, [rows])

  return (
    <div className="space-y-4" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">⭐ تقييمات العملاء</h1>
        <p className="text-sm text-gray-600 mt-1">عرض وتصفية جميع التقييمات المسجلة بعد التوصيل.</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500">عدد التقييمات في الفترة</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{stats.count.toLocaleString()}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500">متوسط التقييم</div>
          <div className="text-2xl font-bold text-yellow-600 mt-1">{stats.avg.toFixed(2)} / 5</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500">نسبة الرضا (4-5)</div>
          <div className="text-2xl font-bold text-emerald-600 mt-1">{stats.positivePct.toFixed(1)}%</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">من تاريخ</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">إلى تاريخ</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">نطاق التقييم</label>
            <select
              value={bucket}
              onChange={(e) => setBucket(e.target.value as typeof bucket)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              {RATING_BUCKETS.map((b) => (
                <option key={b.value} value={b.value}>{b.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">جامع التقييم</label>
            <select
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">الكل</option>
              {agents.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 بحث بالاسم أو التليفون أو التعليقات أو رقم الطلب..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
        />

        {/* Dimension drill-down filters */}
        <div className="pt-3 border-t border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-700">تصفية حسب بعد محدد</span>
            {Object.values(dimFilters).some(Boolean) && (
              <button
                type="button"
                onClick={() => setDimFilters({})}
                className="text-[11px] text-red-600 hover:text-red-800"
              >
                ✕ مسح التصفيات
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {FEEDBACK_DIMENSIONS.map((dim) => (
              <select
                key={dim.key}
                value={dimFilters[dim.key] || ''}
                onChange={(e) =>
                  setDimFilters((d) => ({ ...d, [dim.key]: e.target.value || undefined }))
                }
                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-xs"
              >
                <option value="">{dim.icon} {dim.label} — الكل</option>
                {dim.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.value}
                  </option>
                ))}
              </select>
            ))}
          </div>
        </div>
      </div>

      {/* List */}
      <div className="space-y-2">
        {loading ? (
          <div className="text-center py-12 text-gray-500">⏳ جاري التحميل...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-500 bg-white rounded-xl border border-gray-200">
            لا توجد تقييمات مطابقة للفلاتر.
          </div>
        ) : (
          filtered.map((row) => (
            <div
              key={row.id}
              className={`rounded-xl border p-4 ${ratingTone(row.rating)}`}
            >
              <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xl">
                    <Stars rating={row.rating} />
                  </span>
                  <span className="text-sm font-bold">{row.rating}/5</span>
                  {(row.customerName || row.customerPhone) && (
                    <span className="text-sm font-bold bg-white/70 rounded-lg px-2 py-0.5">
                      👤 {row.customerName || '—'}
                      {row.customerPhone && (
                        <a
                          href={`tel:${row.customerPhone}`}
                          className="ms-2 text-xs underline opacity-80 hover:opacity-100"
                          dir="ltr"
                        >
                          📞 {row.customerPhone}
                        </a>
                      )}
                    </span>
                  )}
                  {row.escalatedComplaintId && (
                    <span className="text-[10px] bg-white/70 px-2 py-0.5 rounded-full font-bold">
                      🎫 شكوى مفتوحة
                    </span>
                  )}
                </div>
                <div className="text-[11px] opacity-80">
                  بواسطة <strong>{row.collectedBy}</strong> ·{' '}
                  <span dir="ltr">{formatCairoDateTime(row.collectedAt, 'en-GB')}</span>
                </div>
              </div>
              {row.comment && (
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{row.comment}</p>
              )}

              {/* Dimension badges */}
              {FEEDBACK_DIMENSIONS.some((d) => (row as Record<string, unknown>)[d.key]) && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {FEEDBACK_DIMENSIONS.map((dim) => {
                    const v = (row as Record<string, unknown>)[dim.key] as string | null
                    if (!v) return null
                    const opt = findOption(dim, v)
                    const tone = opt ? TONE_BADGE[opt.tone] : 'bg-white text-gray-800 border-gray-300'
                    const other =
                      v === 'أخرى' && dim.otherField
                        ? ((row as Record<string, unknown>)[dim.otherField] as string | null)
                        : null
                    return (
                      <span
                        key={dim.key}
                        className={`text-[10px] border rounded-full px-2 py-0.5 ${tone}`}
                        title={`${dim.label}: ${v}${other ? ` — ${other}` : ''}`}
                      >
                        {dim.icon} {v}{other ? ` (${other})` : ''}
                      </span>
                    )
                  })}
                </div>
              )}

              <div className="mt-2 flex items-center justify-between text-xs gap-2 flex-wrap">
                <Link
                  href={`/orders/${row.orderId}`}
                  className="font-bold underline"
                >
                  📋 الطلب
                </Link>
                <div className="flex items-center gap-2">
                  {row.escalatedComplaintId ? (
                    <Link
                      href={`/orders/complaints?complaintId=${row.escalatedComplaintId}`}
                      className="font-bold underline"
                    >
                      عرض الشكوى ←
                    </Link>
                  ) : (
                    (row.rating <= 2 || getEscalationReasons(row).length > 0) && (
                      <button
                        type="button"
                        onClick={() => escalateRow(row)}
                        disabled={escalatingId === row.id}
                        className="text-[11px] px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold shadow disabled:opacity-50"
                        title="فتح تذكرة شكوى مرتبطة بهذا التقييم"
                      >
                        {escalatingId === row.id ? '...جاري' : '🎫 فتح شكوى'}
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
