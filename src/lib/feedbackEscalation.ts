// Shared helper for creating a complaint linked to a feedback row.
// Used by:
//   - POST /api/feedback         (auto-escalation at submission time)
//   - POST /api/feedback/escalate (manual / retry escalation by CS)
//
// Verifies the insert actually persisted — the legacy `createComplaint`
// helper logs and returns the in-memory object even when Supabase rejects
// the insert (RLS, NOT NULL violation, etc.), which used to leave us with
// a dangling escalatedComplaintId. We re-read the row to be sure.

import { supabase } from '@/lib/supabase'
import { createComplaint } from '@/lib/omsData'

export interface EscalationContext {
  orderId: string
  customerId: string | null
  customerName: string | null
  customerPhone: string | null
  rating: number
  comment: string
  collectedBy: string
  triggers: string[]
  priority: 'high' | 'medium'
}

export async function buildAndCreateComplaint(
  ctx: EscalationContext,
  now: string,
): Promise<{ id: string | null; error?: string }> {
  try {
    const subject = `تقييم سلبي من العميل — ${ctx.triggers[0]}${
      ctx.triggers.length > 1 ? ` (+${ctx.triggers.length - 1})` : ''
    }`
    const reason = ctx.triggers.join(' • ')
    const descriptionLines: string[] = []
    if (ctx.comment) descriptionLines.push(ctx.comment)
    if (ctx.triggers.length) {
      descriptionLines.push('')
      descriptionLines.push('— أسباب التصعيد —')
      for (const t of ctx.triggers) descriptionLines.push(`• ${t}`)
    }

    const complaint = await createComplaint({
      channel: 'App',
      subject,
      description: descriptionLines.join('\n') || '(لم يُسجل تعليق نصي)',
      reason,
      status: 'open',
      priority: ctx.priority,
      customerId: ctx.customerId,
      customerName: ctx.customerName,
      customerPhone: ctx.customerPhone,
      linkedOrderId: ctx.orderId,
      assignedTo: ctx.collectedBy,
      createdBy: `النظام (تقييم بواسطة ${ctx.collectedBy})`,
      compensationAmount: 0,
      productIds: [],
      openedAt: now,
      closedAt: null,
    })

    // Verify the insert persisted
    const { data: verify, error: verifyErr } = await supabase
      .from('complaints')
      .select('id')
      .eq('id', complaint.id)
      .maybeSingle()
    if (verifyErr || !verify) {
      console.error('complaint insert verification failed', verifyErr)
      return { id: null, error: verifyErr?.message || 'تعذّر التحقق من حفظ الشكوى' }
    }
    return { id: complaint.id }
  } catch (e: any) {
    console.error('complaint creation threw:', e)
    return { id: null, error: e?.message || 'فشل إنشاء الشكوى' }
  }
}
