import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const TABLE = 'cs_call_logs'

// Edit (PUT) and delete (DELETE) a single call-log row.
//
// PUT body: any subset of editable fields. We never let callers overwrite
// id / createdAt; updatedAt is server-side.

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json()
    const patch: Record<string, any> = {}
    const editable = [
      'callDate',
      'callTime',
      'customerName',
      'phone',
      'email',
      'inquiry',
      'response',
      'loggedBy',
    ] as const
    for (const k of editable) {
      if (k in body) patch[k] = typeof body[k] === 'string' ? body[k].trim() : body[k]
    }
    patch.updatedAt = new Date().toISOString()

    const { data, error } = await supabase
      .from(TABLE)
      .update(patch)
      .eq('id', params.id)
      .select()
      .single()

    if (error) {
      console.error('PUT /api/cs-call-logs/[id]:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ log: data })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'فشل تحديث السجل' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error } = await supabase.from(TABLE).delete().eq('id', params.id)
    if (error) {
      console.error('DELETE /api/cs-call-logs/[id]:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'فشل حذف السجل' }, { status: 500 })
  }
}
