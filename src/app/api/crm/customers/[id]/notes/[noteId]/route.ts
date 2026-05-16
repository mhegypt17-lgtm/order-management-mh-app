import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

interface CustomerNote {
  id: string
  customerId: string
  note: string
  author: string
  role: 'cs' | 'admin'
  createdAt: string
  updatedAt: string
}

// PATCH: edit a note
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; noteId: string } }
) {
  try {
    const body = await req.json()
    const noteText = (body.note || '').toString().trim()
    const author = (body.author || '').toString().trim()
    const role = body.role === 'admin' ? 'admin' : 'cs'

    if (!noteText) {
      return NextResponse.json({ error: 'Note text required' }, { status: 400 })
    }
    if (noteText.length > 500) {
      return NextResponse.json({ error: 'Note too long (max 500 chars)' }, { status: 400 })
    }

    const { data: note, error: fetchError } = await supabase
      .from('customer_notes')
      .select('*')
      .eq('id', params.noteId)
      .eq('customerId', params.id)
      .single()

    if (fetchError || !note) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 })
    }

    const { data: updated, error } = await supabase
      .from('customer_notes')
      .update({
        note: noteText,
        author: author || note.author,
        role,
        updatedAt: new Date().toISOString(),
      })
      .eq('id', params.noteId)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }

    return NextResponse.json(updated)
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// DELETE: remove a note
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; noteId: string } }
) {
  try {
    const { error: fetchError } = await supabase
      .from('customer_notes')
      .select('id')
      .eq('id', params.noteId)
      .eq('customerId', params.id)
      .single()

    if (fetchError) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 })
    }

    const { error } = await supabase
      .from('customer_notes')
      .delete()
      .eq('id', params.noteId)
      .eq('customerId', params.id)

    if (error) {
      return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
