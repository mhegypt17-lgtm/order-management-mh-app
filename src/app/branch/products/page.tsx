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
  isTargeted?: boolean
  productCondition?: 'فريش' | 'مبردة' | 'مجمد'
  fatRatioComments?: string
  isStandardPackage?: boolean
  hasDailyPriceChange?: boolean
  isByReservation?: boolean
  description?: string
  bestRecipes?: string
}

export default function BranchProductsPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [products, setProducts] = useState<Product[]>([])
  const [searchTerm, setSearchTerm] = useState('')
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

  const filteredProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) return products

    return products.filter((p) => {
      return (
        String(p.productName || '').toLowerCase().includes(term) ||
        String(p.productCategory || '').toLowerCase().includes(term) ||
        String(p.packagingType || '').toLowerCase().includes(term)
      )
    })
  }, [products, searchTerm])

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

      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="بحث باسم المنتج أو التصنيف أو التغليف"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
          dir="rtl"
        />
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
                <th className="px-3 py-2 text-center">🎯</th>
                <th className="px-3 py-2 text-right">المنتج</th>
                <th className="px-3 py-2 text-right">التصنيف</th>
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
                    className={`border-b border-gray-100 hover:bg-red-50 transition cursor-pointer ${product.isTargeted ? 'bg-amber-50/40' : ''}`}
                    onClick={() => setSelectedProduct(product)}
                    title="انقر لعرض تفاصيل المنتج"
                  >
                    <td className="px-3 py-2 text-center">
                      {product.isTargeted ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500 text-white" title="منتج مستهدف">🎯</span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-900 font-semibold">{product.productName}</td>
                    <td className="px-3 py-2 text-gray-700">{product.productCategory || '-'}</td>
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
