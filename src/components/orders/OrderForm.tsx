'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/lib/auth'
import { cairoDateString, cairoTimeString, formatCairoFriendly } from '@/lib/cairoTime'
import WhatsAppShare from './WhatsAppShare'

type Product = {
  id: string
  productName: string
  productDescription?: string
  productCategory?: string
  packagingType?: string
  weightGrams: number
  basePrice: number
  offerPrice: number | null
  productCondition: 'فريش' | 'مبردة' | 'مجمد'
  isActive: boolean
  isTargeted?: boolean
  stockStatus?: 'available' | 'low' | 'out'
  stockQuantity?: number | null
  /** 'weight' = sold per kg; basePrice/offerPrice are interpreted as price-per-kg. */
  pricingMode?: 'unit' | 'weight'
}

type CustomerAddress = {
  id: string
  addressLabel: string
  area?: string
  subArea?: string
  streetAddress: string
  googleMapsLink: string
}

type DeliveryZone = {
  zone: number
  area: string
  subArea?: string
  customerDeliveryFee: number
  freeDeliveryValue: number
}

type OrderItemForm = {
  productId: string
  productNameInput: string
  quantity: number
  weightGrams: number
  unitPrice: number
  specialInstructions: string
  /** CS-entered quantity snapshot, set by branch on first amend. */
  originalQuantity?: number | null
  /** CS-entered weight (grams) snapshot, set by branch on first amend. */
  originalWeightGrams?: number | null
}

const normalizeProductName = (value: string) =>
  String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

const findProductByName = (products: Product[], productNameInput: string) => {
  const normalizedInput = normalizeProductName(productNameInput)
  if (!normalizedInput) return null

  // Strict equality only — fuzzy substring matching caused the field to keep
  // snapping back to the previously selected product when typing a new name.
  return products.find((p) => normalizeProductName(p.productName) === normalizedInput) || null
}

type OrderFormModel = {
  orderDate: string
  orderTime: string
  orderType: string
  orderReceiver: string
  orderMethod: string
  phone: string
  customerName: string
  customerType: 'جديد' | 'قديم' | 'عائد' | 'استكمال' | 'استرجاع' | 'استبدال' | 'تسويق' | 'تعويض' | 'فحص' | 'تحصيل'
  customerSource: string
  deliveryAddressId: string
  addressLabel: string
  deliveryArea: string
  deliverySubArea: string
  streetAddress: string
  googleMapsLink: string
  paymentMethod: string
  orderStatus: string
  cancellationReason: 'نفاد المنتج' | 'عدم توفر' | 'تأخير التوصيل' | 'سعر مرتفع' | 'موعد غير مناسب' | 'Other' | ''
  notes: string
  followUp: boolean
  followUpNotes: string
  scheduledDate: string
  scheduledTimeSlot: '' | 'صباحي' | 'مسائي' | 'ساعة محددة'
  scheduledSpecificTime: string
  csAttachments: CSAttachmentForm[]
}

// CS-side attachment captured on the order form. We use a separate form
// type (vs. lib/omsData's CSAttachment) so the form state stays a pure
// React-friendly value and the persistence shape can evolve independently.
type CSAttachmentForm = {
  id: string
  url: string        // data URL (base64)
  caption: string
  uploadedBy: string
  uploadedAt: string
}

type DeliveryData = {
  deliveryStatus: 'لم يخرج بعد' | 'جاهز' | 'في الطريق' | 'تم التوصيل'
  branchComments: string
  productPhotos: string[]
  invoicePhoto: string
  deliveredAt: string | null
}

const ORDER_TYPES_FALLBACK = ['B2B', 'Online', 'Instashop', 'App']
const ORDER_RECEIVERS_FALLBACK = ['رنا', 'مى', 'ميرنا', 'أمل']
const ORDER_METHODS_FALLBACK = ['FB', 'Call', 'App', 'WhatsApp', 'B2B', 'W.S']
const CUSTOMER_TYPES: OrderFormModel['customerType'][] = ['جديد', 'قديم', 'عائد', 'استكمال', 'استرجاع', 'استبدال', 'تسويق', 'تعويض', 'فحص', 'تحصيل']
const CUSTOMER_SOURCES_FALLBACK = ['Facebook', 'Instashop', 'Google', 'Breadfast', 'Friend', 'Branch', 'Family', 'Instagram', 'Play Store', 'Ad', 'GoodsMart', 'Other']
const ORDER_STATUSES_FALLBACK = ['تم', 'مؤجل', 'لاغي', 'حجز']
const CANCELLATION_REASONS: string[] = ['نفاد المنتج', 'عدم توفر', 'تأخير التوصيل', 'سعر مرتفع', 'موعد غير مناسب', 'Other']
const PAYMENT_METHODS_FALLBACK = ['Instapay', 'Cash', 'Visa', 'Credit']

function getDefaultOrderModel(): OrderFormModel {
  // Always use Cairo wall-clock so an order placed just after midnight is
  // tagged with the new Cairo day (even if the server/browser is in UTC).
  const orderDate = cairoDateString()
  const orderTime = cairoTimeString()

  return {
    orderDate,
    orderTime,
    orderType: 'Online',
    orderReceiver: 'رنا',
    orderMethod: 'Call',
    phone: '',
    customerName: '',
    customerType: 'جديد',
    customerSource: 'Facebook',
    deliveryAddressId: '__new',
    addressLabel: 'Home',
    deliveryArea: '',
    deliverySubArea: '',
    streetAddress: '',
    googleMapsLink: '',
    paymentMethod: 'Cash',
    orderStatus: 'تم',
    cancellationReason: '',
    notes: '',
    followUp: false,
    followUpNotes: '',
    scheduledDate: '',
    scheduledTimeSlot: '',
    scheduledSpecificTime: '',
    csAttachments: [],
  }
}

const emptyItem = (): OrderItemForm => ({
  productId: '',
  productNameInput: '',
  quantity: 1,
  weightGrams: 0,
  unitPrice: 0,
  specialInstructions: '',
  originalQuantity: null,
  originalWeightGrams: null,
})

/**
 * Decimal kg input that keeps its own draft string so the user can type
 * "1.", "1.2", "0.5" naturally without the value being clipped by Number()
 * round-tripping on every keystroke.
 *
 * UX guardrails (to avoid grams/kg confusion):
 * - Placeholder shows an example in kg (e.g. "1.5").
 * - A live "= NNN جم" hint appears below so the user always sees the gram equivalent.
 * - If the value looks like grams entered by mistake (≥ 10 kg, e.g. "1150"),
 *   a one-click warning lets the user convert it (÷ 1000).
 */
