'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DeliveryProgressBar } from '@/components/orders/DeliveryProgressBar'

type BranchOrder = {
  id: string
  appOrderNo: string
  orderDate: string
  orderTime: string
  orderTotal: number
  orderStatus: string
  isScheduled?: boolean
  scheduledDate?: string | null
  scheduledTimeSlot?: string | null
  scheduledSpecificTime?: string | null
  isPriority?: boolean
  priorityReason?: string | null
  customer: { customerName: string; phone: string } | null
  address: { streetAddress: string; googleMapsLink: string } | null
  items: Array<{ id: string; productName: string; quantity: number }>
  delivery: { 
    deliveryStatus: 'قبول' | 'جاهز' | 'في الطريق' | 'تم التوصيل' | 'لم يخرج بعد'
    branchComments: string
  }
}

export default function BranchPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [orders, setOrders] = useState<BranchOrder[]>([])

  const _now = new Date()
  const today = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-${String(_now.getDate()).padStart(2, '0')}`
  const [dateFilter, setDateFilter] = useState(today)
  const [statusFilter, setStatusFilter] = useState<'all' | 'قبول' | 'جاهز' | 'في الطريق' | 'تم التوصيل'>('all')
  const [scheduleFilter, setScheduleFilter] = useState<'all' | 'today' | 'scheduled' | 'upcoming'>('all')

  const clearFilters = () => {
    setDateFilter(today)
    setStatusFilter('all')
    setScheduleFilter('all')
  }

  const fetchOrders = async () => {
    setIsLoading(true)
    try {
      const params: Record<string, string> = {
        deliveryStatus: statusFilter,
      }
      // When a schedule view is chosen, drop the date filter (server uses view).
      if (scheduleFilter !== 'all') {
        params.view = scheduleFilter
      } else {
        params.date = dateFilter
      }
      const query = new URLSearchParams(params)

      const res = await fetch(`/api/branch/orders?${query.toString()}`)
      const data = await res.json()
      setOrders(data.orders || [])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchOrders()
  }, [dateFilter, statusFilter, scheduleFilter])

  const orderStatusClasses: Record<string, string> = {
    ساري: 'bg-indigo-100 text-indigo-800',
    مؤجل: 'bg-orange-100 text-orange-800',
    حجز: 'bg-blue-100 text-blue-800',
    لاغي: 'bg-red-100 text-red-800',
    تم: 'bg-green-100 text-green-800',
    مقبول: 'bg-teal-100 text-teal-800',
  }

  const summary = useMemo(() => {
    const totalValue = orders.reduce((sum, order) => sum + Number(order.orderTotal || 0), 0)
    const delivered = orders.filter((o) => o.delivery.deliveryStatus === 'تم التوصيل').length
    return {
      count: orders.length,
      totalValue,
      delivered,
    }
  }, [orders])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">🏍️ متابعة التوصيل</h1>
          <p className="text-gray-600 mt-1">عرض طلبات اليوم وتحديث حالة التوصيل</p>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4 grid grid-cols-1 md:grid-cols-5 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 text-right">التاريخ</label>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            disabled={scheduleFilter !== 'all'}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100 disabled:text-gray-400"
            dir="ltr"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 text-right">عرض</label>
          <select
            value={scheduleFilter}
            onChange={(e) => setScheduleFilter(e.target.value as 'all' | 'today' | 'scheduled' | 'upcoming')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            dir="rtl"
          >
            <option value="all">الكل (حسب التاريخ)</option>
            <option value="today">📅 طلبات اليوم</option>
            <option value="scheduled">📅 طلبات مجدولة</option>
            <option value="upcoming">⏭️ الطلبات القادمة</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 text-right">حالة التوصيل</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            dir="rtl"
          >
            <option value="all">الكل</option>
            <option value="قبول">قبول</option>
            <option value="جاهز">جاهز</option>
            <option value="في الطريق">في الطريق</option>
            <option value="تم التوصيل">تم التوصيل</option>
          </select>
        </div>
        <div className="md:col-span-2 flex items-end">
          <div className="flex gap-2 w-full">
            <button
              onClick={fetchOrders}
              className="flex-1 md:flex-initial px-4 py-3 sm:py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold min-h-[44px]"
            >
              تحديث القائمة
            </button>
            <button
              onClick={clearFilters}
              className="flex-1 md:flex-initial px-4 py-3 sm:py-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 font-semibold min-h-[44px]"
            >
              رجوع لليوم
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">عدد الطلبات</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{summary.count}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">تم توصيله</p>
          <p className="text-2xl font-bold text-green-700 mt-1">{summary.delivered}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">إجمالي القيمة</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{summary.totalValue.toLocaleString()} ج.م</p>
        </div>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-gray-500">⏳ جاري تحميل الطلبات...</div>
      ) : orders.length === 0 ? (
        <div className="p-8 text-center text-gray-500 bg-white rounded-lg border border-gray-200">📭 لا توجد طلبات في هذا التاريخ</div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 border-b border-gray-200 sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2 text-right font-semibold text-gray-700">الرقم</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-700">الوقت</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-700">الحجز</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-700">اسم العميل</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-700">الهاتف</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-700">العنوان</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-700">خريطة</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-700">حالة الطلب</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-700">الإجمالي</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-700 min-w-[220px]">تقدم التوصيل</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-700">ملاحظات</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const address = order.address?.streetAddress || '-'

                return (
                  <tr
                    key={order.id}
                    onClick={() => router.push(`/branch/${order.id}`)}
                    className={`border-b border-gray-200 hover:bg-red-50 cursor-pointer ${order.isPriority ? 'border-r-4 border-r-red-500 bg-red-50/40' : order.isScheduled ? 'border-r-4 border-r-indigo-400' : ''}`}
                  >
                    <td className="px-3 py-2 text-gray-900 font-semibold" dir="ltr">
                      {order.isPriority && (
                        <span title={order.priorityReason || 'أولوية عاجلة'} className="ml-1 inline-block px-1.5 py-0.5 rounded bg-red-600 text-white text-[10px] font-bold animate-pulse">🚨 عاجل</span>
                      )}
                      {order.isScheduled && <span title="حجز" className="ml-1">📅</span>}
                      {order.appOrderNo}
                    </td>
                    <td className="px-3 py-2 text-gray-700" dir="ltr">{order.orderTime || '-'}</td>
                    <td className="px-3 py-2 text-sm">
                      {order.isScheduled && order.scheduledDate ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold" dir="ltr">
                          📅 {order.scheduledDate} {order.scheduledTimeSlot === 'ساعة محددة' ? (order.scheduledSpecificTime || '') : (order.scheduledTimeSlot || '')}
                        </span>
                      ) : <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-3 py-2 text-gray-900">{order.customer?.customerName || '-'}</td>
                    <td className="px-3 py-2 text-gray-700" dir="ltr">{order.customer?.phone || '-'}</td>
                    <td className="px-3 py-2 text-gray-700 text-sm max-w-xs truncate" title={address}>{address}</td>
                    <td className="px-3 py-2 text-gray-700 text-sm">
                      {order.address?.googleMapsLink ? (
                        <a
                          href={order.address.googleMapsLink}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-blue-600 hover:underline"
                        >
                          🗺️ فتح
                        </a>
                      ) : '-'}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${orderStatusClasses[order.orderStatus] || 'bg-gray-100 text-gray-700'}`}>
                        {order.orderStatus || '-'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-900 font-semibold">{Number(order.orderTotal || 0).toLocaleString()} ج.م</td>
                    <td className="px-3 py-2">
                      <DeliveryProgressBar status={order.delivery.deliveryStatus} compact />
                    </td>
                    <td className="px-3 py-2 text-gray-700 text-sm max-w-xs truncate" title={order.delivery.branchComments || '-'}>
                      {order.delivery.branchComments || '-'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

    </div>
  )
}
