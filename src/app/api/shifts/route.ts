import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// Shift type matches ShiftPlannerView
export interface Shift {
  id: string
  name: string
  startTime: string
  endTime: string
  daysOfWeek: number[]
  agents: string[]
  active: boolean
  createdAt: string
  updatedAt: string
}

// GET: List all shifts
export async function GET() {
  const { data, error } = await supabase.from('shifts').select('*').order('createdAt', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ shifts: data || [] })
}

// POST: Create or update a shift
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const now = new Date().toISOString()
    let shift: Shift = {
      ...body,
      id: body.id || `shift_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: body.createdAt || now,
      updatedAt: now,
    }
    // Upsert by id
    const { error } = await supabase.from('shifts').upsert([shift], { onConflict: 'id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ shift })
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}

// DELETE: Remove a shift by id
export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    const { error } = await supabase.from('shifts').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
