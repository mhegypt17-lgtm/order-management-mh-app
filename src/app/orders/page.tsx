'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/lib/auth'
import { DeliveryProgressBar } from '@/components/orders/DeliveryProgressBar'

export default function OrdersPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const [isLoading, setIsLoading] = useState(true)
  const [orders, setOrders] = useState<any[]>([])
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)

  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [orderTypeFilter, setOrderTypeFilter] = useState('all')
  const [scheduleFilter, setScheduleFilter] = useState<'all' | 'today' | 'scheduled'>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const clearFilters = () => {
    setSearchTerm('')
    setStatusFilter('all')
    setOrderTypeFilter('all')
    setScheduleFilter('all')
    setDateFrom('')
    setDateTo('')
  }

  const fetchOrders = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/orders')
      const data = await res.json()
      setOrders(data.orders || [])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchOrders()
  }, [])

  const filteredOrders = useMemo(() => {
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    return orders.filter((order) => {
      const term = searchTerm.trim().toLowerCase()
      const orderDate = order.orderDate || ''

      const matchesSearch =
        !term ||
        String(order.appOrderNo || '').toLowerCase().includes(term) ||
        String(order.customer?.phone || '').toLowerCase().includes(term) ||
        String(order.customer?.customerName || '').toLowerCase().includes(term)

      const matchesStatus = statusFilter === 'all' || order.orderStatus === statusFilter
      const matchesType = orderTypeFilter === 'all' || order.orderType === orderTypeFilter
      const matchesFrom = !dateFrom || orderDate >= dateFrom
      const matchesTo = !dateTo || orderDate <= dateTo
      const matchesSchedule =
        scheduleFilter === 'all' ||
        (scheduleFilter === 'scheduled' && order.isScheduled) ||
        (scheduleFilter === 'today' && (
          (order.isScheduled && order.scheduledDate === today) ||
          (!order.isScheduled && orderDate === today)
        ))

      return matchesSearch && matchesStatus && matchesType && matchesFrom && matchesTo && matchesSchedule
    })
  }, [orders, searchTerm, statusFilter, orderTypeFilter, scheduleFilter, dateFrom, dateTo])

  const statusClasses: Record<string, string> = {
    ساري: 'bg-indigo-100 text-indigo-800',
    مقبول: 'bg-teal-100 text-teal-800',
    تم: 'bg-green-100 text-green-800',
    مؤجل: 'bg-orange-100 text-orange-800',
    لاغي: 'bg-red-100 text-red-800',
    حجز: 'bg-blue-100 text-blue-800',
  }

  const summary = useMemo(() => {
    const totalValue = filteredOrders.reduce((sum, order) => sum + Number(order.orderTotal || 0), 0)
    return {
      count: filteredOrders.length,
      totalValue,
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

      <div className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
        <input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="بحث برقم الطلب / الهاتف / الاسم"
          className="md:col-span-2 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
          dir="rtl"
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
          dir="rtl"
        >
          <option value="all">كل الحالات</option>
          <option value="ساري">ساري</option>
          <option value="مؤجل">مؤجل</option>
          <option value="حجز">حجز</option>
          <option value="تم">تم</option>
          <option value="لاغي">لاغي</option>
        </select>

        <select
          value={orderTypeFilter}
          onChange={(e) => setOrderTypeFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
          dir="rtl"
        >
          <option value="all">كل الأنواع</option>
          <option value="B2B">B2B</option>
          <option value="Online">Online</option>
          <option value="Instashop">Instashop</option>
          <option value="App">App</option>
        </select>

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
          <p className="text-sm text-gray-500">إجمالي قيمة الطلبات</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{summary.totalValue.toLocaleString()} ج.م</p>
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
                <span className="text-sm font-bold text-gray-900">{Number(order.orderTotal || 0).toLocaleString()} ج.م</span>
                <span className="text-xs text-gray-500">👤 {order.createdBy || '-'}</span>
                <button
                  disabled={duplicatingId === order.id}
                  onClick={async (e) => {
                    e.stopPropagation()
                    if (duplicatingId) return
                    setDuplicatingId(order.id)
                    const t = toast.loading('جاري إعادة الطلب...')
                    try {
                      const res = await fetch(`/api/orders/${order.id}/duplicate`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ createdBy: user?.id || 'unknown' }),
                      })
                      if (!res.ok) throw new Error('Failed')
                      const data = await res.json()
                      toast.dismiss(t)
                      toast.success(`✅ تم إنشاء الطلب ${data.order?.appOrderNo || ''}`)
                      await fetchOrders()
                    } catch {
                      toast.dismiss(t)
                      toast.error('تعذرت إعادة الطلب')
                    } finally {
                      setDuplicatingId(null)
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 text-emerald-700 text-xs font-semibold min-h-[36px]"
                >
                  {duplicatingId === order.id ? '⏳ ...' : '🔄 إعادة'}
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
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900">{Number(order.orderTotal || 0).toLocaleString()} ج.م</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{order.createdBy || '-'}</td>
                  <td className="px-4 py-3 text-center">
                    <button
                      disabled={duplicatingId === order.id}
                      onClick={async (e) => {
                        e.stopPropagation()
                        if (duplicatingId) return
                        setDuplicatingId(order.id)
                        const t = toast.loading('جاري إعادة الطلب...')
                        try {
                          const res = await fetch(`/api/orders/${order.id}/duplicate`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ createdBy: user?.id || 'unknown' }),
                          })
                          if (!res.ok) throw new Error('Failed')
                          const data = await res.json()
                          toast.dismiss(t)
                          toast.success(`✅ تم إنشاء الطلب ${data.order?.appOrderNo || ''}`)
                          const w = data.warnings || {}
                          if (w.inactiveProductCount > 0) {
                            toast(`⚠️ ${w.inactiveProductCount} منتج غير متاح حالياً`, { duration: 5000 })
                          }
                          if (w.priceChangedCount > 0) {
                            toast(`💰 تم تحديث أسعار ${w.priceChangedCount} منتج`, { duration: 5000 })
                          }
                          if (w.skippedItemCount > 0) {
                            toast(`ℹ️ تم تجاهل ${w.skippedItemCount} منتج غير موجود في الكتالوج`, { duration: 5000 })
                          }
                          await fetchOrders()
                        } catch {
                          toast.dismiss(t)
                          toast.error('تعذرت إعادة الطلب')
                        } finally {
                          setDuplicatingId(null)
                        }
                      }}
                      title="إعادة الطلب بنقرة واحدة"
                      className="px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 text-emerald-700 text-xs font-semibold"
                    >
                      {duplicatingId === order.id ? '⏳ ...' : '🔄 إعادة'}
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
