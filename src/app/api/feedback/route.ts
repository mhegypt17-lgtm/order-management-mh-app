import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import {
  OrderFeedbackRecord,
  createComplaint,
  generateId,
} from '@/lib/omsData'
import {
  FEEDBACK_DIMENSIONS,
  getEscalationReasons,
  type FeedbackDimensionKey,
} from '@/lib/feedbackDimensions'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const EDIT_WINDOW_DAYS = 30
const LOW_RATING_THRESHOLD = 2 // ratings ≤ 2 trigger an auto-complaint

// Narrow projection — never fetch huge text comments unless explicitly needed.
const SUMMARY_COLS = 'id,orderId,customerId,rating,collectedBy,collectedAt,followUpRequired'

// Parse + validate the 7 optional sub-dimensions out of an incoming body.
// Unknown / disallowed values are rejected with a 400 to keep the data clean.
function parseDimensions(body: Record<string, unknown>): {
  ok: true
  values: Partial<OrderFeedbackRecord>
} | { ok: false; error: string } {
  const out: Partial<OrderFeedbackRecord> = {}
  for (const dim of FEEDBACK_DIMENSIONS) {
    const key = dim.key as FeedbackDimensionKey
    if (key in body) {
      const raw = body[key]
      if (raw === null || raw === '') {
        ;(out as Record<string, unknown>)[key] = null
      } else if (typeof raw === 'string') {
        const allowed = dim.options.some((o) => o.value === raw)
        if (!allowed) {
          return { ok: false, error: `قيمة غير صالحة لـ ${dim.label}` }
        }
        ;(out as Record<string, unknown>)[key] = raw
      } else {
        return { ok: false, error: `قيمة غير صالحة لـ ${dim.label}` }
      }
    }
    if (dim.otherField && dim.otherField in body) {
      const raw = body[dim.otherField]
      ;(out as Record<string, unknown>)[dim.otherField] =
        raw === null || raw === '' ? null : String(raw).slice(0, 500)
    }
  }
  return { ok: true, values: out }
}

function isWithinEditWindow(collectedAt: string): boolean {
  const collected = new Date(collectedAt).getTime()
  if (!isFinite(collected)) return false
  return Date.now() - collected <= EDIT_WINDOW_DAYS * 24 * 60 * 60 * 1000
}

// GET /api/feedback
// Filters:
//   ?from=YYYY-MM-DD&to=YYYY-MM-DD   collected-date range
//   ?orderId=...                     single-order lookup
//   ?ratingMax=2 / ?ratingMin=4      bucket filters
//   ?collectedBy=name                per-agent filter
//   ?summary=1                       narrow projection (no comments)
export async function GET(req: NextRequest) {
  try {
    const url = req.nextUrl
    const orderId = url.searchParams.get('orderId')
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const ratingMin = Number(url.searchParams.get('ratingMin')) || undefined
    const ratingMax = Number(url.searchParams.get('ratingMax')) || undefined
    const collectedBy = url.searchParams.get('collectedBy')
    const summary = url.searchParams.get('summary') === '1'

    let query = supabase
      .from('order_feedback')
      .select(summary ? SUMMARY_COLS : '*')
      .order('collectedAt', { ascending: false })

    if (orderId) query = query.eq('orderId', orderId)
    if (from) query = query.gte('collectedAt', from)
    if (to) {
      // Inclusive end-of-day
      const end = new Date(to)
      end.setHours(23, 59, 59, 999)
      query = query.lte('collectedAt', end.toISOString())
    }
    if (ratingMin) query = query.gte('rating', ratingMin)
    if (ratingMax) query = query.lte('rating', ratingMax)
    if (collectedBy) query = query.eq('collectedBy', collectedBy)

    const { data, error } = await query
    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch feedback', details: error.message },
        { status: 500 },
      )
    }

    return NextResponse.json({ feedback: data || [] }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: 'Failed to fetch feedback', details: e?.message }, { status: 500 })
  }
}

