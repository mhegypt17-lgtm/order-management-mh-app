'use client'

import { useEffect, useMemo, useState } from 'react'

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
  stockStatus?: 'available' | 'low' | 'out'
  stockQuantity?: number | null
  stockUpdatedAt?: string | null
}

function stockBadge(p: Product) {
  const s = p.stockStatus || 'available'
  if (s === 'out') return { cls: 'bg-red-100 text-red-700 border-red-300', label: '⛔ غير متاح' }
  if (s === 'low') return { cls: 'bg-amber-100 text-amber-800 border-amber-300', label: '⚠️ مخزون منخفض' }
  return { cls: 'bg-green-100 text-green-700 border-green-300', label: '✅ متاح' }
}

export default function CSProductsPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [products, setProducts] = useState<Product[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)

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

  const categories = useMemo(() => {
    const cats = new Set<string>()
    products.forEach(p => {
      if (p.productCategory) cats.add(p.productCategory)
    })
    return Array.from(cats).sort()
  }, [products])

  const filteredProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()

    return products.filter((p) => {
      const matchesSearch = !term || (
        String(p.productName || '').toLowerCase().includes(term) ||
        String(p.productCategory || '').toLowerCase().includes(term) ||
        String(p.packagingType || '').toLowerCase().includes(term)
      )
      
      const matchesCategory = !selectedCategory || p.productCategory === selectedCategory

      return matchesSearch && matchesCategory
    })
  }, [products, searchTerm, selectedCategory])

  const stats = {
    total: products.length,
    active: filteredProducts.length,
  }

  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">📦 المنتجات</h1>
            <p className="text-gray-600 mt-1">قائمة المنتجات المتاحة لإنشاء الطلبات</p>
          </div>
          <button
            onClick={fetchProducts}
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold transition w-fit"
          >
            🔄 تحديث المنتجات
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4 text-center">
            <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
            <div className="text-sm text-gray-600">المجموع</div>
          </div>
          <div className="bg-blue-50 rounded-lg shadow p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{stats.active}</div>
            <div className="text-sm text-gray-600">معروضة</div>
          </div>
          <div className="bg-purple-50 rounded-lg shadow p-4 text-center">
            <div className="text-2xl font-bold text-purple-600">{categories.length}</div>
            <div className="text-sm text-gray-600">تصنيفات</div>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="bg-white rounded-lg shadow p-4 mb-6 space-y-3">
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="بحث باسم المنتج أو التصنيف أو التغليف"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
            dir="rtl"
          />

          {categories.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedCategory('')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  selectedCategory === ''
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                الكل ({stats.active})
              </button>
              {categories.map((cat) => {
                const count = products.filter(p => p.productCategory === cat).length
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                      selectedCategory === cat
                        ? 'bg-red-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {cat} ({count})
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Products Table */}
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          {isLoading ? (
            <div className="p-8 text-center text-gray-500">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600 mx-auto mb-2"></div>
              جاري تحميل المنتجات...
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <p className="text-lg">📭 لا توجد منتجات مطابقة</p>
              <p className="text-sm mt-1">حاول تغيير معايير البحث أو الفلاتر</p>
            </div>
          ) : (
            <table className="w-full min-w-[1450px] text-sm">
              <thead className="bg-gray-100 border-b-2 border-gray-200 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">المنتج</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">التصنيف</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">التوفر</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">الحالة</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">التغليف</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-700">الوزن (جم)</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">السعر</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">سعر البرومو</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">نسبة الدهون/ملاحظات</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">الوصف</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">أفضل الوصفات</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-700">يتغير يوميا</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-700">بالحجز</th>
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
                      <td className="px-4 py-3 text-gray-900 font-semibold">{product.productName}</td>
                      <td className="px-4 py-3 text-gray-700">{product.productCategory || '-'}</td>
                      <td className="px-4 py-3">
                        {(() => { const b = stockBadge(product); return (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${b.cls}`}>{b.label}</span>
                        )})()}
                      </td>
                      <td className="px-4 py-3">
                        {product.productCondition ? (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${conditionColor}`}>
                            {product.productCondition}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{product.packagingType || '-'}</td>
                      <td className="px-4 py-3 text-center text-gray-700">{product.weightGrams}</td>
                      <td className="px-4 py-3 text-gray-900 font-medium">
                        {Number(product.basePrice || 0).toLocaleString()} ج.م
                      </td>
                      <td className="px-4 py-3">
                        {hasOffer ? (
                          <div>
                            <span className="text-red-600 font-bold">
                              {Number(product.offerPrice).toLocaleString()} ج.م
                            </span>
                            <span className="text-xs text-gray-500 block">
                              -{(((product.basePrice - product.offerPrice!) / product.basePrice) * 100).toFixed(0)}%
                            </span>
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700 max-w-xs truncate" title={product.fatRatioComments || '-'}>
                        {product.fatRatioComments || '-'}
                      </td>
                      <td className="px-4 py-3 text-gray-700 max-w-xs truncate" title={product.description || '-'}>
                        {product.description || '-'}
                      </td>
                      <td className="px-4 py-3 text-gray-700 max-w-xs truncate" title={product.bestRecipes || '-'}>
                        {product.bestRecipes || '-'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {product.hasDailyPriceChange ? (
                          <span className="text-orange-500 font-bold text-base">✓</span>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
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

        {/* Footer Info */}
        {filteredProducts.length > 0 && (
          <div className="mt-4 text-center text-sm text-gray-600">
            يتم عرض {filteredProducts.length} من {stats.total} منتج
          </div>
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
            {/* Modal Header */}
            <div className="bg-red-600 text-white px-6 py-4 rounded-t-2xl flex items-center justify-between">
              <h2 className="text-xl font-bold">{selectedProduct.productName}</h2>
              <button
                onClick={() => setSelectedProduct(null)}
                className="text-white hover:text-red-200 text-2xl leading-none"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
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

              {/* Flags row */}
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

              {/* Fat ratio */}
              {selectedProduct.fatRatioComments && (
                <div className="bg-yellow-50 rounded-lg p-3">
                  <div className="text-gray-500 text-xs mb-1">نسبة الدهون / ملاحظات</div>
                  <div className="text-gray-900 text-sm">{selectedProduct.fatRatioComments}</div>
                </div>
              )}

              {/* Description */}
              {selectedProduct.description && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-gray-500 text-xs mb-1">الوصف</div>
                  <div className="text-gray-900 text-sm">{selectedProduct.description}</div>
                </div>
              )}

              {/* Best Recipes */}
              {selectedProduct.bestRecipes && (
                <div className="bg-red-50 rounded-lg p-3">
                  <div className="text-gray-500 text-xs mb-1">🍽️ أفضل الوصفات</div>
                  <div className="text-gray-900 text-sm">{selectedProduct.bestRecipes}</div>
                </div>
              )}

              {/* Stock status (read-only for CS) */}
              <div className="bg-orange-50 rounded-lg p-3 border border-orange-200">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-bold text-orange-900">📦 حالة المخزون</h3>
                  {(() => { const b = stockBadge(selectedProduct); return (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${b.cls}`}>{b.label}</span>
                  )})()}
                </div>
                {selectedProduct.stockQuantity != null && (
                  <p className="text-sm text-gray-700">عدد القطع المتاحة: <strong>{selectedProduct.stockQuantity}</strong></p>
                )}
                {selectedProduct.stockUpdatedAt && (
                  <p className="text-[11px] text-gray-500 mt-1">آخر تحديث من الفرع: {new Date(selectedProduct.stockUpdatedAt).toLocaleString('ar-EG')}</p>
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
