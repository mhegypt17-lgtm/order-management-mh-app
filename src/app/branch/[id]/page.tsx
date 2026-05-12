'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/lib/auth'

type OrderDetail = {
  id: string
  appOrderNo: string
  orderDate: string
  orderTime: string
  paymentMethod: string
  notes: string
  orderStatus: string
  isPriority?: boolean
  priorityReason?: string | null
  customer: { customerName: string; phone: string } | null
  address: { streetAddress: string; googleMapsLink: string } | null
  items: Array<{ id: string; productName: string; quantity: number; specialInstructions: string }>
  delivery: {
    deliveryStatus: 'قبول' | 'جاهز' | 'في الطريق' | 'تم التوصيل' | 'لم يخرج بعد'
    branchComments: string
    productPhotos: string[]
    invoicePhoto: string
    deliveredAt: string | null
  }
}

const STATUS_OPTIONS: Array<OrderDetail['delivery']['deliveryStatus']> = ['قبول', 'جاهز', 'في الطريق', 'تم التوصيل']

const orderStatusBadgeClass = (status: string): string => {
  switch (status) {
    case 'ساري':
      return 'bg-yellow-100 text-yellow-800'
    case 'مقبول':
      return 'bg-teal-100 text-teal-800'
    case 'تم':
      return 'bg-green-100 text-green-800'
    case 'لاغي':
      return 'bg-red-100 text-red-800'
    case 'مؤجل':
      return 'bg-orange-100 text-orange-800'
    default:
      return 'bg-blue-100 text-blue-800'
  }
}

