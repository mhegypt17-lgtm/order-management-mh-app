'use client'

import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'

type Item = {
  productName: string
  quantity: number
  unitPrice: number
}

type Delivery = {
  deliveryStatus?: string
  branchComments?: string
  productPhotos?: string[]
  invoicePhoto?: string
  deliveredAt?: string | null
} | null

interface Props {
  appOrderNo: string
  orderDate: string
  orderTime: string
  customerName: string
  customerPhone: string
  deliveryArea: string
  streetAddress: string
  googleMapsLink: string
  orderStatus: string
  paymentMethod: string
  orderTotal: number
  notes: string
  items: Item[]
  delivery: Delivery
}

function normalizePhoneForWa(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '')
  if (!digits) return ''
  // Egypt: if starts with 0, drop and prefix 20
  if (digits.startsWith('20')) return digits
  if (digits.startsWith('0')) return '20' + digits.slice(1)
  return digits
}

export function WhatsAppShare(props: Props) {
  const {
    appOrderNo, orderDate, orderTime, customerName, customerPhone,
    deliveryArea, streetAddress, googleMapsLink, orderStatus, paymentMethod,
    orderTotal, notes, items, delivery,
  } = props

  const [includePhotos, setIncludePhotos] = useState(true)
  const [target, setTarget] = useState<'customer' | 'branch' | 'open'>('customer')

  const message = useMemo(() => {
    const lines: string[] = []
    lines.push(`🐮 *Meat House — تفاصيل الطلب*`)
    lines.push(`رقم الطلب: *${appOrderNo}*`)
    if (orderDate || orderTime) lines.push(`📅 ${orderDate}${orderTime ? '  ⏰ ' + orderTime : ''}`)
    if (customerName || customerPhone) {
      lines.push('')
      lines.push(`👤 العميل: ${customerName || '-'}`)
      if (customerPhone) lines.push(`📞 ${customerPhone}`)
    }
    const addrParts = [deliveryArea, streetAddress].filter(Boolean).join(' — ')
    if (addrParts) lines.push(`📍 ${addrParts}`)
    if (googleMapsLink) lines.push(`🗺️ ${googleMapsLink}`)

    const validItems = items.filter((i) => i.productName && i.quantity > 0)
    if (validItems.length) {
      lines.push('')
      lines.push('🛒 *المنتجات:*')
      for (const it of validItems) {
        const line = `• ${it.productName} × ${it.quantity}${it.unitPrice ? ` — ${(it.quantity * it.unitPrice).toLocaleString()} ج.م` : ''}`
        lines.push(line)
      }
    }

    lines.push('')
    lines.push(`💳 الدفع: ${paymentMethod || '-'}`)
    lines.push(`💰 الإجمالي: *${Number(orderTotal || 0).toLocaleString()} ج.م*`)
    lines.push(`📦 حالة الطلب: *${orderStatus || '-'}*`)
    if (delivery?.deliveryStatus) lines.push(`🏍️ حالة التوصيل: *${delivery.deliveryStatus}*`)
    if (delivery?.branchComments) lines.push(`📝 ملاحظات الفرع: ${delivery.branchComments}`)
    if (delivery?.deliveredAt) lines.push(`✅ تم التوصيل: ${delivery.deliveredAt}`)
    if (notes) {
      lines.push('')
      lines.push(`🗒️ ملاحظات: ${notes}`)
    }

    if (includePhotos) {
      const photos = [
        ...((delivery?.productPhotos || []).filter(Boolean)),
        ...(delivery?.invoicePhoto ? [delivery.invoicePhoto] : []),
      ]
      // Only include http(s) photos — data URIs can't be shared via wa.me text
      const sharable = photos.filter((p) => /^https?:\/\//i.test(p))
      if (sharable.length) {
        lines.push('')
        lines.push('📷 *الصور:*')
        sharable.forEach((p, idx) => lines.push(`${idx + 1}. ${p}`))
      }
    }

    return lines.join('\n')
  }, [appOrderNo, orderDate, orderTime, customerName, customerPhone, deliveryArea, streetAddress, googleMapsLink, items, paymentMethod, orderTotal, orderStatus, delivery, notes, includePhotos])

  const waHref = useMemo(() => {
    const encoded = encodeURIComponent(message)
    if (target === 'customer') {
      const phone = normalizePhoneForWa(customerPhone)
      if (!phone) return `https://wa.me/?text=${encoded}`
      return `https://wa.me/${phone}?text=${encoded}`
    }
    return `https://wa.me/?text=${encoded}`
  }, [message, target, customerPhone])

  const dataUriPhotos = useMemo(() => {
    const photos = [
      ...((delivery?.productPhotos || []).filter(Boolean)),
      ...(delivery?.invoicePhoto ? [delivery.invoicePhoto] : []),
    ]
    return photos.filter((p) => p.startsWith('data:'))
  }, [delivery])

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
        مشاركة الطلب على واتساب
      </summary>

      <div className="mt-4 space-y-3" dir="rtl">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="wa-target"
              checked={target === 'customer'}
              onChange={() => setTarget('customer')}
            />
            <span>إرسال للعميل {customerPhone ? `(${customerPhone})` : '(بدون رقم)'}</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="wa-target"
              checked={target === 'open'}
              onChange={() => setTarget('open')}
            />
            <span>اختيار جهة الاتصال</span>
          </label>
          <label className="flex items-center gap-2 mr-auto">
            <input
              type="checkbox"
              checked={includePhotos}
              onChange={(e) => setIncludePhotos(e.target.checked)}
            />
            <span>تضمين روابط الصور</span>
          </label>
        </div>

        <textarea
          readOnly
          value={message}
          rows={10}
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
            <span>فتح واتساب</span>
          </a>
          <button
            type="button"
            onClick={handleCopy}
            className="px-4 py-2 rounded-lg bg-white border border-emerald-300 hover:bg-emerald-100 text-emerald-800 font-semibold"
          >
            📋 نسخ الرسالة
          </button>
        </div>

        {dataUriPhotos.length > 0 && (
          <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
            ⚠️ لديك {dataUriPhotos.length} صورة محفوظة محلياً لا يمكن إرفاقها كرابط.
            بعد فتح واتساب، يمكنك تنزيلها من قسم «ملاحظات الفرع والصور» وإرفاقها يدوياً.
          </div>
        )}
      </div>
    </details>
  )
}

export default WhatsAppShare
