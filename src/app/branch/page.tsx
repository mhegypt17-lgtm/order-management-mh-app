'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type DeliveryStatus = 'لم يخرج بعد' | 'جاهز' | 'في الطريق' | 'تم التوصيل'

type BranchOrder = {
  id: string
  appOrderNo: string
  orderDate: string
  orderTime: string
  orderType: string
  orderStatus: 'تم' | 'مؤجل' | 'لاغي' | 'حجز'
  orderTotal: number
  createdBy: string
  customer: { customerName: string; phone: string } | null
  address: { streetAddress: string; googleMapsLink: string } | null
  items: Array<{ id: string; productName: string; quantity: number }>
  delivery: {
    deliveryStatus: DeliveryStatus
    branchComments: string
  }
}

const DELIVERY_OPTIONS: DeliveryStatus[] = ['لم يخرج بعد', 'جاهز', 'في الطريق', 'تم التوصيل']

const deliveryClasses: Record<DeliveryStatus, string> = {
  'لم يخرج بعد': 'bg-gray-100 text-gray-700 border-gray-300',
  جاهز: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  'في الطريق': 'bg-blue-100 text-blue-800 border-blue-300',
  'تم التوصيل': 'bg-green-100 text-green-800 border-green-300',
}

const orderStatusClasses: Record<string, string> = {
  تم: 'bg-green-100 text-green-800',
  مؤجل: 'bg-yellow-100 text-yellow-800',
  لاغي: 'bg-red-100 text-red-800',
  حجز: 'bg-blue-100 text-blue-800',
}

