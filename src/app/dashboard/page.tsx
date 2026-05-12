'use client'

import { useEffect, useMemo, useState } from 'react'
import { calculateComplaintAnalytics, type ComplaintAnalyticsRecord } from '@/lib/complaintAnalytics'

type DashboardOrder = {
  id: string
  appOrderNo: string
  orderDate: string
  orderType: 'B2B' | 'Online' | 'Instashop' | 'App'
  orderMethod: 'FB' | 'Call' | 'App' | 'WhatsApp' | 'B2B' | 'W.S'
  orderReceiver: 'رنا' | 'مى' | 'ميرنا' | 'أمل'
  customerSource:
    | 'Facebook'
    | 'Instashop'
    | 'Google'
    | 'Breadfast'
    | 'Friend'
    | 'Branch'
    | 'Family'
    | 'Instagram'
    | 'Play Store'
    | 'Ad'
    | 'GoodsMart'
    | 'Other'
  orderStatus: string
  cancellationReason: 'نفاد المنتج' | 'عدم توفر' | 'تأخير التوصيل' | 'سعر مرتفع' | 'موعد غير مناسب' | 'Other' | null
  orderTotal: number
  customerId: string
  orderTime?: string
  deliveryFee?: number
  address?: { id?: string; area?: string | null } | null
  isScheduled?: boolean
  scheduledDate?: string | null
  scheduledTimeSlot?: string | null
  scheduledSpecificTime?: string | null
  items: Array<{ id: string; productName: string; quantity: number; lineTotal: number }>
  delivery?: { deliveryStatus: 'قبول' | 'جاهز' | 'في الطريق' | 'تم التوصيل' | 'لم يخرج بعد' }
}

type DashboardComplaint = ComplaintAnalyticsRecord

type DeliveryZone = {
  id: string
  zone: number
  area: string
  averageDistanceKm?: number
  deliveryCost: number
  customerDeliveryFee: number
  freeDeliveryValue?: number
}

function statusClass(status: DashboardOrder['orderStatus']) {
  return {
    تم: 'bg-green-100 text-green-800',
    مؤجل: 'bg-yellow-100 text-yellow-800',
    لاغي: 'bg-red-100 text-red-800',
    حجز: 'bg-blue-100 text-blue-800',
  }[status]
}

function deliveryClass(status: NonNullable<DashboardOrder['delivery']>['deliveryStatus']) {
  return {
    'لم يخرج بعد': 'bg-gray-100 text-gray-700',
    جاهز: 'bg-yellow-100 text-yellow-800',
    'في الطريق': 'bg-blue-100 text-blue-800',
    'تم التوصيل': 'bg-green-100 text-green-800',
  }[status]
}

function pct(value: number, total: number) {
  if (!total) return 0
  return Number(((value / total) * 100).toFixed(1))
}

function getRecentDates(days: number) {
  const arr: string[] = []
  const now = new Date()
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(now)
    d.setDate(now.getDate() - i)
    arr.push(d.toISOString().slice(0, 10))
  }
  return arr
}

