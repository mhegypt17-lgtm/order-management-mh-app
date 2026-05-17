import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export interface Holiday {
  id: string
  date: string // ISO date
  label: string
}

// GET: List all holidays
export async function GET() {
  const { data, error } = await supabase.from('holidays').select('*').order('date', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ holidays: data || [] })
}

// POST: Add a holiday
export async function POST(req: NextRequest) {
  try {
    const { date, label } = await req.json()
    if (!date || !label) return NextResponse.json({ error: 'Missing date or label' }, { status: 400 })
    const id = `holiday_${date}_${Math.random().toString(36).substr(2, 6)}`
    const { error } = await supabase.from('holidays').insert([{ id, date, label }])
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}

// DELETE: Remove a holiday by id
export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    const { error } = await supabase.from('holidays').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