export default function BranchPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [orders, setOrders] = useState<BranchOrder[]>([])
  const [savingId, setSavingId] = useState<string | null>(null)

  const today = new Date().toISOString().slice(0, 10)
  const [searchTerm, setSearchTerm] = useState('')
  const [fromDate, setFromDate] = useState(today)
  const [toDate, setToDate] = useState(today)
  const [orderTypeFilter, setOrderTypeFilter] = useState('all')
  const [orderStatusFilter, setOrderStatusFilter] = useState('all')
  const [deliveryFilter, setDeliveryFilter] = useState<'all' | DeliveryStatus>('all')

  const setPreset = (preset: 'today' | 'week' | 'month' | 'all') => {
    const now = new Date()
    const iso = (d: Date) => d.toISOString().slice(0, 10)
    if (preset === 'today') {
      setFromDate(today); setToDate(today)
    } else if (preset === 'week') {
      const d = new Date(now); d.setDate(d.getDate() - 6)
      setFromDate(iso(d)); setToDate(today)
    } else if (preset === 'month') {
      const d = new Date(now); d.setDate(d.getDate() - 29)
      setFromDate(iso(d)); setToDate(today)
    } else {
      setFromDate(''); setToDate('')
    }
  }

  const clearFilters = () => {
    setSearchTerm('')
    setFromDate(today)
    setToDate(today)
    setOrderTypeFilter('all')
    setOrderStatusFilter('all')
    setDeliveryFilter('all')
  }

  const fetchOrders = async () => {
    setIsLoading(true)
    try {
      const params: Record<string, string> = { deliveryStatus: deliveryFilter }
      if (fromDate) params.from = fromDate
      if (toDate) params.to = toDate
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
  }, [fromDate, toDate, deliveryFilter])

  const filteredOrders = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return orders.filter((order) => {
      const matchesSearch =
        !term ||
        String(order.appOrderNo || '').toLowerCase().includes(term) ||
        String(order.customer?.phone || '').toLowerCase().includes(term) ||
        String(order.customer?.customerName || '').toLowerCase().includes(term)

      const matchesType = orderTypeFilter === 'all' || order.orderType === orderTypeFilter
      const matchesStatus = orderStatusFilter === 'all' || order.orderStatus === orderStatusFilter
      return matchesSearch && matchesType && matchesStatus
    })
  }, [orders, searchTerm, orderTypeFilter, orderStatusFilter])

  const summary = useMemo(() => {
    const totalValue = filteredOrders.reduce((sum, o) => sum + Number(o.orderTotal || 0), 0)
    const delivered = filteredOrders.filter((o) => o.delivery.deliveryStatus === 'تم التوصيل').length
    const pending = filteredOrders.length - delivered
    return { count: filteredOrders.length, totalValue, delivered, pending }
  }, [filteredOrders])

  const updateDeliveryStatus = async (order: BranchOrder, nextStatus: DeliveryStatus) => {
    if (nextStatus === order.delivery.deliveryStatus) return
    const prevStatus = order.delivery.deliveryStatus
    setSavingId(order.id)
    setOrders((prev) =>
      prev.map((o) =>
        o.id === order.id ? { ...o, delivery: { ...o.delivery, deliveryStatus: nextStatus } } : o
      )
    )
    try {
      const res = await fetch(`/api/branch/orders/${order.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deliveryStatus: nextStatus, updatedBy: 'branch' }),
      })
      if (!res.ok) throw new Error('failed')
    } catch {
      setOrders((prev) =>
        prev.map((o) =>
          o.id === order.id ? { ...o, delivery: { ...o.delivery, deliveryStatus: prevStatus } } : o
        )
      )
      alert('تعذر تحديث حالة التوصيل')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">🚚 متابعة التوصيل</h1>
          <p className="text-gray-600 mt-1">قائمة الطلبات مع البحث والتصفية وتحديث حالة التوصيل مباشرةً</p>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="بحث برقم الطلب / الهاتف / الاسم"
            className="md:col-span-2 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
            dir="rtl"
          />

          <select
            value={orderStatusFilter}
            onChange={(e) => setOrderStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
            dir="rtl"
          >
            <option value="all">كل الحالات</option>
            <option value="تم">تم</option>
            <option value="مؤجل">مؤجل</option>
            <option value="لاغي">لاغي</option>
            <option value="حجز">حجز</option>
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
            value={deliveryFilter}
            onChange={(e) => setDeliveryFilter(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
            dir="rtl"
          >
            <option value="all">كل حالات التوصيل</option>
            <option value="لم يخرج بعد">لم يخرج بعد</option>
            <option value="جاهز">جاهز</option>
            <option value="في الطريق">في الطريق</option>
            <option value="تم التوصيل">تم التوصيل</option>
          </select>

          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg"
            dir="ltr"
          />
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg"
            dir="ltr"
          />

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
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <button onClick={() => setPreset('today')} className="px-3 py-1 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold">اليوم</button>
          <button onClick={() => setPreset('week')} className="px-3 py-1 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold">آخر 7 أيام</button>
          <button onClick={() => setPreset('month')} className="px-3 py-1 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold">آخر 30 يوم</button>
          <button onClick={() => setPreset('all')} className="px-3 py-1 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold">كل التاريخ</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">عدد الطلبات</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{summary.count}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">تم التوصيل</p>
          <p className="text-2xl font-bold text-green-700 mt-1">{summary.delivered}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">قيد التوصيل</p>
          <p className="text-2xl font-bold text-yellow-700 mt-1">{summary.pending}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">إجمالي القيمة</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{summary.totalValue.toLocaleString()} ج.م</p>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">⏳ جاري تحميل الطلبات...</div>
        ) : filteredOrders.length === 0 ? (
          <div className="p-8 text-center text-gray-500">📦 لا توجد طلبات مطابقة</div>
        ) : (
          <table className="w-full min-w-[980px]">
            <thead className="bg-gray-100 border-b border-gray-200 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-right text-sm font-semibold">رقم الطلب</th>
                <th className="px-4 py-3 text-right text-sm font-semibold">التاريخ</th>
                <th className="px-4 py-3 text-right text-sm font-semibold">العميل</th>
                <th className="px-4 py-3 text-right text-sm font-semibold">الحالة</th>
                <th className="px-4 py-3 text-right text-sm font-semibold">الإجمالي</th>
                <th className="px-4 py-3 text-right text-sm font-semibold">المنشئ</th>
                <th className="px-4 py-3 text-right text-sm font-semibold">حالة التوصيل</th>
                <th className="px-4 py-3 text-center text-sm font-semibold">فتح</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order) => (
                <tr key={order.id} className="border-b border-gray-100 hover:bg-red-50">
                  <td
                    className="px-4 py-3 text-sm font-semibold text-gray-900 cursor-pointer"
                    onClick={() => router.push(`/branch/${order.id}`)}
                  >
                    {order.appOrderNo}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700" dir="ltr">{order.orderDate}</td>
                  <td className="px-4 py-3 text-sm text-gray-800">{order.customer?.customerName || '-'}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${orderStatusClasses[order.orderStatus] || 'bg-gray-100 text-gray-700'}`}>
                      {order.orderStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900">{Number(order.orderTotal || 0).toLocaleString()} ج.م</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{order.createdBy || '-'}</td>
                  <td className="px-4 py-3 text-sm">
                    <select
                      value={order.delivery.deliveryStatus}
                      disabled={savingId === order.id}
                      onChange={(e) => updateDeliveryStatus(order, e.target.value as DeliveryStatus)}
                      onClick={(e) => e.stopPropagation()}
                      className={`px-2 py-1 rounded-full text-xs font-semibold border ${deliveryClasses[order.delivery.deliveryStatus]} disabled:opacity-60`}
                      dir="rtl"
                    >
                      {DELIVERY_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-sm text-center">
                    <button
                      onClick={() => router.push(`/branch/${order.id}`)}
                      className="px-3 py-1 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 text-xs font-semibold"
                    >
                      فتح
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
