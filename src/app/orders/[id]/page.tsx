'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import OrderForm from '@/components/orders/OrderForm'

type HistoryItem = {
  id: string
  entityType: 'order' | 'delivery' | 'product'
  action: 'created' | 'updated' | 'deleted' | 'status_changed'
  changedBy: string
  changedAt: string
  summary: string
}

export default function EditOrderPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const res = await fetch(`/api/orders/${params.id}/history`)
        const data = await res.json()
        setHistory(data.history || [])
      } finally {
        setHistoryLoading(false)
      }
    }

    if (params.id) {
      loadHistory()
    }
  }, [params.id])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">✏️ تعديل الطلب</h1>
          <p className="text-gray-600 mt-1">تحديث بيانات الطلب وتعديل العناصر</p>
        </div>
        <button
          onClick={() => router.push(`/orders/new?repeat=${params.id}`)}
          className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold inline-flex items-center gap-2"
          title="إنشاء طلب جديد بنفس البيانات"
        >
          <span>🔄</span>
          <span>إعادة الطلب</span>
        </button>
      </div>
      <OrderForm mode="edit" orderId={params.id} />

      <section className="bg-white rounded-lg border border-gray-200 p-4">
        <h2 className="text-lg font-bold text-gray-900 mb-3">سجل التعديلات</h2>

        {historyLoading ? (
          <p className="text-sm text-gray-500">⏳ جاري تحميل السجل...</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-gray-500">لا توجد تعديلات مسجلة حتى الآن</p>
        ) : (
          <ul className="space-y-2">
            {history.map((entry) => (
              <li key={entry.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-gray-900">{entry.summary}</p>
                  <span className="text-xs text-gray-500" dir="ltr">
                    {new Date(entry.changedAt).toLocaleString('en-GB')}
                  </span>
                </div>
                <p className="text-xs text-gray-600 mt-1">بواسطة: {entry.changedBy || '-'}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
