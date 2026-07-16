'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { calculateComplaintAnalytics, type ComplaintAnalyticsRecord } from '@/lib/complaintAnalytics'
import { cairoDateString, cairoFirstDayOfMonth, addDays, formatCairoDateTime } from '@/lib/cairoTime'
import FeedbackSummaryWidget from '@/components/FeedbackSummaryWidget'

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
  orderStatus: 'تم' | 'مؤجل' | 'لاغي' | 'حجز'
  cancellationReason: 'نفاد المنتج' | 'عدم توفر' | 'تأخير التوصيل' | 'سعر مرتفع' | 'موعد غير مناسب' | 'Other' | null
  orderTotal: number
  customerId: string
  items: Array<{ id: string; productName: string; quantity: number; lineTotal: number }>
  delivery?: { deliveryStatus: 'لم يخرج بعد' | 'جاهز' | 'في الطريق' | 'تم التوصيل' }
}

type DashboardComplaint = ComplaintAnalyticsRecord

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
  const today = cairoDateString()
  for (let i = days - 1; i >= 0; i -= 1) {
    arr.push(addDays(today, -i))
  }
  return arr
}

export default function DashboardPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [orders, setOrders] = useState<DashboardOrder[]>([])
  const [complaints, setComplaints] = useState<DashboardComplaint[]>([])
  const [monthlyCompensationBudget, setMonthlyCompensationBudget] = useState(0)
  const [customerStatusStats, setCustomerStatusStats] = useState({ warning: 0, suspended: 0 })
  const [targetedStats, setTargetedStats] = useState<{
    monthLabel: string
    totalUnits: number
    productCount: number
    targetedProducts: { id: string; productName: string }[]
    perAgent: { agent: string; units: number }[]
    monthlyGoal: number
    achievementPct: number
  }>({ monthLabel: '', totalUnits: 0, productCount: 0, targetedProducts: [], perAgent: [], monthlyGoal: 0, achievementPct: 0 })
  const firstDayOfMonth = cairoFirstDayOfMonth()
  const today = cairoDateString()

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
      // Push the current date window to the server — /api/orders GET
      // supports ?from=&to= filters. Previously the client pulled the
      // ENTIRE enriched orders list on every dashboard refresh and then
      // filtered it in JS. The client-side `filtered` useMemo below is
      // preserved as belt-and-suspenders in case dates change without a
      // refetch.
      const ordersQs = new URLSearchParams()
      if (dateFrom) ordersQs.set('from', dateFrom)
      if (dateTo) ordersQs.set('to', dateTo)
      const ordersUrl = ordersQs.toString()
        ? `/api/orders?${ordersQs.toString()}`
        : '/api/orders'

      const [ordersRes, complaintsRes, settingsRes] = await Promise.all([
        fetch(ordersUrl),
        fetch('/api/complaints'),
        fetch('/api/order-settings'),
      ])

      const ordersData = await ordersRes.json()
      const complaintsData = await complaintsRes.json()
      const settingsData = await settingsRes.json()

      setOrders(ordersData.orders || [])
      setComplaints(Array.isArray(complaintsData) ? complaintsData : [])
      setMonthlyCompensationBudget(Number(settingsData?.settings?.monthlyCompensationBudget) || 0)

      try {
        const statsRes = await fetch('/api/customers/stats')
        const statsData = await statsRes.json()
        setCustomerStatusStats({
          warning: Number(statsData?.warning) || 0,
          suspended: Number(statsData?.suspended) || 0,
        })
      } catch {
        /* non-fatal */
      }

      try {
        const tRes = await fetch('/api/products/targeted-stats?scope=admin')
        const tData = await tRes.json()
        setTargetedStats({
          monthLabel: String(tData?.monthLabel || ''),
          totalUnits: Number(tData?.totalUnits) || 0,
          productCount: Number(tData?.productCount) || 0,
          targetedProducts: Array.isArray(tData?.targetedProducts) ? tData.targetedProducts : [],
          perAgent: Array.isArray(tData?.perAgent) ? tData.perAgent : [],
          monthlyGoal: Number(tData?.monthlyGoal) || 0,
          achievementPct: Number(tData?.achievementPct) || 0,
        })
      } catch {
        /* non-fatal */
      }
    } finally {
      setIsLoading(false)
      // Stamp the timestamp on both success and failure paths so the user
      // sees when the last attempt completed (Phase 2D.1b).
      setLastUpdated(new Date())
    }
  }

  useEffect(() => {
    fetchOrders()
    // Refetch when the user changes the date window so the server can
    // scope the response instead of shipping everything.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo])

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
    const orderTypeMap = new Map<string, { count: number; revenue: number }>()
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

      const otype = o.orderType || 'Unknown'
      const otypeEntry = orderTypeMap.get(otype) || { count: 0, revenue: 0 }
      otypeEntry.count += 1
      otypeEntry.revenue += Number(o.orderTotal || 0)
      orderTypeMap.set(otype, otypeEntry)

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

    const orderTypes = Array.from(orderTypeMap.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.revenue - a.revenue)

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
      orderTypes,
      topProducts,
      receiverPerformance,
      cancellationDetails,
      daily,
      maxDailyOrders,
    }
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
          {lastUpdated && (
            <span
              className="text-xs text-gray-500 self-center whitespace-nowrap"
              title={lastUpdated.toISOString()}
            >
              آخر تحديث:{' '}
              {lastUpdated.toLocaleTimeString('ar-EG', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </span>
          )}
          <button
            onClick={fetchOrders}
            disabled={isLoading}
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:bg-red-300 disabled:cursor-not-allowed text-white font-semibold"
          >
            {isLoading ? '⏳ جاري التحديث...' : '🔄 تحديث البيانات'}
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
        <KpiCard title="عملاء بحالة تحذير" value={customerStatusStats.warning.toLocaleString()} tone="orange" subtitle="بحاجة للمتابعة" />
        <KpiCard title="عملاء موقوفون" value={customerStatusStats.suspended.toLocaleString()} tone="red" subtitle="احتيال / مشاكل كبرى" />
        <KpiCard
          title="🎯 وحدات مستهدفة (هذا الشهر)"
          value={
            targetedStats.monthlyGoal > 0
              ? `${targetedStats.totalUnits.toLocaleString()} / ${targetedStats.monthlyGoal.toLocaleString()}`
              : targetedStats.totalUnits.toLocaleString()
          }
          tone="amber"
          subtitle={
            targetedStats.monthlyGoal > 0
              ? `إنجاز الفريق: ${targetedStats.achievementPct.toFixed(1)}% · ${targetedStats.monthLabel}`
              : `${targetedStats.productCount} منتج مستهدف · ${targetedStats.monthLabel}`
          }
        />
      </div>

      <FeedbackSummaryWidget from={dateFrom} to={dateTo} showRecent showPerAgent />

      <section className="bg-white rounded-lg border border-amber-200 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h2 className="font-bold text-gray-900">🎯 أداء الوكلاء على المنتجات المستهدفة</h2>
            <p className="text-xs text-gray-500">وحدات مباعة خلال الشهر الحالي (طلبات تمت فقط)</p>
          </div>
          <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">
            {targetedStats.productCount === 0
              ? 'لا توجد منتجات مستهدفة حالياً'
              : targetedStats.monthlyGoal > 0
              ? `الإجمالي: ${targetedStats.totalUnits.toLocaleString()} / ${targetedStats.monthlyGoal.toLocaleString()} وحدة · ${targetedStats.achievementPct.toFixed(1)}%`
              : `الإجمالي: ${targetedStats.totalUnits.toLocaleString()} وحدة`}
          </span>
        </div>
        {targetedStats.monthlyGoal > 0 && targetedStats.productCount > 0 && (
          <div>
            <div className="h-2 w-full bg-amber-100 rounded-full overflow-hidden">
              <div
                className={`h-full ${targetedStats.achievementPct >= 100 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                style={{ width: `${Math.min(100, targetedStats.achievementPct)}%` }}
              />
            </div>
            <div className="text-[11px] text-amber-800 mt-1 text-right">
              إنجاز الهدف الشهري للفريق (إجمالي جميع الوكيلات)
            </div>
          </div>
        )}
        {targetedStats.productCount > 0 && (
          <div className="text-xs text-gray-600">
            <span className="font-semibold">المنتجات المستهدفة:</span>{' '}
            {targetedStats.targetedProducts.map((p) => p.productName).join('، ')}
          </div>
        )}
        {targetedStats.perAgent.length === 0 ? (
          <p className="text-sm text-gray-500">لا توجد مبيعات للمنتجات المستهدفة خلال هذا الشهر بعد.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[360px] text-sm">
              <thead>
                <tr className="text-right text-gray-700 border-b border-gray-200">
                  <th className="py-2 px-3">#</th>
                  <th className="py-2 px-3">الوكيل</th>
                  <th className="py-2 px-3">الوحدات المباعة</th>
                </tr>
              </thead>
              <tbody>
                {targetedStats.perAgent.map((row, i) => (
                  <tr key={row.agent} className="border-b last:border-0 border-gray-100">
                    <td className="py-2 px-3 text-gray-500">{i + 1}</td>
                    <td className="py-2 px-3 font-medium text-gray-900">{row.agent}</td>
                    <td className="py-2 px-3 font-bold text-amber-700">{row.units.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

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

        {/* Two-level Reason → Sub-reason breakdown. Each parent reason is a
            shaded header row; its sub-reasons are indented underneath. Share
            = share of the parent count. Uses `reasonBreakdown` from
            complaintAnalytics which already sorts parents & subs by count desc. */}
        <section className="bg-gray-50 rounded-lg border border-gray-200 p-4 overflow-x-auto mt-4">
          <h3 className="font-bold text-gray-900 mb-3">تفصيل الأسباب الفرعية</h3>
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-gray-100 border-b border-gray-200">
              <tr>
                <th className="px-3 py-2 text-right">السبب / السبب الفرعي</th>
                <th className="px-3 py-2 text-center">العدد</th>
                <th className="px-3 py-2 text-center">النسبة داخل السبب</th>
                <th className="px-3 py-2 text-center">النسبة من الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {complaintAnalytics.reasonBreakdown.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-gray-500">لا توجد شكاوى في هذا النطاق</td>
                </tr>
              ) : (
                complaintAnalytics.reasonBreakdown.map((parent) => (
                  <Fragment key={parent.name}>
                    <tr className="bg-red-50 border-b border-red-100">
                      <td className="px-3 py-2 font-bold text-red-900">{parent.name}</td>
                      <td className="px-3 py-2 text-center font-bold text-red-900">{parent.count}</td>
                      <td className="px-3 py-2 text-center text-red-900">—</td>
                      <td className="px-3 py-2 text-center font-bold text-red-900">{parent.share}%</td>
                    </tr>
                    {parent.subReasons.map((sub) => (
                      <tr key={`${parent.name}::${sub.name}`} className="border-b border-gray-100">
                        <td className="px-3 py-2 text-gray-700 pr-8">└ {sub.name}</td>
                        <td className="px-3 py-2 text-center">{sub.count}</td>
                        <td className="px-3 py-2 text-center">{sub.share}%</td>
                        <td className="px-3 py-2 text-center text-gray-500">{sub.shareOfTotal}%</td>
                      </tr>
                    ))}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </section>
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

      <section className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-gray-900">💰 الإيراد حسب نوع الطلب</h2>
          <span className="text-xs text-gray-500">
            إجمالي: {analytics.totalRevenue.toLocaleString()} ج.م
          </span>
        </div>
        {analytics.orderTypes.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">لا توجد بيانات</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {analytics.orderTypes.map((t) => {
              const share = analytics.totalRevenue > 0
                ? Math.round((t.revenue / analytics.totalRevenue) * 100)
                : 0
              return (
                <div key={t.name} className="border border-gray-200 rounded-lg p-3 bg-gradient-to-br from-emerald-50 to-white">
                  <div className="text-xs text-gray-500 uppercase tracking-wide">{t.name}</div>
                  <div className="text-2xl font-bold text-emerald-700 mt-1">
                    {t.revenue.toLocaleString()} <span className="text-sm text-gray-500">ج.م</span>
                  </div>
                  <div className="text-xs text-gray-600 mt-1">
                    {t.count} طلب · {share}% من الإيراد
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

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

      <div className="text-xs text-gray-500">آخر تحديث: {formatCairoDateTime(new Date(), 'en-GB')}</div>
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
  tone: 'red' | 'green' | 'blue' | 'emerald' | 'orange' | 'purple' | 'amber'
}) {
  const toneClass = {
    red: 'border-red-200 bg-red-50',
    green: 'border-green-200 bg-green-50',
    blue: 'border-blue-200 bg-blue-50',
    emerald: 'border-emerald-200 bg-emerald-50',
    orange: 'border-orange-200 bg-orange-50',
    purple: 'border-fuchsia-200 bg-fuchsia-50',
    amber: 'border-amber-300 bg-amber-50',
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
