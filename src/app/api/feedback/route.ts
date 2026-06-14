import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import {
  OrderFeedbackRecord,
  createComplaint,
  generateId,
  readOrderFeedback,
} from '@/lib/omsData'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const EDIT_WINDOW_DAYS = 30
const LOW_RATING_THRESHOLD = 2 // ratings ≤ 2 trigger an auto-complaint

// Narrow projection — never fetch huge text comments unless explicitly needed.
const SUMMARY_COLS = 'id,orderId,customerId,rating,collectedBy,collectedAt,followUpRequired'

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

    // 3) Auto-escalate low ratings to the existing complaints workflow
    if (rating <= LOW_RATING_THRESHOLD) {
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

        const complaint = await createComplaint({
          channel: 'App',
          subject: `تقييم منخفض (${rating}/5) من العميل`,
          description: comment || '(لم يُسجل تعليق نصي)',
          reason: 'تقييم منخفض بعد التوصيل',
          status: 'open',
          priority: rating === 1 ? 'high' : 'medium',
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
      followUpRequired: rating <= LOW_RATING_THRESHOLD,
      escalatedComplaintId,
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
      patch.followUpRequired = r <= LOW_RATING_THRESHOLD
    }
    if (typeof body.comment === 'string') patch.comment = body.comment.trim()
    if (typeof body.contactChannel !== 'undefined') {
      patch.contactChannel = (body.contactChannel || null) as OrderFeedbackRecord['contactChannel']
    }

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
