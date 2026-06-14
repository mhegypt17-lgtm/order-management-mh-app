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
import {
  FEEDBACK_DIMENSIONS,
  TONE_CLASSES,
  TONE_BADGE,
  findOption,
  getEscalationReasons,
  type FeedbackDimensionKey,
} from '@/lib/feedbackDimensions'

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
  productQuality: string | null
  packaging: string | null
  packagingOther: string | null
  deliveryTimeliness: string | null
  customerService: string | null
  customerServiceOther: string | null
  pricingValue: string | null
  appUsability: string | null
  recommendToFriends: string | null
}

type DimensionState = Record<FeedbackDimensionKey, string | null> & {
  packagingOther: string
  customerServiceOther: string
}

const EMPTY_DIMENSIONS: DimensionState = {
  productQuality: null,
  packaging: null,
  deliveryTimeliness: null,
  customerService: null,
  pricingValue: null,
  appUsability: null,
  recommendToFriends: null,
  packagingOther: '',
  customerServiceOther: '',
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
  const [dims, setDims] = useState<DimensionState>(EMPTY_DIMENSIONS)
  const [saving, setSaving] = useState(false)
  const [escalating, setEscalating] = useState(false)

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
        setDims({
          productQuality: existing.productQuality || null,
          packaging: existing.packaging || null,
          deliveryTimeliness: existing.deliveryTimeliness || null,
          customerService: existing.customerService || null,
          pricingValue: existing.pricingValue || null,
          appUsability: existing.appUsability || null,
          recommendToFriends: existing.recommendToFriends || null,
          packagingOther: existing.packagingOther || '',
          customerServiceOther: existing.customerServiceOther || '',
        })
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
    // Build the dimension payload — only send keys for fields we know about,
    // null when unanswered, free-text "other" only when relevant option is picked.
    const dimPayload: Record<string, string | null> = {
      productQuality: dims.productQuality,
      packaging: dims.packaging,
      packagingOther: dims.packaging === 'أخرى' ? dims.packagingOther.trim() || null : null,
      deliveryTimeliness: dims.deliveryTimeliness,
      customerService: dims.customerService,
      customerServiceOther:
        dims.customerService === 'أخرى' ? dims.customerServiceOther.trim() || null : null,
      pricingValue: dims.pricingValue,
      appUsability: dims.appUsability,
      recommendToFriends: dims.recommendToFriends,
    }

    setSaving(true)
    try {
      const isEdit = !!feedback
      const res = await fetch('/api/feedback', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isEdit
            ? { id: feedback.id, rating, comment, contactChannel: channel, ...dimPayload }
            : { orderId, rating, comment, contactChannel: channel, collectedBy: user.name, ...dimPayload },
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
      } else if (json.shouldEscalate) {
        // We tried to auto-create but it failed. Tell CS to use the manual button.
        toast.error(
          json.escalationError
            ? `تم حفظ التقييم ولكن تعذر فتح الشكوى تلقائياً: ${json.escalationError}`
            : 'تم حفظ التقييم — اضغط فتح شكوى يدوياً',
          { duration: 7000 },
        )
      } else {
        toast.success('تم حفظ التقييم')
      }
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحفظ')
    } finally {
      setSaving(false)
    }
  }

  // Manually open a complaint linked to this feedback. Used when the
  // automatic create failed at submit time, OR when CS decides to escalate
  // a borderline rating after the fact.
  const escalateNow = async () => {
    if (!feedback) return
    if (!confirm('سيتم فتح تذكرة شكوى مرتبطة بهذا التقييم. هل تريد المتابعة؟')) return
    setEscalating(true)
    try {
      const res = await fetch('/api/feedback/escalate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedbackId: feedback.id, by: user.name }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json?.error || 'فشل فتح الشكوى')
        return
      }
      if (json.alreadyExists) {
        toast('الشكوى مفتوحة بالفعل', { icon: 'ℹ️' })
      } else {
        toast.success('تم فتح تذكرة الشكوى')
      }
      setFeedback(json.feedback)
    } catch (e: any) {
      toast.error(e?.message || 'فشل فتح الشكوى')
    } finally {
      setEscalating(false)
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

          {/* Detailed dimensions — only render the ones that were answered */}
          {FEEDBACK_DIMENSIONS.some((d) => (feedback as any)[d.key]) && (
            <div className="mt-3 pt-3 border-t border-current border-opacity-20">
              <div className="flex flex-wrap gap-1.5">
                {FEEDBACK_DIMENSIONS.map((dim) => {
                  const v = (feedback as any)[dim.key] as string | null
                  if (!v) return null
                  const opt = findOption(dim, v)
                  const tone = opt ? TONE_BADGE[opt.tone] : 'bg-gray-100 text-gray-800 border-gray-300'
                  const other =
                    v === 'أخرى' && dim.otherField
                      ? (feedback as any)[dim.otherField]
                      : null
                  return (
                    <span
                      key={dim.key}
                      className={`text-[11px] border rounded-full px-2.5 py-1 font-medium ${tone}`}
                      title={`${dim.label}: ${v}${other ? ` — ${other}` : ''}`}
                    >
                      {dim.icon} {dim.label}: <strong>{v}</strong>
                      {other ? <span className="opacity-70"> — {other}</span> : null}
                    </span>
                  )
                })}
              </div>
            </div>
          )}

          <div className="text-[11px] mt-2 opacity-80">
            بواسطة <strong>{feedback.collectedBy}</strong> ·{' '}
            <span dir="ltr">{formatCairoDateTime(feedback.collectedAt, 'en-GB')}</span>
            {feedback.contactChannel && ` · ${CHANNEL_OPTIONS.find((c) => c.value === feedback.contactChannel)?.label || feedback.contactChannel}`}
          </div>
          {feedback.escalatedComplaintId ? (
            <div className="mt-3 pt-3 border-t border-current border-opacity-20">
              <Link
                href={`/orders/complaints?complaintId=${feedback.escalatedComplaintId}`}
                className="text-xs font-bold underline"
              >
                🎫 شكوى متابعة تم فتحها — اضغط للعرض
              </Link>
            </div>
          ) : (
            // No linked complaint: offer a manual escalate button when
            // either the rating is low OR a sub-dimension would trigger.
            (feedback.rating <= 2 || getEscalationReasons(feedback).length > 0) && (
              <div className="mt-3 pt-3 border-t border-current border-opacity-20 flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[11px] font-medium">⚠️ تقييم يستدعي المتابعة — لم تفتح شكوى بعد.</span>
                <button
                  type="button"
                  onClick={escalateNow}
                  disabled={escalating}
                  className="text-xs px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold shadow disabled:opacity-50"
                >
                  {escalating ? '...جاري' : '🎫 فتح تذكرة شكوى'}
                </button>
              </div>
            )
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
            className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto"
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold text-gray-900 mb-1 text-center">
              {feedback ? '✏️ تعديل تقييم العميل' : '📝 إضافة تقييم العميل'}
            </h3>
            <p className="text-xs text-gray-500 text-center mb-4">سجّل ما قاله العميل عن الطلب بعد التوصيل</p>

            <div className="text-center text-xs text-gray-500 mb-1">التقييم العام <span className="text-red-600">*</span></div>
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

            {/* Detailed dimensions section */}
            <div className="mt-5 pt-5 border-t border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-bold text-gray-900">📊 تقييم مفصل للخدمة</h4>
                <span className="text-[10px] text-gray-500">اختياري — إذا أجاب العميل</span>
              </div>

              <div className="space-y-3">
                {FEEDBACK_DIMENSIONS.map((dim) => {
                  const selected = dims[dim.key]
                  return (
                    <div key={dim.key} className="bg-gray-50 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-gray-800">
                          {dim.icon} {dim.label}
                        </span>
                        {selected && (
                          <button
                            type="button"
                            onClick={() => setDims((d) => ({ ...d, [dim.key]: null }))}
                            className="text-[10px] text-gray-400 hover:text-red-600"
                          >
                            ✕ مسح
                          </button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {dim.options.map((opt) => {
                          const isSel = selected === opt.value
                          const cls = isSel ? TONE_CLASSES[opt.tone].selected : TONE_CLASSES[opt.tone].chip
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => setDims((d) => ({ ...d, [dim.key]: opt.value }))}
                              className={`text-[11px] px-2.5 py-1.5 rounded-lg border font-medium transition ${cls}`}
                            >
                              {opt.value}
                            </button>
                          )
                        })}
                      </div>
                      {/* Free-text "other" field for packaging + customer service */}
                      {dim.hasOther && dim.otherField && selected === 'أخرى' && (
                        <input
                          type="text"
                          value={dims[dim.otherField] as string}
                          onChange={(e) =>
                            setDims((d) => ({ ...d, [dim.otherField!]: e.target.value }))
                          }
                          placeholder="اكتب التفاصيل..."
                          maxLength={500}
                          className="w-full mt-2 px-3 py-1.5 text-xs border border-blue-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                          disabled={saving}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            <label className="block mt-5 text-sm text-gray-700 font-medium">
              تعليق العميل <span className="text-gray-400">(اختياري)</span>
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
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