// POST /api/feedback
// Body: { orderId, rating, comment, collectedBy, contactChannel? }
//
// Validates that:
//  * the order exists & has deliveryStatus === 'تم التوصيل'
//  * no feedback already exists for that order (unique constraint also enforces this)
//
// Side effect: when rating <= LOW_RATING_THRESHOLD, creates a linked
// complaint in the existing complaints workflow so it gets routed to an
// agent for follow-up. Stores the resulting complaint id back on the
// feedback row so we can deep-link from the feedback list page.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'invalid json' }, { status: 400 })

    const orderId = String(body.orderId || '').trim()
    const rating = Math.round(Number(body.rating))
    const comment = String(body.comment || '').trim()
    const collectedBy = String(body.collectedBy || '').trim()
    const contactChannel = body.contactChannel ? String(body.contactChannel) : null

    if (!orderId) return NextResponse.json({ error: 'orderId مطلوب' }, { status: 400 })
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'التقييم يجب أن يكون بين 1 و 5' }, { status: 400 })
    }
    if (!collectedBy) {
      return NextResponse.json({ error: 'اسم المسؤول مطلوب' }, { status: 400 })
    }

    // Parse + validate the optional detailed dimensions
    const dimsResult = parseDimensions(body)
    if (!dimsResult.ok) {
      return NextResponse.json({ error: dimsResult.error }, { status: 400 })
    }
    const dimensions = dimsResult.values

    // 1) Validate order + delivery status
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('id, "customerId"')
      .eq('id', orderId)
      .maybeSingle()
    if (orderErr || !order) {
      return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 })
    }

    const { data: delivery } = await supabase
      .from('order_delivery')
      .select('deliveryStatus')
      .eq('orderId', orderId)
      .maybeSingle()
    if (!delivery || delivery.deliveryStatus !== 'تم التوصيل') {
      return NextResponse.json(
        { error: 'لا يمكن إضافة تقييم قبل توصيل الطلب' },
        { status: 409 },
      )
    }

    // 2) Block duplicates (also enforced by unique constraint — we check
    //    here for a clean error message before hitting Postgres).
    const { data: existing } = await supabase
      .from('order_feedback')
      .select('id')
      .eq('orderId', orderId)
      .maybeSingle()
    if (existing) {
      return NextResponse.json(
        { error: 'يوجد تقييم محفوظ لهذا الطلب بالفعل. استخدم زر التعديل بدلاً من ذلك.' },
        { status: 409 },
      )
    }

    const now = new Date().toISOString()
    const customerId = (order as any).customerId || null

    let escalatedComplaintId: string | null = null

    // 3) Decide if we need to auto-escalate. Triggers:
    //    a) Overall rating <= LOW_RATING_THRESHOLD
    //    b) Any sub-dimension answered with a value in its escalateOn list
    //       (e.g. "جودة منخفضة", "متأخر جداً", "لا" for recommend, etc.)
    const subReasons = getEscalationReasons(dimensions)
    const lowRating = rating <= LOW_RATING_THRESHOLD
    const shouldEscalate = lowRating || subReasons.length > 0

    if (shouldEscalate) {
      try {
        // Fetch customer phone/name for the complaint card
        let customerName: string | null = null
        let customerPhone: string | null = null
        if (customerId) {
          const { data: cust } = await supabase
            .from('customers')
            .select('customerName, phone')
            .eq('id', customerId)
            .maybeSingle()
          customerName = (cust as any)?.customerName || null
          customerPhone = (cust as any)?.phone || null
        }

        // Build a human-readable subject + reason listing every trigger
        const triggers: string[] = []
        if (lowRating) triggers.push(`تقييم عام منخفض (${rating}/5)`)
        for (const r of subReasons) triggers.push(`${r.dim.label}: ${r.value}`)
        const subject = `تقييم سلبي من العميل — ${triggers[0]}${triggers.length > 1 ? ` (+${triggers.length - 1})` : ''}`
        const reason = triggers.join(' • ')

        // Priority: high if overall rating is 1 OR multiple sub-dim triggers, else medium
        const priority: 'high' | 'medium' =
          rating === 1 || subReasons.length >= 2 ? 'high' : 'medium'

        // Description = customer comment + structured trigger summary
        const descriptionLines: string[] = []
        if (comment) descriptionLines.push(comment)
        if (triggers.length) {
          descriptionLines.push('')
          descriptionLines.push('— أسباب التصعيد الآلي —')
          for (const t of triggers) descriptionLines.push(`• ${t}`)
        }

        const complaint = await createComplaint({
          channel: 'App',
          subject,
          description: descriptionLines.join('\n') || '(لم يُسجل تعليق نصي)',
          reason,
          status: 'open',
          priority,
          customerId,
          customerName,
          customerPhone,
          linkedOrderId: orderId,
          assignedTo: collectedBy,
          createdBy: `النظام (تقييم آلي بواسطة ${collectedBy})`,
          compensationAmount: 0,
          productIds: [],
          openedAt: now,
          closedAt: null,
        })
        escalatedComplaintId = complaint.id
      } catch (e) {
        console.error('auto-complaint creation from feedback failed:', e)
        // Don't fail the whole request — feedback still saves.
      }
    }

    const feedback: OrderFeedbackRecord = {
      id: generateId('fbk'),
      orderId,
      customerId,
      rating,
      comment,
      collectedBy,
      collectedAt: now,
      contactChannel: contactChannel as OrderFeedbackRecord['contactChannel'],
      followUpRequired: shouldEscalate,
      escalatedComplaintId,
      productQuality: null,
      packaging: null,
      packagingOther: null,
      deliveryTimeliness: null,
      customerService: null,
      customerServiceOther: null,
      pricingValue: null,
      appUsability: null,
      recommendToFriends: null,
      ...dimensions,
      createdAt: now,
      updatedAt: now,
    }

    const { error: insertErr } = await supabase.from('order_feedback').insert([feedback])
    if (insertErr) {
      return NextResponse.json(
        { error: 'فشل حفظ التقييم', details: insertErr.message },
        { status: 500 },
      )
    }

    return NextResponse.json({ feedback }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: 'failed', details: e?.message }, { status: 500 })
  }
}

