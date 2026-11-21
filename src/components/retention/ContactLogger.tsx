'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { CONTACT_RESULTS, NOT_INTERESTED_REASONS, type ContactResult } from '@/lib/retentionQueue'

export default function ContactLogger({
  customerId,
  agent,
  onLogged,
}: {
  customerId: string
  agent: string
  onLogged: () => void
}) {
  const [result, setResult] = useState<ContactResult | null>(null)
  const [reason, setReason] = useState('')
  const [offer, setOffer] = useState('')
  const [note, setNote] = useState('')
  const [nextCall, setNextCall] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!result) return toast.error('اختر نتيجة المكالمة')
    if (result === 'not_interested' && !reason) return toast.error('اختر سبب عدم الاهتمام')
    setSaving(true)
    try {
      const res = await fetch('/api/retention/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, agent, result, reason, offer, note, nextCallAt: nextCall || undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data?.error || 'تعذر حفظ المكالمة', { duration: 8000 })
        return
      }
      toast.success(data?.warning || 'تم تسجيل المكالمة')
      onLogged()
    } catch {
      toast.error('تعذر حفظ المكالمة')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {CONTACT_RESULTS.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => setResult(r.key)}
            className={`px-2.5 py-1 rounded-lg border text-xs font-medium ${
              result === r.key ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>
      {result === 'not_interested' && (
        <select value={reason} onChange={(e) => setReason(e.target.value)} className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white">
          <option value="">— سبب عدم الاهتمام —</option>
          {NOT_INTERESTED_REASONS.map((r) => (
            <option key={r.key} value={r.key}>{r.label}</option>
          ))}
        </select>
      )}
      {result && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input value={offer} onChange={(e) => setOffer(e.target.value)} maxLength={120} placeholder="العرض المستخدم (اختياري)" className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
            <label className="text-xs text-gray-600 flex items-center gap-1">
              مكالمة قادمة
              <input type="date" value={nextCall} onChange={(e) => setNextCall(e.target.value)} className="flex-1 px-2 py-1 border border-gray-300 rounded-lg text-sm" />
            </label>
          </div>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} placeholder="ملاحظة (اختياري)" className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
          <button
            type="button"
            disabled={saving}
            onClick={submit}
            className="px-4 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? 'جاري الحفظ...' : '✅ تسجيل المكالمة'}
          </button>
        </>
      )}
    </div>
  )
}
