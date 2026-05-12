'use client'

import { useEffect, useMemo, useState } from 'react'

type BranchReportOrder = {
  id: string
  orderDate: string
  orderTotal: number
  orderStatus: string
  delivery: {
    deliveryStatus: 'قبول' | 'جاهز' | 'في الطريق' | 'تم التوصيل' | 'لم يخرج بعد'
  }
}

function getCurrentMonth() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${now.getFullYear()}-${month}`
}

export default function BranchReportsPage() {
  const [monthFilter, setMonthFilter] = useState(getCurrentMonth())
  const [isLoading, setIsLoading] = useState(true)
  const [orders, setOrders] = useState<BranchReportOrder[]>([])

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

  useEffect(() => {
    fetchMonthlyOrders()
  }, [monthFilter])

  const stats = useMemo(() => {
    const deliveredOrders = orders.filter((o) => o.delivery?.deliveryStatus === 'تم التوصيل').length
    const cancelledOrders = orders.filter((o) => o.orderStatus === 'لاغي').length
    const totalOrders = orders.length
    const totalRevenue = orders.reduce((sum, o) => sum + Number(o.orderTotal || 0), 0)

    const deliveryRate = totalOrders > 0 ? (deliveredOrders / totalOrders) * 100 : 0
    const cancelRate = totalOrders > 0 ? (cancelledOrders / totalOrders) * 100 : 0

    return {
      totalOrders,
      deliveredOrders,
      cancelledOrders,
      totalRevenue,
      deliveryRate,
      cancelRate,
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
