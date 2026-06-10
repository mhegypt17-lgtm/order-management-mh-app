'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import OrderForm from '@/components/orders/OrderForm'
import { formatCairoDateTime } from '@/lib/cairoTime'

type HistoryItem = {
  id: string
  entityType: 'order' | 'delivery' | 'product'
  action: 'created' | 'updated' | 'deleted' | 'status_changed'
  changedBy: string
  changedAt: string
  summary: string
  details?: Record<string, any> | null
}

export default function EditOrderPage() {
  const params = useParams<{ id: string }>()
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
      <div>
        <h1 className="text-3xl font-bold text-gray-900">✏️ تعديل الطلب</h1>
        <p className="text-gray-600 mt-1">تحديث بيانات الطلب وتعديل العناصر</p>
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
            {history.map((entry) => {
              const isBranchLineEdit =
                entry.details?.source === 'branch' && Array.isArray(entry.details?.changes)
              return (
                <li key={entry.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-900">{entry.summary}</p>
                    <span className="text-xs text-gray-500" dir="ltr">
                      {formatCairoDateTime(entry.changedAt, 'en-GB')}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">بواسطة: {entry.changedBy || '-'}</p>
                  {isBranchLineEdit && (
                    <div className="mt-2 space-y-1">
                      {(entry.details!.changes as any[]).map((c, i) => (
                        <div
                          key={i}
                          className="text-xs bg-blue-50 border border-blue-200 rounded px-2 py-1 text-blue-900"
                        >
                          <span className="font-semibold">{c.productName || '—'}</span>
                          {c.qtyChange && (
                            <span className="mr-2">
                              {' · '}الكمية: {c.qtyChange.from} → {c.qtyChange.to}
                            </span>
                          )}
                          {c.weightChange && (
                            <span className="mr-2">
                              {' · '}الوزن: {(Number(c.weightChange.fromGrams) / 1000).toFixed(2)} →{' '}
                              {(Number(c.weightChange.toGrams) / 1000).toFixed(2)} كج
                              {c.weightChange.newUnitPrice != null && (
                                <span className="text-blue-700"> (سعر جديد: {c.weightChange.newUnitPrice} ج.م)</span>
                              )}
                            </span>
                          )}
                        </div>
                      ))}
                      {(entry.details!.newOrderTotal != null) && (
                        <div className="text-xs text-gray-600 mt-1">
                          💰 الإجمالي الجديد: <span className="font-bold text-red-700">{entry.details!.newOrderTotal} ج.م</span>
                          {' · '}فرعي: {entry.details!.newSubtotal}{' '}
                          {' · '}توصيل: {entry.details!.newDeliveryFee}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
