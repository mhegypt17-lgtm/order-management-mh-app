'use client'

import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'

interface ProductLite {
  id: string
  productName: string
  productCategory?: string
}

interface ResultRow {
  customerId: string
  customerName: string
  customerPhone: string
  customerEmail: string
  orderCount: number
  totalQuantity: number
}

interface Props {
  open: boolean
  onClose: () => void
  onSelectCustomer: (customerId: string) => void
}

const fmt = (n: number) => new Intl.NumberFormat('en-US').format(n)

/**
 * Admin-only "Top Customers by Product" report — pick a product, see every
 * customer who ordered it (completed orders only) ranked by order count.
 * Backed by the low-egress `product_order_customers_v1` view: the API only
 * ever ships rows for the ONE selected product, never a full table scan.
 */
export default function TopCustomersByProductModal({ open, onClose, onSelectCustomer }: Props) {
  const [products, setProducts] = useState<ProductLite[]>([])
  const [productsLoading, setProductsLoading] = useState(false)
  const [productSearch, setProductSearch] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<ProductLite | null>(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [rows, setRows] = useState<ResultRow[] | null>(null)
  const [loading, setLoading] = useState(false)

  // Load the lightweight product list once per time the modal opens.
  useEffect(() => {
    if (!open) return
    setProductsLoading(true)
    fetch('/api/products?columns=lite')
      .then((res) => res.json())
      .then((json) => setProducts(json?.products || []))
      .catch(() => toast.error('تعذر تحميل قائمة المنتجات'))
      .finally(() => setProductsLoading(false))
  }, [open])

  // Reset state whenever the modal is closed so re-opening starts fresh.
  useEffect(() => {
    if (open) return
    setProductSearch('')
    setSelectedProduct(null)
    setFrom('')
    setTo('')
    setRows(null)
  }, [open])

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase()
    if (!q) return products.slice(0, 30)
    return products.filter((p) => p.productName.toLowerCase().includes(q)).slice(0, 30)
  }, [products, productSearch])

  const runReport = async (product: ProductLite) => {
    setSelectedProduct(product)
    setLoading(true)
    setRows(null)
    try {
      const params = new URLSearchParams({ productId: product.id })
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      const res = await fetch(`/api/crm/reports/top-customers-by-product?${params.toString()}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'فشل تحميل التقرير')
      setRows(json.rows || [])
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل التقرير')
    } finally {
      setLoading(false)
    }
  }

  const exportCsv = () => {
    if (!rows || !selectedProduct) return
    const headers = ['العميل', 'الهاتف', 'البريد الإلكتروني', 'عدد الطلبات', 'الكمية الإجمالية']
    const lines = [headers.join(',')]
    for (const r of rows) {
      lines.push(
        [
          r.customerName.replace(/,/g, ' '),
          r.customerPhone,
          (r.customerEmail || '').replace(/,/g, ' '),
          r.orderCount,
          r.totalQuantity,
        ].join(','),
      )
    }
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `top-customers-${selectedProduct.productName}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">📦 أفضل العملاء لمنتج معين</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
            ×
          </button>
        </div>

        {/* Product picker */}
        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">المنتج</label>
          <input
            type="text"
            value={selectedProduct ? selectedProduct.productName : productSearch}
            onChange={(e) => {
              setSelectedProduct(null)
              setRows(null)
              setProductSearch(e.target.value)
            }}
            placeholder="ابحث عن منتج... مثال: فيليه متبل"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
          />
          {!selectedProduct && productSearch.trim() && (
            <div className="mt-1 border border-gray-200 rounded max-h-48 overflow-y-auto">
              {productsLoading ? (
                <div className="p-2 text-xs text-gray-500 text-center">⏳ جاري التحميل...</div>
              ) : filteredProducts.length === 0 ? (
                <div className="p-2 text-xs text-gray-500 text-center">لا توجد نتائج</div>
              ) : (
                filteredProducts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setProductSearch('')
                      runReport(p)
                    }}
                    className="w-full text-right px-3 py-2 text-sm hover:bg-red-50 border-b border-gray-100 last:border-b-0"
                  >
                    {p.productName}
                    {p.productCategory ? (
                      <span className="text-xs text-gray-400"> — {p.productCategory}</span>
                    ) : null}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Optional date range */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">من تاريخ (اختياري)</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              onBlur={() => selectedProduct && runReport(selectedProduct)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">إلى تاريخ (اختياري)</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              onBlur={() => selectedProduct && runReport(selectedProduct)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
            />
          </div>
        </div>

        {/* Results */}
        {loading ? (
          <div className="p-6 text-center text-gray-500 text-sm">⏳ جاري التحميل...</div>
        ) : rows && selectedProduct ? (
          rows.length === 0 ? (
            <div className="p-6 text-center text-gray-500 text-sm">لا يوجد عملاء طلبوا هذا المنتج</div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">
                  {fmt(rows.length)} عميل طلبوا <strong>{selectedProduct.productName}</strong>
                </span>
                <button
                  onClick={exportCsv}
                  className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium px-2 py-1 rounded"
                >
                  ⬇️ تصدير CSV
                </button>
              </div>
              <div className="border border-gray-200 rounded overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-right px-3 py-2 font-semibold text-gray-600">العميل</th>
                      <th className="text-right px-3 py-2 font-semibold text-gray-600">الهاتف</th>
                      <th className="text-right px-3 py-2 font-semibold text-gray-600">البريد الإلكتروني</th>
                      <th className="text-right px-3 py-2 font-semibold text-gray-600">عدد الطلبات</th>
                      <th className="text-right px-3 py-2 font-semibold text-gray-600">الكمية</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r.customerId}
                        className="border-t border-gray-100 hover:bg-red-50 cursor-pointer"
                        onClick={() => {
                          onSelectCustomer(r.customerId)
                          onClose()
                        }}
                      >
                        <td className="px-3 py-2 font-medium text-gray-900">{r.customerName}</td>
                        <td className="px-3 py-2 text-gray-600">{r.customerPhone}</td>
                        <td className="px-3 py-2 text-gray-600">{r.customerEmail || '—'}</td>
                        <td className="px-3 py-2 font-bold text-red-700">{fmt(r.orderCount)}</td>
                        <td className="px-3 py-2 text-gray-600">{fmt(r.totalQuantity)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        ) : (
          <div className="p-6 text-center text-gray-400 text-sm">اختر منتجًا لعرض العملاء الذين طلبوه</div>
        )}
      </div>
    </div>
  )
}
