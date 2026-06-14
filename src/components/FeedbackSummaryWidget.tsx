'use client'

// FeedbackSummaryWidget
// Single dashboard card showing avg rating, satisfaction %, collection
// rate, and (admin variant) recent low-rating list + per-agent table.
//
// Pulls from /api/feedback/summary which does the aggregation server-side
// so dashboards stay light on egress.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatCairoDateTime } from '@/lib/cairoTime'
import { FEEDBACK_DIMENSIONS } from '@/lib/feedbackDimensions'

type DimensionAgg = { answered: number; counts: Record<string, number> }

type Summary = {
  from: string
  to: string
  count: number
  deliveredCount: number
  avgRating: number
  collectionRatePct: number
  satisfactionPct: number
  byRating: Record<1 | 2 | 3 | 4 | 5, number>
  byDimension: Record<string, DimensionAgg>
  perAgent: Array<{ agent: string; count: number; avgRating: number }>
  recentLowRatings: Array<{
    id: string
    orderId: string
    rating: number
    comment: string
    collectedAt: string
    collectedBy: string
  }>
}

const TONE_BY_AVG = (avg: number) => {
  if (avg >= 4.5) return 'text-emerald-700'
  if (avg >= 3.5) return 'text-green-700'
  if (avg >= 2.5) return 'text-yellow-700'
  return 'text-red-700'
}