export default function DashboardPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [orders, setOrders] = useState<DashboardOrder[]>([])
  const [complaints, setComplaints] = useState<DashboardComplaint[]>([])
  const [zones, setZones] = useState<DeliveryZone[]>([])
  const [monthlyCompensationBudget, setMonthlyCompensationBudget] = useState(0)

  const now = new Date()
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const today = now.toISOString().slice(0, 10)

  const [dateFrom, setDateFrom] = useState(firstDayOfMonth)
  const [dateTo, setDateTo] = useState(today)
  const [viewMode, setViewMode] = useState<'simple' | 'advanced'>('simple')

  const resetDateFilter = () => {
    setDateFrom(firstDayOfMonth)
    setDateTo(today)
  }

  const fetchOrders = async () => {
    setIsLoading(true)
    try {
      const [ordersRes, complaintsRes, settingsRes, zonesRes] = await Promise.all([
        fetch('/api/orders'),
        fetch('/api/complaints'),
        fetch('/api/order-settings'),
        fetch('/api/delivery-zones'),
      ])

      const ordersData = await ordersRes.json()
      const complaintsData = await complaintsRes.json()
      const settingsData = await settingsRes.json()
      const zonesData = await zonesRes.json().catch(() => [])

      setOrders(ordersData.orders || [])
      setComplaints(Array.isArray(complaintsData) ? complaintsData : [])
      setZones(Array.isArray(zonesData) ? zonesData : Array.isArray(zonesData?.zones) ? zonesData.zones : [])
      setMonthlyCompensationBudget(Number(settingsData?.settings?.monthlyCompensationBudget) || 0)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchOrders()
  }, [])

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (dateFrom && o.orderDate < dateFrom) return false
      if (dateTo && o.orderDate > dateTo) return false
      return true
    })
  }, [orders, dateFrom, dateTo])

  const analytics = useMemo(() => {
    const totalOrders = filtered.length
    const totalRevenue = filtered.reduce((sum, o) => sum + Number(o.orderTotal || 0), 0)
    const avgOrderValue = totalOrders ? totalRevenue / totalOrders : 0

    const completedOrders = filtered.filter((o) => o.orderStatus === 'تم').length
    const cancelledOrders = filtered.filter((o) => o.orderStatus === 'لاغي').length
    const pendingOrders = filtered.filter((o) => o.orderStatus === 'مؤجل' || o.orderStatus === 'حجز').length

    const uniqueCustomers = new Set(filtered.map((o) => o.customerId).filter(Boolean)).size

    const deliveryCounts = {
      'لم يخرج بعد': 0,
      جاهز: 0,
      'في الطريق': 0,
      'تم التوصيل': 0,
    } as Record<NonNullable<DashboardOrder['delivery']>['deliveryStatus'], number>

    filtered.forEach((o) => {
      if (o.delivery?.deliveryStatus) {
        deliveryCounts[o.delivery.deliveryStatus] += 1
      }
    })

    const byOrderStatus: Record<DashboardOrder['orderStatus'], number> = {
      تم: 0,
      مؤجل: 0,
      لاغي: 0,
      حجز: 0,
    }
    filtered.forEach((o) => {
      byOrderStatus[o.orderStatus] += 1
    })

    const sourceMap = new Map<string, { count: number; revenue: number }>()
    const methodMap = new Map<string, { count: number; revenue: number }>()
    const productMap = new Map<string, { qty: number; revenue: number; orders: number }>()
    const receiverMap = new Map<string, { orders: number; completed: number; cancelled: number; revenue: number }>()
    const cancelReasonMap = new Map<string, { count: number; lostValue: number }>()

    filtered.forEach((o) => {
      const source = sourceMap.get(o.customerSource) || { count: 0, revenue: 0 }
      source.count += 1
      source.revenue += Number(o.orderTotal || 0)
      sourceMap.set(o.customerSource, source)

      const method = methodMap.get(o.orderMethod) || { count: 0, revenue: 0 }
      method.count += 1
      method.revenue += Number(o.orderTotal || 0)
      methodMap.set(o.orderMethod, method)

      const receiver = receiverMap.get(o.orderReceiver) || { orders: 0, completed: 0, cancelled: 0, revenue: 0 }
      receiver.orders += 1
      receiver.revenue += Number(o.orderTotal || 0)
      if (o.orderStatus === 'تم') receiver.completed += 1
      if (o.orderStatus === 'لاغي') receiver.cancelled += 1
      receiverMap.set(o.orderReceiver, receiver)

      if (o.orderStatus === 'لاغي') {
        const reason = o.cancellationReason || 'Other'
        const cancellation = cancelReasonMap.get(reason) || { count: 0, lostValue: 0 }
        cancellation.count += 1
        cancellation.lostValue += Number(o.orderTotal || 0)
        cancelReasonMap.set(reason, cancellation)
      }

      o.items.forEach((item) => {
        const product = productMap.get(item.productName) || { qty: 0, revenue: 0, orders: 0 }
        product.qty += Number(item.quantity || 0)
        product.revenue += Number(item.lineTotal || 0)
        product.orders += 1
        productMap.set(item.productName, product)
      })
    })

    const sources = Array.from(sourceMap.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.count - a.count)

    const methods = Array.from(methodMap.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.count - a.count)

    const topProducts = Array.from(productMap.entries())
      .map(([productName, v]) => ({ productName, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)

    const receiverPerformance = Array.from(receiverMap.entries())
      .map(([receiver, v]) => ({
        receiver,
        ...v,
        completionRate: pct(v.completed, v.orders),
        cancellationRate: pct(v.cancelled, v.orders),
      }))
      .sort((a, b) => b.revenue - a.revenue)

    const cancellationDetails = Array.from(cancelReasonMap.entries())
      .map(([reason, v]) => ({ reason, ...v, rate: pct(v.count, cancelledOrders) }))
      .sort((a, b) => b.count - a.count)

    const dailyDates = getRecentDates(14)
    const daily = dailyDates.map((day) => {
      const dayOrders = filtered.filter((o) => o.orderDate === day)
      return {
        day,
        orders: dayOrders.length,
        revenue: dayOrders.reduce((sum, o) => sum + Number(o.orderTotal || 0), 0),
      }
    })
    const maxDailyOrders = Math.max(...daily.map((d) => d.orders), 1)

    return {
      totalOrders,
      totalRevenue,
      avgOrderValue,
      completedOrders,
      cancelledOrders,
      pendingOrders,
      uniqueCustomers,
      completionRate: pct(completedOrders, totalOrders),
      cancellationRate: pct(cancelledOrders, totalOrders),
      byOrderStatus,
      deliveryCounts,
      sources,
      methods,
      topProducts,
      receiverPerformance,
      cancellationDetails,
      daily,
      maxDailyOrders,
    }
  }, [filtered])

  // Revenue / cost by delivery zone (area)
  const zoneAnalytics = useMemo(() => {
    const zoneByArea = new Map<string, DeliveryZone>()
    for (const z of zones) zoneByArea.set(String(z.area || '').trim(), z)

    const map = new Map<string, { orders: number; revenue: number; customerFees: number; internalCost: number; zoneNum: number | null }>()
    for (const o of filtered) {
      const area = (o.address?.area || 'غير محدد').trim() || 'غير محدد'
      const z = zoneByArea.get(area)
      const fee = Number(o.deliveryFee || 0)
      const cost = z ? Number(z.deliveryCost) || 0 : 0
      const cur = map.get(area) || { orders: 0, revenue: 0, customerFees: 0, internalCost: 0, zoneNum: z?.zone ?? null }
      cur.orders += 1
      cur.revenue += Number(o.orderTotal || 0)
      cur.customerFees += fee
      cur.internalCost += cost
      map.set(area, cur)
    }
    const rows = Array.from(map.entries())
      .map(([area, v]) => ({
        area,
        zone: v.zoneNum,
        orders: v.orders,
        revenue: v.revenue,
        customerFees: v.customerFees,
        internalCost: v.internalCost,
        net: v.revenue - v.internalCost,
        deliveryMargin: v.customerFees - v.internalCost,
      }))
      .sort((a, b) => b.revenue - a.revenue)

    const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0)
    const totalCost = rows.reduce((s, r) => s + r.internalCost, 0)
    const totalFees = rows.reduce((s, r) => s + r.customerFees, 0)
    return { rows, totalRevenue, totalCost, totalFees, deliveryMargin: totalFees - totalCost }
  }, [filtered, zones])

  // Peak hours heatmap (day-of-week × hour)
  const peakHourAnalytics = useMemo(() => {
    // grid[day 0..6 (Sun..Sat)][hour 0..23] = orders count
    const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0))
    const hourTotals: number[] = Array(24).fill(0)
    const dayTotals: number[] = Array(7).fill(0)
    let maxCell = 0

    for (const o of filtered) {
      const time = (o.orderTime || '').trim()
      if (!time) continue
      const hour = Number(time.split(':')[0])
      if (!Number.isFinite(hour) || hour < 0 || hour > 23) continue
      const dt = new Date(o.orderDate + 'T' + (time.length === 5 ? time : '12:00') + ':00')
      const day = dt.getDay()
      if (Number.isNaN(day)) continue
      grid[day][hour] += 1
      hourTotals[hour] += 1
      dayTotals[day] += 1
      if (grid[day][hour] > maxCell) maxCell = grid[day][hour]
    }

    const peakHourIdx = hourTotals.indexOf(Math.max(...hourTotals, 0))
    const peakDayIdx = dayTotals.indexOf(Math.max(...dayTotals, 0))
    return { grid, hourTotals, dayTotals, maxCell, peakHourIdx, peakDayIdx }
  }, [filtered])

  const pieGradient = useMemo(() => {
    const total = analytics.totalOrders || 1
    const pDone = pct(analytics.byOrderStatus['تم'], total)
    const pPending = pct(analytics.byOrderStatus['مؤجل'] + analytics.byOrderStatus['حجز'], total)
    const pCanceled = pct(analytics.byOrderStatus['لاغي'], total)

    const doneEnd = pDone
    const pendingEnd = pDone + pPending
    const cancelEnd = pDone + pPending + pCanceled

    return `conic-gradient(#22c55e 0% ${doneEnd}%, #f59e0b ${doneEnd}% ${pendingEnd}%, #ef4444 ${pendingEnd}% ${cancelEnd}%, #e5e7eb ${cancelEnd}% 100%)`
  }, [analytics])

  const complaintAnalytics = useMemo(() => {
    return calculateComplaintAnalytics(complaints, dateFrom, dateTo)
  }, [complaints, dateFrom, dateTo])

  const isCompensationBudgetExceeded =
    monthlyCompensationBudget > 0 && complaintAnalytics.monthlyCompensation > monthlyCompensationBudget

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">📊 لوحة الإدارة والتقارير</h1>
          <p className="text-gray-600 mt-1">مؤشرات الأداء والتحليلات التشغيلية</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setViewMode('simple')}
            className={`px-3 py-2 rounded-lg text-sm font-semibold ${
              viewMode === 'simple' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700'
            }`}
          >
            عرض مبسط
          </button>
          <button
            onClick={() => setViewMode('advanced')}
            className={`px-3 py-2 rounded-lg text-sm font-semibold ${
              viewMode === 'advanced' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700'
            }`}
          >
            عرض متقدم
          </button>
          <button
            onClick={resetDateFilter}
            className="px-3 py-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 font-semibold text-sm"
          >
            هذا الشهر
          </button>
          <button
            onClick={fetchOrders}
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold"
          >
            تحديث البيانات
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 text-right">من تاريخ</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            dir="ltr"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 text-right">إلى تاريخ</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            dir="ltr"
          />
        </div>
        <div className="md:col-span-2 flex items-end text-sm text-gray-600">
          {isLoading ? '⏳ جاري التحميل...' : `عدد الطلبات في الفترة: ${analytics.totalOrders}`}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <KpiCard title="إجمالي الطلبات" value={analytics.totalOrders.toLocaleString()} tone="red" subtitle="خلال الفترة المحددة" />
        <KpiCard title="إجمالي المبيعات" value={`${analytics.totalRevenue.toLocaleString()} ج.م`} tone="green" subtitle="قيمة كل الطلبات" />
        <KpiCard title="متوسط قيمة الطلب" value={`${analytics.avgOrderValue.toFixed(0)} ج.م`} tone="blue" subtitle="Revenue / Orders" />
        <KpiCard title="نسبة الإتمام" value={`${analytics.completionRate}%`} tone="emerald" subtitle={`${analytics.completedOrders} طلب تم`} />
        <KpiCard title="نسبة الإلغاء" value={`${analytics.cancellationRate}%`} tone="orange" subtitle={`${analytics.cancelledOrders} طلب لاغي`} />
        <KpiCard title="عملاء نشطين" value={analytics.uniqueCustomers.toLocaleString()} tone="purple" subtitle="عدد العملاء الفريدين" />
      </div>

      <section className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-bold text-gray-900">مؤشرات الشكاوى</h2>
          <span className="text-xs text-gray-500">إجمالي التعويض الشهري ثابت على شهر {complaintAnalytics.monthLabel}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
          <KpiCard title="عدد التذاكر" value={complaintAnalytics.totalTickets.toLocaleString()} tone="red" subtitle="خلال الفترة المحددة" />
          <KpiCard title="تذاكر محلولة" value={complaintAnalytics.resolvedTickets.toLocaleString()} tone="emerald" subtitle="الحالة مغلق" />
          <KpiCard title="نسبة الحل" value={`${complaintAnalytics.resolutionRate}%`} tone="blue" subtitle="محلولة / إجمالي" />
          <KpiCard title="متوسط SLA" value={complaintAnalytics.averageSlaLabel} tone="orange" subtitle="من الفتح حتى الإغلاق/الآن" />
          <KpiCard title="تعويضات الشهر" value={`${complaintAnalytics.monthlyCompensation.toLocaleString()} ج.م`} tone="purple" subtitle={complaintAnalytics.monthLabel} />
        </div>

        <p className={`text-xs ${isCompensationBudgetExceeded ? 'text-red-700 font-semibold' : 'text-gray-500'}`}>
          الميزانية الشهرية: {monthlyCompensationBudget.toLocaleString()} ج.م
          {isCompensationBudgetExceeded
            ? ` | تم تجاوزها بمقدار ${(complaintAnalytics.monthlyCompensation - monthlyCompensationBudget).toLocaleString()} ج.م`
            : ' | ضمن الحد'}
        </p>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <section className="bg-gray-50 rounded-lg border border-gray-200 p-4 overflow-x-auto">
            <h3 className="font-bold text-gray-900 mb-3">أكثر أسباب الشكاوى</h3>
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

      {viewMode === 'simple' && (
        <section className="bg-white rounded-lg border border-gray-200 p-4">
          <h2 className="font-bold text-gray-900 mb-3">ملخص سريع</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div className="rounded-lg bg-green-50 border border-green-200 p-3">
              <p className="text-green-800 font-semibold">تم التنفيذ</p>
              <p className="text-green-700 mt-1">{analytics.completedOrders} طلب</p>
            </div>
            <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3">
              <p className="text-yellow-800 font-semibold">قيد المتابعة</p>
              <p className="text-yellow-700 mt-1">{analytics.pendingOrders} طلب</p>
            </div>
            <div className="rounded-lg bg-red-50 border border-red-200 p-3">
              <p className="text-red-800 font-semibold">حالات الإلغاء</p>
              <p className="text-red-700 mt-1">{analytics.cancelledOrders} طلب</p>
            </div>
          </div>
        </section>
      )}

      {viewMode === 'advanced' && (
        <>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <section className="xl:col-span-2 bg-white rounded-lg border border-gray-200 p-4">
          <h2 className="font-bold text-gray-900 mb-3">اتجاه الطلبات اليومي (آخر 14 يوم)</h2>
          <div className="overflow-x-auto">
            <div className="min-w-[620px] flex items-end gap-2 h-52 pt-4">
              {analytics.daily.map((d) => {
                const heightPct = (d.orders / analytics.maxDailyOrders) * 100
                return (
                  <div key={d.day} className="flex-1 flex flex-col items-center gap-2">
                    <div
                      className="w-full bg-red-500/80 hover:bg-red-600 rounded-t transition-all"
                      style={{ height: `${Math.max(heightPct, 4)}%` }}
                      title={`${d.day} - ${d.orders} طلب - ${d.revenue.toLocaleString()} ج.م`}
                    />
                    <div className="text-[10px] text-gray-500" dir="ltr">{d.day.slice(5)}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        <section className="bg-white rounded-lg border border-gray-200 p-4">
          <h2 className="font-bold text-gray-900 mb-3">توزيع حالة الطلب</h2>
          <div className="flex items-center justify-center py-2">
            <div className="w-40 h-40 rounded-full" style={{ background: pieGradient }} />
          </div>
          <div className="space-y-2 text-sm mt-2">
            <Legend label="تم" value={analytics.byOrderStatus['تم']} color="bg-green-500" />
            <Legend label="مؤجل / حجز" value={analytics.byOrderStatus['مؤجل'] + analytics.byOrderStatus['حجز']} color="bg-yellow-500" />
            <Legend label="لاغي" value={analytics.byOrderStatus['لاغي']} color="bg-red-500" />
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <section className="bg-white rounded-lg border border-gray-200 p-4">
          <h2 className="font-bold text-gray-900 mb-3">مصدر العملاء</h2>
          <div className="space-y-2">
            {analytics.sources.slice(0, 8).map((s) => (
              <HorizontalMetric
                key={s.name}
                label={s.name}
                value={s.count}
                total={analytics.totalOrders}
                subValue={`${s.revenue.toLocaleString()} ج.م`}
                barColor="bg-blue-500"
              />
            ))}
          </div>
        </section>

        <section className="bg-white rounded-lg border border-gray-200 p-4">
          <h2 className="font-bold text-gray-900 mb-3">طريقة الطلب</h2>
          <div className="space-y-2">
            {analytics.methods.map((m) => (
              <HorizontalMetric
                key={m.name}
                label={m.name}
                value={m.count}
                total={analytics.totalOrders}
                subValue={`${m.revenue.toLocaleString()} ج.م`}
                barColor="bg-indigo-500"
              />
            ))}
          </div>
        </section>
      </div>

      <section className="bg-white rounded-lg border border-gray-200 p-4 overflow-x-auto">
        <h2 className="font-bold text-gray-900 mb-3">أفضل المنتجات (حسب الإيراد)</h2>
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-gray-100 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-right">المنتج</th>
              <th className="px-3 py-2 text-center">الكمية</th>
              <th className="px-3 py-2 text-center">عدد مرات البيع</th>
              <th className="px-3 py-2 text-right">إيراد المنتج</th>
            </tr>
          </thead>
          <tbody>
            {analytics.topProducts.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-gray-500">لا توجد بيانات منتجات</td>
              </tr>
            ) : (
              analytics.topProducts.map((p) => (
                <tr key={p.productName} className="border-b border-gray-100">
                  <td className="px-3 py-2 text-gray-900">{p.productName}</td>
                  <td className="px-3 py-2 text-center">{p.qty}</td>
                  <td className="px-3 py-2 text-center">{p.orders}</td>
                  <td className="px-3 py-2 font-semibold text-gray-900">{p.revenue.toLocaleString()} ج.م</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <section className="bg-white rounded-lg border border-gray-200 p-4 overflow-x-auto">
          <h2 className="font-bold text-gray-900 mb-3">أداء متلقي الطلبات</h2>
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-gray-100 border-b border-gray-200">
              <tr>
                <th className="px-3 py-2 text-right">الموظف</th>
                <th className="px-3 py-2 text-center">الطلبات</th>
                <th className="px-3 py-2 text-center">نسبة الإتمام</th>
                <th className="px-3 py-2 text-center">نسبة الإلغاء</th>
                <th className="px-3 py-2 text-right">الإيراد</th>
              </tr>
            </thead>
            <tbody>
              {analytics.receiverPerformance.map((r) => (
                <tr key={r.receiver} className="border-b border-gray-100">
                  <td className="px-3 py-2 text-gray-900 font-semibold">{r.receiver}</td>
                  <td className="px-3 py-2 text-center">{r.orders}</td>
                  <td className="px-3 py-2 text-center text-green-700">{r.completionRate}%</td>
                  <td className="px-3 py-2 text-center text-red-700">{r.cancellationRate}%</td>
                  <td className="px-3 py-2 text-gray-900 font-semibold">{r.revenue.toLocaleString()} ج.م</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="bg-white rounded-lg border border-gray-200 p-4 overflow-x-auto">
          <h2 className="font-bold text-gray-900 mb-3">تفاصيل الإلغاء</h2>
          <table className="w-full min-w-[620px] text-sm">
            <thead className="bg-gray-100 border-b border-gray-200">
              <tr>
                <th className="px-3 py-2 text-right">سبب الإلغاء</th>
                <th className="px-3 py-2 text-center">العدد</th>
                <th className="px-3 py-2 text-center">النسبة</th>
                <th className="px-3 py-2 text-right">القيمة المفقودة</th>
              </tr>
            </thead>
            <tbody>
              {analytics.cancellationDetails.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-gray-500">لا توجد حالات إلغاء</td>
                </tr>
              ) : (
                analytics.cancellationDetails.map((c) => (
                  <tr key={c.reason} className="border-b border-gray-100">
                    <td className="px-3 py-2 text-gray-900">{c.reason}</td>
                    <td className="px-3 py-2 text-center">{c.count}</td>
                    <td className="px-3 py-2 text-center">{c.rate}%</td>
                    <td className="px-3 py-2 text-gray-900 font-semibold">{c.lostValue.toLocaleString()} ج.م</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      </div>

      {/* ── Revenue by Zone / Area ─────────────────────────────────────── */}
      <section className="bg-white rounded-lg border border-gray-200 p-4 overflow-x-auto">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <h2 className="font-bold text-gray-900">📍 الإيرادات والتكلفة حسب منطقة التوصيل</h2>
          <div className="text-xs text-gray-500">
            هامش التوصيل = رسوم العميل − تكلفة المندوب
          </div>
        </div>
        {zoneAnalytics.rows.length === 0 ? (
          <div className="text-center text-gray-500 py-6">لا توجد بيانات مناطق في هذه الفترة</div>
        ) : (
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-gray-100 border-b border-gray-200">
              <tr>
                <th className="px-3 py-2 text-right">المنطقة</th>
                <th className="px-3 py-2 text-center">Zone</th>
                <th className="px-3 py-2 text-center">الطلبات</th>
                <th className="px-3 py-2 text-right">الإيراد الإجمالي</th>
                <th className="px-3 py-2 text-right">رسوم التوصيل المحصلة</th>
                <th className="px-3 py-2 text-right">تكلفة المندوب</th>
                <th className="px-3 py-2 text-right">هامش التوصيل</th>
                <th className="px-3 py-2 text-right">صافي بعد التوصيل</th>
              </tr>
            </thead>
            <tbody>
              {zoneAnalytics.rows.map((r) => {
                const marginColor = r.deliveryMargin < 0 ? 'text-red-700' : r.deliveryMargin === 0 ? 'text-gray-700' : 'text-green-700'
                const widthPct = zoneAnalytics.totalRevenue ? Math.max(2, Math.round((r.revenue / zoneAnalytics.totalRevenue) * 100)) : 0
                return (
                  <tr key={r.area} className="border-b border-gray-100">
                    <td className="px-3 py-2 text-gray-900 font-semibold">
                      <div className="flex items-center gap-2">
                        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                        <span>{r.area}</span>
                      </div>
                      <div className="mt-1 h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500" style={{ width: `${widthPct}%` }} />
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center text-gray-600">{r.zone ?? '—'}</td>
                    <td className="px-3 py-2 text-center">{r.orders}</td>
                    <td className="px-3 py-2 font-semibold text-gray-900">{r.revenue.toLocaleString()} ج.م</td>
                    <td className="px-3 py-2 text-blue-700">{r.customerFees.toLocaleString()} ج.م</td>
                    <td className="px-3 py-2 text-orange-700">{r.internalCost.toLocaleString()} ج.م</td>
                    <td className={`px-3 py-2 font-bold ${marginColor}`}>
                      {r.deliveryMargin > 0 ? '+' : ''}{r.deliveryMargin.toLocaleString()} ج.م
                    </td>
                    <td className="px-3 py-2 font-bold text-emerald-700">{r.net.toLocaleString()} ج.م</td>
                  </tr>
                )
              })}
              <tr className="bg-gray-50 border-t-2 border-gray-300">
                <td className="px-3 py-2 font-bold">الإجمالي</td>
                <td className="px-3 py-2"></td>
                <td className="px-3 py-2 text-center font-bold">{zoneAnalytics.rows.reduce((s, r) => s + r.orders, 0)}</td>
                <td className="px-3 py-2 font-bold">{zoneAnalytics.totalRevenue.toLocaleString()} ج.م</td>
                <td className="px-3 py-2 font-bold text-blue-700">{zoneAnalytics.totalFees.toLocaleString()} ج.م</td>
                <td className="px-3 py-2 font-bold text-orange-700">{zoneAnalytics.totalCost.toLocaleString()} ج.م</td>
                <td className={`px-3 py-2 font-bold ${zoneAnalytics.deliveryMargin < 0 ? 'text-red-700' : 'text-green-700'}`}>
                  {zoneAnalytics.deliveryMargin > 0 ? '+' : ''}{zoneAnalytics.deliveryMargin.toLocaleString()} ج.م
                </td>
                <td className="px-3 py-2 font-bold text-emerald-700">{(zoneAnalytics.totalRevenue - zoneAnalytics.totalCost).toLocaleString()} ج.م</td>
              </tr>
            </tbody>
          </table>
        )}
      </section>

      {/* ── Peak Hours Heatmap ─────────────────────────────────────────── */}
      <section className="bg-white rounded-lg border border-gray-200 p-4 overflow-x-auto">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <h2 className="font-bold text-gray-900">🔥 ساعات الذروة (Peak Hours Heatmap)</h2>
          {peakHourAnalytics.maxCell > 0 && (
            <div className="text-xs text-gray-500">
              أعلى يوم: <span className="font-bold text-gray-800">{['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'][peakHourAnalytics.peakDayIdx]}</span>
              {' · '}
              أعلى ساعة: <span className="font-bold text-gray-800" dir="ltr">{String(peakHourAnalytics.peakHourIdx).padStart(2,'0')}:00</span>
            </div>
          )}
        </div>
        {peakHourAnalytics.maxCell === 0 ? (
          <div className="text-center text-gray-500 py-6">لا توجد بيانات أوقات طلبات في هذه الفترة</div>
        ) : (
          <div className="min-w-[860px]">
            <table className="w-full text-xs border-separate" style={{ borderSpacing: 2 }} dir="ltr">
              <thead>
                <tr>
                  <th className="text-right px-2 py-1 text-gray-500 font-medium">اليوم \\ الساعة</th>
                  {Array.from({ length: 24 }).map((_, h) => (
                    <th key={h} className="text-center text-[10px] text-gray-500 font-medium">
                      {String(h).padStart(2, '0')}
                    </th>
                  ))}
                  <th className="text-center text-[10px] text-gray-700 font-bold pl-2">مجموع</th>
                </tr>
              </thead>
              <tbody>
                {['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'].map((dayLabel, day) => (
                  <tr key={day}>
                    <td className="text-right px-2 py-1 text-gray-700 font-semibold whitespace-nowrap">{dayLabel}</td>
                    {Array.from({ length: 24 }).map((_, h) => {
                      const v = peakHourAnalytics.grid[day][h]
                      const intensity = peakHourAnalytics.maxCell ? v / peakHourAnalytics.maxCell : 0
                      // Tailwind opacity scale via inline style for smooth gradient
                      const bg = v === 0
                        ? 'rgb(243,244,246)'
                        : `rgba(220, 38, 38, ${0.15 + intensity * 0.85})`
                      const txt = intensity > 0.55 ? 'text-white' : 'text-gray-800'
                      return (
                        <td
                          key={h}
                          className={`text-center text-[10px] font-medium rounded ${txt}`}
                          style={{ background: bg, minWidth: 24, height: 24 }}
                          title={`${dayLabel} ${String(h).padStart(2,'0')}:00 — ${v} طلب`}
                        >
                          {v || ''}
                        </td>
                      )
                    })}
                    <td className="text-center font-bold text-gray-900 px-1">{peakHourAnalytics.dayTotals[day]}</td>
                  </tr>
                ))}
                <tr>
                  <td className="text-right px-2 py-1 text-gray-700 font-bold">مجموع</td>
                  {peakHourAnalytics.hourTotals.map((v, h) => (
                    <td key={h} className="text-center font-bold text-gray-700 text-[10px]">{v || ''}</td>
                  ))}
                  <td className="text-center font-bold text-gray-900 px-1">
                    {peakHourAnalytics.dayTotals.reduce((s, n) => s + n, 0)}
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="text-[11px] text-gray-500 mt-2 text-right">
              كثافة اللون تعكس عدد الطلبات في الساعة. استخدمها لتعديل جداول عمل خدمة العملاء وفريق التحضير.
            </p>
          </div>
        )}
      </section>
        </>
      )}

      <section className="bg-white rounded-lg border border-gray-200 p-4">
        <h2 className="font-bold text-gray-900 mb-3">حالة التوصيل الحالية</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          {Object.entries(analytics.deliveryCounts).map(([status, count]) => (
            <div key={status} className="rounded-lg border border-gray-200 p-3">
              <div className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${deliveryClass(status as NonNullable<DashboardOrder['delivery']>['deliveryStatus'])}`}>
                {status}
              </div>
              <p className="mt-2 text-2xl font-bold text-gray-900">{count}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white rounded-lg border border-gray-200 p-4 overflow-x-auto">
        <h2 className="font-bold text-gray-900 mb-3">آخر الطلبات</h2>
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-gray-100 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-right">رقم الطلب</th>
              <th className="px-3 py-2 text-right">التاريخ</th>
              <th className="px-3 py-2 text-right">المصدر</th>
              <th className="px-3 py-2 text-right">الطريقة</th>
              <th className="px-3 py-2 text-right">الموظف</th>
              <th className="px-3 py-2 text-right">حالة الطلب</th>
              <th className="px-3 py-2 text-right">حالة التوصيل</th>
              <th className="px-3 py-2 text-right">القيمة</th>
            </tr>
          </thead>
          <tbody>
            {filtered
              .slice()
              .sort((a, b) => (a.orderDate < b.orderDate ? 1 : -1))
              .slice(0, 12)
              .map((o) => (
                <tr key={o.id} className="border-b border-gray-100">
                  <td className="px-3 py-2 font-semibold text-gray-900" dir="ltr">{o.appOrderNo}</td>
                  <td className="px-3 py-2 text-gray-700" dir="ltr">{o.orderDate}</td>
                  <td className="px-3 py-2 text-gray-700">{o.customerSource}</td>
                  <td className="px-3 py-2 text-gray-700">{o.orderMethod}</td>
                  <td className="px-3 py-2 text-gray-700">{o.orderReceiver}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${statusClass(o.orderStatus)}`}>{o.orderStatus}</span>
                  </td>
                  <td className="px-3 py-2">
                    {o.delivery?.deliveryStatus ? (
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${deliveryClass(o.delivery.deliveryStatus)}`}>{o.delivery.deliveryStatus}</span>
                    ) : (
                      <span className="text-xs text-gray-500">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-semibold text-gray-900">{Number(o.orderTotal || 0).toLocaleString()} ج.م</td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>

      <div className="text-xs text-gray-500">آخر تحديث: {new Date().toLocaleString('en-GB')}</div>
    </div>
  )
}

function KpiCard({
  title,
  value,
  subtitle,
  tone,
}: {
  title: string
  value: string
  subtitle: string
  tone: 'red' | 'green' | 'blue' | 'emerald' | 'orange' | 'purple'
}) {
  const toneClass = {
    red: 'border-red-200 bg-red-50',
    green: 'border-green-200 bg-green-50',
    blue: 'border-blue-200 bg-blue-50',
    emerald: 'border-emerald-200 bg-emerald-50',
    orange: 'border-orange-200 bg-orange-50',
    purple: 'border-fuchsia-200 bg-fuchsia-50',
  }[tone]

  return (
    <div className={`rounded-lg border p-4 ${toneClass}`}>
      <p className="text-sm text-gray-600">{title}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
      <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
    </div>
  )
}

function Legend({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className={`inline-block w-3 h-3 rounded-full ${color}`} />
        <span className="text-gray-700">{label}</span>
      </div>
      <span className="font-semibold text-gray-900">{value}</span>
    </div>
  )
}

function HorizontalMetric({
  label,
  value,
  total,
  subValue,
  barColor,
}: {
  label: string
  value: number
  total: number
  subValue: string
  barColor: string
}) {
  const width = Math.max((value / Math.max(total, 1)) * 100, value > 0 ? 6 : 0)

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-700">{label}</span>
        <span className="text-gray-900 font-semibold">{value} | {subValue}</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${barColor}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}