// PATCH /api/feedback
// Body: { id, rating?, comment?, contactChannel?, editedBy }
//
// Only allowed within EDIT_WINDOW_DAYS of collectedAt. Admins are not
// granted a back-door here (deliberately) — if you need a stale fix the
// recommended path is to delete + recreate via admin tooling.
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'invalid json' }, { status: 400 })

    const id = String(body.id || '').trim()
    if (!id) return NextResponse.json({ error: 'id مطلوب' }, { status: 400 })

    const { data: existing, error: getErr } = await supabase
      .from('order_feedback')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (getErr || !existing) {
      return NextResponse.json({ error: 'التقييم غير موجود' }, { status: 404 })
    }

    if (!isWithinEditWindow((existing as OrderFeedbackRecord).collectedAt)) {
      return NextResponse.json(
        { error: `انتهت فترة التعديل (${EDIT_WINDOW_DAYS} يوم).` },
        { status: 403 },
      )
    }

    const patch: Partial<OrderFeedbackRecord> & { updatedAt: string } = {
      updatedAt: new Date().toISOString(),
    }
    if (typeof body.rating !== 'undefined') {
      const r = Math.round(Number(body.rating))
      if (!Number.isFinite(r) || r < 1 || r > 5) {
        return NextResponse.json({ error: 'تقييم غير صالح' }, { status: 400 })
      }
      patch.rating = r
    }
    if (typeof body.comment === 'string') patch.comment = body.comment.trim()
    if (typeof body.contactChannel !== 'undefined') {
      patch.contactChannel = (body.contactChannel || null) as OrderFeedbackRecord['contactChannel']
    }

    // Detailed dimensions — validate against config
    const dimsResult = parseDimensions(body)
    if (!dimsResult.ok) {
      return NextResponse.json({ error: dimsResult.error }, { status: 400 })
    }
    Object.assign(patch, dimsResult.values)

    // Recompute followUpRequired from the merged (existing + patch) state
    const merged = { ...(existing as OrderFeedbackRecord), ...patch }
    patch.followUpRequired =
      merged.rating <= LOW_RATING_THRESHOLD || getEscalationReasons(merged).length > 0

    const { data: updated, error: updErr } = await supabase
      .from('order_feedback')
      .update(patch)
      .eq('id', id)
      .select()
      .single()
    if (updErr) {
      return NextResponse.json({ error: 'فشل التحديث', details: updErr.message }, { status: 500 })
    }

    return NextResponse.json({ feedback: updated }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: 'failed', details: e?.message }, { status: 500 })
  }
}
