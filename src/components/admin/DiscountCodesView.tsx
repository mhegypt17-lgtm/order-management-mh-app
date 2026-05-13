'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'

interface DiscountCode {
  id: string
  code: string
  type: 'percent' | 'value'
  amount: number
  maxDiscount?: number | null
  minOrderTotal?: number | null
  isActive: boolean
  expiresAt?: string | null
  usageLimit?: number | null
  usedCount: number
  createdAt: string
  updatedAt: string
}

const emptyForm = {
  code: '',
  type: 'percent' as 'percent' | 'value',
  amount: '',
  maxDiscount: '',
  minOrderTotal: '',
  expiresAt: '',
  usageLimit: '',
  isActive: true,
}

export default function DiscountCodesView() {
  const [codes, setCodes] = useState<DiscountCode[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...emptyForm })

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/discount-codes', { cache: 'no-store' })
      if (!res.ok) throw new Error()
      setCodes(await res.json())
    } catch {
      toast.error('تعذر تحميل الأكواد')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const openCreate = () => {
    setEditingId(null)
    setForm({ ...emptyForm })
    setShowForm(true)
  }

  const openEdit = (c: DiscountCode) => {
    setEditingId(c.id)
    setForm({
      code: c.code,
      type: c.type,
      amount: String(c.amount),
      maxDiscount: c.maxDiscount != null ? String(c.maxDiscount) : '',
      minOrderTotal: c.minOrderTotal != null ? String(c.minOrderTotal) : '',
      expiresAt: c.expiresAt ? c.expiresAt.slice(0, 10) : '',
      usageLimit: c.usageLimit != null ? String(c.usageLimit) : '',
      isActive: c.isActive,
    })
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.code.trim()) return toast.error('الكود مطلوب')
    if (!form.amount || Number(form.amount) <= 0) return toast.error('قيمة الخصم مطلوبة')
    if (form.type === 'percent' && Number(form.amount) > 100) return toast.error('النسبة لا تتجاوز 100%')

    setSaving(true)
    try {
      const payload = {
        code: form.code.trim().toUpperCase(),
        type: form.type,
        amount: Number(form.amount),
        maxDiscount: form.maxDiscount === '' ? null : Number(form.maxDiscount),
        minOrderTotal: form.minOrderTotal === '' ? null : Number(form.minOrderTotal),
        expiresAt: form.expiresAt || null,
        usageLimit: form.usageLimit === '' ? null : Number(form.usageLimit),
        isActive: form.isActive,
      }
      const res = await fetch(editingId ? `/api/discount-codes/${editingId}` : '/api/discount-codes', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل الحفظ')
      toast.success(editingId ? 'تم التحديث' : 'تم إنشاء الكود')
      setShowForm(false)
      await load()
    } catch (e: any) {
      toast.error(e?.message || 'تعذر الحفظ')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (c: DiscountCode) => {
    if (!confirm(`حذف الكود ${c.code}؟`)) return
    try {
      const res = await fetch(`/api/discount-codes/${c.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('تم الحذف')
      await load()
    } catch {
      toast.error('تعذر الحذف')
    }
  }

  const handleToggleActive = async (c: DiscountCode) => {
    try {
      const res = await fetch(`/api/discount-codes/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !c.isActive }),
      })
      if (!res.ok) throw new Error()
      await load()
    } catch {
      toast.error('تعذر تحديث الحالة')
    }
  }

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-4" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">🏷️ أكواد الخصم</h2>
          <p className="text-xs text-gray-500">إنشاء أكواد خصم بنسبة % أو قيمة ثابتة، يستخدمها الوكيل أثناء إنشاء الطلب.</p>
        </div>
        <button
          onClick={openCreate}
          className="w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-semibold min-h-[40px]"
        >
          + كود جديد
        </button>
      </div>

      {loading ? (
        <div className="p-4 text-center text-gray-500">⏳ جاري التحميل...</div>
      ) : codes.length === 0 ? (
        <div className="p-6 text-center text-gray-500 border border-dashed border-gray-300 rounded-lg">
          لا يوجد أكواد بعد. اضغط <strong>+ كود جديد</strong> للبدء.
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {codes.map((c) => (
              <div key={c.id} className="border-2 border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-bold text-gray-900">{c.code}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${c.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                    {c.isActive ? 'مفعل' : 'متوقف'}
                  </span>
                </div>
                <div className="text-sm text-gray-700">
                  {c.type === 'percent' ? `${c.amount}%` : `${c.amount.toLocaleString()} ج.م`}
                  {c.maxDiscount ? ` (حد أقصى ${c.maxDiscount.toLocaleString()} ج.م)` : ''}
                </div>
                <div className="text-xs text-gray-500 flex flex-wrap gap-x-3 gap-y-1">
                  {c.minOrderTotal ? <span>حد أدنى: {c.minOrderTotal.toLocaleString()} ج.م</span> : null}
                  {c.expiresAt ? <span>ينتهي: {c.expiresAt.slice(0, 10)}</span> : null}
                  <span>الاستخدام: {c.usedCount}{c.usageLimit ? ` / ${c.usageLimit}` : ''}</span>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button onClick={() => openEdit(c)} className="flex-1 sm:flex-initial px-3 py-2 rounded bg-blue-100 text-blue-700 text-sm font-semibold">✏️ تعديل</button>
                  <button onClick={() => handleToggleActive(c)} className="flex-1 sm:flex-initial px-3 py-2 rounded bg-amber-100 text-amber-800 text-sm font-semibold">{c.isActive ? 'إيقاف' : 'تفعيل'}</button>
                  <button onClick={() => handleDelete(c)} className="flex-1 sm:flex-initial px-3 py-2 rounded bg-red-100 text-red-700 text-sm font-semibold">🗑️ حذف</button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-3 py-2 text-right">الكود</th>
                  <th className="px-3 py-2 text-right">النوع</th>
                  <th className="px-3 py-2 text-right">القيمة</th>
                  <th className="px-3 py-2 text-right">حد أدنى</th>
                  <th className="px-3 py-2 text-right">ينتهي</th>
                  <th className="px-3 py-2 text-right">الاستخدام</th>
                  <th className="px-3 py-2 text-right">الحالة</th>
                  <th className="px-3 py-2 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {codes.map((c) => (
                  <tr key={c.id} className="border-b border-gray-100">
                    <td className="px-3 py-2 font-bold">{c.code}</td>
                    <td className="px-3 py-2">{c.type === 'percent' ? 'نسبة %' : 'قيمة ثابتة'}</td>
                    <td className="px-3 py-2">
                      {c.type === 'percent' ? `${c.amount}%` : `${c.amount.toLocaleString()} ج.م`}
                      {c.maxDiscount ? ` (حد ${c.maxDiscount.toLocaleString()})` : ''}
                    </td>
                    <td className="px-3 py-2">{c.minOrderTotal ? `${c.minOrderTotal.toLocaleString()} ج.م` : '—'}</td>
                    <td className="px-3 py-2">{c.expiresAt ? c.expiresAt.slice(0, 10) : '—'}</td>
                    <td className="px-3 py-2">{c.usedCount}{c.usageLimit ? ` / ${c.usageLimit}` : ''}</td>
                    <td className="px-3 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${c.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                        {c.isActive ? 'مفعل' : 'متوقف'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <div className="inline-flex gap-1">
                        <button onClick={() => openEdit(c)} className="px-2 py-1 rounded bg-blue-100 text-blue-700 text-xs font-semibold">✏️</button>
                        <button onClick={() => handleToggleActive(c)} className="px-2 py-1 rounded bg-amber-100 text-amber-800 text-xs font-semibold">{c.isActive ? '⏸' : '▶'}</button>
                        <button onClick={() => handleDelete(c)} className="px-2 py-1 rounded bg-red-100 text-red-700 text-xs font-semibold">🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-xl shadow-xl w-[95vw] sm:w-[90vw] md:max-w-lg max-h-[85vh] overflow-y-auto p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900">{editingId ? '✏️ تعديل كود خصم' : '+ كود خصم جديد'}</h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">الكود</label>
              <input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-left"
                dir="ltr"
                placeholder="EG: WELCOME10"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">النوع</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value as 'percent' | 'value' })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white"
                >
                  <option value="percent">نسبة %</option>
                  <option value="value">قيمة ثابتة (ج.م)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {form.type === 'percent' ? 'النسبة (1-100)' : 'القيمة (ج.م)'}
                </label>
                <input
                  type="number"
                  min={0}
                  max={form.type === 'percent' ? 100 : undefined}
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-left"
                  dir="ltr"
                />
              </div>
            </div>

            {form.type === 'percent' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">الحد الأقصى للخصم (ج.م) — اختياري</label>
                <input
                  type="number"
                  min={0}
                  value={form.maxDiscount}
                  onChange={(e) => setForm({ ...form, maxDiscount: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-left"
                  dir="ltr"
                  placeholder="بدون حد"
                />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">الحد الأدنى للطلب (ج.م) — اختياري</label>
                <input
                  type="number"
                  min={0}
                  value={form.minOrderTotal}
                  onChange={(e) => setForm({ ...form, minOrderTotal: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-left"
                  dir="ltr"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">عدد مرات الاستخدام — اختياري</label>
                <input
                  type="number"
                  min={0}
                  value={form.usageLimit}
                  onChange={(e) => setForm({ ...form, usageLimit: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-left"
                  dir="ltr"
                  placeholder="بدون حد"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">تاريخ انتهاء الصلاحية — اختياري</label>
              <input
                type="date"
                value={form.expiresAt}
                onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-left"
                dir="ltr"
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                className="w-5 h-5 accent-red-600"
              />
              <span className="text-sm text-gray-700">مفعل</span>
            </label>

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button
                disabled={saving}
                onClick={handleSave}
                className="w-full sm:w-auto sm:flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg font-medium min-h-[44px]"
              >
                {saving ? '⏳ ...' : 'حفظ'}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="w-full sm:w-auto px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 min-h-[44px]"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