export default function FeedbackSummaryWidget({
  from,
  to,
  showRecent = false,
  showPerAgent = false,
}: {
  from: string
  to: string
  showRecent?: boolean
  showPerAgent?: boolean
}) {
  const [data, setData] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ from, to })
        if (showRecent) params.set('recent', '1')
        const res = await fetch(`/api/feedback/summary?${params.toString()}`, { cache: 'no-store' })
        const json = await res.json()
        setData(json && !json.error ? (json as Summary) : null)
      } catch {
        setData(null)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [from, to, showRecent])

  if (loading) {
    return (
      <section className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-sm text-gray-500">⏳ جاري تحميل تقييمات العملاء...</p>
      </section>
    )
  }

  if (!data || data.count === 0) {
    return (
      <section className="bg-white rounded-xl border border-amber-200 p-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-bold text-gray-900">⭐ تقييمات العملاء</h2>
          <Link href="/orders/feedback" className="text-xs text-blue-700 underline">
            عرض الكل ←
          </Link>
        </div>
        <p className="text-sm text-gray-500 mt-2">
          لم يتم تسجيل أي تقييمات في الفترة المختارة.
          {data?.deliveredCount && data.deliveredCount > 0 ? (
            <> ({data.deliveredCount} طلب تم توصيله بدون تقييم)</>
          ) : null}
        </p>
      </section>
    )
  }

  return (
    <section className="bg-white rounded-xl border border-amber-200 p-4 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="font-bold text-gray-900">⭐ تقييمات العملاء</h2>
          <p className="text-xs text-gray-500">من {data.from} إلى {data.to}</p>
        </div>
        <Link href="/orders/feedback" className="text-xs text-blue-700 underline">
          عرض الكل ←
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
          <div className="text-[11px] text-amber-700">متوسط التقييم</div>
          <div className={`text-2xl font-bold ${TONE_BY_AVG(data.avgRating)}`}>
            {data.avgRating.toFixed(2)} <span className="text-sm text-gray-500">/ 5</span>
          </div>
        </div>
        <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-200">
          <div className="text-[11px] text-emerald-700">نسبة الرضا (4-5)</div>
          <div className="text-2xl font-bold text-emerald-700">{data.satisfactionPct.toFixed(1)}%</div>
        </div>
        <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
          <div className="text-[11px] text-blue-700">نسبة الجمع</div>
          <div className="text-2xl font-bold text-blue-700">{data.collectionRatePct.toFixed(1)}%</div>
          <div className="text-[10px] text-blue-600 mt-0.5">
            {data.count} من {data.deliveredCount} طلب
          </div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
          <div className="text-[11px] text-gray-600">إجمالي التقييمات</div>
          <div className="text-2xl font-bold text-gray-900">{data.count.toLocaleString()}</div>
        </div>
      </div>

      {/* Histogram */}
      <div>
        <div className="text-xs text-gray-500 mb-1">توزيع التقييمات العامة</div>
        <div className="space-y-1.5">
          {[5, 4, 3, 2, 1].map((r) => {
            const n = data.byRating[r as 1 | 2 | 3 | 4 | 5] || 0
            const pct = data.count > 0 ? (n / data.count) * 100 : 0
            const tone = r >= 4 ? 'bg-emerald-500' : r === 3 ? 'bg-yellow-500' : 'bg-red-500'
            return (
              <div key={r} className="flex items-center gap-2">
                <span className="w-6 text-xs text-right text-gray-600">{r}★</span>
                <div className="flex-1 h-3 bg-gray-100 rounded overflow-hidden">
                  <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
                </div>
                <span className="w-10 text-xs text-gray-600">{n}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Detailed dimension distributions */}
      {data.byDimension && (
        <div>
          <div className="text-xs text-gray-500 mb-2 font-bold">📊 توزيع التقييمات التفصيلية</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {FEEDBACK_DIMENSIONS.map((dim) => {
              const agg = data.byDimension[dim.key]
              if (!agg || agg.answered === 0) return null
              return (
                <div key={dim.key} className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-gray-800">
                      {dim.icon} {dim.label}
                    </span>
                    <span className="text-[10px] text-gray-500">{agg.answered} إجابة</span>
                  </div>
                  <div className="space-y-1">
                    {dim.options.map((opt) => {
                      const n = agg.counts[opt.value] || 0
                      const pct = agg.answered > 0 ? (n / agg.answered) * 100 : 0
                      const barTone =
                        opt.tone === 'positive'
                          ? 'bg-emerald-500'
                          : opt.tone === 'good'
                            ? 'bg-green-500'
                            : opt.tone === 'neutral'
                              ? 'bg-yellow-500'
                              : opt.tone === 'negative'
                                ? 'bg-red-500'
                                : 'bg-blue-500'
                      return (
                        <div key={opt.value} className="flex items-center gap-2">
                          <span className="text-[10px] text-gray-700 w-28 truncate text-right" title={opt.value}>
                            {opt.value}
                          </span>
                          <div className="flex-1 h-2.5 bg-white rounded overflow-hidden border border-gray-100">
                            <div className={`h-full ${barTone}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[10px] text-gray-600 w-12 text-left">
                            {n} ({pct.toFixed(0)}%)
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {showPerAgent && data.perAgent.length > 0 && (
        <div>
          <div className="text-xs text-gray-500 mb-1">أداء الوكلاء</div>
          <table className="w-full text-xs">
            <thead className="text-gray-500">
              <tr>
                <th className="text-right py-1">الوكيل</th>
                <th className="text-center py-1">عدد التقييمات</th>
                <th className="text-center py-1">المتوسط</th>
              </tr>
            </thead>
            <tbody>
              {data.perAgent.map((a) => (
                <tr key={a.agent} className="border-t border-gray-100">
                  <td className="py-1.5 text-right font-medium text-gray-900">{a.agent}</td>
                  <td className="py-1.5 text-center">{a.count}</td>
                  <td className={`py-1.5 text-center font-bold ${TONE_BY_AVG(a.avgRating)}`}>
                    {a.avgRating.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showRecent && data.recentLowRatings.length > 0 && (
        <div>
          <div className="text-xs text-red-700 font-bold mb-2">⚠️ أحدث التقييمات السلبية</div>
          <ul className="space-y-2">
            {data.recentLowRatings.map((r) => (
              <li key={r.id} className="bg-red-50 border border-red-200 rounded-lg p-2 text-xs">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="font-bold text-red-900">{r.rating}/5 ★</span>
                  <span className="text-[10px] text-red-600" dir="ltr">
                    {formatCairoDateTime(r.collectedAt, 'en-GB')}
                  </span>
                </div>
                {r.comment && (
                  <p className="text-red-900 line-clamp-2">{r.comment}</p>
                )}
                <Link
                  href={`/orders/${r.orderId}`}
                  className="text-[10px] text-red-700 underline mt-1 inline-block"
                >
                  📋 عرض الطلب
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
