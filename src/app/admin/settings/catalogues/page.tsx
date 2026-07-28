'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/lib/auth'
import { ONLINE_CATALOGUE_KEY } from '@/lib/catalogue'

interface CatalogueRow {
  key: string
  label: string
  orderTypes: string[]
  isActive: boolean
  sortOrder: number
}

// Order types a catalogue can be mapped to. Keep in sync with the order
// form's `orderType` values — this only controls which catalogue an order
// resolves to, it doesn't restrict what order types exist.
const ORDER_TYPE_OPTIONS = [
  { value: 'online', label: 'أونلاين + تطبيق' },
  { value: 'instashop', label: 'إنستاشوب' },
  { value: 'b2b', label: 'B2B' },
  { value: 'phone', label: 'هاتف' },
  { value: 'branch', label: 'فرع' },
]

export default function CataloguesSettingsPage() {
  const { user } = useAuthStore()
  const [catalogues, setCatalogues] = useState<CatalogueRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [newLabel, setNewLabel] = useState('')
  const [newOrderTypes, setNewOrderTypes] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/catalogues')
      const data = await res.json()
      setCatalogues(Array.isArray(data.catalogues) ? data.catalogues : [])
    } catch {
      toast.error('تعذر تحميل الكتالوجات')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const toggleNewOrderType = (v: string) => {
    setNewOrderTypes((prev) => {
      const next = new Set(prev)
      if (next.has(v)) next.delete(v)
      else next.add(v)
      return next
    })
  }

  const handleCreate = async () => {
    if (!newLabel.trim()) {
      toast.error('اسم الكتالوج مطلوب')
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/catalogues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: newLabel.trim(),
          orderTypes: Array.from(newOrderTypes),
          role: user?.role,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'فشل إنشاء الكتالوج')
      toast.success('✅ تم إنشاء الكتالوج ونسخ أسعار الأونلاين إليه')
      setNewLabel('')
      setNewOrderTypes(new Set())
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'خطأ')
    } finally {
      setCreating(false)
    }
  }

  const patchCatalogue = async (key: string, patch: Partial<CatalogueRow>) => {
    setSaving(key)
    // Optimistic update — rolled back on failure.
    const prev = catalogues
    setCatalogues((cur) => cur.map((c) => (c.key === key ? { ...c, ...patch } : c)))
    try {
      const res = await fetch('/api/catalogues', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, ...patch, role: user?.role }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'فشل التحديث')
    } catch (error) {
      setCatalogues(prev)
      toast.error(error instanceof Error ? error.message : 'خطأ')
    } finally {
      setSaving(null)
    }
  }

  const toggleOrderTypeOnCatalogue = (c: CatalogueRow, v: string) => {
    const has = c.orderTypes.includes(v)
    const nextTypes = has ? c.orderTypes.filter((t) => t !== v) : [...c.orderTypes, v]
    patchCatalogue(c.key, { orderTypes: nextTypes })
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4" dir="rtl">
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">🗂️ الكتالوجات</h1>
            <p className="text-sm text-gray-600 mt-1">
              كل كتالوج له أسعار ومخزون مستقلين. الكتالوج الجديد يُنسخ تلقائيًا من أسعار
              &quot;أونلاين + تطبيق&quot; كنقطة بداية.
            </p>
          </div>
          <Link href="/admin/settings" className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900">
            ← رجوع للإعدادات
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-gray-500">⏳ جاري التحميل...</div>
      ) : (
        <div className="space-y-3">
          {catalogues
            .slice()
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((c) => (
              <div key={c.key} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <input
                      value={c.label}
                      disabled={saving === c.key}
                      onChange={(e) =>
                        setCatalogues((cur) =>
                          cur.map((x) => (x.key === c.key ? { ...x, label: e.target.value } : x)),
                        )
                      }
                      onBlur={(e) => patchCatalogue(c.key, { label: e.target.value.trim() || c.label })}
                      className="px-3 py-1.5 border border-gray-300 rounded-lg font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <span className="text-xs text-gray-400 font-mono">{c.key}</span>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={c.isActive}
                      disabled={c.key === ONLINE_CATALOGUE_KEY || saving === c.key}
                      onChange={(e) => patchCatalogue(c.key, { isActive: e.target.checked })}
                    />
                    مفعّل
                  </label>
                </div>

                <div>
                  <div className="text-xs text-gray-500 mb-1">أنواع الطلبات المرتبطة بهذا الكتالوج</div>
                  <div className="flex flex-wrap gap-2">
                    {ORDER_TYPE_OPTIONS.map((opt) => {
                      const checked = c.orderTypes.includes(opt.value)
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          disabled={saving === c.key}
                          onClick={() => toggleOrderTypeOnCatalogue(c, opt.value)}
                          className={`px-3 py-1 rounded-lg text-xs font-bold border transition ${
                            checked
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                          }`}
                        >
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}

      <div className="bg-white border-2 border-dashed border-gray-300 rounded-xl p-4 space-y-3">
        <h2 className="font-bold text-gray-900">➕ كتالوج جديد</h2>
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="اسم الكتالوج (مثال: B2B)"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <div>
          <div className="text-xs text-gray-500 mb-1">أنواع الطلبات (اختياري)</div>
          <div className="flex flex-wrap gap-2">
            {ORDER_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleNewOrderType(opt.value)}
                className={`px-3 py-1 rounded-lg text-xs font-bold border transition ${
                  newOrderTypes.has(opt.value)
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 font-semibold"
        >
          {creating ? '⏳ جارٍ الإنشاء...' : '➕ إنشاء الكتالوج'}
        </button>
      </div>
    </div>
  )
}
