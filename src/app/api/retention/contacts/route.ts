import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { supabase } from '@/lib/supabase'
import { DEFAULT_RETENTION_CONFIG, generateId, readOrderSettings, type RetentionConfig } from '@/lib/omsData'
import { isMissingTable } from '@/lib/retentionData'
import { NOT_INTERESTED_REASONS, isContactResult, nextCallAt } from '@/lib/retentionQueue'
import { stageForDays } from '@/lib/retentionView'

export const dynamic = 'force-dynamic'

const clip = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max)

// Logs one outbound retention call. The customer leaves the CS queue until the
// next-call date; outcomes (won/lost) are derived later from their orders.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const customerId = clip(body.customerId, 80)
    const agent = clip(body.agent, 60)
    if (!customerId) return NextResponse.json({ error: 'العميل مطلوب', code: 'CUSTOMER_REQUIRED' }, { status: 400 })
    if (!agent) return NextResponse.json({ error: 'اسم الموظف مطلوب', code: 'AGENT_REQUIRED' }, { status: 400 })
    if (!isContactResult(body.result)) return NextResponse.json({ error: 'نتيجة المكالمة غير صحيحة', code: 'BAD_RESULT' }, { status: 400 })
    const result = body.result
    const reason = result === 'not_interested' ? clip(body.reason, 40) : ''
    if (result === 'not_interested' && !NOT_INTERESTED_REASONS.some((r) => r.key === reason)) {
      return NextResponse.json({ error: 'اختر سبب عدم الاهتمام', code: 'REASON_REQUIRED' }, { status: 400 })
    }

    const { data: customer } = await supabase.from('customers').select('id,followUpSnoozeUntil').eq('id', customerId).maybeSingle()
    if (!customer) return NextResponse.json({ error: 'العميل غير موجود', code: 'CUSTOMER_NOT_FOUND' }, { status: 404 })

    // Snapshot at call time (stage, segment, spend) so results can be grouped later.
    const settings = await readOrderSettings()
    const retention: RetentionConfig = settings.retention || DEFAULT_RETENTION_CONFIG
    const [lastOrder, intel] = await Promise.all([
      supabase
        .from('orders')
        .select('createdAt')
        .eq('customerId', customerId)
        .neq('orderStatus', 'لاغي')
        .order('createdAt', { ascending: false })
        .limit(1),
      supabase.from('customer_intelligence_scores').select('lifecycleStage,totalRevenue').eq('customerId', customerId).maybeSingle(),
    ])
    const now = Date.now()
    const lastMs = lastOrder.data?.[0]?.createdAt ? new Date(lastOrder.data[0].createdAt).getTime() : NaN
    const daysInactive = Number.isFinite(lastMs) ? Math.max(0, Math.floor((now - lastMs) / 86_400_000)) : null
    const stage = daysInactive != null ? stageForDays(daysInactive, retention) || null : null

    const next = nextCallAt(result, now, body.nextCallAt)
    const row = {
      id: generateId('contact'),
      customerId,
      agent,
      contactedAt: new Date(now).toISOString(),
      result,
      reason: reason || null,
      note: clip(body.note, 500),
      offer: clip(body.offer, 120),
      nextCallAt: next,
      stage,
      daysInactive,
      segment: intel.data?.lifecycleStage ?? null,
      spendAtContact: intel.data?.totalRevenue != null ? Number(intel.data.totalRevenue) : null,
    }
    const { error } = await supabase.from('retention_contacts').insert(row)
    if (error) {
      console.error('[retention] contact insert failed:', error)
      if (isMissingTable(error.message)) {
        return NextResponse.json(
          { error: 'جدول سجل المكالمات غير موجود — شغّل data/retention-contacts-migration.sql في Supabase', code: 'TABLE_MISSING' },
          { status: 503 },
        )
      }
      return NextResponse.json({ error: 'تعذر حفظ المكالمة', code: 'INSERT_FAILED' }, { status: 500 })
    }

    // Keep the auto follow-up engine quiet for this customer while the call is
    // being followed up; a wrong number stops follow-ups altogether. A failure
    // here must not lose the logged call.
    let warning: string | undefined
    const updates: Record<string, unknown> = {}
    if (result === 'wrong_number') updates.doNotFollowUp = true
    else if (next && result !== 'no_answer') {
      const current = customer.followUpSnoozeUntil ? new Date(customer.followUpSnoozeUntil).getTime() : 0
      if (new Date(next).getTime() > current) updates.followUpSnoozeUntil = next
    }
    if (Object.keys(updates).length > 0) {
      const { error: updErr } = await supabase.from('customers').update(updates).eq('id', customerId)
      if (updErr) {
        console.error('[retention] customer follow-up update failed:', updErr)
        warning = 'تم حفظ المكالمة لكن تعذر تحديث حالة المتابعة للعميل'
      } else {
        revalidateTag('notifications-customers')
      }
    }

    return NextResponse.json({ contact: row, warning }, { status: 201 })
  } catch (err) {
    console.error('[retention] contact failed:', err)
    return NextResponse.json({ error: 'تعذر حفظ المكالمة', code: 'INSERT_FAILED' }, { status: 500 })
  }
}
