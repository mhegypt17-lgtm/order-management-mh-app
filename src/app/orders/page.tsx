'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DeliveryProgressBar } from '@/components/orders/DeliveryProgressBar'
import { cairoDateString, addDays } from '@/lib/cairoTime'
import MultiSelectFilter from '@/components/MultiSelectFilter'

export default function OrdersPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [orders, setOrders] = useState<any[]>([])
  const [targetedWidget, setTargetedWidget] = useState<{
    monthLabel: string
    productCount: number
    targetedProducts: { id: string; productName: string }[]
    totalUnits: number
    perAgent: { agent: string; units: number }[]
    monthlyGoal: number
    achievementPct: number
  }>({ monthLabel: '', productCount: 0, targetedProducts: [], totalUnits: 0, perAgent: [], monthlyGoal: 0, achievementPct: 0 })

  const [searchTerm, setSearchTerm] = useState('')
  // Multi-select filters: empty array = no filtering ("all").
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [orderTypeFilter, setOrderTypeFilter] = useState<string[]>([])
  const [orderMethodFilter, setOrderMethodFilter] = useState<string[]>([])
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string[]>([])
  const [areaFilter, setAreaFilter] = useState<string[]>([])
  const [orderMethodOptions, setOrderMethodOptions] = useState<string[]>([])
  const [paymentMethodOptions, setPaymentMethodOptions] = useState<string[]>([])
  const [scheduleFilter, setScheduleFilter] = useState<'all' | 'today' | 'scheduled'>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  // Filters to "تم التوصيل" only. Purely a client-side filter over the
  // delivery status already loaded with every order (same field the summary
  // card's "delivered" count already uses) — no extra fetch involved.
  const [deliveredOnly, setDeliveredOnly] = useState(false)
  // Bug fix: this dropdown used to be a hardcoded <option> list that had
  // drifted from the admin-configured order statuses (Settings → حالات الطلب)
  // — e.g. still offering 'مؤجل' after an admin deactivated it, while the
  // /branch view's equivalent list was separately missing 'ساري'. Now fetched
  // from the same source OrderForm.tsx already uses, so both stay in sync.
  const [orderStatusOptions, setOrderStatusOptions] = useState<string[]>(['تم', 'لاغي', 'حجز'])
  // Same bug class as orderStatusOptions above — this filter used to be a
  // hardcoded <option> list that drifted from admin-added order types
  // (Settings → نوع الطلب), e.g. missing 'Branch' after it was added there.
  const [orderTypeOptions, setOrderTypeOptions] = useState<string[]>(['B2B', 'Online', 'Instashop', 'App'])
  const [orderReceiverFilter, setOrderReceiverFilter] = useState<string[]>([])
  const [orderReceiverOptions, setOrderReceiverOptions] = useState<string[]>([])

  const clearFilters = () => {
    setSearchTerm('')
    setStatusFilter([])
    setOrderTypeFilter([])
    setOrderMethodFilter([])
    setPaymentMethodFilter([])
    setAreaFilter([])
    setScheduleFilter('all')
    setDateFrom('')
    setDateTo('')
    setDeliveredOnly(false)
    setOrderReceiverFilter([])
  }

  const fetchOrders = async () => {
    setIsLoading(true)
    try {
      // Egress fix: default to TODAY + 2 previous days (3-day window)
      // instead of the route's 35-day window — most staff only ever need
      // recent orders, and this is by far the largest JSON payload in the
      // app. Explicit date-range filters below still work exactly as before
      // by passing them straight through. `includeScheduled=1` asks the API
      // to also merge in any upcoming scheduled (حجز) booking regardless of
      // its creation date, so narrowing the window can never hide a
      // reservation someone is expecting to see.
      const params = new URLSearchParams()
      if (dateFrom || dateTo) {
        if (dateFrom) params.set('from', dateFrom)
        if (dateTo) params.set('to', dateTo)
      } else {
        const today = cairoDateString()
        params.set('from', addDays(today, -2))
        params.set('to', today)
      }
      params.set('includeScheduled', '1')
      const res = await fetch(`/api/orders?${params.toString()}`)
      const data = await res.json()
      setOrders(data.orders || [])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchOrders()
  }, [])

  // Re-fetch from the server whenever the date filters change. Needed now
  // that the default fetch window is "today only" instead of a wide 35-day
  // range — previously all filtering happened client-side over an
  // already-wide dataset, so picking an earlier date just filtered locally.
  // Skips the very first run since the mount effect above already fetches
  // the initial (empty-filters → today-only) window.
  const isFirstDateFilterRun = useRef(true)
  useEffect(() => {
    if (isFirstDateFilterRun.current) {
      isFirstDateFilterRun.current = false
      return
    }
    fetchOrders()
  }, [dateFrom, dateTo])

  useEffect(() => {
    fetch('/api/order-settings', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        const statuses = Array.isArray(d?.options?.orderStatuses) ? d.options.orderStatuses : []
        if (statuses.length > 0) setOrderStatusOptions(statuses)
        const types = Array.isArray(d?.options?.orderTypes) ? d.options.orderTypes : []
        if (types.length > 0) setOrderTypeOptions(types)
        const receivers = Array.isArray(d?.options?.orderReceivers) ? d.options.orderReceivers : []
        setOrderReceiverOptions(receivers)
        const methods = Array.isArray(d?.options?.orderMethods) ? d.options.orderMethods : []
        setOrderMethodOptions(methods)
        const payments = Array.isArray(d?.options?.paymentMethods) ? d.options.paymentMethods : []
        setPaymentMethodOptions(payments)
      })
      .catch(() => {/* keep fallback list */})
  }, [])

  useEffect(() => {
    fetch('/api/products/targeted-stats?scope=cs')
      .then((r) => r.json())
      .then((d) => {
        setTargetedWidget({
          monthLabel: String(d?.monthLabel || ''),
          productCount: Number(d?.productCount) || 0,
          targetedProducts: Array.isArray(d?.targetedProducts) ? d.targetedProducts : [],
          totalUnits: Number(d?.totalUnits) || 0,
          perAgent: Array.isArray(d?.perAgent) ? d.perAgent : [],
          monthlyGoal: Number(d?.monthlyGoal) || 0,
          achievementPct: Number(d?.achievementPct) || 0,
        })
      })
      .catch(() => {/* non-fatal */})
  }, [])

  const filteredOrders = useMemo(() => {
    const today = cairoDateString()
    return orders.filter((order) => {
      const term = searchTerm.trim().toLowerCase()
      const orderDate = order.orderDate || ''

      const matchesSearch =
        !term ||
        String(order.appOrderNo || '').toLowerCase().includes(term) ||
        String(order.customer?.phone || '').toLowerCase().includes(term) ||
        String(order.customer?.customerName || '').toLowerCase().includes(term)

      const matchesStatus = statusFilter.length === 0 || statusFilter.includes(order.orderStatus)
      const matchesType = orderTypeFilter.length === 0 || orderTypeFilter.includes(order.orderType)
      const matchesMethod = orderMethodFilter.length === 0 || orderMethodFilter.includes(order.orderMethod)
      const matchesPayment = paymentMethodFilter.length === 0 || paymentMethodFilter.includes(order.paymentMethod)
      const matchesArea = areaFilter.length === 0 || areaFilter.includes(String(order.address?.area || '').trim())
      const matchesFrom = !dateFrom || orderDate >= dateFrom
      const matchesTo = !dateTo || orderDate <= dateTo
      const matchesSchedule =
        scheduleFilter === 'all' ||
        (scheduleFilter === 'scheduled' && order.isScheduled) ||
        (scheduleFilter === 'today' && (
          (order.isScheduled && order.scheduledDate === today) ||
          (!order.isScheduled && orderDate === today)
        ))
      const matchesDelivered = !deliveredOnly || order.delivery?.deliveryStatus === 'تم التوصيل'
      const matchesReceiver = orderReceiverFilter.length === 0 || orderReceiverFilter.includes(order.orderReceiver)

      return matchesSearch && matchesStatus && matchesType && matchesMethod && matchesPayment && matchesArea && matchesFrom && matchesTo && matchesSchedule && matchesDelivered && matchesReceiver
    })
  }, [orders, searchTerm, statusFilter, orderTypeFilter, orderMethodFilter, paymentMethodFilter, areaFilter, scheduleFilter, dateFrom, dateTo, deliveredOnly, orderReceiverFilter])

  // Areas come from the already-loaded orders (no extra fetch).
  const areaOptions = useMemo(
    () =>
      Array.from(new Set(orders.map((o) => String(o.address?.area || '').trim()).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, 'ar'),
      ),
    [orders],
  )

  const statusClasses: Record<string, string> = {
    ساري: 'bg-indigo-100 text-indigo-800',
    مقبول: 'bg-teal-100 text-teal-800',
    تم: 'bg-green-100 text-green-800',
    مؤجل: 'bg-orange-100 text-orange-800',
    لاغي: 'bg-red-100 text-red-800',
    حجز: 'bg-blue-100 text-blue-800',
  }

  const summary = useMemo(() => {
    const delivered = filteredOrders.filter((o) => o.delivery?.deliveryStatus === 'تم التوصيل').length
    const total = filteredOrders.length
    const fulfilmentPct = total > 0 ? (delivered / total) * 100 : 0
    return {
      count: total,
      delivered,
      fulfilmentPct,
    }
  }, [filteredOrders])

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">📋 الطلبات</h1>
          <p className="text-gray-600 mt-1">قائمة الطلبات مع البحث والتصفية</p>
        </div>
        <button
          onClick={() => router.push('/orders/new')}
          className="w-full sm:w-auto px-5 py-3 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold min-h-[44px]"
        >
          + طلب جديد
        </button>
      </div>

      {/* 🎯 Targeted products focus widget */}
      {targetedWidget.productCount > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xl">🎯</span>
              <span className="font-bold text-amber-900">منتجات الشهر المستهدفة</span>
              <span className="text-xs text-amber-700">({targetedWidget.monthLabel})</span>
            </div>
            <div className="text-sm">
              <span className="text-amber-800">إجمالي الوحدات هذا الشهر: </span>
              <span className="font-bold text-amber-900 text-lg">{targetedWidget.totalUnits.toLocaleString()}</span>
              {targetedWidget.monthlyGoal > 0 && (
                <>
                  <span className="text-amber-800"> / {targetedWidget.monthlyGoal.toLocaleString()}</span>
                  <span className="mr-2 inline-block px-2 py-0.5 rounded-full bg-amber-500 text-white text-xs font-bold">
                    {targetedWidget.achievementPct.toFixed(1)}%
                  </span>
                </>
              )}
            </div>
          </div>
          {targetedWidget.monthlyGoal > 0 && (
            <div>
              <div className="h-2 w-full bg-amber-100 rounded-full overflow-hidden">
                <div
                  className={`h-full ${targetedWidget.achievementPct >= 100 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                  style={{ width: `${Math.min(100, targetedWidget.achievementPct)}%` }}
                />
              </div>
              <div className="text-[11px] text-amber-800 mt-1 text-right">
                إنجاز الهدف الشهري للفريق (إجمالي جميع الوكيلات)
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {targetedWidget.targetedProducts.map((p) => (
              <span
                key={p.id}
                className="px-3 py-1 bg-white border border-amber-300 rounded-full text-xs text-amber-800 font-medium"
              >
                {p.productName}
              </span>
            ))}
          </div>
          {targetedWidget.perAgent.length > 0 && (
            <div className="pt-2 border-t border-amber-200">
              <div className="text-xs font-bold text-amber-900 mb-2">وحدات حسب متلقي الطلب:</div>
              <div className="flex flex-wrap gap-2">
                {targetedWidget.perAgent.map((row) => (
                  <span
                    key={row.agent}
                    className="inline-flex items-center gap-2 px-3 py-1 bg-white border border-amber-400 rounded-full text-xs"
                  >
                    <span className="font-bold text-gray-800">{row.agent}</span>
                    <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-white font-bold">
                      {row.units.toLocaleString()}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
        <input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="بحث برقم الطلب / الهاتف / الاسم"
          className="md:col-span-2 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
          dir="rtl"
        />

        <MultiSelectFilter allLabel="كل الحالات" options={orderStatusOptions} selected={statusFilter} onChange={setStatusFilter} />

        <MultiSelectFilter allLabel="كل الأنواع" options={orderTypeOptions} selected={orderTypeFilter} onChange={setOrderTypeFilter} />

        <MultiSelectFilter allLabel="كل طرق الطلب" options={orderMethodOptions} selected={orderMethodFilter} onChange={setOrderMethodFilter} />

        <MultiSelectFilter allLabel="كل طرق الدفع" options={paymentMethodOptions} selected={paymentMethodFilter} onChange={setPaymentMethodFilter} />

        <MultiSelectFilter allLabel="كل المناطق" options={areaOptions} selected={areaFilter} onChange={setAreaFilter} />

        <select
          value={scheduleFilter}
          onChange={(e) => setScheduleFilter(e.target.value as 'all' | 'today' | 'scheduled')}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
          dir="rtl"
        >
          <option value="all">الكل</option>
          <option value="today">طلبات اليوم</option>
          <option value="scheduled">طلبات مجدولة</option>
        </select>

        <MultiSelectFilter allLabel="كل متلقي الطلب" options={orderReceiverOptions} selected={orderReceiverFilter} onChange={setOrderReceiverFilter} />

        <label className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg cursor-pointer select-none" dir="rtl">
          <input
            type="checkbox"
            checked={deliveredOnly}
            onChange={(e) => setDeliveredOnly(e.target.checked)}
            className="h-4 w-4 accent-red-600"
          />
          <span className="text-sm text-gray-700">تم التوصيل فقط</span>
        </label>

        <button
          onClick={fetchOrders}
          className="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800"
        >
          تحديث
        </button>

        <button
          onClick={clearFilters}
          className="px-3 py-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-700"
        >
          مسح الفلاتر
        </button>

        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg"
          dir="ltr"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg"
          dir="ltr"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">عدد الطلبات المعروضة</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{summary.count}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">نسبة الطلبات المنفذة</p>
          <div className="flex items-baseline gap-2 mt-1">
            <p className="text-2xl font-bold text-gray-900">{summary.delivered.toLocaleString()}</p>
            <span className="text-sm text-gray-500">/ {summary.count.toLocaleString()} طلب</span>
          </div>
          {summary.count > 0 ? (
            <div className="mt-2">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className={`font-bold ${summary.fulfilmentPct >= 100 ? 'text-emerald-700' : summary.fulfilmentPct >= 50 ? 'text-amber-700' : 'text-red-700'}`}>
                  {summary.fulfilmentPct.toFixed(1)}% تم التوصيل
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className={`h-full ${summary.fulfilmentPct >= 100 ? 'bg-emerald-500' : summary.fulfilmentPct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                  style={{ width: `${Math.min(100, summary.fulfilmentPct)}%` }}
                />
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-400 mt-1">لا توجد طلبات في الفترة المحددة</p>
          )}
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-gray-500">نصيحة سريعة</p>
            <p className="text-sm font-medium text-gray-800 mt-1">اضغط على أي صف لفتح تفاصيل الطلب</p>
          </div>
          <span className="text-2xl">👆</span>
        </div>
      </div>

      {/* Mobile cards (sm and below) */}
      <div className="md:hidden space-y-3">
        {isLoading ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500">⏳ جاري تحميل الطلبات...</div>
        ) : filteredOrders.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500">📭 لا توجد طلبات مطابقة</div>
        ) : (
          filteredOrders.map((order) => (
            <div
              key={`m-${order.id}`}
              onClick={() => router.push(`/orders/${order.id}`)}
              className={`bg-white rounded-lg border-2 p-3 cursor-pointer hover:shadow ${order.isPriority ? 'border-red-400 bg-red-50/40' : order.isScheduled ? 'border-indigo-300' : 'border-gray-200'}`}
            >
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  {order.isPriority && (
                    <span title={order.priorityReason || 'أولوية عاجلة'} className="px-1.5 py-0.5 rounded bg-red-600 text-white text-[10px] font-bold animate-pulse">🚨 عاجل</span>
                  )}
                  {order.isScheduled && <span title="حجز">📅</span>}
                  <span className="font-bold text-gray-900">{order.appOrderNo}</span>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${statusClasses[order.orderStatus] || 'bg-gray-100 text-gray-700'}`}>
                  {order.orderStatus}
                </span>
              </div>
              <div className="mt-2 text-sm text-gray-800">{order.customer?.customerName || '-'}</div>
              <div className="text-xs text-gray-600 flex flex-wrap gap-x-3 gap-y-1 mt-1">
                <span dir="ltr">📞 {order.customer?.phone || '-'}</span>
                <span dir="ltr">📅 {order.orderDate}</span>
                {order.isScheduled && order.scheduledDate && (
                  <span className="text-indigo-700" dir="rtl">⏰ {order.scheduledDate}{order.scheduledTimeSlot ? ` — ${order.scheduledTimeSlot === 'ساعة محددة' ? (order.scheduledSpecificTime || 'موعد') : order.scheduledTimeSlot}` : ''}</span>
                )}
              </div>
              <div className="mt-2">
                <DeliveryProgressBar status={order.delivery?.deliveryStatus} compact />
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
                {(() => {
                  // Show a breakdown badge (strike-through pre-total + net + tags)
                  // whenever the customer actually pays *less* than the raw
                  // orderTotal — i.e. a voucher discount and/or a wallet
                  // deduction was applied. Otherwise show the plain total.
                  //
                  // walletUsed is not always returned by the orders_dashboard_v1
                  // view (the current v1 uses `o.*` frozen at creation time and
                  // does not expose walletUsed), so infer it from the invariant
                  // netTotal = orderTotal - discountAmount - walletUsed. This
                  // way the wallet badge appears the moment migration #4 is
                  // run OR whenever any explicit walletUsed value comes back.
                  const orderTotalNum = Number(order.orderTotal || 0)
                  const discountNum = Number(order.discountAmount || 0)
                  const netNum = Number(order.netTotal ?? orderTotalNum)
                  const walletFromField = Number((order as any).walletUsed || 0)
                  const walletInferred = Math.max(0, orderTotalNum - discountNum - netNum)
                  const walletNum = walletFromField > 0 ? walletFromField : walletInferred
                  const hasDiscount = Boolean(order.discountCode) && discountNum > 0
                  const hasWallet = walletNum > 0
                  if (!hasDiscount && !hasWallet) {
                    return <span className="text-sm font-bold text-gray-900">{orderTotalNum.toLocaleString()} ج.م</span>
                  }
                  return (
                    <div className="flex flex-col items-start gap-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-gray-400 line-through">{orderTotalNum.toLocaleString()}</span>
                        <span className="text-sm font-bold text-green-700">{netNum.toLocaleString()} ج.م</span>
                      </div>
                      <div className="flex items-center gap-1 flex-wrap">
                        {hasDiscount && (
                          <span
                            className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 font-mono"
                            dir="ltr"
                            title={`خصم ${discountNum.toLocaleString()} ج.م`}
                          >
                            🏷️ {order.discountCode}
                          </span>
                        )}
                        {hasWallet && (
                          <span
                            className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300"
                            title={`خصم من المحفظة ${walletNum.toLocaleString()} ج.م`}
                          >
                            💳 محفظة −{walletNum.toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })()}
                <span className="text-xs text-gray-500">👤 {order.createdBy || '-'}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    router.push(`/orders/new?reorderFrom=${encodeURIComponent(order.id)}&reset=${Date.now()}`)
                  }}
                  title="فتح طلب جديد بنفس بيانات هذا الطلب للمراجعة ثم الحفظ"
                  className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 text-emerald-700 text-xs font-semibold min-h-[36px]"
                >
                  🔄 إعادة
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop table (md and up) */}
      <div className="hidden md:block bg-white rounded-lg border border-gray-200 overflow-x-auto">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">⏳ جاري تحميل الطلبات...</div>
        ) : filteredOrders.length === 0 ? (
          <div className="p-8 text-center text-gray-500">📭 لا توجد طلبات مطابقة</div>
        ) : (
          <table className="w-full min-w-[980px]">
            <thead className="bg-gray-100 border-b border-gray-200 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-right text-sm font-semibold">رقم الطلب</th>
                <th className="px-4 py-3 text-right text-sm font-semibold">التاريخ</th>
                <th className="px-4 py-3 text-right text-sm font-semibold">الحجز</th>
                <th className="px-4 py-3 text-right text-sm font-semibold">العميل</th>
                <th className="px-4 py-3 text-right text-sm font-semibold">الهاتف</th>
                <th className="px-4 py-3 text-right text-sm font-semibold">الحالة</th>
                <th className="px-4 py-3 text-right text-sm font-semibold min-w-[220px]">تقدم التوصيل</th>
                <th className="px-4 py-3 text-right text-sm font-semibold">الإجمالي</th>
                <th className="px-4 py-3 text-right text-sm font-semibold">المنشئ</th>
                <th className="px-4 py-3 text-center text-sm font-semibold w-24">إعادة</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order) => (
                <tr
                  key={order.id}
                  onClick={() => router.push(`/orders/${order.id}`)}
                  className={`border-b border-gray-100 hover:bg-red-50 cursor-pointer ${order.isPriority ? 'border-r-4 border-r-red-500 bg-red-50/40' : order.isScheduled ? 'border-r-4 border-r-indigo-400' : ''}`}
                >
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                    {order.isPriority && (
                      <span title={order.priorityReason || 'أولوية عاجلة'} className="ml-1 inline-block px-1.5 py-0.5 rounded bg-red-600 text-white text-[10px] font-bold animate-pulse">🚨 عاجل</span>
                    )}
                    {order.isScheduled && <span title="حجز" className="ml-1">📅</span>}
                    {order.appOrderNo}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700" dir="ltr">{order.orderDate}</td>
                  <td className="px-4 py-3 text-xs">
                    {order.isScheduled && order.scheduledDate ? (
                      <span className="inline-block px-2 py-1 rounded bg-indigo-50 text-indigo-800 font-semibold" dir="rtl">
                        📅 {order.scheduledDate}
                        {order.scheduledTimeSlot ? ` — ${order.scheduledTimeSlot === 'ساعة محددة' ? (order.scheduledSpecificTime || 'موعد') : order.scheduledTimeSlot}` : ''}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-800">{order.customer?.customerName || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-700" dir="ltr">{order.customer?.phone || '-'}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${statusClasses[order.orderStatus] || 'bg-gray-100 text-gray-700'}`}>
                      {order.orderStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <DeliveryProgressBar status={order.delivery?.deliveryStatus} compact />
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                    {(() => {
                      // Desktop table — same breakdown/badge logic as the
                      // mobile card view above. Infers wallet from netTotal
                      // when the view doesn't expose walletUsed.
                      const orderTotalNum = Number(order.orderTotal || 0)
                      const discountNum = Number(order.discountAmount || 0)
                      const netNum = Number(order.netTotal ?? orderTotalNum)
                      const walletFromField = Number((order as any).walletUsed || 0)
                      const walletInferred = Math.max(0, orderTotalNum - discountNum - netNum)
                      const walletNum = walletFromField > 0 ? walletFromField : walletInferred
                      const hasDiscount = Boolean(order.discountCode) && discountNum > 0
                      const hasWallet = walletNum > 0
                      if (!hasDiscount && !hasWallet) {
                        return <>{orderTotalNum.toLocaleString()} ج.م</>
                      }
                      return (
                        <div className="flex flex-col items-start gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-gray-400 line-through">{orderTotalNum.toLocaleString()}</span>
                            <span className="text-green-700">{netNum.toLocaleString()} ج.م</span>
                          </div>
                          <div className="flex items-center gap-1 flex-wrap">
                            {hasDiscount && (
                              <span
                                className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 font-mono"
                                dir="ltr"
                                title={`خصم ${discountNum.toLocaleString()} ج.م`}
                              >
                                🏷️ {order.discountCode}
                              </span>
                            )}
                            {hasWallet && (
                              <span
                                className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300"
                                title={`خصم من المحفظة ${walletNum.toLocaleString()} ج.م`}
                              >
                                💳 محفظة −{walletNum.toLocaleString()}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })()}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{order.createdBy || '-'}</td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        router.push(`/orders/new?reorderFrom=${encodeURIComponent(order.id)}&reset=${Date.now()}`)
                      }}
                      title="فتح طلب جديد بنفس بيانات هذا الطلب للمراجعة ثم الحفظ"
                      className="px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 text-emerald-700 text-xs font-semibold"
                    >
                      🔄 إعادة
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
