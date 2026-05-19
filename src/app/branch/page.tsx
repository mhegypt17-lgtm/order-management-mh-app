'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type BranchOrder = {
  id: string
  appOrderNo: string
  orderDate: string
  orderTime: string
  orderTotal: number
  customer: { customerName: string; phone: string } | null
  address: { streetAddress: string; googleMapsLink: string } | null
  items: Array<{ id: string; productName: string; quantity: number }>
  delivery: { 
    deliveryStatus: 'لم يخرج بعد' | 'جاهز' | 'في الطريق' | 'تم التوصيل'
    branchComments: string
  }
}

export default function BranchPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [orders, setOrders] = useState<BranchOrder[]>([])

  const today = new Date().toISOString().slice(0, 10)
  const [fromDate, setFromDate] = useState(today)
  const [toDate, setToDate] = useState(today)
  const [statusFilter, setStatusFilter] = useState<'all' | 'لم يخرج بعد' | 'جاهز' | 'في الطريق' | 'تم التوصيل'>('all')

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
    setFromDate(today)
    setToDate(today)
    setStatusFilter('all')
  }

  const fetchOrders = async () => {
    setIsLoading(true)
    try {
      const params: Record<string, string> = { deliveryStatus: statusFilter }
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
  }, [fromDate, toDate, statusFilter])

  const statusClasses = useMemo(
    () => ({
      'لم يخرج بعد': 'bg-gray-100 text-gray-700',
      جاهز: 'bg-yellow-100 text-yellow-800',
      'في الطريق': 'bg-blue-100 text-blue-800',
      'تم التوصيل': 'bg-green-100 text-green-800',
    }),
    []
  )

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
          <h1 className="text-3xl font-bold text-gray-900">🚚 متابعة التوصيل</h1>
          <p className="text-gray-600 mt-1">عرض الطلبات وتحديث حالة التوصيل (يمكنك عرض التاريخ السابق أيضاً)</p>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 text-right">من تاريخ</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              dir="ltr"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 text-right">إلى تاريخ</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              dir="ltr"
            />
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
              <option value="لم يخرج بعد">لم يخرج بعد</option>
              <option value="جاهز">جاهز</option>
              <option value="في الطريق">في الطريق</option>
              <option value="تم التوصيل">تم التوصيل</option>
            </select>
          </div>
          <div className="flex items-end">
            <div className="flex gap-2">
              <button
                onClick={fetchOrders}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold"
              >
                تحديث
              </button>
              <button
                onClick={clearFilters}
                className="px-4 py-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 font-semibold"
              >
                اليوم
              </button>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <button onClick={() => setPreset('today')} className="px-3 py-1 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold">اليوم</button>
          <button onClick={() => setPreset('week')} className="px-3 py-1 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold">آخر 7 أيام</button>
          <button onClick={() => setPreset('month')} className="px-3 py-1 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold">آخر 30 يوم</button>
          <button onClick={() => setPreset('all')} className="px-3 py-1 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold">كل التاريخ</button>
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
        <div className="p-8 text-center text-gray-500 bg-white rounded-lg border border-gray-200">📦 لا توجد طلبات في هذا النطاق</div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 border-b border-gray-200 sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2 text-right font-semibold text-gray-700">الرقم</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-700">الموقع</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-700">العنوان</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-700">اسم العميل</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-700">الهاتف</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-700">عدد المنتجات</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-700">الإجمالي</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-700">المنتجات</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-700">ملاحظات</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-700">الحالة</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-700">الإجراء</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const productCount = order.items.reduce((sum, item) => sum + item.quantity, 0)
                const productList = order.items.map((item) => `${item.productName} (${item.quantity})`).join(', ')
                const address = order.address?.streetAddress || '-'

                return (
                  <tr key={order.id} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-900 font-semibold" dir="ltr">{order.appOrderNo}</td>
                    <td className="px-3 py-2 text-gray-700 text-sm">
                      {order.address?.googleMapsLink ? (
                        <a href={order.address.googleMapsLink} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                          🗺️ خريطة
                        </a>
                      ) : '-'}
                    </td>
                    <td className="px-3 py-2 text-gray-700 text-sm max-w-xs truncate" title={address}>{address}</td>
                    <td className="px-3 py-2 text-gray-900">{order.customer?.customerName || '-'}</td>
                    <td className="px-3 py-2 text-gray-700" dir="ltr">{order.customer?.phone || '-'}</td>
                    <td className="px-3 py-2 text-center text-gray-900 font-semibold">{productCount}</td>
                    <td className="px-3 py-2 text-gray-900 font-semibold">{Number(order.orderTotal || 0).toLocaleString()} ج.م</td>
                    <td className="px-3 py-2 text-gray-700 text-sm max-w-xs truncate" title={productList}>{productList}</td>
                    <td className="px-3 py-2 text-gray-700 text-sm max-w-xs truncate" title={order.delivery.branchComments || '-'}>
                      {order.delivery.branchComments || '-'}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${statusClasses[order.delivery.deliveryStatus]}`}>
                        {order.delivery.deliveryStatus}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => router.push(`/branch/${order.id}`)}
                        className="px-2 py-1 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 text-xs font-semibold"
                      >
                        تحديث
                      </button>
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
