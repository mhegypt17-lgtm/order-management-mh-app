'use client'

import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/lib/auth'
import {
  cairoDateString,
  cairoTimeString,
  cairoFirstDayOfMonth,
  formatCairoDateTime,
} from '@/lib/cairoTime'

interface CallLog {
  id: string
  callDate: string
  callTime: string
  customerName: string
  phone: string
  email: string
  inquiry: string
  response: string
  customerId: string | null
  loggedBy: string
  createdAt: string
  updatedAt: string
}

const emptyDraft = () => ({
  callDate: cairoDateString(),
  callTime: cairoTimeString(),
  customerName: '',
  phone: '',
  email: '',
  inquiry: '',
  response: '',
})

export default function CallLogsPage() {
  const { user } = useAuthStore()
  const [logs, setLogs] = useState<CallLog[]>([])
  const [loading, setLoading] = useState(true)
  const [from, setFrom] = useState(cairoFirstDayOfMonth())
  const [to, setTo] = useState(cairoDateString())
  const [q, setQ] = useState('')
  const [draft, setDraft] = useState(emptyDraft())
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Partial<CallLog>>({})

  const load = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      if (q.trim()) params.set('q', q.trim())
      const res = await fetch(`/api/cs-call-logs?${params.toString()}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'فشل التحميل')
      setLogs(json.logs || [])
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل السجلات')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to])

  // Debounced reload when the user types in the search box. 300 ms is
  // small enough to feel instant but big enough to skip per-keystroke
  // round-trips.
  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const submitNew = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!draft.customerName.trim() && !draft.phone.trim()) {
      toast.error('أدخل اسم العميل أو رقم الهاتف على الأقل')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/cs-call-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, loggedBy: user?.name || user?.id || '' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'فشل الحفظ')
      toast.success('تم تسجيل المكالمة')
      setLogs((prev) => [json.log, ...prev])
      setDraft(emptyDraft())
    } catch (e: any) {
      toast.error(e?.message || 'فشل حفظ السجل')
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (row: CallLog) => {
    setEditingId(row.id)
    setEditDraft({
      callDate: row.callDate,
      callTime: row.callTime,
      customerName: row.customerName,
      phone: row.phone,
      email: row.email,
      inquiry: row.inquiry,
      response: row.response,
    })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditDraft({})
  }

  const saveEdit = async (id: string) => {
    try {
      const res = await fetch(`/api/cs-call-logs/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editDraft),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'فشل التحديث')
      toast.success('تم التحديث')
      setLogs((prev) => prev.map((r) => (r.id === id ? json.log : r)))
      cancelEdit()
    } catch (e: any) {
      toast.error(e?.message || 'فشل التحديث')
    }
  }

  const deleteRow = async (id: string) => {
    if (!confirm('سيتم حذف هذا السجل نهائياً. هل أنت متأكد؟')) return
    try {
      const res = await fetch(`/api/cs-call-logs/${id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'فشل الحذف')
      toast.success('تم الحذف')
      setLogs((prev) => prev.filter((r) => r.id !== id))
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحذف')
    }
  }

  const totalToday = useMemo(() => {
    const today = cairoDateString()
    return logs.filter((l) => l.callDate === today).length
  }, [logs])

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-gray-800">📞 سجل المكالمات</h1>
        <div className="flex gap-4 text-sm">
          <div className="px-3 py-1.5 bg-blue-100 text-blue-800 rounded-lg">
            مكالمات اليوم: <span className="font-bold">{totalToday}</span>
          </div>
          <div className="px-3 py-1.5 bg-gray-100 text-gray-800 rounded-lg">
            إجمالي معروض: <span className="font-bold">{logs.length}</span>
          </div>
        </div>
      </div>

      {/* New log form */}
      <form
        onSubmit={submitNew}
        className="bg-white rounded-xl shadow p-4 mb-4 grid grid-cols-1 md:grid-cols-6 gap-3"
      >
        <div className="md:col-span-6 font-bold text-gray-700 text-sm">➕ تسجيل مكالمة جديدة</div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">التاريخ</label>
          <input
            type="date"
            value={draft.callDate}
            onChange={(e) => setDraft({ ...draft, callDate: e.target.value })}
            className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">الوقت</label>
          <input
            type="time"
            value={draft.callTime}
            onChange={(e) => setDraft({ ...draft, callTime: e.target.value })}
            className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">اسم العميل</label>
          <input
            type="text"
            value={draft.customerName}
            onChange={(e) => setDraft({ ...draft, customerName: e.target.value })}
            placeholder="اسم العميل أو العميل المحتمل"
            className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">رقم الهاتف</label>
          <input
            type="text"
            value={draft.phone}
            onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
            placeholder="01xxxxxxxxx"
            dir="ltr"
            className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-left"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">البريد الإلكتروني (اختياري)</label>
          <input
            type="email"
            value={draft.email}
            onChange={(e) => setDraft({ ...draft, email: e.target.value })}
            placeholder="example@mail.com"
            dir="ltr"
            className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-left"
          />
        </div>
        <div className="md:col-span-3">
          <label className="block text-xs font-medium text-gray-600 mb-1">الاستفسار</label>
          <textarea
            value={draft.inquiry}
            onChange={(e) => setDraft({ ...draft, inquiry: e.target.value })}
            rows={2}
            placeholder="ماذا طلب العميل؟"
            className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <div className="md:col-span-3">
          <label className="block text-xs font-medium text-gray-600 mb-1">الرد المقدّم</label>
          <textarea
            value={draft.response}
            onChange={(e) => setDraft({ ...draft, response: e.target.value })}
            rows={2}
            placeholder="ماذا قمت بالرد؟"
            className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <div className="md:col-span-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setDraft(emptyDraft())}
            className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm text-gray-700"
          >
            مسح
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold shadow"
          >
            {saving ? '...جاري الحفظ' : 'حفظ المكالمة'}
          </button>
        </div>
      </form>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow p-4 mb-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">من تاريخ</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">إلى تاريخ</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">بحث (هاتف / اسم / بريد)</label>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ابحث برقم الهاتف، الاسم، أو البريد الإلكتروني"
            className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
          />
        </div>
      </div>

      {/* Logs list */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        {loading && <div className="p-8 text-center text-gray-500">⏳ جاري التحميل...</div>}
        {!loading && logs.length === 0 && (
          <div className="p-8 text-center text-gray-500">لا توجد مكالمات في الفترة / البحث المحدد</div>
        )}
        {!loading && logs.length > 0 && (
          <ul className="divide-y divide-gray-100">
            {logs.map((row) => {
              const isEditing = editingId === row.id
              return (
                <li key={row.id} className="p-3 md:p-4 hover:bg-gray-50">
                  {!isEditing ? (
                    <div>
                      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-gray-800">
                            👤 {row.customerName || '(بدون اسم)'}
                          </span>
                          {row.phone && (
                            <a
                              href={`tel:${row.phone}`}
                              dir="ltr"
                              className="text-sm font-mono text-blue-700 hover:underline"
                            >
                              📞 {row.phone}
                            </a>
                          )}
                          {row.email && (
                            <a
                              href={`mailto:${row.email}`}
                              dir="ltr"
                              className="text-xs text-gray-600 hover:underline"
                            >
                              ✉️ {row.email}
                            </a>
                          )}
                          {row.customerId && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">
                              عميل مسجّل
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 flex items-center gap-3">
                          <span>
                            🗓 {row.callDate} • ⏰ {row.callTime}
                          </span>
                          <button
                            type="button"
                            onClick={() => startEdit(row)}
                            className="text-blue-700 hover:underline"
                          >
                            تعديل
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteRow(row.id)}
                            className="text-red-700 hover:underline"
                          >
                            حذف
                          </button>
                        </div>
                      </div>
                      {row.inquiry && (
                        <div className="text-sm text-gray-700 mt-2">
                          <span className="font-bold">الاستفسار: </span>
                          <span className="whitespace-pre-wrap">{row.inquiry}</span>
                        </div>
                      )}
                      {row.response && (
                        <div className="text-sm text-gray-700 mt-1">
                          <span className="font-bold">الرد: </span>
                          <span className="whitespace-pre-wrap">{row.response}</span>
                        </div>
                      )}
                      <div className="text-[11px] text-gray-400 mt-2">
                        سُجّل بواسطة: {row.loggedBy || '—'} •{' '}
                        {formatCairoDateTime(row.createdAt)}
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
                      <input
                        type="date"
                        value={editDraft.callDate || ''}
                        onChange={(e) => setEditDraft({ ...editDraft, callDate: e.target.value })}
                        className="px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                      <input
                        type="time"
                        value={editDraft.callTime || ''}
                        onChange={(e) => setEditDraft({ ...editDraft, callTime: e.target.value })}
                        className="px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                      <input
                        type="text"
                        value={editDraft.customerName || ''}
                        onChange={(e) =>
                          setEditDraft({ ...editDraft, customerName: e.target.value })
                        }
                        placeholder="اسم العميل"
                        className="px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                      <input
                        type="text"
                        value={editDraft.phone || ''}
                        onChange={(e) => setEditDraft({ ...editDraft, phone: e.target.value })}
                        placeholder="هاتف"
                        dir="ltr"
                        className="px-2 py-1 border border-gray-300 rounded text-sm text-left"
                      />
                      <input
                        type="email"
                        value={editDraft.email || ''}
                        onChange={(e) => setEditDraft({ ...editDraft, email: e.target.value })}
                        placeholder="بريد"
                        dir="ltr"
                        className="md:col-span-2 px-2 py-1 border border-gray-300 rounded text-sm text-left"
                      />
                      <textarea
                        value={editDraft.inquiry || ''}
                        onChange={(e) => setEditDraft({ ...editDraft, inquiry: e.target.value })}
                        rows={2}
                        placeholder="الاستفسار"
                        className="md:col-span-3 px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                      <textarea
                        value={editDraft.response || ''}
                        onChange={(e) => setEditDraft({ ...editDraft, response: e.target.value })}
                        rows={2}
                        placeholder="الرد"
                        className="md:col-span-3 px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                      <div className="md:col-span-6 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 text-xs text-gray-700"
                        >
                          إلغاء
                        </button>
                        <button
                          type="button"
                          onClick={() => saveEdit(row.id)}
                          className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-xs text-white font-bold"
                        >
                          حفظ
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
