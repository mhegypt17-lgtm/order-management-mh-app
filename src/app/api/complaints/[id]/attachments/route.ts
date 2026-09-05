import { NextRequest, NextResponse } from 'next/server'
import { unstable_cache, revalidateTag } from 'next/cache'
import { supabase } from '@/lib/supabase'
import { complaintAttachmentsTag } from '@/lib/complaintAttachmentsCache'

// On-demand image fetch for a single complaint ticket — mirrors
// /api/orders/[id]/photos exactly (same Phase 2H lazy-load design, same
// cache-then-invalidate pattern, learned from 2 real egress bugs on that
// route: don't blanket no-store this, and don't leave a second untagged
// cache layer). The main /api/complaints list/detail queries never select
// `attachments` (see COMPLAINT_COLUMNS) — this route is the ONLY place that
// column is ever read, and only when a user explicitly clicks "عرض المرفقات".
export const dynamic = 'force-dynamic'

const MAX_ATTACHMENTS = 5

async function fetchAttachments(complaintId: string) {
  const { data, error } = await supabase
    .from('complaints')
    .select('attachments')
    .eq('id', complaintId)
    .maybeSingle()

  if (error) {
    // Migration not applied yet — behave as "no attachments" rather than 500.
    if (/attachments|column .* does not exist/i.test(error.message || '')) return []
    console.error('[complaints/attachments] read failed:', error)
    return []
  }
  return Array.isArray((data as any)?.attachments) ? (data as any).attachments : []
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const complaintId = params.id
    const cached = unstable_cache(
      () => fetchAttachments(complaintId),
      ['complaint-attachments', complaintId],
      { tags: [complaintAttachmentsTag(complaintId)], revalidate: false },
    )
    const attachments = await cached()
    return NextResponse.json({ attachments })
  } catch (e) {
    console.error('[complaints/attachments GET] failed:', e)
    return NextResponse.json({ error: 'Failed to fetch attachments' }, { status: 500 })
  }
}

// Full-replacement write, same convention as orders' `attachmentsOnly` PUT
// path: returns a minimal ack, never the row (so this stays the ONE place
// the actual bytes travel, on the ONE action that actually needs them).
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const complaintId = params.id
    const body = await request.json()
    const attachments = Array.isArray(body.attachments) ? body.attachments : []
    if (attachments.length > MAX_ATTACHMENTS) {
      return NextResponse.json({ error: `الحد الأقصى ${MAX_ATTACHMENTS} صور لكل تذكرة` }, { status: 400 })
    }

    const { error } = await supabase
      .from('complaints')
      .update({ attachments, updatedAt: new Date().toISOString() })
      .eq('id', complaintId)

    if (error) {
      if (/attachments|column .* does not exist/i.test(error.message || '')) {
        return NextResponse.json(
          { error: 'عمود attachments غير موجود في قاعدة البيانات — شغّل الـ migration أولاً' },
          { status: 500 },
        )
      }
      console.error('[complaints/attachments PUT] failed:', error)
      return NextResponse.json({ error: 'تعذر حفظ المرفقات' }, { status: 500 })
    }

    revalidateTag(complaintAttachmentsTag(complaintId))
    return NextResponse.json({ success: true, count: attachments.length })
  } catch (e) {
    console.error('[complaints/attachments PUT] failed:', e)
    return NextResponse.json({ error: 'Failed to save attachments' }, { status: 500 })
  }
}