export default function BranchOrderDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuthStore()

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [order, setOrder] = useState<OrderDetail | null>(null)

  const [deliveryStatus, setDeliveryStatus] = useState<OrderDetail['delivery']['deliveryStatus']>('قبول')
  const [orderStatus, setOrderStatus] = useState<string>('ساري')
  const [branchComments, setBranchComments] = useState('')
  const [productPhotos, setProductPhotos] = useState<string[]>([])
  const [invoicePhoto, setInvoicePhoto] = useState('')

  const statusClass = useMemo(() => {
    return {
      'قبول': 'bg-purple-100 text-purple-800',
      'لم يخرج بعد': 'bg-gray-100 text-gray-700',
      جاهز: 'bg-yellow-100 text-yellow-800',
      'في الطريق': 'bg-blue-100 text-blue-800',
      'تم التوصيل': 'bg-green-100 text-green-800',
    }[deliveryStatus]
  }, [deliveryStatus])

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      try {
        const res = await fetch(`/api/branch/orders/${params.id}`)
        if (!res.ok) throw new Error('Failed to load')
        const data = await res.json()
        const loaded = data.order as OrderDetail
        setOrder(loaded)
        setDeliveryStatus(loaded.delivery.deliveryStatus)
        setOrderStatus(loaded.orderStatus || 'ساري')
        setBranchComments(loaded.delivery.branchComments || '')
        setProductPhotos(loaded.delivery.productPhotos || [])
        setInvoicePhoto(loaded.delivery.invoicePhoto || '')
      } catch {
        toast.error('تعذر تحميل الطلب')
      } finally {
        setIsLoading(false)
      }
    }

    load()
  }, [params.id])

  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = reject
      reader.readAsDataURL(file)
    })

  const handleAddProductPhotos = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const list = Array.from(files).slice(0, 5)
    const urls = await Promise.all(list.map(fileToDataUrl))
    setProductPhotos((prev) => [...prev, ...urls].slice(0, 10))
  }

  const handleInvoicePhoto = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const url = await fileToDataUrl(files[0])
    setInvoicePhoto(url)
  }

  const handleStatusChange = async (newStatus: OrderDetail['delivery']['deliveryStatus']) => {
    setDeliveryStatus(newStatus)
    setIsSaving(true)
    try {
      const payload = {
        deliveryStatus: newStatus,
        branchComments,
        productPhotos,
        invoicePhoto,
        updatedBy: user?.id || 'branch',
      }

      const res = await fetch(`/api/branch/orders/${order?.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) throw new Error('Failed')
      toast.success('✅ تم تحديث حالة التوصيل')
    } catch {
      toast.error('خطأ في تحديث الحالة')
      setDeliveryStatus(order?.delivery.deliveryStatus || 'قبول')
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveComments = async () => {
    if (!order) return
    setIsSaving(true)
    try {
      const payload = {
        deliveryStatus,
        branchComments,
        productPhotos,
        invoicePhoto,
        updatedBy: user?.id || 'branch',
      }

      const res = await fetch(`/api/branch/orders/${order.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) throw new Error('Failed')

      toast.success('✅ تم حفظ البيانات')
    } catch {
      toast.error('حدث خطأ أثناء الحفظ')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading || !order) {
    return <div className="p-8 text-center text-gray-500">⏳ جاري تحميل التفاصيل...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900" dir="ltr">
            {order.isPriority && <span className="mr-2 px-2 py-0.5 rounded bg-red-600 text-white text-base align-middle animate-pulse">🚨 عاجل</span>}
            🏍️ {order.appOrderNo}
          </h1>
          <p className="text-gray-600 mt-1">تفاصيل الطلب للفرع</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1 rounded-full text-sm font-semibold ${orderStatusBadgeClass(orderStatus)}`}>{orderStatus}</span>
          <span className={`px-3 py-1 rounded-full text-sm font-semibold ${statusClass}`}>{deliveryStatus}</span>
        </div>
      </div>

      {order.isPriority && (
        <div className="rounded-lg border-2 border-red-500 bg-red-50 px-4 py-3 flex items-start gap-3 animate-pulse" dir="rtl">
          <span className="text-2xl">🚨</span>
          <div className="text-sm text-gray-900 flex-1">
            <p className="font-bold mb-1 text-red-800">طلب أولوية عاجلة</p>
            {order.priorityReason && (
              <p className="text-red-900">السبب: <strong>{order.priorityReason}</strong></p>
            )}
            <p className="text-xs text-red-700 mt-1">يرجى التعامل الفوري مع هذا الطلب.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="bg-white rounded-lg border border-gray-200 p-4 space-y-2">
          <h2 className="font-bold text-gray-900">بيانات العميل (قراءة فقط)</h2>
          <p><span className="font-semibold">الاسم:</span> {order.customer?.customerName || '-'}</p>
          <p><span className="font-semibold">الهاتف:</span> <span dir="ltr">{order.customer?.phone || '-'}</span></p>
          <p><span className="font-semibold">العنوان:</span> {order.address?.streetAddress || '-'}</p>
          {order.address?.googleMapsLink && (
            <a
              href={order.address.googleMapsLink}
              target="_blank"
              rel="noreferrer"
              className="inline-block px-3 py-1 rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 text-sm"
              dir="ltr"
            >
              🗺️ Navigate
            </a>
          )}
        </section>

        <section className="bg-white rounded-lg border border-gray-200 p-4 space-y-2">
          <h2 className="font-bold text-gray-900">محتويات الطلب (قراءة فقط)</h2>
          <p><span className="font-semibold">الدفع:</span> {order.paymentMethod}</p>
          <p><span className="font-semibold">ملاحظات CS:</span> {order.notes || '-'}</p>
          <ul className="space-y-1">
            {order.items.map((item) => (
              <li key={item.id} className="text-sm text-gray-700">
                • {item.productName} × {item.quantity}
                {item.specialInstructions ? ` - ${item.specialInstructions}` : ''}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
        <h2 className="font-bold text-gray-900">تحديثات الفرع</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 text-right">
              حالة الطلب
              <span className="text-xs text-gray-400 mr-1">(تحددها خدمة العملاء)</span>
            </label>
            <div className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-right">
              <span className={`px-2 py-0.5 rounded-full text-sm font-semibold ${orderStatusBadgeClass(orderStatus)}`}>
                {orderStatus}
              </span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 text-right">حالة التوصيل</label>
            <div className="flex items-center gap-2">
              <select
                value={deliveryStatus}
                onChange={(e) => handleStatusChange(e.target.value as OrderDetail['delivery']['deliveryStatus'])}
                disabled={isSaving}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100"
                dir="rtl"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              {isSaving && <span className="text-sm text-gray-500">💾 جاري الحفظ...</span>}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 text-right">وقت التسليم</label>
            <p className="px-3 py-2 border border-gray-200 rounded-lg text-gray-700" dir="ltr">
              {deliveryStatus === 'تم التوصيل' ? order.delivery.deliveredAt || 'سيتم تسجيله تلقائياً عند الحفظ' : '-'}
            </p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 text-right">ملاحظات الفرع</label>
          <textarea
            rows={3}
            value={branchComments}
            onChange={(e) => setBranchComments(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
            dir="rtl"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 text-right">صور المنتجات (متعددة)</label>
            <input type="file" accept="image/*" multiple onChange={(e) => handleAddProductPhotos(e.target.files)} className="w-full" />
            <div className="mt-2 grid grid-cols-3 gap-2">
              {productPhotos.map((photo, idx) => (
                <img key={idx} src={photo} alt={`product-${idx}`} className="w-full h-20 object-cover rounded border border-gray-200" />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 text-right">صورة الفاتورة (مفردة)</label>
            <input type="file" accept="image/*" onChange={(e) => handleInvoicePhoto(e.target.files)} className="w-full" />
            <div className="mt-2">
              {invoicePhoto ? (
                <img src={invoicePhoto} alt="invoice" className="w-full h-28 object-cover rounded border border-gray-200" />
              ) : (
                <div className="w-full h-28 border border-dashed border-gray-300 rounded flex items-center justify-center text-sm text-gray-500">
                  لا توجد صورة فاتورة
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="flex gap-3">
        <button
          onClick={handleSaveComments}
          disabled={isSaving}
          className="px-5 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white font-semibold"
        >
          {isSaving ? '... جاري الحفظ' : 'حفظ الملاحظات والصور'}
        </button>
        <button
          onClick={() => router.push('/branch')}
          className="px-5 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold"
        >
          رجوع
        </button>
      </div>
    </div>
  )
}
