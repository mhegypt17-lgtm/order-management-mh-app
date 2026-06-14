'use client'

// OrderFeedbackCard
// Shown on /orders/[id]. Self-fetches delivery status + existing feedback.
// Renders nothing while loading; renders "not yet delivered" hint if the
// order isn't delivered yet; otherwise lets a CS agent capture a 5-star
// rating + comment (or edit it within 30 days).
//
// When a low rating (<=2) is saved, the API auto-creates a complaint and
// returns the linked complaint id — the card surfaces a deep link.

import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import Link from 'next/link'
import { useAuthStore } from '@/lib/auth'
import { formatCairoDateTime } from '@/lib/cairoTime'

type Feedback = {
  id: string
  orderId: string
  rating: number
  comment: string
  collectedBy: string
  collectedAt: string
  contactChannel: 'phone' | 'whatsapp' | 'in-person' | 'other' | null
  followUpRequired: boolean
  escalatedComplaintId: string | null
}

const EDIT_WINDOW_DAYS = 30

const CHANNEL_OPTIONS: Array<{ value: NonNullable<Feedback['contactChannel']>; label: string }> = [
  { value: 'phone', label: '📞 مكالمة' },
  { value: 'whatsapp', label: '🟢 واتساب' },
  { value: 'in-person', label: '🏪 في الفرع' },
  { value: 'other', label: '— أخرى' },
]

function ratingFaceFor(rating: number) {
  if (rating >= 5) return { face: '😍', label: 'ممتاز', tone: 'bg-emerald-50 border-emerald-300 text-emerald-900' }
  if (rating === 4) return { face: '🙂', label: 'جيد', tone: 'bg-green-50 border-green-300 text-green-900' }
  if (rating === 3) return { face: '😐', label: 'مقبول', tone: 'bg-yellow-50 border-yellow-300 text-yellow-900' }
  if (rating === 2) return { face: '🙁', label: 'سيء', tone: 'bg-orange-50 border-orange-300 text-orange-900' }
  return { face: '😡', label: 'غاضب', tone: 'bg-red-50 border-red-300 text-red-900' }
}

function StarPicker({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled?: boolean }) {
  const [hover, setHover] = useState(0)
  const display = hover || value
  return (
    <div className="flex items-center gap-1.5 justify-center" dir="ltr">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(n)}
          className={`text-4xl leading-none transition-transform ${
            disabled ? 'cursor-not-allowed' : 'hover:scale-110'
          } ${n <= display ? 'text-yellow-400' : 'text-gray-300'}`}
          aria-label={`${n} نجوم`}
        >
          ★
        </button>
      ))}
    </div>
  )
}