function WeightKgInput({
  grams,
  pricePerKg,
  onChange,
}: {
  grams: number
  pricePerKg: number
  onChange: (next: { weightGrams: number; unitPrice: number }) => void
}) {
  const [draft, setDraft] = useState<string>(grams ? (grams / 1000).toString() : '')

  // Sync from outside (e.g. product change) only when the numeric value
  // diverges — so typing "1." (grams=1000) doesn't get clobbered back to "1".
  useEffect(() => {
    const expected = grams ? grams / 1000 : 0
    const draftNum = Number(draft)
    if (Number.isNaN(draftNum) || draftNum !== expected) {
      setDraft(grams ? (grams / 1000).toString() : '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grams])

  const kgNum = Number(draft) || 0
  const gramsPreview = Math.round(kgNum * 1000)
  // Likely-grams-by-mistake when the user types an integer >= 10 (kg)
  const looksLikeGrams = kgNum >= 10 && /^\d+$/.test(draft.trim())

  const applyDivideByThousand = () => {
    const correctedKg = kgNum / 1000
    const nextGrams = Math.round(correctedKg * 1000)
    const nextUnitPrice = Math.round(pricePerKg * correctedKg * 100) / 100
    setDraft(String(correctedKg))
    onChange({ weightGrams: nextGrams, unitPrice: nextUnitPrice })
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        onChange={(e) => {
          const raw = e.target.value
          // Allow empty, digits, and a single decimal point (Western or Arabic).
          const normalized = raw.replace(/٫/g, '.')
          if (normalized !== '' && !/^\d*\.?\d*$/.test(normalized)) return
          setDraft(normalized)
          const kg = Number(normalized) || 0
          const nextGrams = Math.round(kg * 1000)
          const nextUnitPrice = Math.round(pricePerKg * kg * 100) / 100
          onChange({ weightGrams: nextGrams, unitPrice: nextUnitPrice })
        }}
        onFocus={(e) => e.currentTarget.select()}
        className={`w-24 px-2 py-1 border rounded text-left ${looksLikeGrams ? 'border-red-400 bg-red-50' : ''}`}
        dir="ltr"
        placeholder="1.5"
        title="أدخل الوزن بالكيلوجرام (مثال: 1.5 لـ 1500 جم)"
      />
      {kgNum > 0 && (
        <span className="text-[10px] text-gray-500 ltr text-left" dir="ltr">
          = {gramsPreview.toLocaleString()} جم
        </span>
      )}
      {looksLikeGrams && (
        <button
          type="button"
          onClick={applyDivideByThousand}
          className="text-[10px] font-bold text-red-700 bg-red-50 border border-red-300 rounded px-1.5 py-0.5 hover:bg-red-100 text-right leading-tight"
          title={`القيمة بالكيلو وليس بالجرام — هل قصدت ${(kgNum / 1000).toString()} كج؟`}
        >
          ⚠️ {kgNum} كج؟ اضغط لتحويلها إلى {(kgNum / 1000).toString()} كج
        </button>
      )}
    </div>
  )
}

type Props = {
  mode: 'create' | 'edit'
  orderId?: string
}

export default function OrderForm({ mode, orderId }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuthStore()

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isLookupLoading, setIsLookupLoading] = useState(false)
  const [customerStatus, setCustomerStatus] = useState<{ status: 'active' | 'warning' | 'suspended'; reason: string | null } | null>(null)
  // Wallet credit captured at customer-lookup time. `customerWalletBalance`
  // is the latest balance pulled from the CRM (null before lookup, 0 if the
  // customer has none, > 0 if they have credit to spend). `walletUsedInput`
  // is the raw string the agent typed so we don't fight with controlled
  // input formatting. `loadedCustomerId` is the customer FK we matched on
  // — used by the API to credit/debit the right wallet on save.
  const [loadedCustomerId, setLoadedCustomerId] = useState<string | null>(null)
  const [customerWalletBalance, setCustomerWalletBalance] = useState<number | null>(null)
  // For an edit, this is the walletUsed amount that was already deducted
  // from the customer's balance on the previous save — we surface it as
  // "available again" inside the cap so editing doesn't double-count.
  const [previousWalletUsed, setPreviousWalletUsed] = useState<number>(0)
  const [walletUsedInput, setWalletUsedInput] = useState<string>('')
  const [discountCodeInput, setDiscountCodeInput] = useState('')
  const [appliedDiscount, setAppliedDiscount] = useState<{ code: string; amount: number; type: 'percent' | 'value'; value: number } | null>(null)
  const [isCheckingDiscount, setIsCheckingDiscount] = useState(false)

  const [products, setProducts] = useState<Product[]>([])
  const [addresses, setAddresses] = useState<CustomerAddress[]>([])
  const [deliveryZones, setDeliveryZones] = useState<DeliveryZone[]>([])
  const [orderReceivers, setOrderReceivers] = useState<string[]>(ORDER_RECEIVERS_FALLBACK)
  const [orderMethods, setOrderMethods] = useState<string[]>(ORDER_METHODS_FALLBACK)
  const [customerSources, setCustomerSources] = useState<string[]>(CUSTOMER_SOURCES_FALLBACK)
  const [orderTypes, setOrderTypes] = useState<string[]>(ORDER_TYPES_FALLBACK)
  const [paymentMethods, setPaymentMethods] = useState<string[]>(PAYMENT_METHODS_FALLBACK)
  const [orderStatuses, setOrderStatuses] = useState<string[]>(ORDER_STATUSES_FALLBACK)
  const [form, setForm] = useState<OrderFormModel>(getDefaultOrderModel())
  const [items, setItems] = useState<OrderItemForm[]>([emptyItem()])
  const [deliveryData, setDeliveryData] = useState<DeliveryData | null>(null)
  const [loadedOrderInfo, setLoadedOrderInfo] = useState<{ appOrderNo: string } | null>(null)

  const setDirtyFlag = (dirty: boolean) => {
    if (typeof window === 'undefined' || mode !== 'create') return
    window.sessionStorage.setItem('order-form-dirty', dirty ? 'true' : 'false')
  }

  useEffect(() => {
    const loadBase = async () => {
      try {
        const [productsRes, zonesRes, settingsRes] = await Promise.all([
          fetch('/api/products'),
          fetch('/api/delivery-zones'),
          fetch('/api/order-settings'),
        ])

        const productsData = await productsRes.json()
        const activeProducts = (productsData.products || []).filter((p: Product) => p.isActive)
        setProducts(activeProducts)

        // Diagnostic: count stock states so we can confirm low/out actually arrive in the client.
        if (typeof window !== 'undefined') {
          const lowList = activeProducts.filter((p: any) => String(p?.stockStatus || '').toLowerCase().trim() === 'low')
          const outList = activeProducts.filter((p: any) => String(p?.stockStatus || '').toLowerCase().trim() === 'out')
          // eslint-disable-next-line no-console
          console.info('[OrderForm] products loaded', {
            total: activeProducts.length,
            low: lowList.length,
            out: outList.length,
            lowSample: lowList.slice(0, 3).map((p: any) => ({ name: p.productName, stockStatus: p.stockStatus, stockQuantity: p.stockQuantity })),
          })
        }

        const zonesData = await zonesRes.json()
        const zones = Array.isArray(zonesData.zones) ? zonesData.zones : []
        setDeliveryZones(zones)

        if (settingsRes.ok) {
          const settingsData = await settingsRes.json()
          const receivers = Array.isArray(settingsData.options?.orderReceivers)
            ? settingsData.options.orderReceivers
            : ORDER_RECEIVERS_FALLBACK
          const methods = Array.isArray(settingsData.options?.orderMethods)
            ? settingsData.options.orderMethods
            : ORDER_METHODS_FALLBACK
          const sources = Array.isArray(settingsData.options?.customerSources)
            ? settingsData.options.customerSources
            : CUSTOMER_SOURCES_FALLBACK

          setOrderReceivers(receivers.length > 0 ? receivers : ORDER_RECEIVERS_FALLBACK)
          setOrderMethods(methods.length > 0 ? methods : ORDER_METHODS_FALLBACK)
          setCustomerSources(sources.length > 0 ? sources : CUSTOMER_SOURCES_FALLBACK)

          const types = Array.isArray(settingsData.options?.orderTypes) ? settingsData.options.orderTypes : ORDER_TYPES_FALLBACK
          const payments = Array.isArray(settingsData.options?.paymentMethods) ? settingsData.options.paymentMethods : PAYMENT_METHODS_FALLBACK
          const statuses = Array.isArray(settingsData.options?.orderStatuses) ? settingsData.options.orderStatuses : ORDER_STATUSES_FALLBACK

          setOrderTypes(types.length > 0 ? types : ORDER_TYPES_FALLBACK)
          setPaymentMethods(payments.length > 0 ? payments : PAYMENT_METHODS_FALLBACK)
          setOrderStatuses(statuses.length > 0 ? statuses : ORDER_STATUSES_FALLBACK)

          if (mode === 'create') {
            setForm((prev) => ({
              ...prev,
              orderReceiver: receivers.includes(prev.orderReceiver) ? prev.orderReceiver : receivers[0] || ORDER_RECEIVERS_FALLBACK[0],
              orderMethod: methods.includes(prev.orderMethod) ? prev.orderMethod : methods[0] || ORDER_METHODS_FALLBACK[1],
              customerSource: sources.includes(prev.customerSource) ? prev.customerSource : sources[0] || CUSTOMER_SOURCES_FALLBACK[0],
              orderType: types.includes(prev.orderType) ? prev.orderType : types[1] || ORDER_TYPES_FALLBACK[1],
              paymentMethod: payments.includes(prev.paymentMethod) ? prev.paymentMethod : payments[0] || PAYMENT_METHODS_FALLBACK[1],
              orderStatus: statuses.includes(prev.orderStatus) ? prev.orderStatus : statuses[0] || ORDER_STATUSES_FALLBACK[0],
            }))
          }
        }

        if (mode === 'create' && zones.length > 0) {
          setForm((prev) => ({
            ...prev,
            deliveryArea: prev.deliveryArea || String(zones[0].area || ''),
          }))
        }

        if (mode === 'edit' && orderId) {
          const orderRes = await fetch(`/api/orders/${orderId}`, { cache: 'no-store' })
          if (!orderRes.ok) {
            console.error('[OrderForm] order fetch failed', orderRes.status, await orderRes.text().catch(() => ''))
            throw new Error('Failed to load order')
          }
          const orderData = await orderRes.json()
          const order = orderData.order || {}

          setForm({
            orderDate: order.orderDate || '',
            orderTime: order.orderTime || '',
            orderType: order.orderType || ORDER_TYPES_FALLBACK[1],
            orderReceiver: order.orderReceiver || '',
            orderMethod: order.orderMethod || '',
            phone: order.customer?.phone || '',
            customerName: order.customer?.customerName || '',
            customerType: order.customerType || 'جديد',
            customerSource: order.customerSource || CUSTOMER_SOURCES_FALLBACK[0],
            deliveryAddressId: order.address?.id || '__new',
            addressLabel: order.address?.addressLabel || 'Home',
            deliveryArea: order.address?.area || '',
            deliverySubArea: order.address?.subArea || '',
            streetAddress: order.address?.streetAddress || '',
            googleMapsLink: order.address?.googleMapsLink || '',
            paymentMethod: order.paymentMethod || PAYMENT_METHODS_FALLBACK[1],
            orderStatus: order.orderStatus || ORDER_STATUSES_FALLBACK[0],
            cancellationReason: order.cancellationReason || '',
            notes: order.notes || '',
            followUp: Boolean(order.followUp),
            followUpNotes: order.followUpNotes || '',
            scheduledDate: order.scheduledDate || '',
            scheduledTimeSlot: (order.scheduledTimeSlot as OrderFormModel['scheduledTimeSlot']) || '',
            scheduledSpecificTime: order.scheduledSpecificTime || '',
            csAttachments: Array.isArray(order.csAttachments) ? order.csAttachments : [],
          })

          // Best-effort: load other addresses for this customer (non-fatal).
          if (order.customer?.phone) {
            try {
              const lookupRes = await fetch(`/api/customers?phone=${encodeURIComponent(order.customer.phone)}`)
              if (lookupRes.ok) {
                const lookupData = await lookupRes.json()
                setAddresses(Array.isArray(lookupData.addresses) ? lookupData.addresses : [])
                // Capture wallet balance + customer id so the wallet UI is
                // populated when the agent reopens an existing order.
                if (lookupData?.customer) {
                  setLoadedCustomerId(String(lookupData.customer.id))
                  setCustomerWalletBalance(Number(lookupData.customer.wallet) || 0)
                }
              } else {
                setAddresses([])
              }
            } catch (err) {
              console.warn('[OrderForm] customer addresses lookup failed', err)
              setAddresses([])
            }
          } else {
            setAddresses([])
          }

          const mappedItems = (Array.isArray(order.items) ? order.items : []).map((item: any) => ({
            productId: item.productId,
            productNameInput: item.productName || '',
            quantity: item.quantity,
            weightGrams: item.weightGrams,
            unitPrice: item.unitPrice,
            specialInstructions: item.specialInstructions || '',
            originalQuantity: item.originalQuantity ?? null,
            originalWeightGrams: item.originalWeightGrams ?? null,
          }))

          setItems(mappedItems.length > 0 ? mappedItems : [emptyItem()])

          setLoadedOrderInfo({ appOrderNo: order.appOrderNo || '' })

          // Restore the voucher that CS applied at save time so it survives
          // close/reopen and is visible to whoever edits the order next.
          if (order.discountCode && Number(order.discountAmount) > 0) {
            setAppliedDiscount({
              code: String(order.discountCode),
              amount: Number(order.discountAmount) || 0,
              // We don't persist the original 'percent vs value' flag, so we
              // display the saved discount as a flat EGP amount which is
              // accurate regardless of the original rule.
              type: 'value',
              value: Number(order.discountAmount) || 0,
            })
            setDiscountCodeInput(String(order.discountCode))
          } else {
            setAppliedDiscount(null)
            setDiscountCodeInput('')
          }

          // Restore previously-applied wallet usage (if any) so editing
          // the order shows the same amount in the wallet input.
          const savedWalletUsed = Number((order as any).walletUsed) || 0
          setPreviousWalletUsed(savedWalletUsed)
          setWalletUsedInput(savedWalletUsed > 0 ? String(savedWalletUsed) : '')

          // Load delivery data if available
          if (order.delivery) {
            setDeliveryData(order.delivery)
          }
        }
      } catch (err) {
        console.error('[OrderForm] loadBase failed', err)
        toast.error('خطأ في تحميل بيانات النموذج')
      } finally {
        setIsLoading(false)
      }
    }

    loadBase()
  }, [mode, orderId])

  // Prefill from URL when launching new order from a customer profile.
  // Supports ?phone=...&name=...&customerId=...
  useEffect(() => {
    if (mode !== 'create' || isLoading) return
    const phoneParam = (searchParams.get('phone') || '').trim()
    const nameParam = (searchParams.get('name') || '').trim()
    if (!phoneParam && !nameParam) return

    let cancelled = false
    const run = async () => {
      try {
        setIsLookupLoading(true)
        const qs = new URLSearchParams()
        if (phoneParam) qs.set('phone', phoneParam)
        if (nameParam) qs.set('name', nameParam)
        const res = await fetch(`/api/customers?${qs.toString()}`)
        const data = await res.json()
        if (cancelled) return

        if (!data?.customer) {
          // No match — just seed the phone/name so the agent sees the prefill.
          setForm((prev) => ({
            ...prev,
            phone: phoneParam || prev.phone,
            customerName: nameParam || prev.customerName,
            customerType: 'جديد',
          }))
          toast('عميل جديد — لم يتم العثور على بيانات سابقة')
          return
        }

        setAddresses(Array.isArray(data.addresses) ? data.addresses : [])
        const firstAddress = data.addresses?.[0]
        const lookedUpStatus = (data.customer?.status as 'active' | 'warning' | 'suspended') || 'active'
        setCustomerStatus({ status: lookedUpStatus, reason: data.customer?.statusReason || null })
        // Capture identity + wallet so the status banner and wallet badge both
        // render — same behaviour as the manual lookup path.
        setLoadedCustomerId(String(data.customer.id))
        setCustomerWalletBalance(Number(data.customer.wallet) || 0)

        setForm((prev) => ({
          ...prev,
          phone: data.customer.phone || phoneParam || prev.phone,
          customerName: data.customer.customerName || nameParam || prev.customerName,
          customerType: 'قديم',
          deliveryAddressId: firstAddress?.id || '__new',
          addressLabel: firstAddress?.addressLabel || 'Home',
          deliveryArea: firstAddress?.area || '',
          deliverySubArea: firstAddress?.subArea || '',
          streetAddress: firstAddress?.streetAddress || '',
          googleMapsLink: firstAddress?.googleMapsLink || '',
        }))
        toast.success('تم تعبئة بيانات العميل')
      } catch (err) {
        console.warn('[OrderForm] prefill from URL failed', err)
      } finally {
        if (!cancelled) setIsLookupLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, isLoading])

  useEffect(() => {
    setDirtyFlag(false)
    return () => setDirtyFlag(false)
  }, [mode])

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0),
    [items]
  )
  const selectedZone = useMemo(() => {
    const area = String(form.deliveryArea || '').trim()
    const sub = String(form.deliverySubArea || '').trim()
    const matches = deliveryZones.filter((z) => String(z.area || '').trim() === area)
    if (matches.length === 0) return null
    return (sub && matches.find((z) => String(z.subArea || '').trim() === sub)) || matches[0]
  }, [deliveryZones, form.deliveryArea, form.deliverySubArea])

  // Sub-areas available under the currently selected area
  const subAreaOptions = useMemo(() => {
    const area = String(form.deliveryArea || '').trim()
    if (!area) return [] as string[]
    return Array.from(
      new Set(
        deliveryZones
          .filter((z) => String(z.area || '').trim() === area)
          .map((z) => String(z.subArea || '').trim())
          .filter(Boolean)
      )
    )
  }, [deliveryZones, form.deliveryArea])
  const freeDeliveryValue = Number(selectedZone?.freeDeliveryValue || 0)
  const baseCustomerDeliveryFee = Number(selectedZone?.customerDeliveryFee || 0)
  const deliveryFee = selectedZone
    ? freeDeliveryValue > 0 && subtotal >= freeDeliveryValue
      ? 0
      : baseCustomerDeliveryFee
    : subtotal > 1800
    ? 0
    : 95
  const orderTotal = subtotal + deliveryFee

  // Voucher / discount-code applied to the gross total
  const discountAmount = appliedDiscount ? Math.min(appliedDiscount.amount, orderTotal) : 0
  // Wallet credit applied on top of the voucher. We cap the wallet
  // application to (a) what the customer actually has + whatever was
  // already debited on this order in edit mode — so editing a saved order
  // doesn't artificially shrink the cap — and (b) what's still owed after
  // the voucher is taken off, so the customer is never charged below 0.
  const afterVoucher = Math.max(0, orderTotal - discountAmount)
  const walletAvailable = Math.max(0, (customerWalletBalance ?? 0) + previousWalletUsed)
  const walletUsedRaw = Number(walletUsedInput) || 0
  const walletUsed = Math.max(0, Math.min(walletUsedRaw, walletAvailable, afterVoucher))
  const netTotal = Math.max(0, afterVoucher - walletUsed)
  const walletBalanceAfter = Math.max(0, walletAvailable - walletUsed)

  const handleApplyDiscount = async () => {
    const code = discountCodeInput.trim().toUpperCase()
    if (!code) {
      toast.error('أدخل كود الخصم')
      return
    }
    setIsCheckingDiscount(true)
    try {
      const res = await fetch(`/api/discount-codes/validate?code=${encodeURIComponent(code)}&gross=${orderTotal}`, { cache: 'no-store' })
      const data = await res.json()
      if (!data.ok) {
        setAppliedDiscount(null)
        toast.error(data.reason || 'الكود غير صالح')
        return
      }
      setAppliedDiscount({ code: data.code, amount: Number(data.discount) || 0, type: data.type, value: Number(data.amount) || 0 })
      toast.success(`✅ تم تطبيق خصم ${(Number(data.discount) || 0).toLocaleString()} ج.م`)
    } catch {
      toast.error('تعذر التحقق من الكود')
    } finally {
      setIsCheckingDiscount(false)
    }
  }

  const handleClearDiscount = () => {
    setAppliedDiscount(null)
    setDiscountCodeInput('')
  }

  // CS-side attachments (proof of payment, ID copy, financial transaction
  // receipts, etc.). We store images as base64 data URLs — same approach
  // used for branch productPhotos / invoicePhoto — and persist them as a
  // JSONB column on the order row. Each file is converted client-side
  // before save so the PUT/POST payload is the only network round-trip.
  const MAX_CS_ATTACHMENT_BYTES = 5 * 1024 * 1024 // 5 MB per file
  const handleAddCsAttachments = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const newOnes: CSAttachmentForm[] = []
    for (const file of Array.from(files)) {
      if (file.size > MAX_CS_ATTACHMENT_BYTES) {
        toast.error(`الملف "${file.name}" أكبر من 5MB — اختر صورة أصغر`)
        continue
      }
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result || ''))
          reader.onerror = () => reject(reader.error)
          reader.readAsDataURL(file)
        })
        newOnes.push({
          id: `cs-att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          url: dataUrl,
          caption: '',
          uploadedBy: user?.name || user?.id || 'unknown',
          uploadedAt: new Date().toISOString(),
        })
      } catch (err) {
        console.warn('[OrderForm] failed to read CS attachment', err)
        toast.error(`تعذر قراءة الملف "${file.name}"`)
      }
    }
    if (newOnes.length === 0) return
    setDirtyFlag(true)
    setForm((prev) => ({ ...prev, csAttachments: [...(prev.csAttachments || []), ...newOnes] }))
  }

  const handleUpdateCsAttachmentCaption = (id: string, caption: string) => {
    setDirtyFlag(true)
    setForm((prev) => ({
      ...prev,
      csAttachments: (prev.csAttachments || []).map((a) =>
        a.id === id ? { ...a, caption } : a,
      ),
    }))
  }

  const handleRemoveCsAttachment = (id: string) => {
    setDirtyFlag(true)
    setForm((prev) => ({
      ...prev,
      csAttachments: (prev.csAttachments || []).filter((a) => a.id !== id),
    }))
  }

  const handleLookupCustomer = async () => {
    const cleanPhone = form.phone.trim()
    const cleanName = form.customerName.trim()
    if (!cleanPhone && !cleanName) {
      toast.error('أدخل رقم الهاتف أو اسم العميل أولاً')
      return
    }

    setIsLookupLoading(true)
    try {
      const params = new URLSearchParams()
      if (cleanPhone) params.set('phone', cleanPhone)
      if (cleanName) params.set('name', cleanName)

      const response = await fetch(`/api/customers?${params.toString()}`)
      const data = await response.json()

      if (!data.customer) {
        setAddresses([])
        setCustomerStatus(null)
        setLoadedCustomerId(null)
        setCustomerWalletBalance(null)
        setWalletUsedInput('')
        setForm((prev) => ({
          ...prev,
          customerName: '',
          customerType: 'جديد',
          deliveryAddressId: '__new',
          deliveryArea: '',
          deliverySubArea: '',
          streetAddress: '',
          googleMapsLink: '',
        }))
        toast('عميل جديد، يمكنك متابعة إدخال البيانات')
        return
      }

      setAddresses(data.addresses || [])
      const firstAddress = data.addresses?.[0]

      const lookedUpStatus = (data.customer?.status as 'active' | 'warning' | 'suspended') || 'active'
      setCustomerStatus({
        status: lookedUpStatus,
        reason: data.customer?.statusReason || null,
      })

      // Capture wallet credit so the form can offer it as a discount.
      setLoadedCustomerId(String(data.customer.id))
      setCustomerWalletBalance(Number(data.customer.wallet) || 0)
      // New lookup — reset any wallet-usage carried over from a previous
      // search on the same form session.
      setPreviousWalletUsed(0)
      setWalletUsedInput('')

      setForm((prev) => ({
        ...prev,
        phone: data.customer.phone || prev.phone,
        customerName: data.customer.customerName || '',
        customerType: 'قديم',
        deliveryAddressId: firstAddress?.id || '__new',
        addressLabel: firstAddress?.addressLabel || 'Home',
        deliveryArea: firstAddress?.area || '',
        deliverySubArea: firstAddress?.subArea || '',
        streetAddress: firstAddress?.streetAddress || '',
        googleMapsLink: firstAddress?.googleMapsLink || '',
      }))

      toast.success('تم العثور على بيانات العميل')
    } catch {
      toast.error('تعذر البحث عن العميل')
    } finally {
      setIsLookupLoading(false)
    }
  }

  const updateForm = <K extends keyof OrderFormModel>(key: K, value: OrderFormModel[K]) => {
    setDirtyFlag(true)
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const updateItem = (index: number, patch: Partial<OrderItemForm>) => {
    setDirtyFlag(true)
    setItems((prev) => prev.map((item, idx) => (idx === index ? { ...item, ...patch } : item)))
  }

  const onProductNameChange = (index: number, productName: string) => {
    setDirtyFlag(true)
    const selected = findProductByName(products, productName)

    if (!selected) {
      updateItem(index, { productNameInput: productName, productId: '' })
      return
    }

    const isWeight = selected.pricingMode === 'weight'
    const pricePerUnit = Number(selected.offerPrice ?? selected.basePrice ?? 0)
    // For weight products, basePrice is price-per-kg. Use the product's
    // configured estimated weight (or default to 1000g) and compute the
    // per-piece price = pricePerKg * estimatedKg.
    const estimatedGrams = Number(selected.weightGrams) > 0 ? Number(selected.weightGrams) : 1000
    const unitPrice = isWeight
      ? Math.round(pricePerUnit * (estimatedGrams / 1000) * 100) / 100
      : pricePerUnit

    updateItem(index, {
      productNameInput: productName,
      productId: selected.id,
      weightGrams: isWeight ? estimatedGrams : Number(selected.weightGrams) || 0,
      unitPrice,
    })
  }

  const addItem = () => {
    setDirtyFlag(true)
    setItems((prev) => [...prev, emptyItem()])
  }
  const removeItem = (index: number) => {
    setDirtyFlag(true)
    setItems((prev) => {
      // If it's the last remaining row, reset it instead of removing —
      // so the agent can clear/start over the single line.
      if (prev.length <= 1) return [emptyItem()]
      return prev.filter((_, idx) => idx !== index)
    })
  }

  const handleAddressSelection = (addressId: string) => {
    setDirtyFlag(true)
    const selected = addresses.find((a) => a.id === addressId)
    if (!selected) {
      updateForm('deliveryAddressId', '__new')
      updateForm('deliveryArea', '')
      updateForm('deliverySubArea', '')
      updateForm('streetAddress', '')
      updateForm('googleMapsLink', '')
      updateForm('addressLabel', 'Home')
      return
    }

    setForm((prev) => ({
      ...prev,
      deliveryAddressId: selected.id,
      addressLabel: selected.addressLabel || 'Home',
      deliveryArea: selected.area || '',
      deliverySubArea: (selected as any).subArea || '',
      streetAddress: selected.streetAddress,
      googleMapsLink: selected.googleMapsLink || '',
    }))
  }

  // Narrow save path used when the order is locked (post-delivery): only
  // the csAttachments array is sent. All other order fields stay frozen on
  // the server. CS uses this to upload proof-of-payment / receipt photos
  // that arrive after the branch has marked the order as delivered.
  const saveAttachmentsOnly = async () => {
    if (!orderId) return
    setIsSaving(true)
    try {
      const response = await fetch(`/api/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attachmentsOnly: true,
          csAttachments: form.csAttachments || [],
          createdBy: user?.name || user?.id || 'unknown',
          role: user?.role || '',
        }),
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        toast.error(err?.error || 'حدث خطأ أثناء حفظ المرفقات')
        return
      }
      const data = await response.json()
      setDirtyFlag(false)
      if (data?.warning) {
        toast.error(data.warning, { duration: 8000 })
      } else {
        toast.success('✅ تم حفظ المرفقات')
      }
      router.refresh()
    } catch {
      toast.error('حدث خطأ أثناء الحفظ')
    } finally {
      setIsSaving(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (isLocked) {
      // Locked orders allow ONLY csAttachments updates — route to the
      // narrow attachments-only save path so CS can still upload receipts
      // / proof-of-payment after the branch has marked the order delivered.
      return saveAttachmentsOnly()
    }

    const resolvedDeliveryArea = form.deliveryArea.trim() || String(deliveryZones[0]?.area || '').trim()

    if (!form.phone.trim()) return toast.error('رقم الهاتف مطلوب')
    if (!form.customerName.trim()) return toast.error('اسم العميل مطلوب')
    if (!resolvedDeliveryArea) return toast.error('اختر المنطقة')
    if (!form.streetAddress.trim()) return toast.error('عنوان التوصيل مطلوب')

    const normalizedItems = items
      .map((i) => {
        const productByName = findProductByName(products, i.productNameInput)

        return {
          ...i,
          productId: i.productId || productByName?.id || '',
          weightGrams: Number(i.weightGrams) || Number(productByName?.weightGrams) || 0,
          unitPrice: Number(i.unitPrice) || Number(productByName?.offerPrice ?? productByName?.basePrice ?? 0),
        }
      })
      .filter((i) => i.productId && i.quantity > 0 && i.productNameInput.trim())

    const validItems = normalizedItems
    if (validItems.length === 0) return toast.error('أضف منتجاً واحداً على الأقل')

    // Stock checks: surface as non-blocking warnings so CS can still place the
    // order (e.g. customer wants to wait for restock, or branch has stock not
    // yet reflected in the system). Admin/branch can review via the order
    // notes which products were out / over-quantity at the time of creation.
    const outOfStockNames = validItems
      .map((i) => {
        const p = products.find((pp) => pp.id === i.productId)
        if (!p) return null
        const s = String((p.stockStatus as any) || '').toLowerCase().trim()
        const qty = (p as any).stockQuantity
        const isOut = s === 'out' || s === 'out_of_stock' || s === 'unavailable' || s === 'غير متاح' || (qty != null && Number(qty) === 0)
        return isOut ? p.productName : null
      })
      .filter(Boolean) as string[]
    if (outOfStockNames.length > 0) {
      toast(`⚠️ تم إنشاء الطلب رغم أن المنتج غير متاح: ${outOfStockNames.join('، ')}`, {
        icon: '⛔',
        duration: 6000,
        style: { background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' },
      })
    }

    // Same treatment for low-stock breaches — warn, don't block.
    const lowStockBreaches = validItems
      .map((i) => {
        const p = products.find((pp) => pp.id === i.productId)
        if (!p) return null
        const s = String((p.stockStatus as any) || '').toLowerCase().trim()
        const qty = (p as any).stockQuantity
        const isLow = s === 'low' || s === 'low_stock' || s === 'منخفض' || s === 'مخزون منخفض' || (qty != null && Number(qty) > 0 && Number(qty) <= 3)
        if (!isLow) return null
        if (qty != null && Number(i.quantity) > Number(qty)) {
          return `${p.productName} (متبقي ${qty})`
        }
        return null
      })
      .filter(Boolean) as string[]
    if (lowStockBreaches.length > 0) {
      toast(`⚠️ الكمية تتجاوز المتاح في المخزون: ${lowStockBreaches.join('، ')}`, {
        icon: '📉',
        duration: 6000,
        style: { background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' },
      })
    }

    if (form.orderStatus === 'لاغي' && !form.cancellationReason) {
      return toast.error('اختر سبب الإلغاء')
    }

    if (form.orderStatus === 'حجز' && !form.scheduledDate) {
      return toast.error('اختر تاريخ الحجز')
    }

    setIsSaving(true)

    try {
      const payload = {
        ...form,
        isScheduled: form.orderStatus === 'حجز',
        deliveryArea: resolvedDeliveryArea,
        deliverySubArea: form.deliverySubArea || '',
        items: validItems,
        discountCode: appliedDiscount?.code || null,
        walletUsed,
        createdBy: user?.name || user?.id || 'unknown',
        role: user?.role || '',
      }

      const url = mode === 'create' ? '/api/orders' : `/api/orders/${orderId}`
      const method = mode === 'create' ? 'POST' : 'PUT'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (response.status === 423) {
        const err = await response.json().catch(() => ({}))
        toast.error(err?.error || '🔒 الطلب مقفل ولا يمكن التعديل')
        return
      }

      if (!response.ok) throw new Error('Save failed')

      const data = await response.json()
      setDirtyFlag(false)
      // The API may have silently dropped csAttachments if the DB column is
      // missing — surface that loudly so the operator knows to run the
      // migration instead of thinking the photos persisted.
      if (data?.warning) {
        toast.error(data.warning, { duration: 8000 })
      } else {
        toast.success(mode === 'create' ? '✅ تم إنشاء الطلب بنجاح' : '✅ تم تحديث الطلب بنجاح')
      }
      router.push(`/orders/${data.order.id}`)
    } catch {
      toast.error('حدث خطأ أثناء الحفظ')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return <div className="p-8 text-center text-gray-500">⏳ جاري تحميل النموذج...</div>
  }

  const isLocked =
    mode === 'edit' &&
    !!deliveryData &&
    (deliveryData.deliveryStatus === 'في الطريق' || deliveryData.deliveryStatus === 'تم التوصيل') &&
    user?.role !== 'admin'

  return (
    <>
    <form onSubmit={handleSubmit} className="space-y-4">
      {isLocked && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 text-amber-900">
          <p className="font-bold">🔒 هذا الطلب مقفل للتعديل</p>
          <p className="text-sm mt-1">لأن الفرع بدأ التوصيل (الحالة: <span className="font-semibold">{deliveryData?.deliveryStatus}</span>). يمكن للأدمن فقط إجراء تعديلات على بقية الحقول.</p>
          <p className="text-sm mt-1">📎 <span className="font-semibold">يمكنك إضافة أو تعديل المرفقات (الصور والإيصالات) فقط</span> — ثم اضغط "حفظ المرفقات".</p>
        </div>
      )}
      <details open className="bg-white rounded-lg border border-gray-200 p-4">
        <summary className="font-bold text-gray-900 cursor-pointer">1) بيانات الطلب</summary>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          <FieldSelect label="نوع الطلب" value={form.orderType} onChange={(v) => updateForm('orderType', v)} options={orderTypes.includes(form.orderType) ? orderTypes : [form.orderType, ...orderTypes]} />
          <FieldInput label="تاريخ الطلب" type="date" value={form.orderDate} onChange={(v) => updateForm('orderDate', v)} />
          <FieldInput label="الساعة" type="time" value={form.orderTime} onChange={(v) => updateForm('orderTime', v)} />
          <FieldSelect
            label="متلقي الطلب"
            value={form.orderReceiver}
            onChange={(v) => updateForm('orderReceiver', v)}
            options={orderReceivers.includes(form.orderReceiver) ? orderReceivers : [form.orderReceiver, ...orderReceivers]}
          />
          <FieldSelect
            label="طريقة الطلب"
            value={form.orderMethod}
            onChange={(v) => updateForm('orderMethod', v)}
            options={orderMethods.includes(form.orderMethod) ? orderMethods : [form.orderMethod, ...orderMethods]}
          />
        </div>
      </details>

      <details open className="bg-white rounded-lg border border-gray-200 p-4">
        <summary className="font-bold text-gray-900 cursor-pointer">2) بيانات العميل</summary>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 text-right">رقم الهاتف</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={form.phone}
                onChange={(e) => updateForm('phone', e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-left"
                dir="ltr"
              />
              <button
                type="button"
                onClick={handleLookupCustomer}
                disabled={isLookupLoading}
                className="px-3 py-2 rounded-lg bg-red-100 text-red-700 hover:bg-red-200"
              >
                {isLookupLoading ? '...' : 'بحث'}
              </button>
            </div>
          </div>

          {/* Customer status banner — always shown after a successful lookup so
              the agent never has to wonder whether the lookup ran. Active
              customers get a green confirmation; warning/suspended get the
              louder coloured warning. */}
          {customerStatus && loadedCustomerId !== null && (
            <div
              className={
                customerStatus.status === 'suspended'
                  ? 'md:col-span-2 border-2 border-red-400 bg-red-50 rounded-lg p-3'
                  : customerStatus.status === 'warning'
                  ? 'md:col-span-2 border-2 border-amber-400 bg-amber-50 rounded-lg p-3'
                  : 'md:col-span-2 border border-green-300 bg-green-50 rounded-lg p-3'
              }
              dir="rtl"
            >
              <div
                className={`font-bold ${
                  customerStatus.status === 'suspended'
                    ? 'text-red-800'
                    : customerStatus.status === 'warning'
                    ? 'text-amber-800'
                    : 'text-green-800'
                }`}
              >
                {customerStatus.status === 'suspended'
                  ? '🛑 عميل موقوف — انتبه قبل إنشاء الطلب'
                  : customerStatus.status === 'warning'
                  ? '⚠️ عميل مُحذَّر — انتبه قبل إنشاء الطلب'
                  : '✅ عميل نشط'}
              </div>
              {customerStatus.reason && customerStatus.status !== 'active' && (
                <div
                  className={`text-sm mt-1 ${
                    customerStatus.status === 'suspended' ? 'text-red-700' : 'text-amber-700'
                  }`}
                >
                  السبب: {customerStatus.reason}
                </div>
              )}
            </div>
          )}

          {/* Wallet credit badge — surfaced after a successful customer lookup
              so the agent immediately sees how much credit is available and
              can offer to apply it as a discount on the current order. */}
          {loadedCustomerId !== null && customerWalletBalance !== null && (
            <div
              className={
                walletAvailable > 0
                  ? 'md:col-span-2 border-2 border-emerald-300 bg-emerald-50 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2'
                  : 'md:col-span-2 border border-gray-200 bg-gray-50 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2'
              }
              dir="rtl"
            >
              <div className={walletAvailable > 0 ? 'text-emerald-900' : 'text-gray-700'}>
                <span className="font-bold">💳 رصيد المحفظة:</span>{' '}
                <span className="font-semibold">{walletAvailable.toLocaleString()} ج.م</span>
                {previousWalletUsed > 0 && (
                  <span className="text-xs text-gray-600 mr-2">
                    (يشمل {previousWalletUsed.toLocaleString()} ج.م مستخدم في هذا الطلب)
                  </span>
                )}
              </div>
              {walletAvailable > 0 && walletUsed === 0 && afterVoucher > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const apply = Math.min(walletAvailable, afterVoucher)
                    setDirtyFlag(true)
                    setWalletUsedInput(String(apply))
                  }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold"
                >
                  تطبيق على الطلب
                </button>
              )}
            </div>
          )}

          <FieldInput label="اسم العميل" value={form.customerName} onChange={(v) => updateForm('customerName', v)} />
          <FieldSelect label="نوع العميل" value={form.customerType} onChange={(v) => updateForm('customerType', v as OrderFormModel['customerType'])} options={CUSTOMER_TYPES} />
          {/* مصدر العميل only matters when acquiring a new customer; for an
              existing (looked-up) customer the original acquisition source is
              already stored on their profile and shouldn't be overwritten. */}
          {form.customerType !== 'قديم' && (
            <FieldSelect
              label="مصدر العميل"
              value={form.customerSource}
              onChange={(v) => updateForm('customerSource', v)}
              options={
                customerSources.includes(form.customerSource) ? customerSources : [form.customerSource, ...customerSources]
              }
            />
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 text-right">عنوان التوصيل</label>
            <select
              value={form.deliveryAddressId}
              onChange={(e) => handleAddressSelection(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-right"
              dir="rtl"
            >
              {addresses.map((a) => (
                <option key={a.id} value={a.id}>{`${a.addressLabel} - ${a.streetAddress}`}</option>
              ))}
              <option value="__new">إضافة عنوان جديد</option>
            </select>
          </div>

          <FieldInput label="تسمية العنوان" value={form.addressLabel} onChange={(v) => updateForm('addressLabel', v)} />
          <FieldSelect
            label="المنطقة"
            value={form.deliveryArea}
            onChange={(v) => {
              // Switching area clears the sub-area so an incompatible value
              // can't linger and cause the wrong fee to be charged.
              updateForm('deliveryArea', v)
              updateForm('deliverySubArea', '')
            }}
            options={Array.from(new Set(deliveryZones.map((z) => z.area).filter(Boolean)))}
          />
          {subAreaOptions.length > 0 ? (
            <FieldSelect
              label="المنطقة الفرعية"
              value={form.deliverySubArea}
              onChange={(v) => updateForm('deliverySubArea', v)}
              options={['', ...subAreaOptions]}
            />
          ) : (
            <FieldInput
              label="المنطقة الفرعية (اختياري)"
              value={form.deliverySubArea}
              onChange={(v) => updateForm('deliverySubArea', v)}
            />
          )}
          <FieldInput label="العنوان" value={form.streetAddress} onChange={(v) => updateForm('streetAddress', v)} />
          <FieldInput label="رابط Google Maps" value={form.googleMapsLink} onChange={(v) => updateForm('googleMapsLink', v)} dir="ltr" />
        </div>

        {selectedZone && (
          <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
            <div>رسوم التوصيل للمنطقة: {baseCustomerDeliveryFee.toLocaleString()} ج.م</div>
            <div>توصيل مجاني عند قيمة طلب: {freeDeliveryValue.toLocaleString()} ج.م</div>
          </div>
        )}
      </details>

      <details open className="bg-white rounded-lg border border-gray-200 p-4">
        <summary className="font-bold text-gray-900 cursor-pointer">3) تفاصيل الطلب</summary>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[980px]">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-2 text-right text-sm">المنتج</th>
                <th className="p-2 text-right text-sm">السعر</th>
                <th className="p-2 text-right text-sm">سعر البرومو</th>
                <th className="p-2 text-right text-sm">الكمية</th>
                <th className="p-2 text-right text-sm">الوزن (كج / جم)</th>
                <th className="p-2 text-right text-sm">سعر الوحدة</th>
                <th className="p-2 text-right text-sm">الإجمالي</th>
                <th className="p-2 text-right text-sm">تعليمات خاصة</th>
                <th className="p-2 text-center text-sm">حذف</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => {
                const selectedProduct = findProductByName(products, item.productNameInput)
                const lineTotal = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)
                const isWeightMode = selectedProduct?.pricingMode === 'weight'
                const pricePerKg = isWeightMode ? Number(selectedProduct?.offerPrice ?? selectedProduct?.basePrice ?? 0) : 0
                const stockRaw = String((selectedProduct?.stockStatus as any) || 'available').toLowerCase().trim()
                const stockQty = selectedProduct?.stockQuantity
                const isOut =
                  stockRaw === 'out' ||
                  stockRaw === 'out_of_stock' ||
                  stockRaw === 'unavailable' ||
                  stockRaw === 'غير متاح' ||
                  (stockQty != null && Number(stockQty) === 0)
                const isLow =
                  !isOut &&
                  (stockRaw === 'low' ||
                    stockRaw === 'low_stock' ||
                    stockRaw === 'منخفض' ||
                    stockRaw === 'مخزون منخفض' ||
                    (stockQty != null && Number(stockQty) > 0 && Number(stockQty) <= 3))
                const rowCls = isOut
                  ? 'border-b-2 border-red-300 bg-red-50'
                  : isLow
                  ? 'border-b-2 border-amber-300 bg-amber-50'
                  : 'border-b border-gray-200'
                return (
                  <tr key={index} className={rowCls}>
                    <td className="p-2 align-top">
                      <div className="flex items-center gap-1">
                        <input
                          list={`products-${index}`}
                          value={item.productNameInput}
                          onChange={(e) => onProductNameChange(index, e.target.value)}
                          className={`flex-1 px-2 py-1 border rounded ${selectedProduct?.isTargeted ? 'border-amber-400 bg-amber-50' : ''}`}
                          placeholder="ابحث عن منتج"
                          dir="rtl"
                        />
                        {selectedProduct?.isTargeted && (
                          <span
                            className="shrink-0 px-1.5 py-0.5 rounded bg-amber-500 text-white text-[10px] font-bold"
                            title="منتج مستهدف هذا الشهر"
                          >
                            🎯
                          </span>
                        )}
                        {isWeightMode && (
                          <span
                            className="shrink-0 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold border border-amber-300"
                            title="هذا المنتج يُسعّر بالوزن (السعر للكيلو)"
                          >
                            بالكيلو
                          </span>
                        )}
                      </div>
                      {selectedProduct && (isOut || isLow) && (
                        <div
                          className={`mt-1.5 px-2 py-1 rounded-md text-[11px] font-bold border-2 text-center ${
                            isOut
                              ? 'bg-red-600 text-white border-red-700'
                              : 'bg-amber-500 text-white border-amber-600'
                          }`}
                          title={isOut ? 'غير متاح' : 'مخزون منخفض'}
                        >
                          {isOut
                            ? '⛔ غير متاح'
                            : `⚠️ مخزون منخفض${selectedProduct.stockQuantity != null ? ` — متبقي ${selectedProduct.stockQuantity}` : ''}`}
                        </div>
                      )}
                      <datalist id={`products-${index}`}>
                        {products.map((p) => (
                          <option key={p.id} value={p.productName} />
                        ))}
                      </datalist>
                    </td>
                    <td className="p-2 text-sm text-gray-700 whitespace-nowrap">
                      {selectedProduct
                        ? `${Number(selectedProduct.basePrice || 0).toLocaleString()} ج.م${isWeightMode ? ' / كج' : ''}`
                        : '--'}
                    </td>
                    <td className="p-2 text-sm whitespace-nowrap">
                      {selectedProduct?.offerPrice != null && Number(selectedProduct.offerPrice) > 0 && Number(selectedProduct.offerPrice) < Number(selectedProduct.basePrice || 0) ? (
                        <span className="inline-flex items-center gap-1">
                          <span className="text-red-600 font-bold">
                            {Number(selectedProduct.offerPrice).toLocaleString()} ج.م
                          </span>
                          <span className="text-xs text-red-600 font-semibold">
                            -{(((Number(selectedProduct.basePrice) - Number(selectedProduct.offerPrice)) / Number(selectedProduct.basePrice)) * 100).toFixed(0)}%
                          </span>
                        </span>
                      ) : (
                        <span className="text-gray-400">--</span>
                      )}
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(e) => updateItem(index, { quantity: Number(e.target.value) || 1 })}
                        className="w-20 px-2 py-1 border rounded text-left"
                        dir="ltr"
                      />
                      {item.originalQuantity != null && Number(item.originalQuantity) !== Number(item.quantity) && (
                        <div className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold rounded bg-blue-50 text-blue-700 border border-blue-200" title="تم تعديل الكمية من الفرع">
                          فرع: {item.originalQuantity} → {item.quantity}
                        </div>
                      )}
                    </td>
                    <td className="p-2">
                      {isWeightMode ? (
                        <div className="flex flex-col items-stretch gap-1">
                          <div className="flex items-center gap-1">
                            <WeightKgInput
                              grams={item.weightGrams}
                              pricePerKg={pricePerKg}
                              onChange={(next) => updateItem(index, next)}
                            />
                            <span className="text-[11px] text-gray-600">كج</span>
                          </div>
                          <span className="text-[10px] text-amber-700 font-semibold">تقديري، يُحدد بعد الوزن</span>
                          {item.originalWeightGrams != null && Number(item.originalWeightGrams) !== Number(item.weightGrams) && (
                            <span className="inline-flex w-fit items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold rounded bg-blue-50 text-blue-700 border border-blue-200" title="تم تحديث الوزن بعد الوزن الفعلي بالفرع">
                              فرع: {(Number(item.originalWeightGrams) / 1000).toFixed(2)} → {(Number(item.weightGrams) / 1000).toFixed(2)} كج
                            </span>
                          )}
                        </div>
                      ) : (
                        <div
                          className="w-24 px-2 py-1 text-sm text-gray-700 text-left bg-gray-50 border border-gray-200 rounded"
                          dir="ltr"
                          title="الوزن القياسي للمنتج"
                        >
                          {item.weightGrams ? `${item.weightGrams} جم` : '--'}
                        </div>
                      )}
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        value={item.unitPrice}
                        onChange={(e) => updateItem(index, { unitPrice: Number(e.target.value) || 0 })}
                        readOnly={isWeightMode}
                        title={isWeightMode ? 'يُحتسب تلقائياً: سعر الكيلو × الوزن المقدر' : undefined}
                        className={`w-24 px-2 py-1 border rounded text-left ${isWeightMode ? 'bg-gray-50 text-gray-700' : ''}`}
                        dir="ltr"
                      />
                    </td>
                    <td className="p-2 text-sm font-semibold text-gray-900">{lineTotal.toLocaleString()} ج.م</td>
                    <td className="p-2">
                      <input
                        type="text"
                        value={item.specialInstructions}
                        onChange={(e) => updateItem(index, { specialInstructions: e.target.value })}
                        className="w-full px-2 py-1 border rounded"
                        dir="rtl"
                      />
                    </td>
                    <td className="p-2 text-center">
                      <button type="button" onClick={() => removeItem(index)} className="px-2 py-1 rounded bg-red-100 text-red-700">✖</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-3">
          <button type="button" onClick={addItem} className="px-4 py-2 rounded-lg bg-red-100 text-red-700 hover:bg-red-200">
            + إضافة عنصر
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <SummaryCard label="الإجمالي الفرعي" value={`${subtotal.toLocaleString()} ج.م`} />
          <SummaryCard label="رسوم التوصيل" value={`${deliveryFee.toLocaleString()} ج.م`} />
          <SummaryCard
            label={
              walletUsed > 0
                ? 'الإجمالي بعد الخصم والرصيد'
                : discountAmount > 0
                  ? 'الإجمالي بعد الخصم'
                  : 'الإجمالي الكلي'
            }
            value={`${netTotal.toLocaleString()} ج.م`}
            highlight
          />
        </div>

        <div className="mt-3 rounded-lg border-2 border-amber-200 bg-amber-50 p-3">
          <div className="text-sm font-semibold text-amber-900 mb-2">🏷️ كود الخصم</div>
            {appliedDiscount ? (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="text-sm text-amber-900">
                  <span className="font-bold">{appliedDiscount.code}</span> —{' '}
                  {appliedDiscount.type === 'percent'
                    ? `خصم ${appliedDiscount.value}% (${appliedDiscount.amount.toLocaleString()} ج.م)`
                    : `خصم ${appliedDiscount.amount.toLocaleString()} ج.م`}
                </div>
                <button
                  type="button"
                  onClick={handleClearDiscount}
                  className="w-full sm:w-auto px-3 py-2 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 text-sm font-semibold min-h-[40px]"
                >
                  ✖ إزالة
                </button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={discountCodeInput}
                  onChange={(e) => setDiscountCodeInput(e.target.value.toUpperCase())}
                  placeholder="أدخل كود الخصم"
                  className="flex-1 px-3 py-2 border border-amber-300 rounded-lg text-left bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={handleApplyDiscount}
                  disabled={isCheckingDiscount}
                  className="w-full sm:w-auto px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold min-h-[40px]"
                >
                  {isCheckingDiscount ? '...' : 'تطبيق'}
                </button>
              </div>
            )}
          </div>

        {selectedZone && freeDeliveryValue > 0 && (
          <p className="mt-2 text-xs text-gray-600 text-right">
            {subtotal >= freeDeliveryValue
              ? '✅ تم تطبيق التوصيل المجاني لأن الطلب وصل الحد الأدنى.'
              : `التوصيل مجاني عند ${freeDeliveryValue.toLocaleString()} ج.م`}
          </p>
        )}

        {/* Wallet credit applier — only shown if the looked-up customer has
            a wallet balance to spend. Wallet is applied on top of any
            voucher and capped to the remaining-owed amount. */}
        {loadedCustomerId !== null && customerWalletBalance !== null && walletAvailable > 0 && (
          <div className="mt-3 rounded-lg border-2 border-emerald-200 bg-emerald-50 p-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
              <div className="text-sm font-semibold text-emerald-900">
                💳 خصم من رصيد المحفظة
              </div>
              <div className="text-xs text-emerald-800">
                المتاح: <span className="font-bold">{walletAvailable.toLocaleString()} ج.م</span>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="number"
                min={0}
                max={Math.min(walletAvailable, afterVoucher)}
                step="1"
                value={walletUsedInput}
                onChange={(e) => {
                  setDirtyFlag(true)
                  setWalletUsedInput(e.target.value)
                }}
                placeholder="المبلغ المستخدم من الرصيد"
                className="flex-1 px-3 py-2 border border-emerald-300 rounded-lg text-left bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
                dir="ltr"
              />
              <button
                type="button"
                onClick={() => {
                  const apply = Math.min(walletAvailable, afterVoucher)
                  setDirtyFlag(true)
                  setWalletUsedInput(String(apply))
                }}
                className="w-full sm:w-auto px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold min-h-[40px]"
              >
                تطبيق الحد الأقصى
              </button>
              {walletUsedInput && (
                <button
                  type="button"
                  onClick={() => {
                    setDirtyFlag(true)
                    setWalletUsedInput('')
                  }}
                  className="w-full sm:w-auto px-3 py-2 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 text-sm font-semibold min-h-[40px]"
                >
                  ✖ إزالة
                </button>
              )}
            </div>
            {walletUsed > 0 && (
              <div className="mt-2 text-xs text-emerald-800">
                ✅ سيتم خصم <span className="font-bold">{walletUsed.toLocaleString()} ج.م</span> من رصيد العميل،
                الرصيد بعد الحفظ: <span className="font-bold">{walletBalanceAfter.toLocaleString()} ج.م</span>
              </div>
            )}
            {walletUsedRaw > walletUsed && (
              <div className="mt-2 text-xs text-red-700">
                ⚠️ تم تقليص المبلغ إلى {walletUsed.toLocaleString()} ج.م
                ({walletUsedRaw > walletAvailable ? 'تجاوز الرصيد المتاح' : 'تجاوز المبلغ المطلوب'})
              </div>
            )}
          </div>
        )}
      </details>

      <details open className="bg-white rounded-lg border border-gray-200 p-4">
        <summary className="font-bold text-gray-900 cursor-pointer">4) الدفع والحالة</summary>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          <FieldSelect label="طريقة الدفع" value={form.paymentMethod} onChange={(v) => updateForm('paymentMethod', v)} options={paymentMethods.includes(form.paymentMethod) ? paymentMethods : [form.paymentMethod, ...paymentMethods]} />
          <FieldSelect label="حالة الطلب" value={form.orderStatus} onChange={(v) => updateForm('orderStatus', v)} options={orderStatuses.includes(form.orderStatus) ? orderStatuses : [form.orderStatus, ...orderStatuses]} />

          {form.orderStatus === 'لاغي' && (
            <FieldSelect
              label="سبب الإلغاء"
              value={form.cancellationReason}
              onChange={(v) => updateForm('cancellationReason', v as OrderFormModel['cancellationReason'])}
              options={CANCELLATION_REASONS}
            />
          )}

          {form.orderStatus === 'حجز' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 text-right">تاريخ الحجز</label>
                <input
                  type="date"
                  value={form.scheduledDate}
                  onChange={(e) => updateForm('scheduledDate', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
                  dir="ltr"
                />
              </div>
              <FieldSelect
                label="فترة التوصيل"
                value={form.scheduledTimeSlot}
                onChange={(v) => updateForm('scheduledTimeSlot', v as OrderFormModel['scheduledTimeSlot'])}
                options={['', 'صباحي', 'مسائي', 'ساعة محددة']}
              />
              {form.scheduledTimeSlot === 'ساعة محددة' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 text-right">الساعة المحددة</label>
                  <input
                    type="time"
                    value={form.scheduledSpecificTime}
                    onChange={(e) => updateForm('scheduledSpecificTime', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
                    dir="ltr"
                  />
                </div>
              )}
            </>
          )}

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1 text-right">ملاحظات</label>
            <textarea
              value={form.notes}
              onChange={(e) => updateForm('notes', e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-right"
              dir="rtl"
            />
          </div>

          <div className="md:col-span-2 flex items-center gap-2">
            <input type="checkbox" checked={form.followUp} onChange={(e) => updateForm('followUp', e.target.checked)} />
            <span className="text-sm text-gray-700">متابعة لاحقة</span>
          </div>

          {form.followUp && (
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1 text-right">ملاحظات المتابعة</label>
              <textarea
                value={form.followUpNotes}
                onChange={(e) => updateForm('followUpNotes', e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-right"
                dir="rtl"
              />
            </div>
          )}
        </div>
      </details>

      {/* CS-side attachments — proof of payment screenshots, ID copies,
          bank-transfer receipts, etc. Mirrors the branch's productPhotos
          pattern (data URLs) but exposes a caption per attachment so the
          admin/branch can tell at a glance what each image represents. */}
      <details
        open={(form.csAttachments && form.csAttachments.length > 0) || false}
        className="bg-white rounded-lg border border-emerald-200 p-4"
      >
        <summary className="font-bold text-emerald-900 cursor-pointer">
          � مرفقات خدمة العملاء {form.csAttachments?.length ? `(${form.csAttachments.length})` : ''}
        </summary>
        <div className="mt-3 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 text-right">
              إضافة مرفقات (إيصال تحويل، صورة بطاقة، أي مستند ذي صلة)
            </label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => {
                handleAddCsAttachments(e.target.files)
                e.target.value = ''
              }}
              className="w-full text-sm"
            />
            <p className="text-xs text-gray-500 mt-1 text-right">
              حد أقصى 5MB لكل ملف — يمكن رفع أكثر من صورة في المرة الواحدة
            </p>
          </div>

          {form.csAttachments && form.csAttachments.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {form.csAttachments.map((att) => (
                <div
                  key={att.id}
                  className="relative border border-gray-200 rounded-lg p-2 bg-gray-50 space-y-2"
                >
                  <a href={att.url} target="_blank" rel="noreferrer" className="block">
                    <img
                      src={att.url}
                      alt={att.caption || 'مرفق'}
                      className="w-full h-28 object-cover rounded border border-gray-300"
                    />
                  </a>
                  <input
                    type="text"
                    value={att.caption}
                    onChange={(e) => handleUpdateCsAttachmentCaption(att.id, e.target.value)}
                    placeholder="وصف قصير (مثال: إيصال تحويل)"
                    className="w-full px-2 py-1 text-xs border border-gray-300 rounded text-right"
                    dir="rtl"
                  />
                  <div className="flex items-center justify-between text-[10px] text-gray-500">
                    <span>👤 {att.uploadedBy || '—'}</span>
                    <a
                      href={att.url}
                      download={att.caption ? `${att.caption}.png` : `attachment-${att.id}.png`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-700 underline"
                    >
                      📥 تحميل
                    </a>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveCsAttachment(att.id)}
                    className="absolute top-1 left-1 bg-red-600 hover:bg-red-700 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shadow"
                    title="حذف"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </details>

      {deliveryData && mode === 'edit' && (
        <details open className="bg-white rounded-lg border border-blue-200 p-4">
          <summary className="font-bold text-blue-900 cursor-pointer">📍 ملاحظات الفرع والصور</summary>
          <div className="mt-4 space-y-4">
            {deliveryData.deliveryStatus && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 text-right">حالة التوصيل</label>
                <div className="px-3 py-2 bg-gray-100 rounded-lg text-gray-700 text-right">
                  {deliveryData.deliveryStatus}
                </div>
              </div>
            )}

            {deliveryData.branchComments && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 text-right">ملاحظات الفرع</label>
                <div className="px-3 py-2 bg-gray-100 rounded-lg text-gray-700 text-right whitespace-pre-wrap">
                  {deliveryData.branchComments}
                </div>
              </div>
            )}

            {deliveryData.productPhotos && deliveryData.productPhotos.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 text-right">صور المنتجات</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {deliveryData.productPhotos.map((photo, idx) => (
                    <div key={idx} className="space-y-1">
                      <img src={photo} alt={`product-${idx}`} className="w-full h-24 object-cover rounded border border-gray-300" />
                      <a
                        href={photo}
                        download={`product-photo-${idx + 1}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block w-full text-center px-2 py-1 text-xs bg-blue-100 text-blue-700 hover:bg-blue-200 rounded"
                      >
                        📥 تحميل
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {deliveryData.invoicePhoto && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 text-right">صورة الفاتورة</label>
                <div className="space-y-2">
                  <img src={deliveryData.invoicePhoto} alt="invoice" className="w-full max-w-md h-32 object-cover rounded border border-gray-300" />
                  <a
                    href={deliveryData.invoicePhoto}
                    download="invoice-photo"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block px-3 py-1 text-sm bg-blue-100 text-blue-700 hover:bg-blue-200 rounded"
                  >
                    📥 تحميل صورة الفاتورة
                  </a>
                </div>
              </div>
            )}

            {deliveryData.deliveredAt && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 text-right">وقت التسليم</label>
                <div className="px-3 py-2 bg-gray-100 rounded-lg text-gray-700 text-right" dir="ltr">
                  {formatCairoFriendly(deliveryData.deliveredAt)}
                </div>
              </div>
            )}
          </div>
        </details>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isSaving}
          title={isLocked ? 'الطلب مقفل — سيتم حفظ المرفقات فقط' : undefined}
          className={`px-5 py-2 rounded-lg disabled:cursor-not-allowed text-white font-semibold ${
            isLocked
              ? 'bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300'
              : 'bg-red-600 hover:bg-red-700 disabled:bg-red-300'
          }`}
        >
          {isSaving
            ? '... جاري الحفظ'
            : isLocked
              ? '📎 حفظ المرفقات'
              : mode === 'create'
                ? 'حفظ الطلب'
                : 'تحديث الطلب'}
        </button>
        <button type="button" onClick={() => router.push('/orders')} className="px-5 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold">
          رجوع
        </button>
        {mode === 'edit' && orderId && (user?.role === 'admin' || user?.role === 'cs') && (
          <button
            type="button"
            disabled={isSaving}
            onClick={async () => {
              if (!confirm('هل أنت متأكد من حذف هذا الطلب؟ لا يمكن التراجع.')) return
              try {
                const params = new URLSearchParams({
                  role: user?.role || '',
                  by: user?.name || user?.id || 'unknown',
                })
                const res = await fetch(`/api/orders/${orderId}?${params.toString()}`, {
                  method: 'DELETE',
                })
                if (!res.ok) {
                  const data = await res.json().catch(() => ({}))
                  toast.error(data?.error || 'فشل حذف الطلب')
                  return
                }
                toast.success('🗑️ تم حذف الطلب')
                router.push('/orders')
              } catch (err) {
                console.error('[OrderForm] delete failed', err)
                toast.error('فشل حذف الطلب')
              }
            }}
            className="ml-auto px-5 py-2 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 font-semibold disabled:opacity-50"
          >
            🗑️ حذف الطلب
          </button>
        )}
      </div>
    </form>

    {mode === 'edit' && loadedOrderInfo && (
      <div className="mt-4">
        <WhatsAppShare
          appOrderNo={loadedOrderInfo.appOrderNo}
          orderDate={form.orderDate}
          orderTime={form.orderTime}
          customerName={form.customerName}
          customerPhone={form.phone}
          deliveryArea={form.deliveryArea}
          streetAddress={form.streetAddress}
          googleMapsLink={form.googleMapsLink}
          orderStatus={form.orderStatus}
          paymentMethod={form.paymentMethod}
          orderTotal={orderTotal}
          discountCode={appliedDiscount?.code || null}
          discountAmount={discountAmount}
          netTotal={netTotal}
          notes={form.notes}
          items={items
            .filter((i) => i.productNameInput && Number(i.quantity) > 0)
            .map((i) => {
              const prod = findProductByName(products, i.productNameInput)
              const isWeight = prod?.pricingMode === 'weight'
              return {
                productName: i.productNameInput,
                quantity: Number(i.quantity) || 0,
                unitPrice: Number(i.unitPrice) || 0,
                pricingMode: (isWeight ? 'weight' : 'unit') as 'unit' | 'weight',
                weightGrams: Number(i.weightGrams) || 0,
                // If the branch has logged the original (pre-amend) value,
                // the current weight is the final weighed weight.
                weightConfirmed: i.originalWeightGrams != null,
              }
            })}
          delivery={deliveryData}
        />
      </div>
    )}
    </>
  )
}

function FieldInput({
  label,
  value,
  onChange,
  type = 'text',
  dir = 'rtl',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  dir?: 'rtl' | 'ltr'
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1 text-right">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
        dir={dir}
      />
    </div>
  )
}

function FieldSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: string[]
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1 text-right">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-right"
        dir="rtl"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  )
}

function SummaryCard({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? 'bg-red-50 border-red-300' : 'bg-gray-50 border-gray-200'}`}>
      <p className="text-xs text-gray-600">{label}</p>
      <p className={`text-lg font-bold ${highlight ? 'text-red-700' : 'text-gray-900'}`}>{value}</p>
    </div>
  )
}
