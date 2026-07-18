'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/lib/auth'
import { formatCairoFriendly } from '@/lib/cairoTime'
import { compressImage } from '@/lib/imageCompression'

type OrderItemDetail = {
  id: string
  productName: string
  quantity: number
  weightGrams: number
  unitPrice: number
  lineTotal: number
  specialInstructions: string
  pricingMode: 'unit' | 'weight'
  pricePerKg: number
  basePrice?: number | null
  offerPrice?: number | null
  originalQuantity?: number | null
  originalWeightGrams?: number | null
}

type OrderDetail = {
  id: string
  appOrderNo: string
  orderDate: string
  orderTime: string
  paymentMethod: string
  notes: string
  subtotal?: number
  deliveryFee?: number
  orderTotal?: number
  discountCode?: string | null
  discountAmount?: number | null
  netTotal?: number | null
  customer: { customerName: string; phone: string } | null
  address: { streetAddress: string; googleMapsLink: string } | null
  items: OrderItemDetail[]
  delivery: {
    deliveryStatus: 'لم يخرج بعد' | 'جاهز' | 'في الطريق' | 'تم التوصيل'
    branchComments: string
    productPhotos: string[]
    invoicePhoto: string
    deliveredAt: string | null
  }
  // Phase 2H — lazy-load metadata. The initial GET returns empty photo arrays
  // + these counts. Real photo bytes are fetched from /photos on demand.
  productPhotosCount?: number
  hasInvoicePhoto?: boolean
  photosLoaded?: boolean
}

const STATUS_OPTIONS: Array<OrderDetail['delivery']['deliveryStatus']> = ['لم يخرج بعد', 'جاهز', 'في الطريق', 'تم التوصيل']

