'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import Link from 'next/link'
import { pushCategoriesUpdate, ProductCategory } from '@/lib/useProductCategories'

type Draft = ProductCategory & { _isNew?: boolean; _isDirty?: boolean }

export default function CategorySettingsPage() {
  const [rows, setRows] = useState<Draft[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newName, setNewName] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/product-categories', { cache: 'no-store' })
      const data = await res.json()
      const list: ProductCategory[] = Array.isArray(data?.categories) ? data.categories : []
      setRows(list.map((c) => ({ ...c })))
    } catch {
      toast.error('فشل تحميل التصنيفات')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const move = (idx: number, dir: -1 | 1) => {
    const target = idx + dir
    if (target < 0 || target >= rows.length) return
    const next = [...rows]
    const [item] = next.splice(idx, 1)
    next.splice(target, 0, item)
    setRows(next.map((r, i) => ({ ...r, sortOrder: i + 1, _isDirty: true })))
  }

  const toggleActive = (id: string) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, isActive: !r.isActive, _isDirty: true } : r)),
    )
  }

  const remove = (id: string) => {
    if (!confirm('هل تريد حذف هذا التصنيف؟ (سيتم منع الحذف لو هناك منتجات تستخدمه)')) return
    setRows((prev) => prev.filter((r) => r.id !== id))
  }

  const addCategory = () => {
    const name = newName.trim()
    if (!name) return
    if (rows.some((r) => r.name.replace(/\s+/g, ' ').toLowerCase() === name.replace(/\s+/g, ' ').toLowerCase())) {
      toast.error('هذا التصنيف موجود بالفعل')
      return
    }
    setRows((prev) => [
      ...prev,
      {
        id: `new_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name,
        sortOrder: prev.length + 1,
        isActive: true,
        _isNew: true,
        _isDirty: true,
      },
    ])
    setNewName('')
  }

  const save = async () => {
    setSaving(true)
    try {
      const payload = rows.map(({ _isNew, _isDirty, ...rest }, i) => ({
        // Strip client-generated ids so the server assigns a stable one.
        id: _isNew ? undefined : rest.id,
        name: rest.name,
        sortOrder: i + 1,
        isActive: rest.isActive,
      }))
      const res = await fetch('/api/product-categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories: payload }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 409 && Array.isArray(data?.blocked)) {
          const lines = data.blocked
            .map((b: any) => `• ${b.name} — ${b.productCount} منتج`)
            .join('\n')
          toast.error(`لا يمكن حذف:\n${lines}`, { duration: 6000 })
        } else {
          toast.error(data?.error || 'فشل الحفظ')
        }
        return
      }
      const saved: ProductCategory[] = Array.isArray(data?.categories) ? data.categories : []
      setRows(saved.map((c) => ({ ...c })))
      pushCategoriesUpdate(saved) // broadcast to all open product pages
      toast.success('تم الحفظ')
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحفظ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6" dir="rtl">
      <div className="max-w-3xl mx-auto">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">إدارة تصنيفات المنتجات</h1>
            <p className="text-sm text-gray-600 mt-1">
              ترتيب وتفعيل التصنيفات يظهر مباشرة في كل صفحات المنتجات.
            </p>
          </div>
          <Link
            href="/admin/settings"
            className="text-sm px-3 py-2 rounded-lg bg-white border border-gray-300 hover:bg-gray-100"
          >
            ← رجوع للإعدادات
          </Link>
        </div>

        <div className="bg-white rounded-xl shadow border border-gray-200 p-5">
          {/* Add new */}
          <div className="flex gap-2 mb-5">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addCategory()
                }
              }}
              placeholder="اسم تصنيف جديد"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <button
              type="button"
              onClick={addCategory}
              className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold"
            >
              + إضافة
            </button>
          </div>

          {/* List */}
          {loading ? (
            <div className="text-center py-8 text-gray-500">جاري التحميل...</div>
          ) : rows.length === 0 ? (
            <div className="text-center py-8 text-gray-500">لا توجد تصنيفات. أضف واحداً للبدء.</div>
          ) : (
            <ul className="space-y-2">
              {rows.map((row, idx) => (
                <li
                  key={row.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border ${
                    row.isActive ? 'border-gray-200 bg-white' : 'border-gray-200 bg-gray-50 opacity-60'
                  }`}
                >
                  <span className="w-8 text-center text-sm text-gray-400">{idx + 1}</span>
                  <span className="flex-1 text-right text-base font-medium text-gray-900">
                    {row.name}
                    {row._isNew && <span className="ml-2 text-xs text-green-600">(جديد)</span>}
                  </span>

                  {/* Reorder */}
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      onClick={() => move(idx, -1)}
                      disabled={idx === 0}
                      className="text-xs px-2 py-0.5 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-30"
                      title="تحريك لأعلى"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => move(idx, 1)}
                      disabled={idx === rows.length - 1}
                      className="text-xs px-2 py-0.5 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-30"
                      title="تحريك لأسفل"
                    >
                      ▼
                    </button>
                  </div>

                  {/* Active toggle */}
                  <button
                    type="button"
                    onClick={() => toggleActive(row.id)}
                    className={`text-xs px-3 py-1.5 rounded-lg font-bold ${
                      row.isActive
                        ? 'bg-green-100 text-green-800 hover:bg-green-200'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    {row.isActive ? '✓ مفعل' : '⏸ معطل'}
                  </button>

                  {/* Delete */}
                  <button
                    type="button"
                    onClick={() => remove(row.id)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 font-bold"
                  >
                    🗑 حذف
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Save */}
          <div className="mt-6 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              ⚠️ الحذف ممنوع لو هناك منتجات تستخدم التصنيف. عطّل التصنيف بدلاً من حذفه لإخفائه من القوائم الجديدة.
            </p>
            <button
              type="button"
              onClick={save}
              disabled={saving || loading}
              className="px-6 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold shadow disabled:opacity-50"
            >
              {saving ? '...جاري الحفظ' : '💾 حفظ التغييرات'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
