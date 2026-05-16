'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import OrderForm from '@/components/orders/OrderForm'

type NoticeType = 'info' | 'promo' | 'warning' | 'success'

const NOTICE_STYLES: Record<NoticeType, { bg: string; border: string; icon: string; text: string }> = {
  info:    { bg: 'bg-blue-50',   border: 'border-blue-400',   icon: '💬', text: 'text-blue-900' },
  promo:   { bg: 'bg-purple-50', border: 'border-purple-400', icon: '🎉', text: 'text-purple-900' },
  warning: { bg: 'bg-yellow-50', border: 'border-yellow-400', icon: '⚠️', text: 'text-yellow-900' },
  success: { bg: 'bg-green-50',  border: 'border-green-400',  icon: '✅', text: 'text-green-900' },
}

export default function NewOrderPage() {
  const searchParams = useSearchParams()
  const resetKey = searchParams.get('reset') || 'default'
  const repeatId = searchParams.get('repeat') || undefined

  const [notice, setNotice] = useState<{ message: string; type: NoticeType; isActive: boolean } | null>(null)

  useEffect(() => {
    fetch('/api/order-settings', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        const n = data.options?.agentNotice
        if (n?.isActive && n.message) setNotice({ message: n.message, type: n.type || 'info', isActive: true })
      })
      .catch(() => {})
  }, [])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">{repeatId ? '🔄 إعادة طلب' : '➕ طلب جديد'}</h1>
        <p className="text-gray-600 mt-1">
          {repeatId
            ? 'تم نسخ بيانات الطلب — راجع المنتجات والعنوان قبل الحفظ'
            : 'إنشاء طلب جديد مع تفاصيل المنتجات والعنوان'}
        </p>
      </div>

      {notice && (() => {
        const s = NOTICE_STYLES[notice.type] || NOTICE_STYLES.info
        return (
          <div className={`flex items-start gap-3 rounded-xl border-2 ${s.border} ${s.bg} px-4 py-3 shadow-sm`}>
            <span className="text-2xl mt-0.5 shrink-0">{s.icon}</span>
            <div className="flex-1 text-right" dir="rtl">
              <p className="text-xs font-semibold uppercase tracking-wide opacity-60 mb-1">تنبيه</p>
              <p className={`text-sm font-medium leading-relaxed ${s.text} whitespace-pre-wrap`}>{notice.message}</p>
            </div>
          </div>
        )
      })()}

      <OrderForm key={repeatId ? `repeat-${repeatId}` : resetKey} mode="create" repeatFromOrderId={repeatId} />
    </div>
  )
}
