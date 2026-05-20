'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function OrdersPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [orders, setOrders] = useState<any[]>([])

  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [orderTypeFilter, setOrderTypeFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const clearFilters = () => {
    setSearchTerm('')
    setStatusFilter('all')
    setOrderTypeFilter('all')
    setDateFrom('')
    setDateTo('')
  }

  const fetchOrders = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/orders', { cache: 'no-store' })
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

      return matchesSearch && matchesStatus && matchesType && matchesFrom && matchesTo
    })
  }, [orders, searchTerm, statusFilter, orderTypeFilter, dateFrom, dateTo])

  const statusClasses: Record<string, string> = {
    تم: 'bg-green-100 text-green-800',
    مؤجل: 'bg-yellow-100 text-yellow-800',
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">📋 الطلبات</h1>
          <p className="text-gray-600 mt-1">قائمة الطلبات مع البحث والتصفية</p>
        </div>
        <button
          onClick={() => router.push('/orders/new')}
          className="px-5 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold"
        >
          + طلب جديد
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4 grid grid-cols-1 md:grid-cols-5 gap-3">
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

      <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
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
                <th className="px-4 py-3 text-right text-sm font-semibold">العميل</th>
                <th className="px-4 py-3 text-right text-sm font-semibold">الهاتف</th>
                <th className="px-4 py-3 text-right text-sm font-semibold">الحالة</th>
                <th className="px-4 py-3 text-right text-sm font-semibold">الإجمالي</th>
                <th className="px-4 py-3 text-right text-sm font-semibold">المنشئ</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order) => (
                <tr
                  key={order.id}
                  onClick={() => router.push(`/orders/${order.id}`)}
                  className="border-b border-gray-100 hover:bg-red-50 cursor-pointer"
                >
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900">{order.appOrderNo}</td>
                  <td className="px-4 py-3 text-sm text-gray-700" dir="ltr">{order.orderDate}</td>
                  <td className="px-4 py-3 text-sm text-gray-800">{order.customer?.customerName || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-700" dir="ltr">{order.customer?.phone || '-'}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${statusClasses[order.orderStatus] || 'bg-gray-100 text-gray-700'}`}>
                      {order.orderStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900">{Number(order.orderTotal || 0).toLocaleString()} ج.م</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{order.createdBy || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
