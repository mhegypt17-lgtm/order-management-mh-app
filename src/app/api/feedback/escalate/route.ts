import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import type { OrderFeedbackRecord } from '@/lib/omsData'
import { getEscalationReasons } from '@/lib/feedbackDimensions'
import { buildAndCreateComplaint } from '@/lib/feedbackEscalation'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// POST /api/feedback/escalate
// Body: { feedbackId, by? }
//
// Manually open (or re-open) a complaint linked to a saved feedback row.
// Used when the auto-escalation failed at submission time, OR when CS
// decides a borderline rating still deserves a complaint ticket.
//
// Idempotency: if the feedback already has a non-null escalatedComplaintId
// AND that complaint actually exists, we return it without creating a new
// one. If the linked id is dangling (the auto-create silently failed in
// older builds), we create a fresh complaint and overwrite the link.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'invalid json' }, { status: 400 })

    const feedbackId = String(body.feedbackId || '').trim()
    if (!feedbackId) {
      return NextResponse.json({ error: 'feedbackId مطلوب' }, { status: 400 })
    }
    const by = String(body.by || '').trim() || null

    // 1) Load the feedback row
    const { data: fb, error: fbErr } = await supabase
      .from('order_feedback')
      .select('*')
      .eq('id', feedbackId)
      .maybeSingle()
    if (fbErr || !fb) {
      return NextResponse.json({ error: 'التقييم غير موجود' }, { status: 404 })
    }
    const feedback = fb as OrderFeedbackRecord

    // 2) If a complaint id is already attached and still exists, just return it.
    if (feedback.escalatedComplaintId) {
      const { data: existing } = await supabase
        .from('complaints')
        .select('id')
        .eq('id', feedback.escalatedComplaintId)
        .maybeSingle()
      if (existing) {
        return NextResponse.json(
          { feedback, complaintId: feedback.escalatedComplaintId, alreadyExists: true },
          { status: 200 },
        )
      }
      // Otherwise the previous id was dangling — fall through and create fresh.
    }

    // 3) Look up customer contact info
    let customerName: string | null = null
    let customerPhone: string | null = null
    if (feedback.customerId) {
      const { data: cust } = await supabase
        .from('customers')
        .select('customerName, phone')
        .eq('id', feedback.customerId)
        .maybeSingle()
      customerName = (cust as any)?.customerName || null
      customerPhone = (cust as any)?.phone || null
    }

    // 4) Recompute triggers from current feedback state. We escalate even if
    //    no auto-trigger matched — this endpoint is also CS's manual escape
    //    hatch — but we tag the reasons so the complaint says why.
    const subReasons = getEscalationReasons(feedback)
    const lowRating = feedback.rating <= 2
    const triggers: string[] = []
    if (lowRating) triggers.push(`تقييم عام منخفض (${feedback.rating}/5)`)
    for (const r of subReasons) triggers.push(`${r.dim.label}: ${r.value}`)
    if (triggers.length === 0) triggers.push(`تصعيد يدوي بواسطة ${by || 'CS'} (تقييم ${feedback.rating}/5)`)

    const priority: 'high' | 'medium' =
      feedback.rating === 1 || subReasons.length >= 2 ? 'high' : 'medium'

    const now = new Date().toISOString()
    const result = await buildAndCreateComplaint(
      {
        orderId: feedback.orderId,
        customerId: feedback.customerId,
        customerName,
        customerPhone,
        rating: feedback.rating,
        comment: feedback.comment || '',
        collectedBy: by || feedback.collectedBy,
        triggers,
        priority,
      },
      now,
    )

    if (!result.id) {
      return NextResponse.json(
        { error: 'فشل إنشاء الشكوى', details: result.error || null },
        { status: 500 },
      )
    }

    // 5) Link the new complaint id back onto the feedback row
    const { data: updated, error: updErr } = await supabase
      .from('order_feedback')
      .update({
        escalatedComplaintId: result.id,
        followUpRequired: true,
        updatedAt: now,
      })
      .eq('id', feedbackId)
      .select()
      .single()
    if (updErr) {
      // The complaint exists but we couldn't write the link back. Log and
      // still return the new complaint id so the UI can navigate to it.
      console.error('feedback link-back failed:', updErr)
    }

    return NextResponse.json(
      { feedback: updated || feedback, complaintId: result.id, alreadyExists: false },
      { status: 201 },
    )
  } catch (e: any) {
    return NextResponse.json({ error: 'failed', details: e?.message }, { status: 500 })
  }
}
