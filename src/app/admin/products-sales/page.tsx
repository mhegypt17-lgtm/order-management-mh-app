'use client'

import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import {
  cairoDateString,
  cairoFirstDayOfMonth,
  addDays,
} from '@/lib/cairoTime'

interface Row {
  productId: string
  productName: string
  productCategory: string
  isTargeted: boolean
  isActive: boolean
  units: number
  revenue: number
  orderCount: number
  sharePct: number
}

interface ReportResponse {
  from: string
  to: string
  orderCount: number
  totalUnits: number
  totalRevenue: number
  rows: Row[]
  categories: string[]
}

// Quick-range presets. Each returns { from, to } in 'YYYY-MM-DD' Cairo time.
const today = () => cairoDateString()
const PRESETS: { label: string; range: () => { from: string; to: string } }[] = [
  { label: 'اليوم', range: () => ({ from: today(), to: today() }) },
  { label: 'آخر 7 أيام', range: () => ({ from: addDays(today(), -6), to: today() }) },
  { label: 'هذا الشهر', range: () => ({ from: cairoFirstDayOfMonth(), to: today() }) },
  { label: 'آخر 30 يوم', range: () => ({ from: addDays(today(), -29), to: today() }) },
  { label: 'آخر 90 يوم', range: () => ({ from: addDays(today(), -89), to: today() }) },
  { label: 'آخر سنة', range: () => ({ from: addDays(today(), -364), to: today() }) },
]

const fmt = (n: number) => new Intl.NumberFormat('en-US').format(n)
const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n) + ' ج.م'

export default function ProductSalesReportPage() {
  const [from, setFrom] = useState(cairoFirstDayOfMonth())
  const [to, setTo] = useState(cairoDateString())
  const [category, setCategory] = useState('')
  const [targetedOnly, setTargetedOnly] = useState(false)
  const [activeOnly, setActiveOnly] = useState(true)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<ReportResponse | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ from, to })
      if (category) params.set('category', category)
      if (targetedOnly) params.set('targetedOnly', '1')
      if (activeOnly) params.set('activeOnly', '1')
      const res = await fetch(`/api/reports/product-sales?${params.toString()}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'فشل تحميل التقرير')
      setData(json)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل التقرير')
    } finally {
      setLoading(false)
    }
  }

  // Auto-load on filter change. Keeps the report in sync with the user's
  // selections without needing an explicit "Apply" click.
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, category, targetedOnly, activeOnly])

  const filteredRows = useMemo(() => {
    if (!data) return [] as Row[]
    const q = search.trim().toLowerCase()
    if (!q) return data.rows
    return data.rows.filter(
      (r) =>
        r.productName.toLowerCase().includes(q) ||
        r.productCategory.toLowerCase().includes(q),
    )
  }, [data, search])

  const exportCsv = () => {
    if (!data) return
    const headers = ['المنتج', 'الفئة', 'الوحدات المباعة', 'الإيرادات', 'عدد الطلبات', 'الحصة %']
    const lines = [headers.join(',')]
    for (const r of filteredRows) {
      const cells = [
        r.productName.replace(/,/g, ' '),
        r.productCategory.replace(/,/g, ' '),
        r.units,
        r.revenue,
        r.orderCount,
        r.sharePct,
      ]
      lines.push(cells.join(','))
    }
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `product-sales_${from}_to_${to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-gray-800">📊 تقرير مبيعات المنتجات</h1>
        <button
          type="button"
          onClick={exportCsv}
          disabled={!data || filteredRows.length === 0}
          className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow disabled:opacity-50"
        >
          ⬇️ تصدير CSV
        </button>
      </div>

      {/* Quick-range presets */}
      <div className="flex flex-wrap gap-2 mb-3">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => {
              const r = p.range()
              setFrom(r.from)
              setTo(r.to)
            }}
            className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm font-medium text-gray-700"
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow p-4 mb-4 grid grid-cols-1 md:grid-cols-6 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">من تاريخ</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">إلى تاريخ</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">الفئة</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">كل الفئات</option>
            {(data?.categories || []).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">بحث بالمنتج</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="اسم منتج أو فئة..."
            className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <label className="flex items-center gap-2 mt-5 text-sm">
          <input
            type="checkbox"
            checked={targetedOnly}
            onChange={(e) => setTargetedOnly(e.target.checked)}
            className="w-4 h-4"
          />
          <span>المنتجات المستهدفة فقط 🎯</span>
        </label>
        <label className="flex items-center gap-2 mt-5 text-sm">
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={(e) => setActiveOnly(e.target.checked)}
            className="w-4 h-4"
          />
          <span>المنتجات النشطة فقط</span>
        </label>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-white rounded-xl shadow p-4">
          <div className="text-xs text-gray-500">إجمالي الوحدات المباعة</div>
          <div className="text-2xl font-bold text-gray-800">{fmt(data?.totalUnits || 0)}</div>
        </div>
        <div className="bg-white rounded-xl shadow p-4">
          <div className="text-xs text-gray-500">إجمالي الإيرادات</div>
          <div className="text-2xl font-bold text-emerald-700">{fmtCurrency(data?.totalRevenue || 0)}</div>
        </div>
        <div className="bg-white rounded-xl shadow p-4">
          <div className="text-xs text-gray-500">عدد الطلبات</div>
          <div className="text-2xl font-bold text-gray-800">{fmt(data?.orderCount || 0)}</div>
        </div>
        <div className="bg-white rounded-xl shadow p-4">
          <div className="text-xs text-gray-500">عدد المنتجات المباعة</div>
          <div className="text-2xl font-bold text-gray-800">{fmt(filteredRows.length)}</div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-700">
              <tr>
                <th className="px-3 py-2 text-right">#</th>
                <th className="px-3 py-2 text-right">المنتج</th>
                <th className="px-3 py-2 text-right">الفئة</th>
                <th className="px-3 py-2 text-center">الوحدات</th>
                <th className="px-3 py-2 text-center">الإيرادات</th>
                <th className="px-3 py-2 text-center">عدد الطلبات</th>
                <th className="px-3 py-2 text-center">الحصة %</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-gray-500">
                    ⏳ جاري التحميل...
                  </td>
                </tr>
              )}
              {!loading && filteredRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-gray-500">
                    لا توجد مبيعات في الفترة / الفلتر المحدد
                  </td>
                </tr>
              )}
              {!loading &&
                filteredRows.map((r, idx) => (
                  <tr key={r.productId} className="border-t hover:bg-gray-50">
                    <td className="px-3 py-2 text-right text-gray-500">{idx + 1}</td>
                    <td className="px-3 py-2 text-right font-medium">
                      {r.productName}
                      {r.isTargeted && (
                        <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">
                          🎯 مستهدف
                        </span>
                      )}
                      {!r.isActive && (
                        <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-700 font-bold">
                          غير نشط
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-600">{r.productCategory || '—'}</td>
                    <td className="px-3 py-2 text-center font-bold text-gray-800">{fmt(r.units)}</td>
                    <td className="px-3 py-2 text-center text-emerald-700 font-medium">
                      {fmtCurrency(r.revenue)}
                    </td>
                    <td className="px-3 py-2 text-center text-gray-700">{fmt(r.orderCount)}</td>
                    <td className="px-3 py-2 text-center">
                      <div className="inline-flex items-center gap-2">
                        <div className="w-16 bg-gray-200 rounded h-1.5 overflow-hidden">
                          <div
                            className="h-1.5 bg-red-500"
                            style={{ width: `${Math.min(100, r.sharePct)}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-700 w-10 text-left">{r.sharePct}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
