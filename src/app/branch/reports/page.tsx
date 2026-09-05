'use client'

import { useEffect, useMemo, useState } from 'react'
import { cairoMonthString } from '@/lib/cairoTime'
import { calculateComplaintAnalytics, type ComplaintAnalyticsRecord } from '@/lib/complaintAnalytics'

type BranchReportComplaint = ComplaintAnalyticsRecord

type BranchReportOrder = {
  id: string
  orderDate: string
  orderTime: string
  createdAt: string
  orderTotal: number
  orderStatus: 'تم' | 'مؤجل' | 'لاغي' | 'حجز'
  delivery: {
    deliveryStatus: 'لم يخرج بعد' | 'جاهز' | 'في الطريق' | 'تم التوصيل'
    acceptedAt?: string | null
    readyAt?: string | null
    outForDeliveryAt?: string | null
    deliveredAt?: string | null
  }
}

function getCurrentMonth() {
  return cairoMonthString()
}

// Average time-to-deliver helpers — kept module-scope so they're reusable
// from admin reports too. We measure from acceptedAt (first branch touch)
// to deliveredAt (final state) because that is the window the branch
// actually controls; the time a CS user spends preparing the order before
// dispatching to the branch is intentionally excluded.
function durationMinutes(from?: string | null, to?: string | null): number | null {
  if (!from || !to) return null
  const a = new Date(from).getTime()
  const b = new Date(to).getTime()
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null
  return (b - a) / 60000
}