export default function BranchOrderDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuthStore()

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [order, setOrder] = useState<OrderDetail | null>(null)

  const [deliveryStatus, setDeliveryStatus] = useState<OrderDetail['delivery']['deliveryStatus']>('لم يخرج بعد')
  const [branchComments, setBranchComments] = useState('')
  const [productPhotos, setProductPhotos] = useState<string[]>([])
  const [invoicePhoto, setInvoicePhoto] = useState('')

  // Phase 2H — lazy-load state. Photos are NOT fetched with the order.
  // `photosLoaded` guards two things:
  //   1) The "view saved photos" button + gallery visibility.
  //   2) Whether PUT payloads include productPhotos/invoicePhoto keys — when
  //      the user hasn't loaded them, we omit those keys so the server keeps
  //      whatever is already in the DB (belt-and-braces against accidental
  //      overwrites).
  const [photosLoaded, setPhotosLoaded] = useState(false)
  const [isLoadingPhotos, setIsLoadingPhotos] = useState(false)
  const [savedPhotosCount, setSavedPhotosCount] = useState(0)
  const [savedHasInvoice, setSavedHasInvoice] = useState(false)

  /** Per-line draft edits keyed by item id. */
  const [itemEdits, setItemEdits] = useState<
    Record<string, { quantity: number; weightGrams: number; weightDraft: string }>
  >({})
  const [isSavingItems, setIsSavingItems] = useState(false)

  const isLocked = deliveryStatus === 'في الطريق' || deliveryStatus === 'تم التوصيل'

  const statusClass = useMemo(() => {
    return {
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
        // Phase 2H — initial load does NOT fetch photos. `data.order.delivery.productPhotos`
        // will be an empty array on this response even if photos exist in the DB;
        // the actual count is in `data.order.productPhotosCount`. When the user
        // clicks "عرض الصور المحفوظة" we call /photos to hydrate.
        const res = await fetch(`/api/branch/orders/${params.id}`, { cache: 'no-store' })
        if (!res.ok) throw new Error('Failed to load')
        const data = await res.json()
        const loaded = data.order as OrderDetail
        setOrder(loaded)
        setDeliveryStatus(loaded.delivery.deliveryStatus)
        setBranchComments(loaded.delivery.branchComments || '')
        setProductPhotos([])
        setInvoicePhoto('')
        setPhotosLoaded(Boolean(loaded.photosLoaded))
        setSavedPhotosCount(Number(loaded.productPhotosCount) || 0)
        setSavedHasInvoice(Boolean(loaded.hasInvoicePhoto))
        const drafts: Record<string, { quantity: number; weightGrams: number; weightDraft: string }> = {}
        for (const it of loaded.items || []) {
          drafts[it.id] = {
            quantity: Number(it.quantity) || 1,
            weightGrams: Number(it.weightGrams) || 0,
            weightDraft: it.weightGrams ? (Number(it.weightGrams) / 1000).toString() : '',
          }
        }
        setItemEdits(drafts)
      } catch {
        toast.error('تعذر تحميل الطلب')
      } finally {
        setIsLoading(false)
      }
    }

    load()
  }, [params.id])

  // Phase 2H — user clicks the "view saved photos" button. Fetch the photos
  // bytes on demand from /photos and hydrate state. Idempotent; a second click
  // is a no-op after the first success.
  const handleLoadPhotos = async () => {
    if (!order || photosLoaded || isLoadingPhotos) return
    setIsLoadingPhotos(true)
    try {
      const res = await fetch(`/api/branch/orders/${order.id}/photos`, { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to load photos')
      const data = await res.json()
      setProductPhotos(Array.isArray(data.productPhotos) ? data.productPhotos : [])
      setInvoicePhoto((data.invoicePhoto as string) || '')
      setPhotosLoaded(true)
    } catch {
      toast.error('تعذر تحميل الصور')
    } finally {
      setIsLoadingPhotos(false)
    }
  }

  // Phase 2H — compress on client before upload. Was: raw FileReader → base64,
  // which meant a 4 MB camera JPEG hit the DB as ~5.3 MB. Now: downscaled to
  // max 1280px longest edge and re-encoded as JPEG q=0.72, typically ~250 KB.
  // Saves 15-20× egress on every subsequent read of these photos.
  //
  // Also: if existing photos haven't been lazy-fetched yet, we fetch them
  // FIRST so the new photo appends to the saved set instead of overwriting it.

  const ensurePhotosLoaded = async () => {
    if (photosLoaded) return true
    if (!order) return false
    // No existing photos to preserve — just mark loaded and continue.
    if (savedPhotosCount === 0 && !savedHasInvoice) {
      setPhotosLoaded(true)
      return true
    }
    setIsLoadingPhotos(true)
    try {
      const res = await fetch(`/api/branch/orders/${order.id}/photos`, { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to load photos')
      const data = await res.json()
      setProductPhotos(Array.isArray(data.productPhotos) ? data.productPhotos : [])
      setInvoicePhoto((data.invoicePhoto as string) || '')
      setPhotosLoaded(true)
      return true
    } catch {
      toast.error('تعذر تحميل الصور الحالية')
      return false
    } finally {
      setIsLoadingPhotos(false)
    }
  }

  // Phase 2H — accept a File[] snapshot (not a live FileList) because callers
  // reset the file input's `.value` synchronously after invoking us. A live
  // FileList reference goes empty after that reset, which used to silently
  // swallow the upload once we introduced `await ensurePhotosLoaded()`.
  const handleAddProductPhotos = async (files: File[]) => {
    if (!files || files.length === 0) return
    const ok = await ensurePhotosLoaded()
    if (!ok) return
    const list = files.slice(0, 5)
    const urls = await Promise.all(list.map((f) => compressImage(f)))
    setProductPhotos((prev) => [...prev, ...urls].slice(0, 10))
  }

  const handleInvoicePhoto = async (files: File[]) => {
    if (!files || files.length === 0) return
    const ok = await ensurePhotosLoaded()
    if (!ok) return
    const url = await compressImage(files[0])
    setInvoicePhoto(url)
  }

  const handleRemoveProductPhoto = async (idx: number) => {
    const ok = window.confirm('هل تريد حذف هذه الصورة؟')
    if (!ok) return
    const loaded = await ensurePhotosLoaded()
    if (!loaded) return
    setProductPhotos((prev) => prev.filter((_, i) => i !== idx))
    toast.success('🗑️ تم حذف الصورة. اضغط "حفظ" لتأكيد التغيير')
  }

  const handleRemoveInvoicePhoto = async () => {
    const ok = window.confirm('هل تريد حذف صورة الفاتورة؟')
    if (!ok) return
    const loaded = await ensurePhotosLoaded()
    if (!loaded) return
    if (!invoicePhoto) return
    setInvoicePhoto('')
    toast.success('🗑️ تم حذف صورة الفاتورة. اضغط "حفظ" لتأكيد التغيير')
  }

  const handleStatusChange = async (newStatus: OrderDetail['delivery']['deliveryStatus']) => {
    setDeliveryStatus(newStatus)
    setIsSaving(true)
    try {
      // Phase 2H — only send photo fields when the user has actually loaded
      // them into state (or is adding fresh ones). Otherwise the server keeps
      // whatever is in the DB (see PUT: `Array.isArray(body.productPhotos)`).
      const payload: any = {
        deliveryStatus: newStatus,
        branchComments,
        updatedBy: user?.id || 'branch',
      }
      if (photosLoaded) {
        payload.productPhotos = productPhotos
        payload.invoicePhoto = invoicePhoto
      }

      const res = await fetch(`/api/branch/orders/${order?.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) throw new Error('Failed')
      // Merge the server's enriched response back into state so the
      // newly-set deliveredAt / acceptedAt / etc. appear immediately
      // without a manual page refresh. Note: PUT no longer returns
      // photo bytes — we keep our own state authoritative for photos.
      const data = await res.json().catch(() => null)
      if (data?.order) {
        setOrder(data.order as OrderDetail)
        // Server may return updated counts even when we didn't send photos.
        if (typeof data.order.productPhotosCount === 'number') {
          setSavedPhotosCount(data.order.productPhotosCount)
        }
        if (typeof data.order.hasInvoicePhoto === 'boolean') {
          setSavedHasInvoice(data.order.hasInvoicePhoto)
        }
      }
      toast.success('✅ تم تحديث حالة التوصيل')
    } catch {
      toast.error('خطأ في تحديث الحالة')
      setDeliveryStatus(order?.delivery.deliveryStatus || 'لم يخرج بعد')
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveComments = async () => {
    if (!order) return
    setIsSaving(true)
    try {
      const payload: any = {
        deliveryStatus,
        branchComments,
        updatedBy: user?.id || 'branch',
      }
      if (photosLoaded) {
        payload.productPhotos = productPhotos
        payload.invoicePhoto = invoicePhoto
      }

      const res = await fetch(`/api/branch/orders/${order.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) throw new Error('Failed')

      const data = await res.json().catch(() => null)
      if (data?.order) {
        setOrder(data.order as OrderDetail)
        if (typeof data.order.productPhotosCount === 'number') {
          setSavedPhotosCount(data.order.productPhotosCount)
        }
        if (typeof data.order.hasInvoicePhoto === 'boolean') {
          setSavedHasInvoice(data.order.hasInvoicePhoto)
        }
      }
      toast.success('✅ تم حفظ البيانات')
    } catch {
      toast.error('حدث خطأ أثناء الحفظ')
    } finally {
      setIsSaving(false)
    }
  }

  /** Push branch line edits (qty/weight) to the server. */
  const handleSaveItems = async () => {
    if (!order) return
    if (isLocked) {
      toast.error('لا يمكن تعديل الطلب بعد خروجه للتوصيل')
      return
    }
    const payloadItems = order.items.map((it) => {
      const draft = itemEdits[it.id]
      return {
        id: it.id,
        quantity: draft ? draft.quantity : it.quantity,
        weightGrams: draft ? draft.weightGrams : it.weightGrams,
      }
    })
    setIsSavingItems(true)
    try {
      const res = await fetch(`/api/branch/orders/${order.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: payloadItems,
          updatedBy: user?.id || 'branch',
        }),
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody?.error || 'Failed')
      }
      const data = await res.json()
      const refreshed = data.order as OrderDetail
      setOrder(refreshed)
      const drafts: Record<string, { quantity: number; weightGrams: number; weightDraft: string }> = {}
      for (const it of refreshed.items || []) {
        drafts[it.id] = {
          quantity: Number(it.quantity) || 1,
          weightGrams: Number(it.weightGrams) || 0,
          weightDraft: it.weightGrams ? (Number(it.weightGrams) / 1000).toString() : '',
        }
      }
      setItemEdits(drafts)
      toast.success('✅ تم حفظ تعديلات البنود')
    } catch (err: any) {
      toast.error(err?.message || 'تعذر حفظ التعديلات')
    } finally {
      setIsSavingItems(false)
    }
  }

  if (isLoading || !order) {
    return <div className="p-8 text-center text-gray-500">⏳ جاري تحميل التفاصيل...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900" dir="ltr">🚚 {order.appOrderNo}</h1>
          <p className="text-gray-600 mt-1">تفاصيل الطلب للفرع</p>
        </div>
        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${statusClass}`}>{deliveryStatus}</span>
      </div>

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
          <h2 className="font-bold text-gray-900">محتويات الطلب</h2>
          <p><span className="font-semibold">الدفع:</span> {order.paymentMethod}</p>
          <p><span className="font-semibold">ملاحظات CS:</span> {order.notes || '-'}</p>
          {isLocked && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              🔒 الطلب خرج للتوصيل — لا يمكن تعديل الكميات/الأوزان
            </p>
          )}
          <div className="overflow-x-auto mt-2">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-right text-gray-600 border-b">
                  <th className="py-2 pr-2">المنتج</th>
                  <th className="py-2 px-2">الكمية</th>
                  <th className="py-2 px-2">الوزن</th>
                  <th className="py-2 px-2">السعر</th>
                  <th className="py-2 px-2">العرض</th>
                  <th className="py-2 px-2">سعر الوحدة</th>
                  <th className="py-2 pl-2">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => {
                  const draft = itemEdits[item.id] || {
                    quantity: item.quantity,
                    weightGrams: item.weightGrams,
                    weightDraft: item.weightGrams ? (item.weightGrams / 1000).toString() : '',
                  }
                  const isWeight = item.pricingMode === 'weight'
                  const liveUnitPrice = isWeight
                    ? Math.round(item.pricePerKg * (draft.weightGrams / 1000) * 100) / 100
                    : item.unitPrice
                  const liveLineTotal =
                    Math.round(draft.quantity * liveUnitPrice * 100) / 100
                  const qtyChanged =
                    item.originalQuantity != null && Number(item.originalQuantity) !== item.quantity
                  const weightChanged =
                    item.originalWeightGrams != null &&
                    Number(item.originalWeightGrams) !== item.weightGrams
                  return (
                    <tr key={item.id} className="border-b last:border-b-0 align-top">
                      <td className="py-2 pr-2">
                        <div className="flex flex-col gap-1">
                          <span className="font-semibold text-gray-900">{item.productName}</span>
                          {isWeight && (
                            <span className="inline-flex w-fit items-center px-1.5 py-0.5 text-[10px] font-semibold rounded bg-amber-100 text-amber-800 border border-amber-200">
                              بالكيلو · {item.pricePerKg} ج.م / كج
                            </span>
                          )}
                          {item.specialInstructions && (
                            <span className="text-[11px] text-gray-500">{item.specialInstructions}</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="number"
                          min={1}
                          value={draft.quantity}
                          disabled={isLocked}
                          onChange={(e) => {
                            const q = Math.max(1, Number(e.target.value) || 1)
                            setItemEdits((prev) => ({
                              ...prev,
                              [item.id]: { ...draft, quantity: q },
                            }))
                          }}
                          className="w-20 px-2 py-1 border rounded text-left disabled:bg-gray-100"
                          dir="ltr"
                        />
                        {qtyChanged && (
                          <div className="text-[10px] text-blue-700 mt-1">أصلي: {item.originalQuantity}</div>
                        )}
                      </td>
                      <td className="py-2 px-2">
                        {isWeight ? (
                          <div className="flex flex-col items-stretch gap-1">
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={draft.weightDraft}
                                disabled={isLocked}
                                onChange={(e) => {
                                  const raw = e.target.value.replace(/٫/g, '.')
                                  if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return
                                  const kg = Number(raw) || 0
                                  const grams = Math.round(kg * 1000)
                                  setItemEdits((prev) => ({
                                    ...prev,
                                    [item.id]: { ...draft, weightDraft: raw, weightGrams: grams },
                                  }))
                                }}
                                className={`w-24 px-2 py-1 border rounded text-left disabled:bg-gray-100 ${(() => {
                                  const v = Number(draft.weightDraft) || 0
                                  return v >= 10 && /^\d+$/.test(String(draft.weightDraft).trim()) ? 'border-red-400 bg-red-50' : ''
                                })()}`}
                                dir="ltr"
                                placeholder="1.5"
                                title="أدخل الوزن بالكيلوجرام (مثال: 1.5 لـ 1500 جم)"
                              />
                              <span className="text-[11px] text-gray-600">كج</span>
                            </div>
                            {(() => {
                              const kg = Number(draft.weightDraft) || 0
                              if (kg <= 0) return null
                              return (
                                <span className="text-[10px] text-gray-500 text-left" dir="ltr">
                                  = {Math.round(kg * 1000).toLocaleString()} جم
                                </span>
                              )
                            })()}
                            {(() => {
                              const kg = Number(draft.weightDraft) || 0
                              const looksLikeGrams = kg >= 10 && /^\d+$/.test(String(draft.weightDraft).trim())
                              if (!looksLikeGrams || isLocked) return null
                              const correctedKg = kg / 1000
                              return (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const grams = Math.round(correctedKg * 1000)
                                    setItemEdits((prev) => ({
                                      ...prev,
                                      [item.id]: { ...draft, weightDraft: String(correctedKg), weightGrams: grams },
                                    }))
                                  }}
                                  className="text-[10px] font-bold text-red-700 bg-red-50 border border-red-300 rounded px-1.5 py-0.5 hover:bg-red-100 text-right leading-tight"
                                  title={`القيمة بالكيلو وليس بالجرام — هل قصدت ${correctedKg} كج؟`}
                                >
                                  ⚠️ {kg} كج؟ اضغط لتحويلها إلى {correctedKg} كج
                                </button>
                              )
                            })()}
                            {weightChanged && (
                              <div className="text-[10px] text-blue-700 mt-1">
                                أصلي: {(Number(item.originalWeightGrams) / 1000).toFixed(2)} كج
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-500" dir="ltr">
                            {item.weightGrams ? `${item.weightGrams} جم` : '—'}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-gray-700 whitespace-nowrap">
                        {item.basePrice != null
                          ? `${Number(item.basePrice).toLocaleString()} ج.م${isWeight ? ' / كج' : ''}`
                          : '--'}
                      </td>
                      <td className="py-2 px-2 whitespace-nowrap">
                        {item.offerPrice != null &&
                        Number(item.offerPrice) > 0 &&
                        item.basePrice != null &&
                        Number(item.offerPrice) < Number(item.basePrice) ? (
                          <span className="inline-flex items-center gap-1">
                            <span className="text-red-600 font-bold">
                              {Number(item.offerPrice).toLocaleString()} ج.م
                            </span>
                            <span className="text-xs text-red-600 font-semibold">
                              -{(((Number(item.basePrice) - Number(item.offerPrice)) / Number(item.basePrice)) * 100).toFixed(0)}%
                            </span>
                          </span>
                        ) : (
                          <span className="text-gray-400">--</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-gray-700">{liveUnitPrice} ج.م</td>
                      <td className="py-2 pl-2 font-semibold text-gray-900">{liveLineTotal} ج.م</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between pt-2 border-t mt-2">
            <div className="text-xs text-gray-500">
              {!isLocked && 'تعديل الكمية أو وزن المنتجات بالكيلو واضغط حفظ'}
            </div>
            <button
              type="button"
              onClick={handleSaveItems}
              disabled={isLocked || isSavingItems}
              className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-semibold"
            >
              {isSavingItems ? '... جاري الحفظ' : 'حفظ تعديلات البنود'}
            </button>
          </div>
          {(order.subtotal != null || order.deliveryFee != null || order.orderTotal != null) && (
            <>
              {order.discountCode && Number(order.discountAmount) > 0 && (
                <div className="mt-3 rounded-lg border-2 border-amber-300 bg-amber-50 p-3 text-right">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <div className="text-xs font-semibold text-amber-800">🏷️ كود خصم مطبَّق</div>
                      <div className="font-mono text-lg font-bold text-amber-900 tracking-wider" dir="ltr">
                        {order.discountCode}
                      </div>
                    </div>
                    <div className="text-left">
                      <div className="text-xs text-amber-800">قيمة الخصم</div>
                      <div className="text-lg font-bold text-amber-900">
                        −{Number(order.discountAmount).toLocaleString()} ج.م
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 text-[12px] text-amber-900 bg-amber-100 border border-amber-200 rounded px-2 py-1.5">
                    ⚠️ <strong>تنبيه للفرع:</strong> طبِّق هذا الخصم عند التحصيل من العميل. اقبض المبلغ <strong>بعد الخصم</strong> الموضح أدناه باللون الأخضر.
                  </div>
                </div>
              )}
              {Number((order as any).walletUsed) > 0 && (
                <div className="mt-3 rounded-lg border-2 border-emerald-300 bg-emerald-50 p-3 text-right">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <div className="text-xs font-semibold text-emerald-800">💳 خصم من رصيد المحفظة</div>
                      <div className="text-sm font-semibold text-emerald-900">تم خصم رصيد العميل من قبل</div>
                    </div>
                    <div className="text-left">
                      <div className="text-xs text-emerald-800">قيمة الخصم من المحفظة</div>
                      <div className="text-lg font-bold text-emerald-900">
                        −{Number((order as any).walletUsed).toLocaleString()} ج.م
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 text-[12px] text-emerald-900 bg-emerald-100 border border-emerald-200 rounded px-2 py-1.5">
                    ⚠️ <strong>تنبيه للفرع:</strong> العميل استخدم رصيد المحفظة على هذا الطلب. اقبض فقط المبلغ <strong>المطلوب تحصيله</strong> الموضح أدناه باللون الأخضر — لا تحصِّل الإجمالي الكامل.
                  </div>
                </div>
              )}
              {(() => {
                const hasDiscount = Boolean(order.discountCode) && Number(order.discountAmount) > 0
                const hasWallet = Number((order as any).walletUsed) > 0
                const showBreakdown = hasDiscount || hasWallet
                const colClass = showBreakdown ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'
                return (
                  <div className={`grid ${colClass} gap-2 text-xs mt-2`}>
                    <div className="bg-gray-50 border border-gray-200 rounded px-2 py-1">
                      <div className="text-gray-500">الإجمالي الفرعي</div>
                      <div className="font-semibold text-gray-900">{order.subtotal ?? 0} ج.م</div>
                    </div>
                    <div className="bg-gray-50 border border-gray-200 rounded px-2 py-1">
                      <div className="text-gray-500">رسوم التوصيل</div>
                      <div className="font-semibold text-gray-900">{order.deliveryFee ?? 0} ج.م</div>
                    </div>
                    {showBreakdown ? (
                      <>
                        <div className="bg-gray-50 border border-gray-200 rounded px-2 py-1">
                          <div className="text-gray-500">
                            {hasDiscount && hasWallet ? 'قبل الخصم والمحفظة' : hasDiscount ? 'قبل الخصم' : 'قبل خصم المحفظة'}
                          </div>
                          <div className="font-semibold text-gray-500 line-through">{order.orderTotal ?? 0} ج.م</div>
                        </div>
                        <div className="bg-green-50 border-2 border-green-400 rounded px-2 py-1">
                          <div className="text-green-800 font-bold">💰 المطلوب تحصيله</div>
                          <div className="font-bold text-green-800 text-base">{Number(order.netTotal ?? order.orderTotal ?? 0).toLocaleString()} ج.م</div>
                        </div>
                      </>
                    ) : (
                      <div className="bg-red-50 border border-red-200 rounded px-2 py-1">
                        <div className="text-red-700">الإجمالي الكلي</div>
                        <div className="font-bold text-red-700">{order.orderTotal ?? 0} ج.م</div>
                      </div>
                    )}
                  </div>
                )
              })()}
            </>
          )}
        </section>
      </div>

      <section className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
        <h2 className="font-bold text-gray-900">تحديثات الفرع</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
              {deliveryStatus === 'تم التوصيل'
                ? order.delivery.deliveredAt
                  ? formatCairoFriendly(order.delivery.deliveredAt)
                  : 'سيتم تسجيله تلقائياً عند الحفظ'
                : '-'}
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
            {/* Phase 2H — lazy-load banner. Shows count of saved photos when
                we haven't fetched their bytes yet. Clicking the button
                downloads the photos on demand. */}
            {!photosLoaded && savedPhotosCount > 0 && (
              <div className="mb-2 flex items-center justify-between bg-blue-50 border border-blue-200 rounded px-3 py-2 text-sm">
                <span className="text-blue-800">
                  🖼️ {savedPhotosCount} صور محفوظة (لم يتم تحميلها)
                </span>
                <button
                  type="button"
                  onClick={handleLoadPhotos}
                  disabled={isLoadingPhotos}
                  className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-xs font-semibold"
                >
                  {isLoadingPhotos ? '... جاري التحميل' : 'عرض الصور'}
                </button>
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => {
                // Snapshot into a File[] BEFORE clearing the input, because the
                // clear invalidates the live FileList reference we'd otherwise
                // capture in the async handler.
                const captured = e.target.files ? Array.from(e.target.files) : []
                e.target.value = ''
                handleAddProductPhotos(captured)
              }}
              className="w-full"
            />
            <div className="mt-2 grid grid-cols-3 gap-2">
              {productPhotos.map((photo, idx) => (
                <div key={idx} className="relative group">
                  <img src={photo} alt={`product-${idx}`} className="w-full h-20 object-cover rounded border border-gray-200" />
                  <button
                    type="button"
                    onClick={() => handleRemoveProductPhoto(idx)}
                    className="absolute top-1 left-1 bg-red-600 hover:bg-red-700 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shadow opacity-90 group-hover:opacity-100 transition"
                    aria-label="حذف الصورة"
                    title="حذف الصورة"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 text-right">صورة الفاتورة (مفردة)</label>
            {!photosLoaded && savedHasInvoice && (
              <div className="mb-2 flex items-center justify-between bg-blue-50 border border-blue-200 rounded px-3 py-2 text-sm">
                <span className="text-blue-800">🧾 صورة فاتورة محفوظة (لم يتم تحميلها)</span>
                <button
                  type="button"
                  onClick={handleLoadPhotos}
                  disabled={isLoadingPhotos}
                  className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-xs font-semibold"
                >
                  {isLoadingPhotos ? '... جاري التحميل' : 'عرض الفاتورة'}
                </button>
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const captured = e.target.files ? Array.from(e.target.files) : []
                e.target.value = ''
                handleInvoicePhoto(captured)
              }}
              className="w-full"
            />
            <div className="mt-2">
              {invoicePhoto ? (
                <div className="relative group">
                  <img src={invoicePhoto} alt="invoice" className="w-full h-28 object-cover rounded border border-gray-200" />
                  <button
                    type="button"
                    onClick={handleRemoveInvoicePhoto}
                    className="absolute top-1 left-1 bg-red-600 hover:bg-red-700 text-white w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shadow opacity-90 group-hover:opacity-100 transition"
                    aria-label="حذف صورة الفاتورة"
                    title="حذف صورة الفاتورة"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div className="w-full h-28 border border-dashed border-gray-300 rounded flex items-center justify-center text-sm text-gray-500">
                  {!photosLoaded && savedHasInvoice
                    ? 'اضغط "عرض الفاتورة" أعلاه لتحميل الصورة'
                    : 'لا توجد صورة فاتورة'}
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
