'use client'

import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/lib/auth'

type Role = 'admin' | 'cs' | 'branch'

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
}

type AdahiItem = {
  productName: string
  quantity: number
  unitPrice: number
}

type AdahiOrder = {
  id: string
  seasonLabel: string
  customerName: string
  phone: string
  items: AdahiItem[]
  subtotal: number
  paidAmount: number
  remainingAmount: number
  collectionPercent: number
  slaughterDay: 'اليوم الأول' | 'اليوم الثاني'
  hasDelivery: boolean
  willWitnessSacrifice: boolean
  createdAt: string
}

const ORDER_RECEIVERS_FALLBACK = ['رنا', 'مى', 'ميرنا', 'أمل']
const ORDER_METHODS_FALLBACK = ['FB', 'Call', 'App', 'WhatsApp', 'B2B', 'W.S']
const ADAHI_PRODUCTS = ['باكدج صك 5 ك', 'عجل', 'خروف بلدي', 'خروف برقي']

function nowDate() {
  return new Date().toISOString().slice(0, 10)
}

function nowTime() {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

function emptyItem(): AdahiItem {
  return {
    productName: ADAHI_PRODUCTS[0],
    quantity: 1,
    unitPrice: 0,
  }
}

export default function AdahiOrderView({ role }: { role: Role }) {
  const { user } = useAuthStore()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [lookupLoading, setLookupLoading] = useState(false)

  const [orders, setOrders] = useState<AdahiOrder[]>([])
  const [addresses, setAddresses] = useState<CustomerAddress[]>([])
  const [deliveryZones, setDeliveryZones] = useState<DeliveryZone[]>([])
  const [orderReceivers, setOrderReceivers] = useState<string[]>(ORDER_RECEIVERS_FALLBACK)
  const [orderMethods, setOrderMethods] = useState<string[]>(ORDER_METHODS_FALLBACK)

  const [phone, setPhone] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [deliveryAddressId, setDeliveryAddressId] = useState('__new')
  const [addressLabel, setAddressLabel] = useState('Home')
  const [deliveryArea, setDeliveryArea] = useState('')
  const [streetAddress, setStreetAddress] = useState('')
  const [googleMapsLink, setGoogleMapsLink] = useState('')

  const [orderDate, setOrderDate] = useState(nowDate())
  const [orderTime, setOrderTime] = useState(nowTime())
  const [orderReceiver, setOrderReceiver] = useState('رنا')
  const [orderMethod, setOrderMethod] = useState('Call')
  const [seasonLabel, setSeasonLabel] = useState(`${new Date().getFullYear()} موسم الأضاحي`)

  const [items, setItems] = useState<AdahiItem[]>([emptyItem()])
  const [paidAmount, setPaidAmount] = useState(0)

  const [slaughterDay, setSlaughterDay] = useState<'اليوم الأول' | 'اليوم الثاني'>('اليوم الأول')
  const [cuttingDetails, setCuttingDetails] = useState('')
  const [cleanOffal, setCleanOffal] = useState(false)
  const [hasDelivery, setHasDelivery] = useState(true)
  const [willWitnessSacrifice, setWillWitnessSacrifice] = useState(false)
  const [notes, setNotes] = useState('')

  useEffect(() => {
    const loadData = async () => {
      try {
        const [ordersRes, zonesRes, settingsRes] = await Promise.all([
          fetch('/api/adahi-orders'),
          fetch('/api/delivery-zones'),
          fetch('/api/order-settings'),
        ])

        const ordersData = await ordersRes.json()
        const zonesData = await zonesRes.json()

        setOrders(Array.isArray(ordersData.orders) ? ordersData.orders : [])

        const zones = Array.isArray(zonesData.zones)
          ? zonesData.zones.map((z: any) => ({ zone: Number(z.zone), area: String(z.area || '') }))
          : []

        setDeliveryZones(zones)
        if (zones.length > 0) {
          setDeliveryArea((prev) => prev || zones[0].area)
        }

        if (settingsRes.ok) {
          const settingsData = await settingsRes.json()
          const receivers = Array.isArray(settingsData.options?.orderReceivers)
            ? settingsData.options.orderReceivers
            : ORDER_RECEIVERS_FALLBACK
          const methods = Array.isArray(settingsData.options?.orderMethods)
            ? settingsData.options.orderMethods
            : ORDER_METHODS_FALLBACK

          setOrderReceivers(receivers.length > 0 ? receivers : ORDER_RECEIVERS_FALLBACK)
          setOrderMethods(methods.length > 0 ? methods : ORDER_METHODS_FALLBACK)
          setOrderReceiver((prev) => (receivers.includes(prev) ? prev : receivers[0] || ORDER_RECEIVERS_FALLBACK[0]))
          setOrderMethod((prev) => (methods.includes(prev) ? prev : methods[0] || ORDER_METHODS_FALLBACK[1]))
        }
      } catch {
        toast.error('تعذر تحميل بيانات الأضاحي')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0),
    [items]
  )

  const collectionPercent = useMemo(() => {
    if (subtotal <= 0) return 0
    return Math.min(100, Math.round((Math.max(0, paidAmount) / subtotal) * 100))
  }, [subtotal, paidAmount])

  const remainingAmount = useMemo(() => Math.max(0, subtotal - Math.max(0, paidAmount)), [subtotal, paidAmount])

  const handleLookupCustomer = async () => {
    if (!phone.trim() && !customerName.trim()) {
      toast.error('أدخل رقم الهاتف أو اسم العميل أولاً')
      return
    }

    setLookupLoading(true)
    try {
      const params = new URLSearchParams()
      if (phone.trim()) params.set('phone', phone.trim())
      if (customerName.trim()) params.set('name', customerName.trim())

      const response = await fetch(`/api/customers?${params.toString()}`)
      const data = await response.json()

      if (!data.customer) {
        setAddresses([])
        setDeliveryAddressId('__new')
        toast('عميل جديد - أكمل البيانات')
        return
      }

      setPhone(data.customer.phone || phone)
      setCustomerName(data.customer.customerName || customerName)

      const customerAddresses = Array.isArray(data.addresses) ? data.addresses : []
      setAddresses(customerAddresses)

      const firstAddress = customerAddresses[0]
      if (firstAddress) {
        setDeliveryAddressId(firstAddress.id)
        setAddressLabel(firstAddress.addressLabel || 'Home')
        setDeliveryArea(firstAddress.area || deliveryArea)
        setStreetAddress(firstAddress.streetAddress || '')
        setGoogleMapsLink(firstAddress.googleMapsLink || '')
      }

      toast.success('تم تحميل بيانات العميل')
    } catch {
      toast.error('تعذر البحث عن العميل')
    } finally {
      setLookupLoading(false)
    }
  }

  const onAddressChange = (id: string) => {
    setDeliveryAddressId(id)
    if (id === '__new') {
      setAddressLabel('Home')
      setStreetAddress('')
      setGoogleMapsLink('')
      return
    }

    const selected = addresses.find((a) => a.id === id)
    if (!selected) return

    setAddressLabel(selected.addressLabel || 'Home')
    setDeliveryArea(selected.area || deliveryArea)
    setStreetAddress(selected.streetAddress || '')
    setGoogleMapsLink(selected.googleMapsLink || '')
  }

  const updateItem = (index: number, patch: Partial<AdahiItem>) => {
    setItems((prev) => prev.map((item, idx) => (idx === index ? { ...item, ...patch } : item)))
  }

  const addItem = () => setItems((prev) => [...prev, emptyItem()])

  const removeItem = (index: number) => {
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== index)))
  }

  const resetForm = () => {
    setPhone('')
    setCustomerName('')
    setDeliveryAddressId('__new')
    setAddressLabel('Home')
    setDeliveryArea(deliveryZones[0]?.area || '')
    setStreetAddress('')
    setGoogleMapsLink('')
    setOrderDate(nowDate())
    setOrderTime(nowTime())
    setOrderReceiver(orderReceivers[0] || ORDER_RECEIVERS_FALLBACK[0])
    setOrderMethod(orderMethods[0] || ORDER_METHODS_FALLBACK[1])
    setItems([emptyItem()])
    setPaidAmount(0)
    setSlaughterDay('اليوم الأول')
    setCuttingDetails('')
    setCleanOffal(false)
    setHasDelivery(true)
    setWillWitnessSacrifice(false)
    setNotes('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const area = deliveryArea.trim() || String(deliveryZones[0]?.area || '').trim()

    if (!phone.trim()) return toast.error('رقم الهاتف مطلوب')
    if (!customerName.trim()) return toast.error('اسم العميل مطلوب')
    if (!streetAddress.trim()) return toast.error('عنوان التوصيل مطلوب')
    if (!area) return toast.error('اختر المنطقة')

    const validItems = items.filter((item) => item.productName && item.quantity > 0)
    if (validItems.length === 0) return toast.error('أضف منتجاً واحداً على الأقل')

    setSaving(true)
    try {
      const payload = {
        seasonLabel,
        orderDate,
        orderTime,
        orderReceiver,
        orderMethod,
        phone,
        customerName,
        deliveryAddressId,
        addressLabel,
        deliveryArea: area,
        streetAddress,
        googleMapsLink,
        items: validItems,
        paidAmount,
        slaughterDay,
        cuttingDetails,
        cleanOffal,
        hasDelivery,
        willWitnessSacrifice,
        notes,
        createdBy: user?.id || 'unknown',
      }

      const response = await fetch('/api/adahi-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(data?.error || 'Save failed')
      }

      const data = await response.json()
      setOrders((prev) => [data.order, ...prev])
      toast.success('✅ تم حفظ طلب الأضحية')
      resetForm()
    } catch (error: any) {
      toast.error(error?.message || 'حدث خطأ أثناء الحفظ')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="p-6 text-center text-gray-500">⏳ جاري تحميل بيانات الأضاحي...</div>
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">🐑 اضاحي</h1>
        <p className="text-gray-600 mt-1">طلبات موسمية للأضاحي مع متابعة التحصيل</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <details open className="bg-white rounded-lg border border-gray-200 p-4">
          <summary className="font-bold text-gray-900 cursor-pointer">1) بيانات الطلب الموسمي</summary>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
            <FieldInput label="الموسم" value={seasonLabel} onChange={setSeasonLabel} />
            <FieldInput label="تاريخ الطلب" type="date" value={orderDate} onChange={setOrderDate} />
            <FieldInput label="الساعة" type="time" value={orderTime} onChange={setOrderTime} />
            <FieldSelect
              label="متلقي الطلب"
              value={orderReceiver}
              onChange={(v) => setOrderReceiver(v)}
              options={orderReceivers.includes(orderReceiver) ? orderReceivers : [orderReceiver, ...orderReceivers]}
            />
            <FieldSelect
              label="طريقة الطلب"
              value={orderMethod}
              onChange={(v) => setOrderMethod(v)}
              options={orderMethods.includes(orderMethod) ? orderMethods : [orderMethod, ...orderMethods]}
            />
            <FieldSelect label="يوم الذبح" value={slaughterDay} onChange={(v) => setSlaughterDay(v as 'اليوم الأول' | 'اليوم الثاني')} options={['اليوم الأول', 'اليوم الثاني']} />
          </div>
        </details>

        <details open className="bg-white rounded-lg border border-gray-200 p-4">
          <summary className="font-bold text-gray-900 cursor-pointer">2) بيانات العميل والعنوان</summary>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 text-right">رقم الهاتف</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-left"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={handleLookupCustomer}
                  disabled={lookupLoading}
                  className="px-3 py-2 rounded-lg bg-red-100 text-red-700 hover:bg-red-200"
                >
                  {lookupLoading ? '...' : 'بحث'}
                </button>
              </div>
            </div>

            <FieldInput label="اسم العميل" value={customerName} onChange={setCustomerName} />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 text-right">عنوان التوصيل</label>
              <select
                value={deliveryAddressId}
                onChange={(e) => onAddressChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-right"
                dir="rtl"
              >
                {addresses.map((a) => (
                  <option key={a.id} value={a.id}>{`${a.addressLabel} - ${a.streetAddress}`}</option>
                ))}
                <option value="__new">إضافة عنوان جديد</option>
              </select>
            </div>

            <FieldInput label="تسمية العنوان" value={addressLabel} onChange={setAddressLabel} />
            <FieldSelect label="المنطقة" value={deliveryArea} onChange={setDeliveryArea} options={deliveryZones.map((z) => z.area)} />
            <FieldInput label="العنوان" value={streetAddress} onChange={setStreetAddress} />
            <FieldInput label="رابط Google Maps" value={googleMapsLink} onChange={setGoogleMapsLink} dir="ltr" />
          </div>
        </details>

        <details open className="bg-white rounded-lg border border-gray-200 p-4">
          <summary className="font-bold text-gray-900 cursor-pointer">3) تفاصيل الأضاحي والتحصيل</summary>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[780px]">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-2 text-right text-sm">المنتج</th>
                  <th className="p-2 text-right text-sm">الكمية</th>
                  <th className="p-2 text-right text-sm">السعر</th>
                  <th className="p-2 text-right text-sm">الإجمالي</th>
                  <th className="p-2 text-center text-sm">حذف</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => {
                  const lineTotal = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)
                  return (
                    <tr key={index} className="border-b border-gray-200">
                      <td className="p-2">
                        <select
                          value={item.productName}
                          onChange={(e) => updateItem(index, { productName: e.target.value })}
                          className="w-full px-2 py-1 border rounded"
                        >
                          {ADAHI_PRODUCTS.map((name) => (
                            <option key={name} value={name}>{name}</option>
                          ))}
                        </select>
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
                          min={0}
                          value={item.unitPrice}
                          onChange={(e) => updateItem(index, { unitPrice: Number(e.target.value) || 0 })}
                          className="w-36 px-2 py-1 border rounded text-left"
                          dir="ltr"
                          placeholder="مثال: 100000"
                        />
                      </td>
                      <td className="p-2 font-semibold text-sm">{lineTotal.toLocaleString()} ج.م</td>
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
            <SummaryCard label="المطلوب تحصيله" value={`${subtotal.toLocaleString()} ج.م`} />
            <div className="rounded-lg border border-gray-200 p-3">
              <label className="block text-sm font-medium text-gray-700 mb-1 text-right">المدفوع (المحصل)</label>
              <input
                type="number"
                min={0}
                value={paidAmount}
                onChange={(e) => setPaidAmount(Math.max(0, Number(e.target.value) || 0))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-left"
                dir="ltr"
              />
              <div className="text-xs text-gray-600 mt-1">المتبقي: {remainingAmount.toLocaleString()} ج.م</div>
            </div>
            <SummaryCard label="نسبة التحصيل" value={`${collectionPercent}%`} highlight />
          </div>

          <div className="mt-3">
            <div className="h-3 w-full rounded-full bg-gray-200 overflow-hidden">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${collectionPercent}%` }} />
            </div>
            <div className="text-xs text-gray-600 mt-1 text-right">تم تحصيل {collectionPercent}% من قيمة الطلب</div>
          </div>
        </details>

        <details open className="bg-white rounded-lg border border-gray-200 p-4">
          <summary className="font-bold text-gray-900 cursor-pointer">4) تفاصيل الذبح والتجهيز</summary>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 text-right">تفاصيل التقطيع</label>
              <textarea
                value={cuttingDetails}
                onChange={(e) => setCuttingDetails(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-right"
                dir="rtl"
                placeholder="مثال: نصف مفروم - نصف قطع..."
              />
            </div>

            <div className="space-y-3">
              <BooleanField label="نظيف السقط" value={cleanOffal} onChange={setCleanOffal} />
              <BooleanField label="يوجد توصيل" value={hasDelivery} onChange={setHasDelivery} />
              <BooleanField label="سيشهد الذبح" value={willWitnessSacrifice} onChange={setWillWitnessSacrifice} />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1 text-right">ملاحظات إضافية</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-right"
                dir="rtl"
              />
            </div>
          </div>
        </details>

        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white font-semibold"
        >
          {saving ? '... جاري الحفظ' : 'حفظ طلب الأضحية'}
        </button>
      </form>

      <section className="bg-white rounded-lg border border-gray-200 p-4">
        <h2 className="text-lg font-bold text-gray-900 mb-3">طلبات الأضاحي الحالية</h2>
        {orders.length === 0 ? (
          <p className="text-sm text-gray-500">لا توجد طلبات اضاحي حتى الآن.</p>
        ) : (
          <div className="space-y-3">
            {orders.slice(0, 8).map((order) => (
              <div key={order.id} className="rounded-lg border border-gray-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-gray-900">{order.customerName}</div>
                    <div className="text-sm text-gray-600" dir="ltr">{order.phone}</div>
                  </div>
                  <div className="text-sm text-gray-700">{new Date(order.createdAt).toLocaleString('ar-EG')}</div>
                </div>
                <div className="mt-2 text-sm text-gray-700">
                  {order.items.map((item, idx) => `${item.productName} x${item.quantity}`).join(' - ')}
                </div>
                <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                  <InfoPill label="المطلوب" value={`${order.subtotal.toLocaleString()} ج.م`} />
                  <InfoPill label="المحصل" value={`${order.paidAmount.toLocaleString()} ج.م`} />
                  <InfoPill label="المتبقي" value={`${order.remainingAmount.toLocaleString()} ج.م`} />
                  <InfoPill label="النسبة" value={`${order.collectionPercent}%`} />
                </div>
                <div className="mt-2 h-2 w-full rounded-full bg-gray-200 overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: `${order.collectionPercent}%` }} />
                </div>
                <div className="mt-2 text-xs text-gray-600">
                  {order.slaughterDay} | {order.hasDelivery ? 'توصيل' : 'بدون توصيل'} | {order.willWitnessSacrifice ? 'سيشهد الذبح' : 'لن يشهد الذبح'}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {role === 'branch' && (
        <p className="text-xs text-gray-500">عرض الفرع يدعم إنشاء ومتابعة طلبات الأضاحي خلال الموسم.</p>
      )}
    </div>
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
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-right"
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

function BooleanField({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1 text-right">{label}</label>
      <select
        value={value ? 'yes' : 'no'}
        onChange={(e) => onChange(e.target.value === 'yes')}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-right"
      >
        <option value="yes">نعم</option>
        <option value="no">لا</option>
      </select>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-lg font-bold ${highlight ? 'text-red-700' : 'text-gray-900'}`}>{value}</p>
    </div>
  )
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-gray-200 px-2 py-1">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="font-semibold text-gray-800">{value}</div>
    </div>
  )
}
