'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { useProductCategories } from '@/lib/useProductCategories'

export interface Product {
  id?: string
  productName: string
  productDescription: string
  bestRecipes: string
  productCategory: string
  fatRatioComments: string
  isStandardPackage: boolean
  packagingType: string
  weightGrams: number
  basePrice: number
  offerPrice: number | null
  hasDailyPriceChange: boolean
  isByReservation: boolean
  productCondition: 'فريش' | 'مبردة' | 'مجمد'
  isActive: boolean
  isTargeted?: boolean
  /** 'unit' = sold per piece (basePrice is price per piece). 'weight' = sold per kilo (basePrice is price per kg, branch weighs each piece). */
  pricingMode?: 'unit' | 'weight'
  stockStatus?: 'available' | 'low' | 'out'
  stockQuantity?: number | null
}

type StockStatus = 'available' | 'low' | 'out'

export default function ProductCatalogPage() {
  const { activeCategories, compareCategories } = useProductCategories()
  const [products, setProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [showTargetedOnly, setShowTargetedOnly] = useState(false)
  const [showWeightOnly, setShowWeightOnly] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [stockFilter, setStockFilter] = useState<'all' | StockStatus>('all')
  const [sortBy, setSortBy] = useState<'default' | 'category' | 'name' | 'priceAsc' | 'priceDesc'>('default')
  const [formData, setFormData] = useState<Product>({
    productName: '',
    productDescription: '',
    bestRecipes: '',
    productCategory: '',
    fatRatioComments: '',
    isStandardPackage: false,
    packagingType: 'فاكيوم',
    weightGrams: 0,
    basePrice: 0,
    offerPrice: null,
    hasDailyPriceChange: false,
    isByReservation: false,
    productCondition: 'فريش',
    isActive: true,
    isTargeted: false,
    pricingMode: 'unit',
  })

  useEffect(() => {
    fetchProducts()
  }, [])

  const fetchProducts = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/products')
      const data = await res.json()
      const normalizedProducts = (data.products || []).map((product: Product) => ({
        ...product,
        productCategory: product.productCategory || 'غير محدد',
        packagingType: product.packagingType || 'غير محدد',
        productDescription: product.productDescription || '',
        bestRecipes: product.bestRecipes || '',
        fatRatioComments: product.fatRatioComments || '',
        isStandardPackage: Boolean(product.isStandardPackage),
        hasDailyPriceChange: Boolean(product.hasDailyPriceChange),
        isByReservation: Boolean(product.isByReservation),
        isTargeted: Boolean(product.isTargeted),
        pricingMode: product.pricingMode === 'weight' ? 'weight' : 'unit',
      }))
      setProducts(normalizedProducts)
    } catch (error) {
      toast.error('خطأ في تحميل المنتجات')
      console.error(error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleOpenModal = (product?: Product) => {
    if (product) {
      setFormData({
        productName: '',
        productDescription: '',
        bestRecipes: '',
        productCategory: '',
        fatRatioComments: '',
        isStandardPackage: false,
        packagingType: 'فاكيوم',
        weightGrams: 0,
        basePrice: 0,
        offerPrice: null,
        hasDailyPriceChange: false,
        isByReservation: false,
        productCondition: 'فريش',
        isActive: true,
        isTargeted: false,
        pricingMode: 'unit',
        ...product,
      })
      setEditingId(product.id || null)
    } else {
      setFormData({
        productName: '',
        productDescription: '',
        bestRecipes: '',
        productCategory: '',
        fatRatioComments: '',
        isStandardPackage: false,
        packagingType: 'فاكيوم',
        weightGrams: 0,
        basePrice: 0,
        offerPrice: null,
        hasDailyPriceChange: false,
        isByReservation: false,
        productCondition: 'فريش',
        isActive: true,
        isTargeted: false,
        pricingMode: 'unit',
      })
      setEditingId(null)
    }
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingId(null)
  }

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target
    const checked = (e.target as HTMLInputElement).checked

    setFormData((prev) => ({
      ...prev,
      [name]:
        type === 'checkbox'
          ? checked
          : type === 'number'
          ? value === ''
            ? 0
            : parseFloat(value)
          : value,
    }))
  }

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.productName.trim()) {
      toast.error('اسم المنتج مطلوب')
      return
    }

    if (!formData.productCategory || !formData.productCategory.trim()) {
      toast.error('يرجى اختيار التصنيف')
      return
    }

    if (formData.basePrice <= 0) {
      toast.error('السعر الأساسي يجب أن يكون أكبر من 0')
      return
    }

    try {
      const method = editingId ? 'PUT' : 'POST'
      const res = await fetch('/api/products', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          id: editingId,
        }),
      })

      if (!res.ok) throw new Error('Failed to save')

      toast.success(editingId ? '✅ تم تحديث المنتج' : '✅ تم إضافة المنتج')
      handleCloseModal()
      fetchProducts()
    } catch (error) {
      toast.error('خطأ في حفظ المنتج')
      console.error(error)
    }
  }

  const handleDeleteProduct = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا المنتج؟')) return

    try {
      const res = await fetch('/api/products', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })

      if (!res.ok) throw new Error('Failed to delete')

      toast.success('✅ تم حذف المنتج')
      fetchProducts()
    } catch (error) {
      toast.error('خطأ في حذف المنتج')
      console.error(error)
    }
  }

  const handleToggleActive = async (product: Product) => {
    try {
      const updatedProduct = { ...product, isActive: !product.isActive }
      const res = await fetch('/api/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedProduct),
      })

      if (!res.ok) throw new Error('Failed to update')

      toast.success('✅ تم تحديث حالة المنتج')
      fetchProducts()
    } catch (error) {
      toast.error('خطأ في تحديث حالة المنتج')
      console.error(error)
    }
  }

  const handleToggleTargeted = async (product: Product) => {
    try {
      const updatedProduct = { ...product, isTargeted: !product.isTargeted }
      const res = await fetch('/api/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedProduct),
      })
      if (!res.ok) throw new Error('Failed to update')
      toast.success(
        updatedProduct.isTargeted
          ? '🎯 تم تحديد كمنتج مستهدف'
          : '➖ تم الغاء الاستهداف',
      )
      fetchProducts()
    } catch (error) {
      toast.error('خطأ في تحديث حالة الاستهداف')
      console.error(error)
    }
  }

  /**
   * Inline-update a single field (price/offer) on a product without opening
   * the full edit modal. Optimistically mutates local state so the UI reflects
   * the new value instantly; rolls back + toasts on server error.
   */
  const saveProductField = async (
    product: Product,
    patch: Partial<Pick<Product, 'basePrice' | 'offerPrice'>>,
  ): Promise<boolean> => {
    const before = { ...product }
    const updated: Product = { ...product, ...patch }
    setProducts((prev) =>
      prev.map((p) => (p.id === product.id ? updated : p)),
    )
    try {
      const res = await fetch('/api/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      })
      if (!res.ok) throw new Error('Failed to update')
      toast.success('💰 تم تحديث السعر')
      return true
    } catch (err) {
      console.error(err)
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? before : p)),
      )
      toast.error('تعذر حفظ السعر — تم التراجع')
      return false
    }
  }

  const filteredProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    const list = products.filter((p) => {
      if (showTargetedOnly && !p.isTargeted) return false
      if (showWeightOnly && p.pricingMode !== 'weight') return false
      if (selectedCategory && p.productCategory !== selectedCategory) return false
      if (stockFilter !== 'all' && (p.stockStatus || 'available') !== stockFilter) return false
      if (!term) return true
      return (
        String(p.productName || '').toLowerCase().includes(term) ||
        String(p.productCategory || '').toLowerCase().includes(term) ||
        String(p.packagingType || '').toLowerCase().includes(term)
      )
    })
    const priceOf = (p: Product) => (p.offerPrice && p.offerPrice > 0 ? p.offerPrice : p.basePrice)
    const cmp = (a: string, b: string) => a.localeCompare(b, 'ar')
    if (sortBy === 'category') {
      return [...list].sort((a, b) => compareCategories(a.productCategory, b.productCategory) || cmp(a.productName, b.productName))
    }
    if (sortBy === 'name') return [...list].sort((a, b) => cmp(a.productName, b.productName))
    if (sortBy === 'priceAsc') return [...list].sort((a, b) => priceOf(a) - priceOf(b))
    if (sortBy === 'priceDesc') return [...list].sort((a, b) => priceOf(b) - priceOf(a))
    return list
  }, [products, searchTerm, showTargetedOnly, showWeightOnly, selectedCategory, stockFilter, sortBy])

  const targetedCount = useMemo(() => products.filter((p) => p.isTargeted).length, [products])
  const weightCount = useMemo(() => products.filter((p) => p.pricingMode === 'weight').length, [products])
  const categories = useMemo(() => {
    const cats = new Set<string>()
    products.forEach((p) => { if (p.productCategory) cats.add(p.productCategory) })
    return Array.from(cats).sort(compareCategories)
  }, [products])
  const stockCounts = useMemo(() => ({
    all: products.length,
    available: products.filter((p) => (p.stockStatus || 'available') === 'available').length,
    low: products.filter((p) => p.stockStatus === 'low').length,
    out: products.filter((p) => p.stockStatus === 'out').length,
  }), [products])
  const stats = { total: products.length, active: filteredProducts.length }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">📦 المنتجات</h1>
          <p className="text-gray-600 mt-1">إدارة كتالوج المنتجات</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-6 rounded-lg transition flex items-center space-x-2 rtl:space-x-reverse"
        >
          <span>➕</span>
          <span>إضافة منتج جديد</span>
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
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

      {/* Search / Sort / Filters */}
      <div className="bg-white rounded-lg shadow p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          <input
            type="text"
            placeholder="بحث باسم المنتج أو التصنيف أو التغليف"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-right"
            dir="rtl"
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500"
            dir="rtl"
            title="ترتيب المنتجات"
          >
            <option value="default">↕️ الترتيب الافتراضي</option>
            <option value="category">📂 حسب التصنيف</option>
            <option value="name">🔤 حسب الاسم</option>
            <option value="priceAsc">💰 السعر تصاعدي</option>
            <option value="priceDesc">💰 السعر تنازلي</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowTargetedOnly((v) => !v)}
            className={`px-3 py-1.5 rounded-lg text-sm font-bold transition border ${
              showTargetedOnly
                ? 'bg-amber-500 text-white border-amber-500'
                : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
            }`}
            title="عرض المنتجات المستهدفة فقط"
          >
            🎯 المستهدفة فقط ({targetedCount})
          </button>
          <button
            type="button"
            onClick={() => setShowWeightOnly((v) => !v)}
            className={`px-3 py-1.5 rounded-lg text-sm font-bold transition border ${
              showWeightOnly
                ? 'bg-orange-500 text-white border-orange-500'
                : 'bg-orange-50 text-orange-800 border-orange-300 hover:bg-orange-100'
            }`}
            title="عرض المنتجات التي تُسعّر بالوزن فقط"
          >
            ⚖️ بالوزن فقط ({weightCount})
          </button>
        </div>

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
              الكل ({products.length})
            </button>
            {categories.map((cat) => {
              const count = products.filter((p) => p.productCategory === cat).length
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

      {/* Products Table */}
      <div className="bg-white rounded-lg shadow overflow-x-auto">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">
            ⏳ جاري التحميل...
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {searchTerm ? '❌ لا توجد نتائج' : '📭 لا توجد منتجات حتى الآن'}
          </div>
        ) : (
          <table className="w-full min-w-[1600px]">
            <thead className="bg-gray-100 border-b border-gray-300">
              <tr>
                <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                  اسم المنتج
                </th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                  الفئة
                </th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                  السعر
                </th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                  سعر البرومو
                </th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                  نسبة الدهون/ملاحظات
                </th>
                <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900">
                  تعبئة قياسية
                </th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                  التغليف
                </th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                  الوزن (جم)
                </th>
                <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900">
                  يتغير يوميا
                </th>
                <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900">
                  بالحجز
                </th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                  الوصف
                </th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                  أفضل الوصفات
                </th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                  الحالة
                </th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                  نشط
                </th>
                <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900">
                  🎯 مستهدف
                </th>
                <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900">
                  الإجراءات
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredProducts.map((product) => (
                <tr
                  key={product.id || product.productName}
                  className="hover:bg-gray-50 transition cursor-pointer"
                  onClick={() => handleOpenModal(product)}
                  title="اضغط لفتح تفاصيل المنتج"
                >
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    {product.productName}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700 font-medium">
                    {product.productCategory ? (
                      activeCategories.some((c) => c.name === product.productCategory) ? (
                        product.productCategory
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-300 text-xs"
                          title="تصنيف غير معروف — غير موجود في إعدادات التصنيفات"
                        >
                          ⚠️ {product.productCategory}
                        </span>
                      )
                    ) : (
                      '-'
                    )}
                  </td>
                  <td
                    className="px-6 py-4 text-sm text-gray-900 font-semibold"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <InlinePriceCell
                      value={product.basePrice}
                      allowNull={false}
                      onSave={(v) =>
                        saveProductField(product, { basePrice: v ?? 0 })
                      }
                    />
                    {product.pricingMode === 'weight' && (
                      <span className="mr-1 inline-flex items-center rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold px-1.5 py-0.5">بالكيلو</span>
                    )}
                  </td>
                  <td
                    className="px-6 py-4 text-sm text-green-600 font-semibold"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <InlinePriceCell
                      value={product.offerPrice}
                      allowNull
                      onSave={(v) => saveProductField(product, { offerPrice: v })}
                    />
                    {product.offerPrice && product.offerPrice < product.basePrice && (
                      <div className="text-xs text-gray-500 mt-1">
                        -{(((product.basePrice - product.offerPrice) / product.basePrice) * 100).toFixed(0)}%
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700 max-w-[180px] truncate" title={product.fatRatioComments || '-'}>
                    {product.fatRatioComments || '-'}
                  </td>
                  <td className="px-6 py-4 text-center text-sm text-gray-700">
                    {product.isStandardPackage ? 'نعم' : 'لا'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700 font-medium">
                    {product.packagingType || '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {product.weightGrams || '-'}
                  </td>
                  <td className="px-6 py-4 text-center text-sm text-gray-700">
                    {product.hasDailyPriceChange ? 'نعم' : 'لا'}
                  </td>
                  <td className="px-6 py-4 text-center text-sm text-gray-700">
                    {product.isByReservation ? 'نعم' : 'لا'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 max-w-[220px] truncate" title={product.productDescription || '-'}>
                    {product.productDescription || '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 max-w-[220px] truncate" title={product.bestRecipes || '-'}>
                    {product.bestRecipes || '-'}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800">
                      {product.productCondition}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={product.isActive}
                        onChange={() => handleToggleActive(product)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-5 h-5 rounded"
                      />
                      <span className="ml-2 text-sm text-gray-600 rtl:ml-0 rtl:mr-2">
                        {product.isActive ? '🟢' : '🔴'}
                      </span>
                    </label>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleToggleTargeted(product)
                      }}
                      className={`px-3 py-1 rounded-full text-xs font-semibold border transition ${
                        product.isTargeted
                          ? 'bg-amber-500 border-amber-500 text-white hover:bg-amber-600'
                          : 'bg-white border-gray-300 text-gray-500 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700'
                      }`}
                      title={product.isTargeted ? 'اضغط لإلغاء الاستهداف' : 'اضغط لتحديد كمستهدف'}
                    >
                      {product.isTargeted ? '🎯 مستهدف' : 'غير مستهدف'}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-sm flex items-center justify-center space-x-2 rtl:space-x-reverse">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleOpenModal(product)
                      }}
                      className="px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 transition font-medium"
                    >
                      ✏️ تعديل
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteProduct(product.id || '')
                      }}
                      className="px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 transition font-medium"
                    >
                      🗑️ حذف
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold text-gray-900 mb-4 text-right">
              {editingId ? '✏️ تعديل المنتج' : '➕ إضافة منتج جديد'}
            </h2>

            <form onSubmit={handleSaveProduct} className="space-y-4">
              {/* Product Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 text-right">
                  اسم المنتج *
                </label>
                <input
                  type="text"
                  name="productName"
                  value={formData.productName}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-right"
                  dir="rtl"
                  required
                />
              </div>

              {/* Product Category */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 text-right">
                  الفئة <span className="text-red-600">*</span>
                </label>
                <select
                  name="productCategory"
                  value={formData.productCategory}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-right"
                  dir="rtl"
                  required
                >
                  <option value="" disabled>-- اختر التصنيف --</option>
                  {/* If the saved category is no longer in the active list,
                      surface it as an explicit option so the user sees the
                      real stored value instead of the browser silently
                      displaying the first option. */}
                  {formData.productCategory &&
                    !activeCategories.some((c) => c.name === formData.productCategory) && (
                      <option value={formData.productCategory}>
                        ⚠️ {formData.productCategory} — (تصنيف غير معروف في الإعدادات)
                      </option>
                    )}
                  {activeCategories.map((cat) => (
                    <option key={cat.id} value={cat.name}>{cat.name}</option>
                  ))}
                </select>
                {formData.productCategory &&
                  !activeCategories.some((c) => c.name === formData.productCategory) && (
                    <p className="mt-1 text-xs text-amber-700 bg-amber-50 border border-amber-300 rounded px-2 py-1">
                      ⚠️ التصنيف الحالي «{formData.productCategory}» غير موجود في قائمة التصنيفات الفعّالة. اختر تصنيفاً صحيحاً
                      أو أضفه من{' '}
                      <Link href="/admin/settings/categories" className="underline font-medium">إعدادات → التصنيفات</Link>.
                    </p>
                  )}
              </div>

              {/* Pricing Mode */}
              <div className="rounded-lg border border-gray-200 p-3">
                <label className="block text-sm font-medium text-gray-700 mb-2 text-right">
                  طريقة التسعير
                </label>
                <div className="flex flex-wrap gap-3 text-sm" dir="rtl">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="pricingMode"
                      value="unit"
                      checked={(formData.pricingMode || 'unit') === 'unit'}
                      onChange={() => setFormData((prev) => ({ ...prev, pricingMode: 'unit' }))}
                    />
                    <span>بالقطعة (سعر ثابت)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="pricingMode"
                      value="weight"
                      checked={formData.pricingMode === 'weight'}
                      onChange={() => setFormData((prev) => ({ ...prev, pricingMode: 'weight' }))}
                    />
                    <span>بالوزن (السعر للكيلو)</span>
                  </label>
                </div>
                <p className="text-xs text-gray-500 mt-2 text-right">
                  {formData.pricingMode === 'weight'
                    ? 'سيتم احتساب سعر المنتج حسب الوزن الفعلي الذي يوزنه الفرع. أدخل سعر الكيلو في خانة السعر.'
                    : 'سعر ثابت لكل قطعة (الوضع الافتراضي).'}
                </p>
              </div>

              {/* Base Price */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 text-right">
                  {formData.pricingMode === 'weight' ? 'السعر للكيلو *' : 'السعر *'}
                </label>
                <input
                  type="number"
                  name="basePrice"
                  value={formData.basePrice === 0 ? '' : formData.basePrice}
                  onChange={handleInputChange}
                  onFocus={(e) => e.currentTarget.select()}
                  onClick={(e) => e.currentTarget.select()}
                  step={0.01}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-right"
                  dir="ltr"
                  required
                />
              </div>

              {/* Offer Price */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 text-right">
                  سعر البرومو
                </label>
                <input
                  type="number"
                  name="offerPrice"
                  value={formData.offerPrice || ''}
                  onChange={(e) => {
                    const value = e.target.value === '' ? null : parseFloat(e.target.value)
                    setFormData((prev) => ({ ...prev, offerPrice: value }))
                  }}
                  onFocus={(e) => e.currentTarget.select()}
                  onClick={(e) => e.currentTarget.select()}
                  step={0.01}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-right"
                  dir="ltr"
                />
              </div>

              {/* Fat Ratio / Comments */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 text-right">
                  نسبة الدهون / ملاحظات
                </label>
                <textarea
                  name="fatRatioComments"
                  value={formData.fatRatioComments}
                  onChange={handleInputChange}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-right"
                  dir="rtl"
                />
              </div>

              {/* Standard Package */}
              <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
                <label className="text-sm font-medium text-gray-700">تعبئة قياسية؟</label>
                <input
                  type="checkbox"
                  name="isStandardPackage"
                  checked={formData.isStandardPackage}
                  onChange={handleInputChange}
                  className="w-4 h-4 rounded"
                />
              </div>

              {/* Packaging */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 text-right">
                  نوع التغليف
                </label>
                <select
                  name="packagingType"
                  value={formData.packagingType}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-right"
                  dir="rtl"
                >
                  <option value="فاكيوم">فاكيوم</option>
                  <option value="أطباق">أطباق</option>
                  <option value="كلاهما">كلاهما</option>
                </select>
              </div>

              {/* Weight */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 text-right">
                  الوزن (جرام)
                </label>
                <input
                  type="number"
                  name="weightGrams"
                  value={formData.weightGrams}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-right"
                  dir="ltr"
                />
              </div>

              {/* Daily Price Change */}
              <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
                <label className="text-sm font-medium text-gray-700">سعره يتغير يوميا؟</label>
                <input
                  type="checkbox"
                  name="hasDailyPriceChange"
                  checked={formData.hasDailyPriceChange}
                  onChange={handleInputChange}
                  className="w-4 h-4 rounded"
                />
              </div>

              {/* By Reservation */}
              <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
                <label className="text-sm font-medium text-gray-700">بالحجز؟</label>
                <input
                  type="checkbox"
                  name="isByReservation"
                  checked={formData.isByReservation}
                  onChange={handleInputChange}
                  className="w-4 h-4 rounded"
                />
              </div>

              {/* Product Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 text-right">
                  وصف المنتج
                </label>
                <textarea
                  name="productDescription"
                  value={formData.productDescription}
                  onChange={handleInputChange}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-right"
                  dir="rtl"
                />
              </div>

              {/* Best Recipes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 text-right">
                  أفضل الوصفات
                </label>
                <textarea
                  name="bestRecipes"
                  value={formData.bestRecipes}
                  onChange={handleInputChange}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-right"
                  dir="rtl"
                />
              </div>

              {/* Product Condition */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 text-right">
                  حالة المنتج
                </label>
                <select
                  name="productCondition"
                  value={formData.productCondition}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-right"
                  dir="rtl"
                >
                  <option value="فريش">فريش (طازج)</option>
                  <option value="مبردة">مبردة</option>
                  <option value="مجمد">مجمد</option>
                </select>
              </div>

              {/* Active Checkbox */}
              <div className="flex items-center">
                <input
                  type="checkbox"
                  name="isActive"
                  checked={formData.isActive}
                  onChange={handleInputChange}
                  className="w-4 h-4 rounded"
                />
                <label className="ml-2 text-sm font-medium text-gray-700 rtl:ml-0 rtl:mr-2">
                  نشط
                </label>
              </div>

              {/* Targeted Checkbox */}
              <div className="flex items-center bg-amber-50 border border-amber-200 rounded-lg p-3">
                <input
                  type="checkbox"
                  name="isTargeted"
                  checked={Boolean(formData.isTargeted)}
                  onChange={handleInputChange}
                  className="w-4 h-4 rounded accent-amber-500"
                />
                <label className="ml-2 text-sm font-semibold text-amber-800 rtl:ml-0 rtl:mr-2">
                  🎯 منتج مستهدف (تركيز للوكلاء)
                </label>
              </div>

              {/* Buttons */}
              <div className="flex space-x-3 rtl:space-x-reverse pt-4 border-t border-gray-300">
                <button
                  type="submit"
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg transition"
                >
                  💾 حفظ
                </button>
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-900 font-semibold py-2 px-4 rounded-lg transition"
                >
                  ❌ إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Click-to-edit price cell for the admin products table. Renders as a clean
 * text label by default; turns into a number input on click. Saves on blur or
 * Enter, cancels on Escape. Supports nullable values (offer price).
 */
function InlinePriceCell({
  value,
  onSave,
  allowNull,
}: {
  value: number | null
  onSave: (next: number | null) => Promise<boolean>
  allowNull: boolean
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState<string>(value != null ? String(value) : '')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!isEditing) setDraft(value != null ? String(value) : '')
  }, [value, isEditing])

  const commit = async () => {
    setIsEditing(false)
    const trimmed = draft.trim()
    let parsed: number | null
    if (trimmed === '' || trimmed === '-') {
      if (!allowNull) {
        // basePrice cannot be cleared — revert silently.
        setDraft(value != null ? String(value) : '')
        return
      }
      parsed = null
    } else {
      const n = Number(trimmed)
      if (!Number.isFinite(n) || n < 0) {
        toast.error('قيمة غير صالحة')
        setDraft(value != null ? String(value) : '')
        return
      }
      parsed = n
    }
    // No-op if value didn't actually change.
    if ((parsed ?? null) === (value ?? null)) return
    setIsSaving(true)
    await onSave(parsed)
    setIsSaving(false)
  }

  if (!isEditing) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setIsEditing(true)
        }}
        className="text-right hover:bg-yellow-50 px-2 py-1 -mx-1 rounded border border-transparent hover:border-yellow-300 transition cursor-text"
        title="اضغط للتعديل"
      >
        {value != null && value > 0 ? `${value} ج.م` : '-'}
        {isSaving && <span className="text-[10px] text-gray-400 mr-1">💾</span>}
      </button>
    )
  }

  return (
    <input
      autoFocus
      type="number"
      inputMode="decimal"
      step="0.01"
      min={0}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          ;(e.currentTarget as HTMLInputElement).blur()
        } else if (e.key === 'Escape') {
          setDraft(value != null ? String(value) : '')
          setIsEditing(false)
        }
      }}
      className="w-24 px-2 py-1 border-2 border-red-400 rounded text-left bg-white"
      dir="ltr"
    />
  )
}
