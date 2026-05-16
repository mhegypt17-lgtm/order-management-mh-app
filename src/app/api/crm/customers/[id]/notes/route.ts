import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export interface CustomerNote {
  id: string
  customerId: string
  note: string
  author: string
  role: 'cs' | 'admin'
  createdAt: string
  updatedAt: string
}

function generateTextId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// GET: list notes for a customer
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { data: notes, error } = await supabase
      .from('customer_notes')
      .select('*')
      .eq('customerId', params.id)
      .order('createdAt', { ascending: false })
    
    if (error) {
      return NextResponse.json([], { status: 200 })
    }
    return NextResponse.json(notes || [])
  } catch {
    return NextResponse.json([], { status: 200 })
  }
}

// POST: add a new note
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json()
    const noteText = (body.note || '').toString().trim()
    const author = (body.author || 'مستخدم').toString().trim()
    const role = body.role === 'admin' ? 'admin' : 'cs'

    if (!noteText) {
      return NextResponse.json({ error: 'Note text required' }, { status: 400 })
    }
    if (noteText.length > 500) {
      return NextResponse.json({ error: 'Note too long (max 500 chars)' }, { status: 400 })
    }

    const now = new Date().toISOString()
    const newNote: CustomerNote = {
      id: generateTextId('note'),
      customerId: params.id,
      note: noteText,
      author,
      role,
      createdAt: now,
      updatedAt: now,
    }

    const { data: inserted, error } = await supabase
      .from('customer_notes')
      .insert([newNote])
      .select()
      .single()

    if (error) {
      console.error('Error inserting note:', error)
      return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }

    return NextResponse.json(inserted || newNote, { status: 201 })
  } catch (error) {
    console.error('Error creating note:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
