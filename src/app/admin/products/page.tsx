'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'

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
  stockStatus?: 'available' | 'low' | 'out'
  stockQuantity?: number | null
  stockUpdatedAt?: string | null
  stockUpdatedBy?: string | null
}

export default function ProductCatalogPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [formData, setFormData] = useState<Product>({
    productName: '',
    productDescription: '',
    bestRecipes: '',
    productCategory: 'لحوم',
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
        productCategory: 'لحوم',
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
        ...product,
      })
      setEditingId(product.id || null)
    } else {
      setFormData({
        productName: '',
        productDescription: '',
        bestRecipes: '',
        productCategory: 'لحوم',
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

  const filteredProducts = products.filter((p) =>
    p.productName.includes(searchTerm)
  )

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

      {/* Search Bar */}
      <div className="flex items-center space-x-2 rtl:space-x-reverse">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="ابحث عن منتج..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-right"
            dir="rtl"
          />
          <span className="absolute left-3 rtl:left-auto rtl:right-3 top-2 text-gray-400">
            🔍
          </span>
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
                  التوفر
                </th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                  نشط
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
                    {product.productCategory || '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 font-semibold">
                    {product.basePrice} ج.م
                  </td>
                  <td className="px-6 py-4 text-sm text-green-600 font-semibold">
                    {product.offerPrice && product.offerPrice < product.basePrice ? (
                      <div>
                        <div>{product.offerPrice} ج.م</div>
                        <div className="text-xs text-gray-500">
                          -{(((product.basePrice - product.offerPrice) / product.basePrice) * 100).toFixed(0)}%
                        </div>
                      </div>
                    ) : (
                      '-'
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
                  <td className="px-6 py-4 text-sm" onClick={(e) => e.stopPropagation()}>
                    <select
                      value={product.stockStatus || 'available'}
                      onChange={async (e) => {
                        const next = e.target.value as 'available' | 'low' | 'out'
                        try {
                          const res = await fetch('/api/products/stock', {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              id: product.id,
                              stockStatus: next,
                              stockQuantity: next === 'out' ? 0 : product.stockQuantity ?? null,
                              role: 'admin',
                              actor: 'مدير',
                            }),
                          })
                          if (!res.ok) throw new Error()
                          const d = await res.json()
                          setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, ...d.product } : p)))
                          toast.success('تم تحديث المخزون')
                        } catch {
                          toast.error('تعذر تحديث المخزون')
                        }
                      }}
                      className={`px-2 py-1 rounded-md text-xs font-bold border-2 ${
                        (product.stockStatus || 'available') === 'out'
                          ? 'border-red-300 bg-red-50 text-red-700'
                          : product.stockStatus === 'low'
                          ? 'border-amber-300 bg-amber-50 text-amber-800'
                          : 'border-green-300 bg-green-50 text-green-700'
                      }`}
                    >
                      <option value="available">✅ متاح</option>
                      <option value="low">⚠️ منخفض</option>
                      <option value="out">⛔ غير متاح</option>
                    </select>
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
                  الفئة
                </label>
                <select
                  name="productCategory"
                  value={formData.productCategory}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-right"
                  dir="rtl"
                >
                  <option value="دواجن">دواجن</option>
                  <option value="لحوم">لحوم</option>
                  <option value="أسماك">أسماك</option>
                  <option value="مقبلات">مقبلات</option>
                  <option value="مجمدات">مجمدات</option>
                  <option value="أخرى">أخرى</option>
                </select>
              </div>

              {/* Base Price */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 text-right">
                  السعر *
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
