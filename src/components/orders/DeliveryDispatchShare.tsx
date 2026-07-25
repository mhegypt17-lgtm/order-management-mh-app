'use client'

import { useMemo } from 'react'
import toast from 'react-hot-toast'

// Branch → delivery WhatsApp dispatch. Unlike the full CS WhatsAppShare (which
// shares the whole order — products, totals, payment), the branch cashier only
// needs to hand the courier the essentials to make the drop:
//   • customer name
//   • mobile number
//   • address
//   • location (Google Maps pin)
//   • number of items to carry
// The message targets "choose contact" so the cashier can pick whichever
// courier is on shift.

interface Props {
  appOrderNo: string
  customerName: string
  customerPhone: string
  streetAddress: string
  googleMapsLink: string
  itemCount: number
}

export default function DeliveryDispatchShare(props: Props) {
  const { appOrderNo, customerName, customerPhone, streetAddress, googleMapsLink, itemCount } = props

  const message = useMemo(() => {
    const lines: string[] = []
    lines.push('🏍️ *طلب للتوصيل — Meat House*')
    if (appOrderNo) lines.push(`رقم الطلب: *${appOrderNo}*`)
    lines.push('')
    lines.push(`👤 العميل: ${customerName || '-'}`)
    lines.push(`📞 الموبايل: ${customerPhone || '-'}`)
    lines.push(`📍 العنوان: ${streetAddress || '-'}`)
    if (googleMapsLink) lines.push(`🗺️ الموقع: ${googleMapsLink}`)
    lines.push(`📦 عدد الأصناف: *${itemCount}*`)
    return lines.join('\n')
  }, [appOrderNo, customerName, customerPhone, streetAddress, googleMapsLink, itemCount])

  const waHref = useMemo(() => `https://wa.me/?text=${encodeURIComponent(message)}`, [message])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message)
      toast.success('✅ تم نسخ الرسالة')
    } catch {
      toast.error('تعذر النسخ')
    }
  }

  return (
    <details className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
      <summary className="font-bold text-emerald-800 cursor-pointer flex items-center gap-2">
        <span className="text-xl">📲</span>
        إرسال بيانات التوصيل على واتساب
      </summary>

      <div className="mt-4 space-y-3" dir="rtl">
        <textarea
          readOnly
          value={message}
          rows={7}
          className="w-full px-3 py-2 border border-emerald-200 rounded-lg bg-white text-sm font-mono whitespace-pre-wrap"
          dir="rtl"
        />

        <div className="flex flex-wrap gap-2">
          <a
            href={waHref}
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-semibold inline-flex items-center gap-2"
          >
            <span>📲</span>
            <span>إرسال للمندوب</span>
          </a>
          <button
            type="button"
            onClick={handleCopy}
            className="px-4 py-2 rounded-lg bg-white border border-emerald-300 hover:bg-emerald-100 text-emerald-800 font-semibold"
          >
            📋 نسخ الرسالة
          </button>
        </div>
      </div>
    </details>
  )
}
