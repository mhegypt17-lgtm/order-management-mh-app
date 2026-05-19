'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CustomerSummary {
  id: string
  customerName: string
  phone: string
  createdAt: string
  addressCount: number
  totalOrders: number
  completedOrders: number
  totalRevenue: number
  lastOrderDate: string | null
  daysSinceLastOrder: number | null
  tier: 'برونزي' | 'فضي' | 'ذهبي' | 'بلاتيني'
}

interface Address {
  id: string
  addressLabel: string
  area?: string
  streetAddress: string
  googleMapsLink: string
}

interface OrderItem {
  id: string
  productId: string
  productName: string
  quantity: number
  weightGrams: number
  unitPrice: number
  lineTotal: number
  specialInstructions: string
}

interface Order {
  id: string
  appOrderNo: string
  orderDate: string
  orderTime: string
  orderStatus: string
  orderMethod: string
  paymentMethod: string
  subtotal: number
  deliveryFee: number
  orderTotal: number
  notes: string
  items: OrderItem[]
}

interface TopProduct {
  productId: string
  productName: string
  category: string
  totalQty: number
  totalSpend: number
  orderCount: number
}

interface Stats {
  totalOrders: number
  completedOrders: number
  cancelledOrders: number
  totalRevenue: number
  avgOrderValue: number
  lifetimeMonths: number
  firstOrderDate: string | null
  lastOrderDate: string | null
}

interface Insights {
  tier: string
  daysSinceLastOrder: number | null
  activityAlert: string | null
  ordersPerMonth: number
  preferredPayment: string | null
  preferredChannel: string | null
  cancellationRate: number
  singleOrderProducts: string[]
  unorderedCategories: string[]
  customerSource: string | null
  avgOrderValue: number
}