function formatDurationMinutes(mins: number | null): string {
  if (mins === null || !Number.isFinite(mins)) return '—'
  const total = Math.max(0, Math.round(mins))
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m} دقيقة`
  if (m === 0) return `${h} ساعة`
  return `${h} ساعة ${m} دقيقة`
}

export default function BranchReportsPage() {
  const [monthFilter, setMonthFilter] = useState(getCurrentMonth())
  const [isLoading, setIsLoading] = useState(true)
  const [orders, setOrders] = useState<BranchReportOrder[]>([])
  const [complaints, setComplaints] = useState<BranchReportComplaint[]>([])

  const fetchMonthlyOrders = async () => {
    setIsLoading(true)
    try {
      const query = new URLSearchParams({ month: monthFilter, deliveryStatus: 'all' })
      const res = await fetch(`/api/branch/orders?${query.toString()}`)
      const data = await res.json()
      setOrders(Array.isArray(data.orders) ? data.orders : [])
    } finally {
      setIsLoading(false)
    }
  }

  // Owner breakdown (فرع/ديليفري/etc.) for the selected month only — a new
  // read for this page (it never called /api/complaints before), but bounded
  // to the selected month via `from` and narrowed further client-side via
  // calculateComplaintAnalytics's dateFrom/dateTo, same as the CS reports page.
  const fetchMonthlyComplaints = async () => {
    try {
      const res = await fetch(`/api/complaints?from=${monthFilter}-01`)
      const data = await res.json()
      setComplaints(Array.isArray(data) ? data : [])
    } catch {
      setComplaints([])
    }
  }

  useEffect(() => {
    fetchMonthlyOrders()
    fetchMonthlyComplaints()
  }, [monthFilter])

  const stats = useMemo(() => {
    const deliveredOrders = orders.filter((o) => o.delivery?.deliveryStatus === 'تم التوصيل').length
    const cancelledOrders = orders.filter((o) => o.orderStatus === 'لاغي').length
    const totalOrders = orders.length
    // Revenue = only orders the branch actually delivered ('تم التوصيل').
    // Previously summed every order regardless of delivery status, so a
    // month with cancelled / not-yet-delivered orders showed inflated
    // revenue that didn't match the daily/weekly ops emails.
    const totalRevenue = orders
      .filter((o) => o.delivery?.deliveryStatus === 'تم التوصيل')
      .reduce((sum, o) => sum + Number(o.orderTotal || 0), 0)

    const deliveryRate = totalOrders > 0 ? (deliveredOrders / totalOrders) * 100 : 0
    const cancelRate = totalOrders > 0 ? (cancelledOrders / totalOrders) * 100 : 0

    // Average delivery duration. Primary signal is acceptedAt → deliveredAt
    // (the branch's own working window). For older orders that were
    // delivered BEFORE the timing-columns migration ran, acceptedAt is
    // null, so we fall back to createdAt → deliveredAt — less precise
    // (includes any CS-prep delay before the branch saw the order) but
    // far more useful than showing "—" for an entire month of history.
    const exactDurations: number[] = []
    const fallbackDurations: number[] = []
    for (const o of orders) {
      if (o.delivery?.deliveryStatus !== 'تم التوصيل') continue
      const end = o.delivery?.deliveredAt
      if (!end) continue
      const exact = durationMinutes(o.delivery?.acceptedAt, end)
      if (exact !== null) {
        exactDurations.push(exact)
      } else {
        const approx = durationMinutes(o.createdAt, end)
        if (approx !== null) fallbackDurations.push(approx)
      }
    }
    const allDurations = [...exactDurations, ...fallbackDurations]
    const avgDeliveryMinutes =
      allDurations.length > 0
        ? allDurations.reduce((a, b) => a + b, 0) / allDurations.length
        : null

    return {
      totalOrders,
      deliveredOrders,
      cancelledOrders,
      totalRevenue,
      deliveryRate,
      cancelRate,
      avgDeliveryMinutes,
      avgDeliveryCount: allDurations.length,
      avgDeliveryExactCount: exactDurations.length,
      avgDeliveryFallbackCount: fallbackDurations.length,
    }
  }, [orders])

  const dailyPerformance = useMemo(() => {
    const map = new Map<string, { total: number; delivered: number; cancelled: number }>()

    orders.forEach((order) => {
      const day = order.orderDate
      const row = map.get(day) || { total: 0, delivered: 0, cancelled: 0 }
      row.total += 1
      if (order.delivery?.deliveryStatus === 'تم التوصيل') row.delivered += 1
      if (order.orderStatus === 'لاغي') row.cancelled += 1
      map.set(day, row)
    })

    return Array.from(map.entries())
      .map(([date, values]) => ({ date, ...values }))
      .sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [orders])

  // dateTo = last day of the selected month (YYYY-MM-DD), so the analytics
  // helper's inclusive date-range filter matches exactly one calendar month.
  const complaintAnalytics = useMemo(() => {
    const [y, m] = monthFilter.split('-').map(Number)
    const lastDay = new Date(y, m, 0).getDate()
    const dateFrom = `${monthFilter}-01`
    const dateTo = `${monthFilter}-${String(lastDay).padStart(2, '0')}`
    return calculateComplaintAnalytics(complaints, dateFrom, dateTo)
  }, [complaints, monthFilter])

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">📊 تقارير الفرع</h1>
          <p className="text-gray-600 mt-1">تحليل أداء التوصيلات شهريا</p>
        </div>
        <button
          onClick={fetchMonthlyOrders}
          className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold w-fit"
        >
          تحديث التقرير
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 text-right">الشهر</label>
          <input
            type="month"
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            dir="ltr"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-gray-500 bg-white rounded-lg border border-gray-200">⏳ جاري تحميل التقرير...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <p className="text-sm text-gray-500">إجمالي الطلبات</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats.totalOrders}</p>
            </div>
            <div className="bg-green-50 rounded-lg border border-green-200 p-4">
              <p className="text-sm text-gray-600">عدد الطلبات الموصلة</p>
              <p className="text-2xl font-bold text-green-700 mt-1">{stats.deliveredOrders}</p>
              <p className="text-xs text-green-700 mt-1">{stats.deliveryRate.toFixed(1)}%</p>
            </div>
            <div className="bg-red-50 rounded-lg border border-red-200 p-4">
              <p className="text-sm text-gray-600">عدد الطلبات الملغاة</p>
              <p className="text-2xl font-bold text-red-700 mt-1">{stats.cancelledOrders}</p>
              <p className="text-xs text-red-700 mt-1">{stats.cancelRate.toFixed(1)}%</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <p className="text-sm text-gray-500">إجمالي قيمة الشهر</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats.totalRevenue.toLocaleString()} ج.م</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-blue-50 rounded-lg border border-blue-200 p-4">
              <p className="text-sm text-gray-600">⏱️ متوسط مدة التوصيل</p>
              <p className="text-2xl font-bold text-blue-700 mt-1">
                {formatDurationMinutes(stats.avgDeliveryMinutes)}
              </p>
              <p className="text-xs text-blue-700 mt-1">
                {stats.avgDeliveryCount > 0
                  ? `محسوبة من ${stats.avgDeliveryCount} طلب — من وقت قبول الفرع حتى التسليم`
                  : 'لا توجد بيانات كافية لحساب متوسط مدة التوصيل لهذا الشهر'}
              </p>
              {stats.avgDeliveryFallbackCount > 0 && (
                <p className="text-xs text-amber-700 mt-1">
                  ⚠️ {stats.avgDeliveryFallbackCount} من الطلبات تم حساب وقتها تقريبياً من وقت إنشاء الطلب لأنها سابقة لـ migration التوقيتات
                </p>
              )}
            </div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h2 className="font-bold text-gray-900 mb-1">🎫 الشكاوى حسب المسؤول</h2>
            <p className="text-xs text-gray-500 mb-3">
              عدد الشكاوى المفتوحة هذا الشهر مقسّمة حسب الجهة المسؤولة (فرع، ديليفري، مصنع، مبيعات) — إجمالي {complaintAnalytics.totalTickets} تذكرة
            </p>
            {complaintAnalytics.topOwners.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">لا توجد شكاوى لهذا الشهر</p>
            ) : (
              <div className="space-y-2">
                {complaintAnalytics.topOwners.map((o) => (
                  <div key={o.name} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-sm font-medium text-gray-700">{o.name}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                      <div className="bg-red-500 h-3 rounded-full" style={{ width: `${o.share}%` }} />
                    </div>
                    <span className="w-16 shrink-0 text-sm text-gray-600 text-left">{o.count} ({o.share}%)</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
            <div className="px-4 py-3 border-b border-gray-200">
              <h2 className="font-bold text-gray-900">الأداء اليومي داخل الشهر</h2>
            </div>
            {dailyPerformance.length === 0 ? (
              <div className="p-8 text-center text-gray-500">📭 لا توجد بيانات لهذا الشهر</div>
            ) : (
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-gray-100 border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-2 text-right">التاريخ</th>
                    <th className="px-3 py-2 text-center">إجمالي الطلبات</th>
                    <th className="px-3 py-2 text-center">تم التوصيل</th>
                    <th className="px-3 py-2 text-center">ملغاة</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyPerformance.map((row) => (
                    <tr key={row.date} className="border-b border-gray-100">
                      <td className="px-3 py-2 text-gray-900" dir="ltr">{row.date}</td>
                      <td className="px-3 py-2 text-center font-semibold">{row.total}</td>
                      <td className="px-3 py-2 text-center text-green-700 font-semibold">{row.delivered}</td>
                      <td className="px-3 py-2 text-center text-red-700 font-semibold">{row.cancelled}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}
