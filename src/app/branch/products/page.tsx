'use client'

import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/lib/auth'

type StockStatus = 'available' | 'low' | 'out'

type Product = {
  id: string
  productName: string
  productCategory?: string
  packagingType?: string
  weightGrams: number
  offerPrice: number | null
  basePrice: number
  isActive: boolean
  productCondition?: 'فريش' | 'مبردة' | 'مجمد'
  fatRatioComments?: string
  isStandardPackage?: boolean
  hasDailyPriceChange?: boolean
  isByReservation?: boolean
  description?: string
  bestRecipes?: string
  stockStatus?: StockStatus
  stockQuantity?: number | null
  stockUpdatedAt?: string | null
  stockUpdatedBy?: string | null
}

function stockBadge(p: Product) {
  const s = p.stockStatus || 'available'
  if (s === 'out') return { cls: 'bg-red-100 text-red-700 border-red-300', label: '⛔ غير متاح' }
  if (s === 'low') return { cls: 'bg-amber-100 text-amber-800 border-amber-300', label: '⚠️ مخزون منخفض' }
  return { cls: 'bg-green-100 text-green-700 border-green-300', label: '✅ متاح' }
}

export default function BranchProductsPage() {
  const { user } = useAuthStore()
  const [isLoading, setIsLoading] = useState(true)
  const [products, setProducts] = useState<Product[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [stockFilter, setStockFilter] = useState<'all' | StockStatus>('all')
  const [stockEditStatus, setStockEditStatus] = useState<StockStatus>('available')
  const [stockEditQty, setStockEditQty] = useState<string>('')
  const [savingStock, setSavingStock] = useState(false)

  const role = (user?.role || 'branch') as 'branch' | 'admin' | 'cs'
  const canEditStock = role === 'branch' || role === 'admin'

  const fetchProducts = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/products')
      const data = await res.json()
      const active = (data.products || []).filter((p: Product) => p.isActive)
      setProducts(active)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchProducts()
  }, [])

  const filteredProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return products.filter((p) => {
      const matchesSearch = !term || (
        String(p.productName || '').toLowerCase().includes(term) ||
        String(p.productCategory || '').toLowerCase().includes(term) ||
        String(p.packagingType || '').toLowerCase().includes(term)
      )
      const matchesStock = stockFilter === 'all' || (p.stockStatus || 'available') === stockFilter
      return matchesSearch && matchesStock
    })
  }, [products, searchTerm, stockFilter])

  // Sync modal edit fields when a product is opened
  useEffect(() => {
    if (selectedProduct) {
      setStockEditStatus((selectedProduct.stockStatus || 'available') as StockStatus)
      setStockEditQty(selectedProduct.stockQuantity != null ? String(selectedProduct.stockQuantity) : '')
    }
  }, [selectedProduct])

  const stockCounts = useMemo(() => ({
    all: products.length,
    available: products.filter((p) => (p.stockStatus || 'available') === 'available').length,
    low: products.filter((p) => p.stockStatus === 'low').length,
    out: products.filter((p) => p.stockStatus === 'out').length,
  }), [products])

  const saveStock = async () => {
    if (!selectedProduct) return
    if (!canEditStock) {
      toast.error('غير مسموح')
      return
    }
    setSavingStock(true)
    try {
      const res = await fetch('/api/products/stock', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedProduct.id,
          stockStatus: stockEditStatus,
          stockQuantity: stockEditQty === '' ? null : Number(stockEditQty),
          role,
          actor: user?.name || role,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error || 'failed')
      }
      const data = await res.json()
      const updated = data.product as Product
      setProducts((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)))
      setSelectedProduct(updated)
      toast.success('تم تحديث حالة المخزون')
    } catch (e: any) {
      toast.error(e?.message || 'تعذر حفظ حالة المخزون')
    } finally {
      setSavingStock(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">📦 المنتجات</h1>
          <p className="text-gray-600 mt-1">قائمة المنتجات المتاحة للفرع</p>
        </div>
        <button
          onClick={fetchProducts}
          className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold"
        >
          تحديث المنتجات
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
        <input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="بحث باسم المنتج أو التصنيف أو التغليف"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
          dir="rtl"
        />
        <div className="flex flex-wrap gap-2">
          {([
            { key: 'all', label: `الكل (${stockCounts.all})`, cls: 'bg-gray-100 text-gray-700' },
            { key: 'available', label: `✅ متاح (${stockCounts.available})`, cls: 'bg-green-100 text-green-700' },
            { key: 'low', label: `⚠️ منخفض (${stockCounts.low})`, cls: 'bg-amber-100 text-amber-800' },
            { key: 'out', label: `⛔ غير متاح (${stockCounts.out})`, cls: 'bg-red-100 text-red-700' },
          ] as const).map((b) => (
            <button
              key={b.key}
              onClick={() => setStockFilter(b.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition ${stockFilter === b.key ? `${b.cls} border-current` : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">⏳ جاري تحميل المنتجات...</div>
        ) : filteredProducts.length === 0 ? (
          <div className="p-8 text-center text-gray-500">📭 لا توجد منتجات مطابقة</div>
        ) : (
          <table className="w-full min-w-[1450px] text-sm">
            <thead className="bg-gray-100 border-b border-gray-200">
              <tr>
                <th className="px-3 py-2 text-right">المنتج</th>
                <th className="px-3 py-2 text-right">التصنيف</th>
                <th className="px-3 py-2 text-right">التوفر</th>
                <th className="px-3 py-2 text-right">الحالة</th>
                <th className="px-3 py-2 text-right">التغليف</th>
                <th className="px-3 py-2 text-center">الوزن (جم)</th>
                <th className="px-3 py-2 text-right">السعر</th>
                <th className="px-3 py-2 text-right">سعر البرومو</th>
                <th className="px-3 py-2 text-right">نسبة الدهون/ملاحظات</th>
                <th className="px-3 py-2 text-right">الوصف</th>
                <th className="px-3 py-2 text-right">أفضل الوصفات</th>
                <th className="px-3 py-2 text-center">يتغير يوميا</th>
                <th className="px-3 py-2 text-center">بالحجز</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => {
                const hasOffer = product.offerPrice && product.offerPrice < product.basePrice
                const conditionColor =
                  product.productCondition === 'فريش'
                    ? 'bg-green-100 text-green-700'
                    : product.productCondition === 'مبردة'
                    ? 'bg-blue-100 text-blue-700'
                    : product.productCondition === 'مجمد'
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'bg-gray-100 text-gray-500'
                return (
                  <tr
                    key={product.id}
                    className="border-b border-gray-100 hover:bg-red-50 transition cursor-pointer"
                    onClick={() => setSelectedProduct(product)}
                    title="انقر لعرض تفاصيل المنتج"
                  >
                    <td className="px-3 py-2 text-gray-900 font-semibold">{product.productName}</td>
                    <td className="px-3 py-2 text-gray-700">{product.productCategory || '-'}</td>
                    <td className="px-3 py-2">
                      {(() => { const b = stockBadge(product); return (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${b.cls}`}>{b.label}</span>
                      )})()}
                    </td>
                    <td className="px-3 py-2">
                      {product.productCondition ? (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${conditionColor}`}>
                          {product.productCondition}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-3 py-2 text-gray-700">{product.packagingType || '-'}</td>
                    <td className="px-3 py-2 text-center text-gray-700" dir="ltr">{product.weightGrams}</td>
                    <td className="px-3 py-2 text-gray-900 font-semibold">
                      {Number(product.basePrice ?? 0).toLocaleString()} ج.م
                    </td>
                    <td className="px-3 py-2 text-red-600 font-semibold">
                      {hasOffer ? (
                        <div>
                          <div>{Number(product.offerPrice).toLocaleString()} ج.م</div>
                          <div className="text-xs text-gray-500">
                            -{(((product.basePrice - product.offerPrice!) / product.basePrice) * 100).toFixed(0)}%
                          </div>
                        </div>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-700 max-w-xs truncate" title={product.fatRatioComments || '-'}>
                      {product.fatRatioComments || '-'}
                    </td>
                    <td className="px-3 py-2 text-gray-700 max-w-xs truncate" title={product.description || '-'}>
                      {product.description || '-'}
                    </td>
                    <td className="px-3 py-2 text-gray-700 max-w-xs truncate" title={product.bestRecipes || '-'}>
                      {product.bestRecipes || '-'}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {product.hasDailyPriceChange ? (
                        <span className="text-orange-500 font-bold text-base">✓</span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {product.isByReservation ? (
                        <span className="text-blue-500 font-bold text-base">✓</span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Product Detail Modal */}
      {selectedProduct && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedProduct(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
          >
            <div className="bg-red-600 text-white px-6 py-4 rounded-t-2xl flex items-center justify-between">
              <h2 className="text-xl font-bold">{selectedProduct.productName}</h2>
              <button
                onClick={() => setSelectedProduct(null)}
                className="text-white hover:text-red-200 text-2xl leading-none"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-gray-500 text-xs mb-1">التصنيف</div>
                  <div className="font-semibold text-gray-900">{selectedProduct.productCategory || '-'}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-gray-500 text-xs mb-1">الحالة</div>
                  <div className="font-semibold text-gray-900">{selectedProduct.productCondition || '-'}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-gray-500 text-xs mb-1">التغليف</div>
                  <div className="font-semibold text-gray-900">{selectedProduct.packagingType || '-'}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-gray-500 text-xs mb-1">الوزن (جم)</div>
                  <div className="font-semibold text-gray-900">{selectedProduct.weightGrams}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-gray-500 text-xs mb-1">السعر الأساسي</div>
                  <div className="font-bold text-gray-900 text-base">{Number(selectedProduct.basePrice || 0).toLocaleString()} ج.م</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-gray-500 text-xs mb-1">سعر البرومو</div>
                  {selectedProduct.offerPrice && selectedProduct.offerPrice < selectedProduct.basePrice ? (
                    <div>
                      <div className="font-bold text-red-600 text-base">{Number(selectedProduct.offerPrice).toLocaleString()} ج.م</div>
                      <div className="text-xs text-gray-500">
                        خصم {(((selectedProduct.basePrice - selectedProduct.offerPrice) / selectedProduct.basePrice) * 100).toFixed(0)}%
                      </div>
                    </div>
                  ) : (
                    <div className="text-gray-400">لا يوجد</div>
                  )}
                </div>
              </div>
              <div className="flex gap-3 flex-wrap">
                {selectedProduct.isStandardPackage && (
                  <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-medium">✓ تعبئة قياسية</span>
                )}
                {selectedProduct.hasDailyPriceChange && (
                  <span className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-xs font-medium">⚡ سعر يتغير يوميا</span>
                )}
                {selectedProduct.isByReservation && (
                  <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-medium">📅 بالحجز</span>
                )}
              </div>
              {selectedProduct.fatRatioComments && (
                <div className="bg-yellow-50 rounded-lg p-3">
                  <div className="text-gray-500 text-xs mb-1">نسبة الدهون / ملاحظات</div>
                  <div className="text-gray-900 text-sm">{selectedProduct.fatRatioComments}</div>
                </div>
              )}
              {selectedProduct.description && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-gray-500 text-xs mb-1">الوصف</div>
                  <div className="text-gray-900 text-sm">{selectedProduct.description}</div>
                </div>
              )}
              {selectedProduct.bestRecipes && (
                <div className="bg-red-50 rounded-lg p-3">
                  <div className="text-gray-500 text-xs mb-1">🍽️ أفضل الوصفات</div>
                  <div className="text-gray-900 text-sm">{selectedProduct.bestRecipes}</div>
                </div>
              )}

              {/* Stock control (branch/admin only) */}
              <div className="bg-orange-50 rounded-xl p-4 border-2 border-orange-200">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <h3 className="text-sm font-bold text-orange-900">📦 حالة المخزون</h3>
                  {(() => { const b = stockBadge(selectedProduct); return (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${b.cls}`}>{b.label}</span>
                  )})()}
                </div>
                {canEditStock ? (
                  <>
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      {([
                        { v: 'available', label: '✅ متاح', cls: 'border-green-400 bg-green-100 text-green-800' },
                        { v: 'low', label: '⚠️ منخفض', cls: 'border-amber-400 bg-amber-100 text-amber-800' },
                        { v: 'out', label: '⛔ غير متاح', cls: 'border-red-400 bg-red-100 text-red-700' },
                      ] as const).map((opt) => (
                        <button
                          key={opt.v}
                          type="button"
                          onClick={() => {
                            setStockEditStatus(opt.v)
                            if (opt.v === 'out') setStockEditQty('0')
                          }}
                          className={`px-2 py-2 rounded-lg text-xs font-bold border-2 transition ${stockEditStatus === opt.v ? opt.cls + ' ring-2 ring-offset-1 ring-orange-300' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <label className="block text-xs text-gray-700 mb-1 text-right">
                      عدد القطع المتاحة (اختياري — يظهر فقط داخل تفاصيل المنتج)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={stockEditQty}
                      onChange={(e) => setStockEditQty(e.target.value)}
                      disabled={stockEditStatus === 'out'}
                      placeholder="مثال: 12"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-right disabled:bg-gray-100 disabled:opacity-60"
                    />
                    <button
                      type="button"
                      onClick={saveStock}
                      disabled={savingStock}
                      className="mt-3 w-full py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-bold disabled:opacity-50"
                    >
                      {savingStock ? 'جاري الحفظ...' : '💾 حفظ حالة المخزون'}
                    </button>
                    {selectedProduct.stockUpdatedAt && (
                      <p className="text-[11px] text-gray-500 mt-2 text-right">
                        آخر تحديث: {new Date(selectedProduct.stockUpdatedAt).toLocaleString('ar-EG')}
                        {selectedProduct.stockUpdatedBy ? ` · بواسطة ${selectedProduct.stockUpdatedBy}` : ''}
                      </p>
                    )}
                  </>
                ) : (
                  <div className="text-sm text-gray-700">
                    {selectedProduct.stockQuantity != null && (
                      <p>عدد القطع المتاحة: <strong>{selectedProduct.stockQuantity}</strong></p>
                    )}
                    {selectedProduct.stockUpdatedAt && (
                      <p className="text-[11px] text-gray-500 mt-1">
                        آخر تحديث: {new Date(selectedProduct.stockUpdatedAt).toLocaleString('ar-EG')}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="px-6 pb-4">
              <button
                onClick={() => setSelectedProduct(null)}
                className="w-full py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium transition"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
