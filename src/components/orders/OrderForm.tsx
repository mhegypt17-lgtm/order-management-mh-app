'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/lib/auth'
import { DeliveryProgressBar } from '@/components/orders/DeliveryProgressBar'
import { WhatsAppShare } from '@/components/orders/WhatsAppShare'
import ProductCombobox from '@/components/orders/ProductCombobox'

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
  stockStatus?: 'available' | 'low' | 'out'
  stockQuantity?: number | null
}

type CustomerAddress = {
  id: string
  addressLabel: string
  area?: string
  streetAddress: string
  googleMapsLink: string
}

type DeliveryZone = {
  zone: number
  area: string
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
}

const normalizeProductName = (value: string) =>
  String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

const findProductByName = (products: Product[], productNameInput: string) => {
  const normalizedInput = normalizeProductName(productNameInput)
  if (!normalizedInput) return null

  const exact = products.find((p) => normalizeProductName(p.productName) === normalizedInput)
  if (exact) return exact

  return (
    products.find((p) => {
      const normalizedProductName = normalizeProductName(p.productName)
      return normalizedProductName.includes(normalizedInput) || normalizedInput.includes(normalizedProductName)
    }) || null
  )
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
  streetAddress: string
  googleMapsLink: string
  paymentMethod: string
  orderStatus: string
  cancellationReason: 'نفاد المنتج' | 'عدم توفر' | 'تأخير التوصيل' | 'سعر مرتفع' | 'موعد غير مناسب' | 'Other' | ''
  notes: string
  followUp: boolean
  followUpNotes: string
  isScheduled: boolean
  scheduledDate: string
  scheduledTimeSlot: 'صباحي' | 'ظهري' | 'مسائي' | 'ساعة محددة' | ''
  scheduledSpecificTime: string
  isPriority: boolean
  priorityReason: string
}

type DeliveryData = {
  deliveryStatus: 'قبول' | 'جاهز' | 'في الطريق' | 'تم التوصيل' | 'لم يخرج بعد'
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
const ORDER_STATUSES_FALLBACK = ['ساري', 'مؤجل', 'حجز', 'لاغي']
const CANCELLATION_REASONS: string[] = ['نفاد المنتج', 'عدم توفر', 'تأخير التوصيل', 'سعر مرتفع', 'موعد غير مناسب', 'Other']
const PAYMENT_METHODS_FALLBACK = ['Instapay', 'Cash', 'Visa', 'Credit']

function getDefaultOrderModel(): OrderFormModel {
  const now = new Date()
  const orderDate = now.toISOString().slice(0, 10)
  const orderTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

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
    streetAddress: '',
    googleMapsLink: '',
    paymentMethod: 'Cash',
    orderStatus: 'ساري',
    cancellationReason: '',
    notes: '',
    followUp: false,
    followUpNotes: '',
    isScheduled: false,
    scheduledDate: '',
    scheduledTimeSlot: '',
    scheduledSpecificTime: '',
    isPriority: false,
    priorityReason: '',
  }
}

const emptyItem = (): OrderItemForm => ({
  productId: '',
  productNameInput: '',
  quantity: 1,
  weightGrams: 0,
  unitPrice: 0,
  specialInstructions: '',
})

type Props = {
  mode: 'create' | 'edit'
  orderId?: string
  repeatFromOrderId?: string
}

