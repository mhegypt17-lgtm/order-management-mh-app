import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// Per-agent time slot + notes inside a shift
export interface ShiftAssignment {
  agentName: string
  startTime: string  // HH:mm
  endTime: string    // HH:mm
  notes?: string
}

// Shift type matches ShiftPlannerView
export interface Shift {
  id: string
  name: string
  startTime: string         // overall envelope (auto-computed from assignments when provided)
  endTime: string
  daysOfWeek: number[]
  agents: string[]          // kept for back-compat (read by notifications etc.)
  assignments?: ShiftAssignment[]
  active: boolean
  createdAt: string
  updatedAt: string
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

function sanitizeAssignments(raw: unknown, fallbackStart: string, fallbackEnd: string): ShiftAssignment[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((r: any): ShiftAssignment | null => {
      const name = String(r?.agentName ?? '').trim()
      if (!name) return null
      const s = HHMM.test(String(r?.startTime || '')) ? r.startTime : fallbackStart
      const e = HHMM.test(String(r?.endTime   || '')) ? r.endTime   : fallbackEnd
      const notes = String(r?.notes ?? '').trim()
      return { agentName: name, startTime: s, endTime: e, notes: notes || undefined }
    })
    .filter((x): x is ShiftAssignment => !!x)
}

function toMin(t: string): number {
  const [h, m] = (t || '').split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

// Compute the shift envelope from its assignments (earliest start → latest end,
// handling slots that cross midnight).
function envelopeFromAssignments(asg: ShiftAssignment[], fallbackStart: string, fallbackEnd: string) {
  if (asg.length === 0) return { startTime: fallbackStart, endTime: fallbackEnd }
  const starts = asg.map((a) => toMin(a.startTime))
  const ends   = asg.map((a) => toMin(a.endTime))
  const minStart = Math.min(...starts)
  const maxEnd   = Math.max(...ends)
  const pad = (n: number) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`
  return { startTime: pad(minStart), endTime: pad(maxEnd) }
}

// Lazy backfill: if a row has agents[] but no assignments, synthesize them.
function withAssignments(s: any): Shift {
  const assignments: ShiftAssignment[] = Array.isArray(s.assignments) && s.assignments.length > 0
    ? sanitizeAssignments(s.assignments, s.startTime, s.endTime)
    : (Array.isArray(s.agents) ? s.agents : []).map((a: string) => ({
        agentName: a,
        startTime: s.startTime,
        endTime: s.endTime,
        notes: undefined,
      }))
  return { ...s, assignments }
}

// GET: List all shifts
export async function GET() {
  const { data, error } = await supabase.from('shifts').select('*').order('createdAt', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const shifts = (data || []).map(withAssignments)
  return NextResponse.json({ shifts })
}

// POST / PUT: Create or update a shift
async function upsertShift(req: NextRequest) {
  try {
    const body = await req.json()
    const now = new Date().toISOString()

    const fallbackStart = HHMM.test(String(body.startTime || '')) ? body.startTime : '09:00'
    const fallbackEnd   = HHMM.test(String(body.endTime   || '')) ? body.endTime   : '17:00'

    const assignments = sanitizeAssignments(body.assignments, fallbackStart, fallbackEnd)
    const agents = Array.from(new Set(assignments.map((a) => a.agentName)))
    const envelope = envelopeFromAssignments(assignments, fallbackStart, fallbackEnd)

    const shift: Shift = {
      ...body,
      id: body.id || `shift_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      startTime: envelope.startTime,
      endTime: envelope.endTime,
      agents,
      assignments,
      createdAt: body.createdAt || now,
      updatedAt: now,
    }

    // Try writing with `assignments`. If the column doesn't exist yet (migration
    // not applied), fall back to writing without it so the rest of the data is
    // persisted.
    let { error } = await supabase.from('shifts').upsert([shift], { onConflict: 'id' })
    if (error && /column .* "?assignments"? .* does not exist/i.test(error.message)) {
      const { assignments: _drop, ...legacy } = shift as any
      ;({ error } = await supabase.from('shifts').upsert([legacy], { onConflict: 'id' }))
      if (!error) {
        return NextResponse.json({
          shift,
          warning: 'تم الحفظ بدون التوزيعات لكل وكيل — يرجى تشغيل data/shift-assignments-migration.sql على قاعدة البيانات.',
        })
      }
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ shift })
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}

export const POST = upsertShift
export const PUT  = upsertShift

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