interface CustomerProfile {
  customer: { id: string; customerName: string; phone: string; createdAt: string }
  addresses: Address[]
  orders: Order[]
  stats: Stats
  top5Products: TopProduct[]
  insights: Insights
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TIER_COLORS: Record<string, string> = {
  'برونزي': 'bg-amber-100 text-amber-800',
  'فضي':   'bg-gray-100 text-gray-700',
  'ذهبي':  'bg-yellow-100 text-yellow-800',
  'بلاتيني': 'bg-purple-100 text-purple-800',
}

const STATUS_COLORS: Record<string, string> = {
  'تم':    'bg-green-100 text-green-800',
  'لاغي':  'bg-red-100 text-red-800',
  'مؤجل':  'bg-orange-100 text-orange-800',
  'حجز':   'bg-blue-100 text-blue-800',
}

function formatCurrency(n: number) {
  return n.toLocaleString('ar-EG') + ' ج.م'
}

// ─── Component ────────────────────────────────────────────────────────────────

interface CRMViewProps {
  role: 'cs' | 'admin'
}

export default function CRMView({ role }: CRMViewProps) {
  const [customers, setCustomers] = useState<CustomerSummary[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [profile, setProfile] = useState<CustomerProfile | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'orders' | 'products' | 'insights'>('overview')
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newWallet, setNewWallet] = useState('')
  const [creating, setCreating] = useState(false)

  const handleCreateCustomer = async () => {
    const name = newName.trim()
    const phone = newPhone.trim()
    if (!name) return toast.error('اسم العميل مطلوب')
    if (!phone) return toast.error('رقم الهاتف مطلوب')
    setCreating(true)
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: name,
          phone,
          wallet: newWallet ? Number(newWallet) : 0,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data?.error || 'تعذر إنشاء العميل')
        return
      }
      toast.success('✅ تم إنشاء العميل')
      setShowAdd(false)
      setNewName('')
      setNewPhone('')
      setNewWallet('')
      setReloadKey((k) => k + 1)
      if (data?.customer?.id) {
        setSelectedId(data.customer.id)
        loadProfile(data.customer.id)
      }
    } catch {
      toast.error('تعذر إنشاء العميل')
    } finally {
      setCreating(false)
    }
  }

  // Load customer list
  useEffect(() => {
    const fetchCustomers = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/crm/customers?search=${encodeURIComponent(search)}`)
        if (!res.ok) throw new Error('Failed to load')
        const data = await res.json()
        setCustomers(data)
      } catch {
        toast.error('خطأ في تحميل العملاء')
      } finally {
        setLoading(false)
      }
    }
    const debounce = setTimeout(fetchCustomers, 300)
    return () => clearTimeout(debounce)
  }, [search, reloadKey])

  // Load customer profile
  const loadProfile = useCallback(async (id: string) => {
    setProfileLoading(true)
    setProfile(null)
    setActiveTab('overview')
    setExpandedOrder(null)
    try {
      const res = await fetch(`/api/crm/customers/${id}?role=${role}`)
      if (!res.ok) throw new Error('Failed to load profile')
      const data = await res.json()
      setProfile(data)
    } catch {
      toast.error('خطأ في تحميل بيانات العميل')
    } finally {
      setProfileLoading(false)
    }
  }, [role])

  const handleSelectCustomer = (id: string) => {
    setSelectedId(id)
    loadProfile(id)
  }

  const selectedCustomer = customers.find((c) => c.id === selectedId)

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden" dir="rtl">
      {/* ── Sidebar: Customer List ─────────────────────────────────────────── */}
      <div className="w-72 flex-shrink-0 border-l border-gray-200 bg-white flex flex-col">
        <div className="p-3 border-b border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-base font-bold text-gray-800">👥 قاعدة العملاء</h2>
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="text-xs bg-red-600 hover:bg-red-700 text-white font-bold px-2 py-1 rounded"
              title="إضافة عميل جديد"
            >
              + إضافة
            </button>
          </div>
          <input
            type="text"
            placeholder="بحث بالاسم أو الهاتف..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-gray-500 text-sm">⏳ جاري التحميل...</div>
          ) : customers.length === 0 ? (
            <div className="p-4 text-center text-gray-500 text-sm">لا يوجد عملاء</div>
          ) : (
            customers.map((c) => (
              <button
                key={c.id}
                onClick={() => handleSelectCustomer(c.id)}
                className={`w-full text-right px-3 py-3 border-b border-gray-100 hover:bg-red-50 transition-colors ${selectedId === c.id ? 'bg-red-50 border-r-4 border-r-red-500' : ''}`}
              >
                <div className="flex justify-between items-start">
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${TIER_COLORS[c.tier]}`}>
                    {c.tier}
                  </span>
                  <span className="font-semibold text-sm text-gray-900 truncate max-w-[130px]">{c.customerName}</span>
                </div>
                <div className="text-xs text-gray-500 mt-1 text-right">{c.phone}</div>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-xs text-gray-400">
                    {c.lastOrderDate ? c.lastOrderDate : 'لا طلبات'}
                  </span>
                  <span className="text-xs text-gray-600">{c.totalOrders} طلب</span>
                </div>
              </button>
            ))
          )}
        </div>
        <div className="p-2 text-xs text-center text-gray-400 border-t border-gray-100">
          {customers.length} عميل
        </div>
      </div>

      {/* ── Main Panel: Customer Profile ───────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        {!selectedId ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="text-center">
              <div className="text-5xl mb-4">👤</div>
              <p className="text-lg">اختر عميلاً من القائمة</p>
            </div>
          </div>
        ) : profileLoading ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center">
              <div className="text-3xl mb-2">⏳</div>
              <p>جاري تحميل بيانات العميل...</p>
            </div>
          </div>
        ) : profile ? (
          <div className="p-5">
            {/* ── Profile Header ─────────────────────────────────────────── */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-4">
              <div className="flex justify-between items-start flex-wrap gap-3">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h1 className="text-2xl font-bold text-gray-900">{profile.customer.customerName}</h1>
                    <span className={`px-2 py-0.5 rounded-full text-sm font-bold ${TIER_COLORS[profile.insights.tier]}`}>
                      {profile.insights.tier}
                    </span>
                  </div>
                  <p className="text-gray-500 text-sm">{profile.customer.phone}</p>
                  {profile.insights.customerSource && (
                    <p className="text-xs text-gray-400 mt-0.5">المصدر: {profile.insights.customerSource}</p>
                  )}
                </div>

                {profile.insights.activityAlert && (
                  <div className={`px-3 py-2 rounded-lg text-sm font-medium ${profile.insights.daysSinceLastOrder && profile.insights.daysSinceLastOrder > 90 ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                    ⚠️ {profile.insights.activityAlert}
                  </div>
                )}
              </div>

              {/* Quick stats row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-gray-800">{profile.stats.totalOrders}</div>
                  <div className="text-xs text-gray-500 mt-0.5">إجمالي الطلبات</div>
                </div>
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-green-700">{profile.stats.completedOrders}</div>
                  <div className="text-xs text-gray-500 mt-0.5">طلبات مكتملة</div>
                </div>
                {role === 'admin' && (
                  <>
                    <div className="bg-blue-50 rounded-lg p-3 text-center">
                      <div className="text-xl font-bold text-blue-700">{formatCurrency(profile.stats.totalRevenue)}</div>
                      <div className="text-xs text-gray-500 mt-0.5">إجمالي الإيرادات</div>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-3 text-center">
                      <div className="text-xl font-bold text-purple-700">{formatCurrency(profile.stats.avgOrderValue)}</div>
                      <div className="text-xs text-gray-500 mt-0.5">متوسط قيمة الطلب</div>
                    </div>
                  </>
                )}
                {role === 'cs' && (
                  <>
                    <div className="bg-orange-50 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-orange-700">{profile.stats.cancelledOrders}</div>
                      <div className="text-xs text-gray-500 mt-0.5">طلبات ملغية</div>
                    </div>
                    <div className="bg-blue-50 rounded-lg p-3 text-center">
                      <div className="text-xl font-bold text-blue-700">{profile.insights.ordersPerMonth}</div>
                      <div className="text-xs text-gray-500 mt-0.5">طلب/شهر</div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* ── Tabs ───────────────────────────────────────────────────── */}
            <div className="flex gap-1 mb-4 bg-white rounded-xl border border-gray-200 p-1 shadow-sm">
              {(['overview', 'orders', 'products', 'insights'] as const).map((tab) => {
                const labels = { overview: '📋 نظرة عامة', orders: `🧾 الطلبات (${profile.orders.length})`, products: '🏆 المنتجات المفضلة', insights: '💡 الرؤى' }
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${activeTab === tab ? 'bg-red-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                  >
                    {labels[tab]}
                  </button>
                )
              })}
            </div>

            {/* ── Tab: Overview ──────────────────────────────────────────── */}
            {activeTab === 'overview' && (
              <div className="space-y-4">
                {/* Addresses */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                  <h3 className="text-sm font-bold text-gray-700 mb-3">📍 العناوين</h3>
                  {profile.addresses.length === 0 ? (
                    <p className="text-sm text-gray-400">لا توجد عناوين محفوظة</p>
                  ) : (
                    <div className="space-y-2">
                      {profile.addresses.map((addr) => (
                        <div key={addr.id} className="bg-gray-50 rounded-lg p-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="font-medium text-sm text-gray-800">{addr.addressLabel}</span>
                              {addr.area && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full mr-2">{addr.area}</span>}
                              {(addr as any).subArea && <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full mr-2">{(addr as any).subArea}</span>}
                            </div>
                            {addr.googleMapsLink && (
                              <a href={addr.googleMapsLink} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline">
                                🗺️ خريطة
                              </a>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 mt-1">{addr.streetAddress}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Order history summary */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                  <h3 className="text-sm font-bold text-gray-700 mb-3">📊 ملخص التاريخ</h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">أول طلب</span>
                      <span className="font-medium">{profile.stats.firstOrderDate || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">آخر طلب</span>
                      <span className="font-medium">{profile.stats.lastOrderDate || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">معدل الإلغاء</span>
                      <span className={`font-medium ${profile.insights.cancellationRate > 30 ? 'text-red-600' : 'text-gray-800'}`}>
                        {profile.insights.cancellationRate}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">قناة التواصل</span>
                      <span className="font-medium">{profile.insights.preferredChannel || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">طريقة الدفع</span>
                      <span className="font-medium">{profile.insights.preferredPayment || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">تاريخ التسجيل</span>
                      <span className="font-medium">{profile.customer.createdAt?.split('T')[0]}</span>
                    </div>
                    {role === 'admin' && (
                      <>
                        <div className="flex justify-between col-span-2 border-t border-gray-100 pt-2 mt-1">
                          <span className="text-gray-500">إجمالي الإيرادات</span>
                          <span className="font-bold text-blue-700">{formatCurrency(profile.stats.totalRevenue)}</span>
                        </div>
                        <div className="flex justify-between col-span-2">
                          <span className="text-gray-500">متوسط قيمة الطلب</span>
                          <span className="font-bold text-purple-700">{formatCurrency(profile.stats.avgOrderValue)}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── Tab: Orders ────────────────────────────────────────────── */}
            {activeTab === 'orders' && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {profile.orders.length === 0 ? (
                  <div className="p-6 text-center text-gray-400">
                    {role === 'cs' ? 'لا توجد طلبات في آخر 6 أشهر' : 'لا توجد طلبات'}
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {profile.orders.map((order) => (
                      <div key={order.id}>
                        <button
                          className="w-full text-right px-4 py-3 hover:bg-gray-50 transition-colors"
                          onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                        >
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-400">{expandedOrder === order.id ? '▲' : '▼'}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[order.orderStatus] || 'bg-gray-100 text-gray-700'}`}>
                                {order.orderStatus}
                              </span>
                              <span className="text-xs text-gray-500">{order.orderMethod}</span>
                            </div>
                            <div className="text-right">
                              <span className="font-semibold text-gray-800 text-sm">{order.appOrderNo}</span>
                              <span className="text-gray-500 text-xs mr-3">{order.orderDate}</span>
                            </div>
                          </div>
                          <div className="flex justify-between items-center mt-1">
                            <span className="text-sm font-bold text-gray-800">{formatCurrency(order.orderTotal)}</span>
                            <span className="text-xs text-gray-500">{order.paymentMethod}</span>
                          </div>
                        </button>

                        {expandedOrder === order.id && (
                          <div className="bg-gray-50 px-4 pb-3 border-t border-gray-100">
                            <div className="mt-2 space-y-1.5">
                              {order.items.map((item) => (
                                <div key={item.id} className="flex justify-between items-center text-sm">
                                  <span className="text-gray-600">× {item.quantity}</span>
                                  <span className="text-gray-800 font-medium flex-1 text-right mx-3">{item.productName}</span>
                                  <span className="text-gray-700 font-semibold">{formatCurrency(item.lineTotal)}</span>
                                </div>
                              ))}
                              <div className="border-t border-gray-200 pt-1.5 mt-2 flex justify-between text-sm">
                                <span className="text-gray-600">توصيل: {formatCurrency(order.deliveryFee)}</span>
                                <span className="font-bold text-gray-800">الإجمالي: {formatCurrency(order.orderTotal)}</span>
                              </div>
                              {order.notes && (
                                <p className="text-xs text-gray-500 mt-1 bg-yellow-50 rounded px-2 py-1">📝 {order.notes}</p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Tab: Top Products ──────────────────────────────────────── */}
            {activeTab === 'products' && (
              <div className="space-y-3">
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                  <h3 className="text-sm font-bold text-gray-700 mb-3">🏆 أكثر 5 منتجات مطلوبة (طوال العمر)</h3>
                  {profile.top5Products.length === 0 ? (
                    <p className="text-sm text-gray-400">لا توجد بيانات</p>
                  ) : (
                    <div className="space-y-3">
                      {profile.top5Products.map((prod, idx) => {
                        const maxQty = profile.top5Products[0]?.totalQty || 1
                        const pct = Math.round((prod.totalQty / maxQty) * 100)
                        const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣']
                        return (
                          <div key={prod.productId} className="flex items-center gap-3">
                            <span className="text-lg w-7 text-center flex-shrink-0">{medals[idx]}</span>
                            <div className="flex-1">
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-xs text-gray-500">{prod.category}</span>
                                <span className="font-semibold text-sm text-gray-800">{prod.productName}</span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div className="bg-red-500 h-2 rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0 w-24">
                              <div className="text-sm font-bold text-gray-800">{prod.totalQty} وحدة</div>
                              <div className="text-xs text-gray-500">{prod.orderCount} مرة</div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Tab: Insights ──────────────────────────────────────────── */}
            {activeTab === 'insights' && (
              <div className="space-y-4">
                {/* Activity & Engagement */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                  <h3 className="text-sm font-bold text-gray-700 mb-3">📈 النشاط والمشاركة</h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="bg-blue-50 rounded-lg p-3">
                      <div className="text-xs text-gray-500">تكرار الشراء</div>
                      <div className="font-bold text-blue-700 mt-0.5">{profile.insights.ordersPerMonth} طلب/شهر</div>
                    </div>
                    <div className={`rounded-lg p-3 ${profile.insights.cancellationRate > 30 ? 'bg-red-50' : 'bg-green-50'}`}>
                      <div className="text-xs text-gray-500">معدل الإلغاء</div>
                      <div className={`font-bold mt-0.5 ${profile.insights.cancellationRate > 30 ? 'text-red-700' : 'text-green-700'}`}>
                        {profile.insights.cancellationRate}%
                      </div>
                    </div>
                    {role === 'admin' && (
                      <div className="bg-purple-50 rounded-lg p-3 col-span-2">
                        <div className="text-xs text-gray-500">متوسط قيمة الطلب</div>
                        <div className="font-bold text-purple-700 mt-0.5">{formatCurrency(profile.insights.avgOrderValue)}</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Upsell Opportunities */}
                {profile.insights.singleOrderProducts.length > 0 && (
                  <div className="bg-white rounded-xl shadow-sm border border-amber-200 p-4">
                    <h3 className="text-sm font-bold text-amber-700 mb-2">🔁 فرص إعادة البيع (Upsell)</h3>
                    <p className="text-xs text-gray-500 mb-2">منتجات طلبها مرة واحدة فقط — فرصة لتشجيع التكرار:</p>
                    <div className="flex flex-wrap gap-2">
                      {profile.insights.singleOrderProducts.map((p) => (
                        <span key={p} className="bg-amber-100 text-amber-800 text-xs px-2 py-1 rounded-full">{p}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Cross-sell Opportunities */}
                {profile.insights.unorderedCategories.length > 0 && (
                  <div className="bg-white rounded-xl shadow-sm border border-blue-200 p-4">
                    <h3 className="text-sm font-bold text-blue-700 mb-2">➕ فرص البيع المتقاطع (Cross-sell)</h3>
                    <p className="text-xs text-gray-500 mb-2">فئات لم يجرب منها العميل بعد:</p>
                    <div className="flex flex-wrap gap-2">
                      {profile.insights.unorderedCategories.map((cat) => (
                        <span key={cat} className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">{cat}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Preferred Behavior */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                  <h3 className="text-sm font-bold text-gray-700 mb-3">🎯 سلوك العميل المفضل</h3>
                  <div className="space-y-2 text-sm">
                    {profile.insights.preferredChannel && (
                      <div className="flex justify-between items-center bg-gray-50 rounded-lg px-3 py-2">
                        <span className="font-medium text-gray-700">{profile.insights.preferredChannel}</span>
                        <span className="text-gray-500">قناة التواصل المفضلة</span>
                      </div>
                    )}
                    {profile.insights.preferredPayment && (
                      <div className="flex justify-between items-center bg-gray-50 rounded-lg px-3 py-2">
                        <span className="font-medium text-gray-700">{profile.insights.preferredPayment}</span>
                        <span className="text-gray-500">طريقة الدفع المفضلة</span>
                      </div>
                    )}
                    {profile.insights.customerSource && (
                      <div className="flex justify-between items-center bg-gray-50 rounded-lg px-3 py-2">
                        <span className="font-medium text-gray-700">{profile.insights.customerSource}</span>
                        <span className="text-gray-500">مصدر اكتساب العميل</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Tier progression */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                  <h3 className="text-sm font-bold text-gray-700 mb-3">⭐ مستوى العميل</h3>
                  <div className="flex gap-2 mb-3">
                    {(['برونزي', 'فضي', 'ذهبي', 'بلاتيني'] as const).map((t) => (
                      <div key={t} className={`flex-1 text-center py-2 rounded-lg text-xs font-medium ${profile.insights.tier === t ? TIER_COLORS[t] + ' ring-2 ring-offset-1 ring-gray-400' : 'bg-gray-100 text-gray-400'}`}>
                        {t}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 text-center">
                    {profile.insights.tier === 'برونزي' && `${5 - profile.stats.completedOrders} طلب حتى الفضي`}
                    {profile.insights.tier === 'فضي' && `${10 - profile.stats.completedOrders} طلب حتى الذهبي`}
                    {profile.insights.tier === 'ذهبي' && `${20 - profile.stats.completedOrders} طلب حتى البلاتيني`}
                    {profile.insights.tier === 'بلاتيني' && '🏆 أعلى مستوى — عميل VIP'}
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* ── Add Customer Modal ─────────────────────────────────────────── */}
      {showAdd && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !creating && setShowAdd(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()} dir="rtl">
            <h3 className="text-lg font-bold text-gray-900 mb-4">إضافة عميل جديد</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">اسم العميل *</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">رقم الهاتف *</label>
                <input
                  type="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="01XXXXXXXXX"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">رصيد المحفظة (اختياري)</label>
                <input
                  type="number"
                  value={newWallet}
                  onChange={(e) => setNewWallet(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                disabled={creating}
                className="px-4 py-2 text-sm rounded bg-gray-100 hover:bg-gray-200 text-gray-700"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleCreateCustomer}
                disabled={creating}
                className="px-4 py-2 text-sm rounded bg-red-600 hover:bg-red-700 text-white font-bold disabled:opacity-60"
              >
                {creating ? '⏳ جاري الحفظ...' : 'حفظ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
