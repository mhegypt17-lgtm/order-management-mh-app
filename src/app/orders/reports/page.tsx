'use client'

import { useEffect, useMemo, useState } from 'react'
import { calculateComplaintAnalytics, type ComplaintAnalyticsRecord } from '@/lib/complaintAnalytics'

type OrderItem = {
  id: string
  productName: string
  quantity: number
}

type OrderRecord = {
  id: string
  appOrderNo: string
  orderDate: string
  orderStatus: string
  orderMethod: 'FB' | 'Call' | 'App' | 'WhatsApp' | 'B2B' | 'W.S'
  customerType: 'جديد' | 'قديم' | 'عائد' | 'استكمال' | 'استرجاع' | 'استبدال' | 'تسويق' | 'تعويض' | 'فحص' | 'تحصيل'
  orderTotal: number
  items: OrderItem[]
  delivery?: {
    deliveryStatus: 'قبول' | 'جاهز' | 'في الطريق' | 'تم التوصيل' | 'لم يخرج بعد'
  }
}

type ReportComplaint = ComplaintAnalyticsRecord

function countBy<T extends string>(list: T[]) {
  const map = new Map<T, number>()
  for (const item of list) {
    map.set(item, (map.get(item) || 0) + 1)
  }
  return Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
}

export default function ReportsPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [orders, setOrders] = useState<OrderRecord[]>([])
  const [complaints, setComplaints] = useState<ReportComplaint[]>([])
  const [monthlyCompensationBudget, setMonthlyCompensationBudget] = useState(0)

  const today = new Date().toISOString().slice(0, 10)
  const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .slice(0, 10)

  const [dateFrom, setDateFrom] = useState(firstDayOfMonth)
  const [dateTo, setDateTo] = useState(today)

  const fetchOrders = async () => {
    setIsLoading(true)
    try {
      const [ordersRes, complaintsRes, settingsRes] = await Promise.all([
        fetch('/api/orders'),
        fetch('/api/complaints'),
        fetch('/api/order-settings'),
      ])

      const ordersData = await ordersRes.json()
      const complaintsData = await complaintsRes.json()
      const settingsData = await settingsRes.json()

      setOrders(ordersData.orders || [])
      setComplaints(Array.isArray(complaintsData) ? complaintsData : [])
      setMonthlyCompensationBudget(Number(settingsData?.settings?.monthlyCompensationBudget) || 0)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchOrders()
  }, [])

  const thisMonthOrders = useMemo(() => {
    return orders.filter((o) => o.orderDate >= firstDayOfMonth && o.orderDate <= today)
  }, [orders, firstDayOfMonth, today])

  const todayOrders = useMemo(() => {
    return orders.filter((o) => o.orderDate === today)
  }, [orders, today])

  const rangeOrders = useMemo(() => {
    return orders.filter((o) => {
      if (dateFrom && o.orderDate < dateFrom) return false
      if (dateTo && o.orderDate > dateTo) return false
      return true
    })
  }, [orders, dateFrom, dateTo])

  const monthStatus = useMemo(() => countBy(thisMonthOrders.map((o) => o.orderStatus)), [thisMonthOrders])
  const todayStatus = useMemo(() => countBy(todayOrders.map((o) => o.orderStatus)), [todayOrders])
  const sourceStats = useMemo(() => countBy(rangeOrders.map((o) => o.orderMethod)), [rangeOrders])
  const customerTypeStats = useMemo(() => countBy(rangeOrders.map((o) => o.customerType)), [rangeOrders])
  const deliveryStats = useMemo(() => countBy(rangeOrders.map((o) => o.delivery?.deliveryStatus || 'لم يخرج بعد')), [rangeOrders])

  const rangeRevenue = useMemo(() => {
    return rangeOrders.reduce((sum, o) => sum + Number(o.orderTotal || 0), 0)
  }, [rangeOrders])

  const avgOrderValue = useMemo(() => {
    return rangeOrders.length ? rangeRevenue / rangeOrders.length : 0
  }, [rangeOrders, rangeRevenue])

  const topProducts = useMemo(() => {
    const map = new Map<string, number>()
    rangeOrders.forEach((order) => {
      order.items.forEach((item) => {
        map.set(item.productName, (map.get(item.productName) || 0) + Number(item.quantity || 0))
      })
    })

    return Array.from(map.entries())
      .map(([productName, soldCount]) => ({ productName, soldCount }))
      .sort((a, b) => b.soldCount - a.soldCount)
      .slice(0, 12)
  }, [rangeOrders])

  const complaintAnalytics = useMemo(() => {
    return calculateComplaintAnalytics(complaints, dateFrom, dateTo)
  }, [complaints, dateFrom, dateTo])

  const isCompensationBudgetExceeded =
    monthlyCompensationBudget > 0 && complaintAnalytics.monthlyCompensation > monthlyCompensationBudget

  const resetToMonth = () => {
    setDateFrom(firstDayOfMonth)
    setDateTo(today)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">📈 تقارير خدمة العملاء</h1>
          <p className="text-gray-600 mt-1">متابعة الأداء اليومي والشهري وتحليل الطلبات</p>
        </div>
        <button
          onClick={fetchOrders}
          className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold"
        >
          تحديث البيانات
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard label="طلبات هذا الشهر" value={thisMonthOrders.length.toLocaleString()} />
        <StatCard label="طلبات اليوم" value={todayOrders.length.toLocaleString()} />
        <StatCard label="إيراد الفترة المحددة" value={`${rangeRevenue.toLocaleString()} ج.م`} />
        <StatCard label="متوسط قيمة الطلب" value={`${avgOrderValue.toFixed(0)} ج.م`} />
      </div>

      <section className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-bold text-gray-900">مؤشرات الشكاوى</h2>
          <span className="text-xs text-gray-500">إجمالي التعويض الشهري ثابت على شهر {complaintAnalytics.monthLabel}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
          <StatCard label="عدد التذاكر" value={complaintAnalytics.totalTickets.toLocaleString()} />
          <StatCard label="التذاكر المحلولة" value={complaintAnalytics.resolvedTickets.toLocaleString()} />
          <StatCard label="نسبة الحل" value={`${complaintAnalytics.resolutionRate}%`} />
          <StatCard label="متوسط SLA" value={complaintAnalytics.averageSlaLabel} />
          <StatCard label="تعويضات الشهر" value={`${complaintAnalytics.monthlyCompensation.toLocaleString()} ج.م`} />
        </div>

        <p className={`text-xs ${isCompensationBudgetExceeded ? 'text-red-700 font-semibold' : 'text-gray-500'}`}>
          الميزانية الشهرية: {monthlyCompensationBudget.toLocaleString()} ج.م
          {isCompensationBudgetExceeded
            ? ` | تم تجاوزها بمقدار ${(complaintAnalytics.monthlyCompensation - monthlyCompensationBudget).toLocaleString()} ج.م`
            : ' | ضمن الحد'}
        </p>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <section className="bg-gray-50 rounded-lg border border-gray-200 p-4 overflow-x-auto">
            <h3 className="font-bold text-gray-900 mb-3">أعلى أسباب الشكاوى</h3>
            <table className="w-full min-w-[460px] text-sm">
              <thead className="bg-gray-100 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2 text-center">الترتيب</th>
                  <th className="px-3 py-2 text-right">السبب</th>
                  <th className="px-3 py-2 text-center">العدد</th>
                  <th className="px-3 py-2 text-center">النسبة</th>
                </tr>
              </thead>
              <tbody>
                {complaintAnalytics.topReasons.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-gray-500">لا توجد شكاوى في هذا النطاق</td>
                  </tr>
                ) : (
                  complaintAnalytics.topReasons.slice(0, 8).map((reason, index) => (
                    <tr key={reason.name} className="border-b border-gray-100">
                      <td className="px-3 py-2 text-center font-semibold">#{index + 1}</td>
                      <td className="px-3 py-2 text-gray-900">{reason.name}</td>
                      <td className="px-3 py-2 text-center">{reason.count}</td>
                      <td className="px-3 py-2 text-center">{reason.share}%</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>

          <section className="bg-gray-50 rounded-lg border border-gray-200 p-4 overflow-x-auto">
            <h3 className="font-bold text-gray-900 mb-3">ترتيب قنوات الشكاوى</h3>
            <table className="w-full min-w-[460px] text-sm">
              <thead className="bg-gray-100 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2 text-center">الترتيب</th>
                  <th className="px-3 py-2 text-right">القناة</th>
                  <th className="px-3 py-2 text-center">العدد</th>
                  <th className="px-3 py-2 text-center">النسبة</th>
                </tr>
              </thead>
              <tbody>
                {complaintAnalytics.topChannels.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-gray-500">لا توجد شكاوى في هذا النطاق</td>
                  </tr>
                ) : (
                  complaintAnalytics.topChannels.slice(0, 8).map((channel, index) => (
                    <tr key={channel.name} className="border-b border-gray-100">
                      <td className="px-3 py-2 text-center font-semibold">#{index + 1}</td>
                      <td className="px-3 py-2 text-gray-900">{channel.name}</td>
                      <td className="px-3 py-2 text-center">{channel.count}</td>
                      <td className="px-3 py-2 text-center">{channel.share}%</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>
        </div>
      </section>

      <section className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 text-right">من تاريخ</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg"
              dir="ltr"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 text-right">إلى تاريخ</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg"
              dir="ltr"
            />
          </div>
          <button
            onClick={resetToMonth}
            className="px-4 py-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 font-semibold"
          >
            هذا الشهر
          </button>
          <div className="text-sm text-gray-600">عدد الطلبات في النطاق: {rangeOrders.length}</div>
        </div>
      </section>

      {isLoading ? (
        <div className="p-8 text-center text-gray-500">⏳ جاري تحميل التقارير...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ReportTable title="حالة الطلبات اليوم" rows={todayStatus.map((s) => ({ name: s.name, value: s.count }))} emptyLabel="لا توجد طلبات اليوم" />
            <ReportTable title="حالة الطلبات هذا الشهر" rows={monthStatus.map((s) => ({ name: s.name, value: s.count }))} emptyLabel="لا توجد طلبات هذا الشهر" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ReportTable title="مصدر الطلبات (Call / App / FB ...)" rows={sourceStats.map((s) => ({ name: s.name, value: s.count }))} emptyLabel="لا توجد بيانات" />
            <ReportTable title="نوع العميل (جديد / قديم / عائد ...)" rows={customerTypeStats.map((s) => ({ name: s.name, value: s.count }))} emptyLabel="لا توجد بيانات" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ReportTable title="حالة التوصيل" rows={deliveryStats.map((s) => ({ name: s.name, value: s.count }))} emptyLabel="لا توجد بيانات" />

            <section className="bg-white rounded-lg border border-gray-200 p-4 overflow-x-auto">
              <h2 className="font-bold text-gray-900 mb-3">المنتجات المباعة بالكمية (حسب النطاق)</h2>
              {topProducts.length === 0 ? (
                <div className="p-6 text-center text-gray-500">لا توجد بيانات منتجات في هذا النطاق</div>
              ) : (
                <table className="w-full min-w-[480px] text-sm">
                  <thead className="bg-gray-100 border-b border-gray-200">
                    <tr>
                      <th className="px-3 py-2 text-right">المنتج</th>
                      <th className="px-3 py-2 text-center">الكمية المباعة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topProducts.map((p) => (
                      <tr key={p.productName} className="border-b border-gray-100">
                        <td className="px-3 py-2 text-gray-900">{p.productName}</td>
                        <td className="px-3 py-2 text-center font-semibold text-gray-900">{p.soldCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
    </div>
  )
}

function ReportTable({
  title,
  rows,
  emptyLabel,
}: {
  title: string
  rows: Array<{ name: string; value: number }>
  emptyLabel: string
}) {
  return (
    <section className="bg-white rounded-lg border border-gray-200 p-4 overflow-x-auto">
      <h2 className="font-bold text-gray-900 mb-3">{title}</h2>
      {rows.length === 0 ? (
        <div className="p-6 text-center text-gray-500">{emptyLabel}</div>
      ) : (
        <table className="w-full min-w-[420px] text-sm">
          <thead className="bg-gray-100 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-right">التصنيف</th>
              <th className="px-3 py-2 text-center">العدد</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name} className="border-b border-gray-100">
                <td className="px-3 py-2 text-gray-900">{row.name}</td>
                <td className="px-3 py-2 text-center font-semibold text-gray-900">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