export default function OrderFeedbackCard({ orderId }: { orderId: string }) {
  const { user } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [deliveryStatus, setDeliveryStatus] = useState<string>('')
  const [feedback, setFeedback] = useState<Feedback | null>(null)

  const [open, setOpen] = useState(false)
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [channel, setChannel] = useState<Feedback['contactChannel']>('phone')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [orderRes, fbRes] = await Promise.all([
        fetch(`/api/orders/${orderId}`, { cache: 'no-store' }),
        fetch(`/api/feedback?orderId=${encodeURIComponent(orderId)}`, { cache: 'no-store' }),
      ])
      const orderJson = await orderRes.json().catch(() => null)
      const fbJson = await fbRes.json().catch(() => null)
      setDeliveryStatus(orderJson?.order?.delivery?.deliveryStatus || '')
      const existing: Feedback | null =
        Array.isArray(fbJson?.feedback) && fbJson.feedback.length > 0 ? (fbJson.feedback[0] as Feedback) : null
      setFeedback(existing)
      if (existing) {
        setRating(existing.rating)
        setComment(existing.comment || '')
        setChannel(existing.contactChannel || 'phone')
      }
    } catch {
      /* network errors silenced — card just hides */
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (orderId) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId])

  const isDelivered = deliveryStatus === 'تم التوصيل'
  const isEditable = useMemo(() => {
    if (!feedback) return true
    const ageMs = Date.now() - new Date(feedback.collectedAt).getTime()
    return ageMs <= EDIT_WINDOW_DAYS * 24 * 60 * 60 * 1000
  }, [feedback])

  const submit = async () => {
    if (!rating) {
      toast.error('اختر تقييم من 1 إلى 5 نجوم')
      return
    }
    setSaving(true)
    try {
      const isEdit = !!feedback
      const res = await fetch('/api/feedback', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isEdit
            ? { id: feedback.id, rating, comment, contactChannel: channel }
            : { orderId, rating, comment, contactChannel: channel, collectedBy: user.name },
        ),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json?.error || 'فشل الحفظ')
        return
      }
      const saved: Feedback = json.feedback
      setFeedback(saved)
      setOpen(false)
      if (saved.escalatedComplaintId) {
        toast.success('تم حفظ التقييم وتم فتح تذكرة شكوى للمتابعة', { duration: 5000 })
      } else {
        toast.success('تم حفظ التقييم')
      }
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحفظ')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return null
  if (!isDelivered && !feedback) {
    return (
      <section className="bg-white rounded-lg border border-gray-200 p-4">
        <h2 className="text-lg font-bold text-gray-900 mb-1">⭐ تقييم العميل</h2>
        <p className="text-sm text-gray-500">
          سيظهر زر إضافة التقييم بعد تغيير حالة التوصيل إلى <strong>تم التوصيل</strong>.
        </p>
      </section>
    )
  }

  return (
    <section className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-lg font-bold text-gray-900">⭐ تقييم العميل</h2>
        {feedback ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            disabled={!isEditable}
            className="text-xs px-3 py-1.5 rounded-lg bg-blue-100 text-blue-800 font-bold hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed"
            title={isEditable ? 'تعديل التقييم' : `لا يمكن التعديل بعد ${EDIT_WINDOW_DAYS} يوم من جمع التقييم`}
          >
            ✏️ تعديل
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-sm px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold shadow"
          >
            📝 إضافة تقييم العميل
          </button>
        )}
      </div>

      {/* Display */}
      {feedback ? (
        <div className={`rounded-lg border ${ratingFaceFor(feedback.rating).tone} p-3 text-right`}>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl">{ratingFaceFor(feedback.rating).face}</span>
            <div>
              <div className="text-2xl font-bold" dir="ltr">
                {'★'.repeat(feedback.rating)}
                <span className="text-gray-300">{'★'.repeat(5 - feedback.rating)}</span>
              </div>
              <div className="text-xs">
                {ratingFaceFor(feedback.rating).label} · {feedback.rating}/5
              </div>
            </div>
          </div>
          {feedback.comment && (
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{feedback.comment}</p>
          )}
          <div className="text-[11px] mt-2 opacity-80">
            بواسطة <strong>{feedback.collectedBy}</strong> ·{' '}
            <span dir="ltr">{formatCairoDateTime(feedback.collectedAt, 'en-GB')}</span>
            {feedback.contactChannel && ` · ${CHANNEL_OPTIONS.find((c) => c.value === feedback.contactChannel)?.label || feedback.contactChannel}`}
          </div>
          {feedback.escalatedComplaintId && (
            <div className="mt-3 pt-3 border-t border-current border-opacity-20">
              <Link
                href={`/orders/complaints?complaintId=${feedback.escalatedComplaintId}`}
                className="text-xs font-bold underline"
              >
                🎫 شكوى متابعة تم فتحها — اضغط للعرض
              </Link>
            </div>
          )}
          {!isEditable && (
            <p className="text-[10px] mt-2 opacity-60">
              ⚠️ انتهت فترة التعديل ({EDIT_WINDOW_DAYS} يوم).
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-gray-500">لا يوجد تقييم محفوظ لهذا الطلب.</p>
      )}

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-[9000] bg-black/50 flex items-center justify-center p-4" onClick={() => !saving && setOpen(false)}>
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6"
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold text-gray-900 mb-1 text-center">
              {feedback ? '✏️ تعديل تقييم العميل' : '📝 إضافة تقييم العميل'}
            </h3>
            <p className="text-xs text-gray-500 text-center mb-4">سجّل ما قاله العميل عن الطلب بعد التوصيل</p>

            <StarPicker value={rating} onChange={setRating} disabled={saving} />
            {rating > 0 && (
              <div className="mt-2 text-center text-sm text-gray-700">
                {ratingFaceFor(rating).face} {ratingFaceFor(rating).label}
              </div>
            )}

            {rating > 0 && rating <= 2 && (
              <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800 text-center">
                ⚠️ تقييم منخفض — سيتم فتح تذكرة شكوى تلقائياً للمتابعة.
              </div>
            )}

            <label className="block mt-4 text-sm text-gray-700 font-medium">قناة التواصل</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {CHANNEL_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setChannel(opt.value)}
                  className={`text-xs px-3 py-1.5 rounded-lg border ${
                    channel === opt.value
                      ? 'bg-red-600 text-white border-red-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <label className="block mt-4 text-sm text-gray-700 font-medium">
              تعليق العميل <span className="text-gray-400">(اختياري)</span>
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="اكتب ما قاله العميل بالضبط..."
              className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-red-500"
              disabled={saving}
            />
            <div className="text-left text-[11px] text-gray-400 mt-1">{comment.length}/1000</div>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={saving}
                className="flex-1 py-2.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={saving || !rating}
                className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold shadow disabled:opacity-50"
              >
                {saving ? '...جاري الحفظ' : feedback ? '💾 حفظ التعديلات' : '💾 حفظ التقييم'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