export default function OrderForm({ mode, orderId, repeatFromOrderId }: Props) {
  const router = useRouter()
  const { user } = useAuthStore()

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isLookupLoading, setIsLookupLoading] = useState(false)
  const [customerWallet, setCustomerWallet] = useState<number | null>(null)
  const [useWallet, setUseWallet] = useState(false)
  const [walletAmountInput, setWalletAmountInput] = useState('')
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
  const [loadedOrderInfo, setLoadedOrderInfo] = useState<{ appOrderNo: string; orderTotal: number } | null>(null)

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
        const allProducts: Product[] = Array.isArray(productsData.products) ? productsData.products : []
        const activeProducts = allProducts.filter((p: Product) => p.isActive)
        setProducts(activeProducts)

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
          const orderRes = await fetch(`/api/orders/${orderId}`)
          if (!orderRes.ok) throw new Error('Failed to load order')
          const orderData = await orderRes.json()
          const order = orderData.order

          setForm({
            orderDate: order.orderDate,
            orderTime: order.orderTime,
            orderType: order.orderType,
            orderReceiver: order.orderReceiver,
            orderMethod: order.orderMethod,
            phone: order.customer?.phone || '',
            customerName: order.customer?.customerName || '',
            customerType: order.customerType,
            customerSource: order.customerSource,
            deliveryAddressId: order.address?.id || '__new',
            addressLabel: order.address?.addressLabel || 'Home',
            deliveryArea: order.address?.area || '',
            streetAddress: order.address?.streetAddress || '',
            googleMapsLink: order.address?.googleMapsLink || '',
            paymentMethod: order.paymentMethod,
            orderStatus: order.orderStatus,
            cancellationReason: order.cancellationReason || '',
            notes: order.notes || '',
            followUp: Boolean(order.followUp),
            followUpNotes: order.followUpNotes || '',
            isScheduled: Boolean(order.isScheduled),
            scheduledDate: order.scheduledDate || '',
            scheduledTimeSlot: order.scheduledTimeSlot || '',
            scheduledSpecificTime: order.scheduledSpecificTime || '',
            isPriority: Boolean(order.isPriority),
            priorityReason: order.priorityReason || '',
          })

          if (order.customer?.phone) {
            const lookupRes = await fetch(`/api/customers?phone=${encodeURIComponent(order.customer.phone)}`)
            const lookupData = await lookupRes.json()
            setAddresses(lookupData.addresses || [])
            if (lookupData.customer) setCustomerWallet(Number(lookupData.customer.wallet) || 0)
          } else {
            setAddresses([])
          }

          const mappedItems = (order.items || []).map((item: any) => ({
            productId: item.productId,
            productNameInput: item.productName || '',
            quantity: item.quantity,
            weightGrams: item.weightGrams,
            unitPrice: item.unitPrice,
            specialInstructions: item.specialInstructions || '',
          }))

          setItems(mappedItems.length > 0 ? mappedItems : [emptyItem()])

          // Load delivery data if available
          if (order.delivery) {
            setDeliveryData(order.delivery)
          }
          setLoadedOrderInfo({
            appOrderNo: order.appOrderNo || '',
            orderTotal: Number(order.orderTotal || 0),
          })
        }

        if (mode === 'create' && repeatFromOrderId) {
          const srcRes = await fetch(`/api/orders/${repeatFromOrderId}`)
          if (srcRes.ok) {
            const srcData = await srcRes.json()
            const src = srcData.order

            // Pre-fill form (keep today's date/time + default status from getDefaultOrderModel)
            setForm((prev) => ({
              ...prev,
              orderType: src.orderType || prev.orderType,
              orderMethod: src.orderMethod || prev.orderMethod,
              phone: src.customer?.phone || '',
              customerName: src.customer?.customerName || '',
              customerType: 'عائد',
              customerSource: src.customerSource || prev.customerSource,
              deliveryAddressId: src.address?.id || '__new',
              addressLabel: src.address?.addressLabel || 'Home',
              deliveryArea: src.address?.area || prev.deliveryArea,
              streetAddress: src.address?.streetAddress || '',
              googleMapsLink: src.address?.googleMapsLink || '',
              paymentMethod: src.paymentMethod || prev.paymentMethod,
              notes: '',
              followUp: false,
              followUpNotes: '',
              isScheduled: false,
              scheduledDate: '',
              scheduledTimeSlot: '',
              scheduledSpecificTime: '',
              isPriority: false,
              priorityReason: '',
            }))

            if (src.customer?.phone) {
              try {
                const lookupRes = await fetch(`/api/customers?phone=${encodeURIComponent(src.customer.phone)}`)
                const lookupData = await lookupRes.json()
                setAddresses(lookupData.addresses || [])
              } catch {
                setAddresses([])
              }
            }

            // Re-price items from current catalog; flag inactive/price changes
            let inactiveCount = 0
            let priceChangedCount = 0
            const mapped: OrderItemForm[] = (src.items || []).map((item: any) => {
              const product = allProducts.find((p) => p.id === item.productId)
              const oldPrice = Number(item.unitPrice) || 0
              let newPrice = oldPrice
              let label = item.productName || ''
              if (product) {
                newPrice = Number(product.offerPrice ?? product.basePrice) || oldPrice
                label = product.productName
                if (!product.isActive) {
                  inactiveCount += 1
                  label = `⚠️ ${label} (غير متاح حالياً)`
                }
                if (oldPrice && Math.abs(oldPrice - newPrice) > 0.001) {
                  priceChangedCount += 1
                }
              }
              return {
                productId: item.productId,
                productNameInput: label,
                quantity: Number(item.quantity) || 1,
                weightGrams: Number(item.weightGrams) || 0,
                unitPrice: newPrice,
                specialInstructions: item.specialInstructions || '',
              }
            })

            setItems(mapped.length > 0 ? mapped : [emptyItem()])

            toast.success('تم نسخ الطلب — راجع البيانات قبل الحفظ')
            if (inactiveCount > 0) {
              toast.error(`⚠️ ${inactiveCount} منتج غير متاح حالياً — راجع القائمة`, { duration: 6000 })
            }
            if (priceChangedCount > 0) {
              toast(`💰 تم تحديث أسعار ${priceChangedCount} منتج بحسب القائمة الحالية`, { duration: 6000 })
            }
          } else {
            toast.error('تعذر تحميل الطلب الأصلي للنسخ')
          }
        }
      } catch {
        toast.error('خطأ في تحميل بيانات النموذج')
      } finally {
        setIsLoading(false)
      }
    }

    loadBase()
  }, [mode, orderId, repeatFromOrderId])

  useEffect(() => {
    setDirtyFlag(false)
    return () => setDirtyFlag(false)
  }, [mode])

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0),
    [items]
  )
  const selectedZone = useMemo(
    () => deliveryZones.find((z) => String(z.area || '').trim() === String(form.deliveryArea || '').trim()) || null,
    [deliveryZones, form.deliveryArea]
  )
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

  // Discount code applied first to gross total
  const grossTotal = orderTotal
  const discountAmount = appliedDiscount ? Math.min(appliedDiscount.amount, grossTotal) : 0
  const afterDiscount = Math.max(0, grossTotal - discountAmount)

  // Wallet credit applied after discount
  const walletAvailable = Math.max(0, Number(customerWallet) || 0)
  const requestedWallet = useWallet
    ? walletAmountInput.trim() === ''
      ? walletAvailable
      : Math.max(0, Number(walletAmountInput) || 0)
    : 0
  const walletApplied = mode === 'create' ? Math.min(requestedWallet, walletAvailable, afterDiscount) : 0
  const netTotal = afterDiscount - walletApplied

  // CS lock: once branch marks the order as out for delivery or delivered,
  // customer service can no longer edit it. Admin can still override.
  const lockedDeliveryStatuses = ['في الطريق', 'تم التوصيل']
  const isLockedForCs =
    mode === 'edit' &&
    user?.role === 'cs' &&
    !!deliveryData?.deliveryStatus &&
    lockedDeliveryStatuses.includes(deliveryData.deliveryStatus)

  const handleApplyDiscount = async () => {
    const code = discountCodeInput.trim().toUpperCase()
    if (!code) {
      toast.error('أدخل كود الخصم')
      return
    }
    setIsCheckingDiscount(true)
    try {
      const gross = subtotal + deliveryFee
      const res = await fetch(`/api/discount-codes/validate?code=${encodeURIComponent(code)}&gross=${gross}`, { cache: 'no-store' })
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
        setCustomerWallet(null)
        setForm((prev) => ({
          ...prev,
          customerName: '',
          customerType: 'جديد',
          deliveryAddressId: '__new',
          deliveryArea: '',
          streetAddress: '',
          googleMapsLink: '',
        }))
        toast('عميل جديد، يمكنك متابعة إدخال البيانات')
        return
      }

      setAddresses(data.addresses || [])
      setCustomerWallet(Number(data.customer.wallet) || 0)
      const firstAddress = data.addresses?.[0]

      setForm((prev) => ({
        ...prev,
        phone: data.customer.phone || prev.phone,
        customerName: data.customer.customerName || '',
        customerType: 'قديم',
        deliveryAddressId: firstAddress?.id || '__new',
        addressLabel: firstAddress?.addressLabel || 'Home',
        deliveryArea: firstAddress?.area || '',
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

  const onProductSelect = (index: number, selected: { id: string; productName: string; weightGrams?: number; basePrice?: number | null; offerPrice?: number | null }) => {
    setDirtyFlag(true)
    updateItem(index, {
      productNameInput: selected.productName,
      productId: selected.id,
      weightGrams: Number(selected.weightGrams) || 0,
      unitPrice: Number(selected.offerPrice ?? selected.basePrice ?? 0),
    })
  }

  const onProductClear = (index: number) => {
    setDirtyFlag(true)
    updateItem(index, { productNameInput: '', productId: '', unitPrice: 0, weightGrams: 0 })
  }

  const addItem = () => {
    setDirtyFlag(true)
    setItems((prev) => [...prev, emptyItem()])
  }
  const removeItem = (index: number) => {
    setDirtyFlag(true)
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== index)))
  }

  const handleAddressSelection = (addressId: string) => {
    setDirtyFlag(true)
    const selected = addresses.find((a) => a.id === addressId)
    if (!selected) {
      updateForm('deliveryAddressId', '__new')
      updateForm('deliveryArea', '')
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
      streetAddress: selected.streetAddress,
      googleMapsLink: selected.googleMapsLink || '',
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (isLockedForCs) {
      return toast.error('🔒 لا يمكن تعديل الطلب بعد خروجه للتوصيل')
    }

    const resolvedDeliveryArea = form.deliveryArea.trim() || String(deliveryZones[0]?.area || '').trim()

    if (!form.phone.trim()) return toast.error('رقم الهاتف مطلوب')
    if (!form.customerName.trim()) return toast.error('اسم العميل مطلوب')
    if (!resolvedDeliveryArea) return toast.error('اختر المنطقة')
    if (!form.streetAddress.trim()) return toast.error('عنوان التوصيل مطلوب')

    const normalizedItems = items
      .map((i) => {
        // Re-resolve from current catalog as a safety net (handles stale rows from duplicates)
        const productByName = findProductByName(products, i.productNameInput)
        const productById = i.productId ? products.find((p) => p.id === i.productId) : null
        const product = productById || productByName

        return {
          ...i,
          productId: product?.id || i.productId || '',
          weightGrams: Number(i.weightGrams) || Number(product?.weightGrams) || 0,
          unitPrice: Number(i.unitPrice) || Number(product?.offerPrice ?? product?.basePrice ?? 0),
        }
      })
      .filter((i) => i.productId && Number(i.quantity) > 0)

    const validItems = normalizedItems
    if (validItems.length === 0) {
      // Differentiate the cause so the user knows what to fix
      const hasTypedNames = items.some((i) => i.productNameInput.trim())
      if (hasTypedNames) {
        return toast.error('⚠️ لم يتم اختيار منتج من القائمة — اضغط على حقل المنتج واختر من القائمة المنسدلة')
      }
      return toast.error('أضف منتجاً واحداً على الأقل')
    }

    // Block if any selected product is out of stock
    const outProducts = validItems
      .map((i) => products.find((p) => p.id === i.productId))
      .filter((p): p is Product => !!p && p.stockStatus === 'out')
    if (outProducts.length > 0) {
      return toast.error(`⛔ المنتج "${outProducts[0].productName}" غير متاح حالياً. يرجى إزالته أو استبداله.`)
    }

    if (form.orderStatus === 'لاغي' && !form.cancellationReason) {
      return toast.error('اختر سبب الإلغاء')
    }

    if (form.isScheduled) {
      if (!form.scheduledDate) return toast.error('اختر تاريخ التوصيل المجدول')
      if (!form.scheduledTimeSlot) return toast.error('اختر فترة التوصيل')
      const today = new Date(); today.setHours(0, 0, 0, 0)
      const sched = new Date(form.scheduledDate); sched.setHours(0, 0, 0, 0)
      const diffDays = (sched.getTime() - today.getTime()) / 86400000
      if (diffDays < 1) return toast.error('تاريخ الحجز يجب أن يكون من الغد فأبعد')
      if (diffDays > 14) return toast.error('لا يمكن الحجز لأكثر من 14 يوم مقدماً')
      if (form.scheduledTimeSlot === 'ساعة محددة' && !form.scheduledSpecificTime) {
        return toast.error('اختر الساعة المحددة للتوصيل')
      }
    }

    setIsSaving(true)

    try {
      const payload = {
        ...form,
        deliveryArea: resolvedDeliveryArea,
        items: validItems,
        walletApplied,
        discountCode: appliedDiscount?.code || null,
        createdBy: user?.id || 'unknown',
        actorRole: user?.role || 'unknown',
      }

      const url = mode === 'create' ? '/api/orders' : `/api/orders/${orderId}`
      const method = mode === 'create' ? 'POST' : 'PUT'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        let serverMsg = ''
        try {
          const errBody = await response.json()
          serverMsg = errBody?.error || ''
        } catch {}
        throw new Error(serverMsg || `HTTP ${response.status}`)
      }

      const data = await response.json()
      setDirtyFlag(false)
      toast.success(mode === 'create' ? '✅ تم إنشاء الطلب بنجاح' : '✅ تم تحديث الطلب بنجاح')
      router.push(`/orders/${data.order.id}`)
    } catch (err: any) {
      const detail = err?.message ? ` (${err.message})` : ''
      toast.error(`حدث خطأ أثناء الحفظ${detail}`)
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return <div className="p-8 text-center text-gray-500">⏳ جاري تحميل النموذج...</div>
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {isLockedForCs && (
        <div className="rounded-lg border-2 border-amber-300 bg-amber-50 px-4 py-3 flex items-start gap-3" dir="rtl">
          <span className="text-2xl">🔒</span>
          <div className="text-sm text-amber-900">
            <p className="font-bold mb-1">الطلب مغلق للتعديل</p>
            <p>
              تم تحديث حالة التوصيل إلى <strong>{deliveryData?.deliveryStatus}</strong> بواسطة الفرع.
              لم يعد بالإمكان تعديل بيانات الطلب من قبل خدمة العملاء.
            </p>
          </div>
        </div>
      )}
      {form.isPriority && (
        <div className="rounded-lg border-2 border-red-500 bg-red-50 px-4 py-3 flex items-start gap-3 animate-pulse" dir="rtl">
          <span className="text-2xl">🚨</span>
          <div className="text-sm text-gray-900 flex-1">
            <p className="font-bold mb-1 text-red-800">طلب أولوية عاجلة (Priority)</p>
            {form.priorityReason && (
              <p className="text-red-900">السبب: <strong>{form.priorityReason}</strong></p>
            )}
            <p className="text-xs text-red-700 mt-1">على الفرع التعامل الفوري مع هذا الطلب.</p>
          </div>
        </div>
      )}
      {form.isScheduled && form.scheduledDate && (() => {
        const sched = new Date(form.scheduledDate)
        sched.setHours(0, 0, 0, 0)
        const today = new Date(); today.setHours(0, 0, 0, 0)
        const overdue = mode === 'edit' && sched.getTime() < today.getTime() && deliveryData?.deliveryStatus !== 'تم التوصيل'
        const slotLabel = form.scheduledTimeSlot === 'ساعة محددة'
          ? `الساعة ${form.scheduledSpecificTime || ''}`
          : `الفترة ${form.scheduledTimeSlot || ''}`
        return (
          <div className={`rounded-lg border-2 px-4 py-3 flex items-start gap-3 ${overdue ? 'border-red-400 bg-red-50' : 'border-indigo-300 bg-indigo-50'}`} dir="rtl">
            <span className="text-2xl">📅</span>
            <div className="text-sm text-gray-900 flex-1">
              <p className="font-bold mb-1">
                حجز
                {overdue && (
                  <span className="mr-2 inline-block px-2 py-0.5 rounded-full bg-red-600 text-white text-xs">🔴 متأخر</span>
                )}
              </p>
              <p>
                تاريخ التوصيل: <strong dir="ltr" className="inline-block">{form.scheduledDate}</strong>
                {' — '}
                <strong>{slotLabel}</strong>
              </p>
            </div>
          </div>
        )
      })()}
      <fieldset disabled={isLockedForCs} className={isLockedForCs ? 'opacity-60 pointer-events-none' : ''}>
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
          {/* Order status: CS & admin can edit; branch is read-only */}
          {user?.role === 'branch' ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 text-right">
                حالة الطلب
                <span className="text-xs text-gray-400 mr-1">(تحددها خدمة العملاء)</span>
              </label>
              <div className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-right">
                <span
                  className={`px-2 py-0.5 rounded-full text-sm font-semibold ${
                    form.orderStatus === 'ساري'
                      ? 'bg-yellow-100 text-yellow-800'
                      : form.orderStatus === 'مقبول'
                      ? 'bg-teal-100 text-teal-800'
                      : form.orderStatus === 'تم'
                      ? 'bg-green-100 text-green-800'
                      : form.orderStatus === 'لاغي'
                      ? 'bg-red-100 text-red-800'
                      : form.orderStatus === 'مؤجل'
                      ? 'bg-orange-100 text-orange-800'
                      : 'bg-blue-100 text-blue-800'
                  }`}
                >
                  {form.orderStatus || 'ساري'}
                </span>
              </div>
            </div>
          ) : (
            <FieldSelect label="حالة الطلب" value={form.orderStatus} onChange={(v) => updateForm('orderStatus', v)} options={orderStatuses.includes(form.orderStatus) ? orderStatuses : [form.orderStatus, ...orderStatuses]} />
          )}
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
            {customerWallet !== null && (
              <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-300 text-emerald-800 text-sm font-semibold">
                💳 رصيد المحفظة: {customerWallet.toLocaleString('ar-EG')} ج.م
              </div>
            )}
          </div>

          <FieldInput label="اسم العميل" value={form.customerName} onChange={(v) => updateForm('customerName', v)} />
          <FieldSelect label="نوع العميل" value={form.customerType} onChange={(v) => updateForm('customerType', v as OrderFormModel['customerType'])} options={CUSTOMER_TYPES} />
          <FieldSelect
            label="مصدر العميل"
            value={form.customerSource}
            onChange={(v) => updateForm('customerSource', v)}
            options={
              customerSources.includes(form.customerSource) ? customerSources : [form.customerSource, ...customerSources]
            }
          />

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
            onChange={(v) => updateForm('deliveryArea', v)}
            options={deliveryZones.map((z) => z.area)}
          />
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
        {/* Mobile cards */}
        <div className="mt-4 md:hidden space-y-3">
          {items.map((item, index) => {
            const selectedProduct = findProductByName(products, item.productNameInput)
            const lineTotal = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)
            const stock = selectedProduct?.stockStatus || (selectedProduct ? 'available' : null)
            return (
              <div key={`m-${index}`} className="border-2 border-gray-200 rounded-lg p-3 bg-gray-50 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-gray-500">عنصر #{index + 1}</span>
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="px-3 py-2 rounded bg-red-100 text-red-700 text-sm font-semibold min-h-[40px]"
                  >
                    🗑️ حذف
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1 text-right">المنتج</label>
                  <ProductCombobox
                    products={products}
                    value={item.productNameInput}
                    selectedProductId={item.productId}
                    onSelect={(p) => onProductSelect(index, p)}
                    onClear={() => onProductClear(index)}
                  />
                  {selectedProduct && (
                    <div className="mt-1 flex flex-wrap gap-1 text-[11px]">
                      {stock === 'out' && <span className="px-2 py-0.5 rounded-full font-bold border bg-red-100 text-red-700 border-red-300">⛔ غير متاح</span>}
                      {stock === 'low' && <span className="px-2 py-0.5 rounded-full font-bold border bg-amber-100 text-amber-800 border-amber-300">⚠️ منخفض</span>}
                      {stock === 'available' && <span className="px-2 py-0.5 rounded-full font-bold border bg-green-100 text-green-700 border-green-300">✅ متاح</span>}
                      <span className="px-2 py-0.5 rounded-full bg-white border border-gray-300 text-gray-700">سعر: {Number(selectedProduct.basePrice || 0).toLocaleString()} ج.م</span>
                      {selectedProduct.offerPrice != null && (
                        <span className="px-2 py-0.5 rounded-full bg-blue-50 border border-blue-300 text-blue-800">برومو: {Number(selectedProduct.offerPrice || 0).toLocaleString()} ج.م</span>
                      )}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1 text-right">الكمية</label>
                    <input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(e) => updateItem(index, { quantity: Number(e.target.value) || 1 })}
                      className="w-full px-2 py-2 border border-gray-300 rounded text-left bg-white"
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1 text-right">الوزن</label>
                    <input
                      type="number"
                      value={item.weightGrams}
                      onChange={(e) => updateItem(index, { weightGrams: Number(e.target.value) || 0 })}
                      className="w-full px-2 py-2 border border-gray-300 rounded text-left bg-white"
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1 text-right">سعر الوحدة</label>
                    <input
                      type="number"
                      value={item.unitPrice}
                      onChange={(e) => updateItem(index, { unitPrice: Number(e.target.value) || 0 })}
                      className="w-full px-2 py-2 border border-gray-300 rounded text-left bg-white"
                      dir="ltr"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1 text-right">تعليمات خاصة</label>
                  <input
                    type="text"
                    value={item.specialInstructions}
                    onChange={(e) => updateItem(index, { specialInstructions: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-right bg-white"
                    dir="rtl"
                  />
                </div>

                <div className="flex items-center justify-between bg-white rounded p-2 border border-gray-200">
                  <span className="text-xs text-gray-600">الإجمالي</span>
                  <span className="text-base font-bold text-gray-900">{lineTotal.toLocaleString()} ج.م</span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Desktop table */}
        <div className="mt-4 hidden md:block overflow-x-auto">
          <table className="w-full min-w-[980px]">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-2 text-right text-sm">المنتج</th>
                <th className="p-2 text-right text-sm">السعر</th>
                <th className="p-2 text-right text-sm">سعر البرومو</th>
                <th className="p-2 text-right text-sm">الكمية</th>
                <th className="p-2 text-right text-sm">الوزن</th>
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
                const stock = selectedProduct?.stockStatus || (selectedProduct ? 'available' : null)
                return (
                  <tr key={index} className="border-b border-gray-200">
                    <td className="p-2">
                      <ProductCombobox
                        products={products}
                        value={item.productNameInput}
                        selectedProductId={item.productId}
                        onSelect={(p) => onProductSelect(index, p)}
                        onClear={() => onProductClear(index)}
                        size="sm"
                      />
                      {selectedProduct && (
                        <div className="mt-1">
                          {stock === 'out' && (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border bg-red-100 text-red-700 border-red-300">⛔ غير متاح — لا يمكن إضافته</span>
                          )}
                          {stock === 'low' && (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border bg-amber-100 text-amber-800 border-amber-300">⚠️ مخزون منخفض — راجع الفرع</span>
                          )}
                          {stock === 'available' && (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border bg-green-100 text-green-700 border-green-300">✅ متاح</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="p-2 text-sm text-gray-700 whitespace-nowrap">
                      {selectedProduct ? `${Number(selectedProduct.basePrice || 0).toLocaleString()} ج.م` : '--'}
                    </td>
                    <td className="p-2 text-sm text-gray-700 whitespace-nowrap">
                      {selectedProduct?.offerPrice != null
                        ? `${Number(selectedProduct.offerPrice || 0).toLocaleString()} ج.م`
                        : '--'}
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
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        value={item.weightGrams}
                        onChange={(e) => updateItem(index, { weightGrams: Number(e.target.value) || 0 })}
                        className="w-24 px-2 py-1 border rounded text-left"
                        dir="ltr"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        value={item.unitPrice}
                        onChange={(e) => updateItem(index, { unitPrice: Number(e.target.value) || 0 })}
                        className="w-24 px-2 py-1 border rounded text-left"
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
          <SummaryCard label={walletApplied > 0 ? 'الإجمالي بعد المحفظة' : (discountAmount > 0 ? 'الإجمالي بعد الخصم' : 'الإجمالي الكلي')} value={`${netTotal.toLocaleString()} ج.م`} highlight />
        </div>

        {mode === 'create' && (
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
        )}

        {mode === 'create' && walletAvailable > 0 && (
          <div className="mt-3 rounded-lg border-2 border-emerald-200 bg-emerald-50 p-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={useWallet}
                onChange={(e) => {
                  setUseWallet(e.target.checked)
                  if (!e.target.checked) setWalletAmountInput('')
                }}
                className="w-5 h-5 accent-emerald-600"
              />
              <span className="text-sm font-semibold text-emerald-900">
                💳 خصم من رصيد المحفظة ({walletAvailable.toLocaleString()} ج.م متاح)
              </span>
            </label>
            {useWallet && (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-emerald-900 mb-1">المبلغ المطلوب خصمه (اتركه فارغًا للخصم الأقصى)</label>
                  <input
                    type="number"
                    min={0}
                    max={Math.min(walletAvailable, grossTotal)}
                    value={walletAmountInput}
                    onChange={(e) => setWalletAmountInput(e.target.value)}
                    placeholder={String(Math.min(walletAvailable, grossTotal))}
                    className="w-full px-3 py-2 border border-emerald-300 rounded-lg text-left bg-white"
                    dir="ltr"
                  />
                </div>
                <div className="flex items-end">
                  <div className="w-full text-right text-sm text-emerald-900">
                    <div>سيتم خصم: <strong>{walletApplied.toLocaleString()} ج.م</strong></div>
                    <div>الرصيد بعد الحفظ: <strong>{(walletAvailable - walletApplied).toLocaleString()} ج.م</strong></div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {selectedZone && freeDeliveryValue > 0 && (
          <p className="mt-2 text-xs text-gray-600 text-right">
            {subtotal >= freeDeliveryValue
              ? '✅ تم تطبيق التوصيل المجاني لأن الطلب وصل الحد الأدنى.'
              : `التوصيل مجاني عند ${freeDeliveryValue.toLocaleString()} ج.م`}
          </p>
        )}
      </details>

      <details open className="bg-white rounded-lg border border-gray-200 p-4">
        <summary className="font-bold text-gray-900 cursor-pointer">4) الدفع والحالة</summary>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          <FieldSelect label="طريقة الدفع" value={form.paymentMethod} onChange={(v) => updateForm('paymentMethod', v)} options={paymentMethods.includes(form.paymentMethod) ? paymentMethods : [form.paymentMethod, ...paymentMethods]} />

          {form.orderStatus === 'لاغي' && (
            <FieldSelect
              label="سبب الإلغاء"
              value={form.cancellationReason}
              onChange={(v) => updateForm('cancellationReason', v as OrderFormModel['cancellationReason'])}
              options={CANCELLATION_REASONS}
            />
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

          {/* Priority flag */}
          <div className={`md:col-span-2 rounded-lg border p-3 ${form.isPriority ? 'bg-red-50 border-red-300' : 'bg-gray-50 border-gray-200'}`}>
            <div className="flex items-center gap-2">
              <input
                id="is-priority"
                type="checkbox"
                checked={form.isPriority}
                onChange={(e) => updateForm('isPriority', e.target.checked)}
                className="h-4 w-4 text-red-600"
              />
              <label htmlFor="is-priority" className="text-sm font-semibold text-gray-800 cursor-pointer">
                🚨 طلب أولوية عاجلة (Priority)
              </label>
            </div>
            {form.isPriority && (
              <div className="mt-2">
                <label className="block text-xs font-medium text-gray-700 mb-1 text-right">سبب الأولوية (اختياري)</label>
                <input
                  type="text"
                  value={form.priorityReason}
                  onChange={(e) => updateForm('priorityReason', e.target.value)}
                  placeholder="مثال: عميل VIP — مناسبة عاجلة — تعويض"
                  className="w-full px-3 py-2 border border-red-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-right bg-white"
                  dir="rtl"
                />
                <p className="text-xs text-red-700 mt-1 text-right">سيتم إخطار الفرع فوراً مع تنبيه صوتي.</p>
              </div>
            )}
          </div>

          <div className="md:col-span-2 flex items-center gap-2">
            <input
              id="is-scheduled"
              type="checkbox"
              checked={form.isScheduled}
              onChange={(e) => {
                const checked = e.target.checked
                updateForm('isScheduled', checked)
                if (checked) {
                  if (!form.scheduledDate) {
                    const tomorrow = new Date()
                    tomorrow.setDate(tomorrow.getDate() + 1)
                    updateForm('scheduledDate', tomorrow.toISOString().slice(0, 10))
                  }
                  if (!form.scheduledTimeSlot) {
                    updateForm('scheduledTimeSlot', 'صباحي')
                  }
                  if (form.orderStatus !== 'حجز') {
                    updateForm('orderStatus', 'حجز')
                  }
                }
              }}
            />
            <label htmlFor="is-scheduled" className="text-sm text-gray-700 cursor-pointer">
              📅 حجز (ليوم لاحق)
            </label>
          </div>

          {form.isScheduled && (() => {
            const tomorrow = new Date()
            tomorrow.setDate(tomorrow.getDate() + 1)
            const minDate = tomorrow.toISOString().slice(0, 10)
            const maxDateObj = new Date()
            maxDateObj.setDate(maxDateObj.getDate() + 14)
            const maxDate = maxDateObj.toISOString().slice(0, 10)
            return (
              <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-3 p-3 rounded-lg bg-indigo-50 border border-indigo-200">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 text-right">تاريخ التوصيل</label>
                  <input
                    type="date"
                    value={form.scheduledDate}
                    min={minDate}
                    max={maxDate}
                    onChange={(e) => updateForm('scheduledDate', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    dir="ltr"
                  />
                  <p className="text-[11px] text-gray-500 mt-1 text-right">من الغد وحتى 14 يوم قادمة</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 text-right">فترة التوصيل</label>
                  <select
                    value={form.scheduledTimeSlot}
                    onChange={(e) => updateForm('scheduledTimeSlot', e.target.value as OrderFormModel['scheduledTimeSlot'])}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    dir="rtl"
                  >
                    <option value="صباحي">صباحي (9 ص – 12 م)</option>
                    <option value="ظهري">ظهري (12 م – 5 م)</option>
                    <option value="مسائي">مسائي (5 م – 10 م)</option>
                    <option value="ساعة محددة">تحديد ساعة معينة</option>
                  </select>
                </div>
                {form.scheduledTimeSlot === 'ساعة محددة' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 text-right">الساعة</label>
                    <input
                      type="time"
                      value={form.scheduledSpecificTime}
                      onChange={(e) => updateForm('scheduledSpecificTime', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      dir="ltr"
                    />
                  </div>
                )}
              </div>
            )
          })()}

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

      {deliveryData && mode === 'edit' && (
        <details open className="bg-white rounded-lg border border-blue-200 p-4">
          <summary className="font-bold text-blue-900 cursor-pointer">📍 ملاحظات الفرع والصور</summary>
          <div className="mt-4 space-y-4">
            {deliveryData.deliveryStatus && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 text-right">حالة التوصيل</label>
                <div className="px-3 py-3 bg-gray-50 rounded-lg border border-gray-200">
                  <DeliveryProgressBar status={deliveryData.deliveryStatus} />
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
                  {deliveryData.deliveredAt}
                </div>
              </div>
            )}
          </div>
        </details>
      )}
      </fieldset>

      <div className="flex flex-col sm:flex-row gap-3 sticky bottom-0 sm:static bg-gray-50 sm:bg-transparent -mx-3 sm:mx-0 px-3 sm:px-0 py-3 sm:py-0 border-t sm:border-0 border-gray-200">
        <button
          type="submit"
          disabled={isSaving || isLockedForCs}
          className="w-full sm:w-auto px-5 py-3 sm:py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white font-semibold min-h-[44px]"
        >
          {isSaving ? '... جاري الحفظ' : mode === 'create' ? 'حفظ الطلب' : 'تحديث الطلب'}
        </button>
        <button type="button" onClick={() => router.push('/orders')} className="w-full sm:w-auto px-5 py-3 sm:py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold min-h-[44px]">
          رجوع
        </button>
      </div>

      {mode === 'edit' && loadedOrderInfo && (
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
          orderTotal={loadedOrderInfo.orderTotal}
          notes={form.notes}
          items={items.map((i) => ({
            productName: i.productNameInput,
            quantity: Number(i.quantity) || 0,
            unitPrice: Number(i.unitPrice) || 0,
          }))}
          delivery={deliveryData}
        />
      )}
    </form>
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
