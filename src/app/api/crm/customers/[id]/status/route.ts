import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { generateId } from '@/lib/omsData'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type Status = 'active' | 'warning' | 'suspended'

const STATUS_LABEL_AR: Record<Status, string> = {
  active: 'نشط',
  warning: 'تحذير',
  suspended: 'موقوف',
}

async function postChatAlert(message: string) {
  try {
    await supabase.from('chat_messages').insert([
      {
        id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role: 'admin',
        author: 'النظام (تنبيه)',
        text: message,
        createdAt: new Date().toISOString(),
      },
    ])
  } catch (err) {
    console.error('chat alert insert failed:', err)
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json().catch(() => ({} as any))
    const rawStatus = String(body?.status || '').trim() as Status
    if (!['active', 'warning', 'suspended'].includes(rawStatus)) {
      return NextResponse.json({ error: 'حالة غير صالحة' }, { status: 400 })
    }
    const status: Status = rawStatus

    const reason = String(body?.reason || '').trim()
    const by = String(body?.by || 'unknown').trim()
    const byRole = String(body?.byRole || '').trim().toLowerCase()

    // Permission: CS can set active/warning. Only Admin can set suspended.
    if (status === 'suspended' && byRole !== 'admin') {
      return NextResponse.json(
        { error: 'فقط المدير يمكنه تعليق العميل' },
        { status: 403 },
      )
    }
    if (!['admin', 'cs'].includes(byRole)) {
      return NextResponse.json({ error: 'صلاحية غير كافية' }, { status: 403 })
    }
    if ((status === 'warning' || status === 'suspended') && reason.length < 3) {
      return NextResponse.json(
        { error: 'سبب التغيير مطلوب (3 أحرف على الأقل)' },
        { status: 400 },
      )
    }

    const { data: customer, error: custErr } = await supabase
      .from('customers')
      .select('*')
      .eq('id', params.id)
      .maybeSingle()
    if (custErr) {
      console.error('Customer lookup error:', custErr)
      return NextResponse.json({ error: 'تعذر تحميل العميل' }, { status: 500 })
    }
    if (!customer) {
      return NextResponse.json({ error: 'العميل غير موجود' }, { status: 404 })
    }

    const prevStatus: Status = ((customer as any).status as Status) || 'active'
    if (prevStatus === status) {
      return NextResponse.json({ customer, unchanged: true })
    }

    const now = new Date().toISOString()
    const updates: Record<string, any> = {
      status,
      statusReason: reason || null,
      statusUpdatedAt: now,
      statusUpdatedBy: by,
      updatedAt: now,
    }

    const { data: updated, error: updErr } = await supabase
      .from('customers')
      .update(updates)
      .eq('id', params.id)
      .select()
      .single()
    if (updErr) {
      console.error('Status update error:', updErr)
      return NextResponse.json(
        { error: 'تعذر تحديث الحالة', details: updErr.message },
        { status: 500 },
      )
    }

    const custName = (customer as any).customerName || 'عميل'
    const alertText =
      `🚨 تغيير حالة عميل\n` +
      `العميل: ${custName} (${(customer as any).phone || '—'})\n` +
      `الحالة: ${STATUS_LABEL_AR[prevStatus]} → ${STATUS_LABEL_AR[status]}\n` +
      `بواسطة: ${by} (${byRole})` +
      (reason ? `\nالسبب: ${reason}` : '')
    await postChatAlert(alertText)

    // Append to edit_history for audit trail.
    try {
      await supabase.from('edit_history').insert([
        {
          id: generateId('hist'),
          entityType: 'customer',
          entityId: params.id,
          orderId: null,
          action: 'status_changed',
          changedBy: by,
          summary: `تغيير حالة العميل: ${STATUS_LABEL_AR[prevStatus]} → ${STATUS_LABEL_AR[status]}`,
          details: { from: prevStatus, to: status, reason, byRole },
          changedAt: now,
        },
      ])
    } catch {
      /* non-fatal */
    }

    return NextResponse.json({ customer: updated })
  } catch (err) {
    console.error('PATCH status error:', err)
    return NextResponse.json({ error: 'تعذر تحديث الحالة' }, { status: 500 })
  }
}
