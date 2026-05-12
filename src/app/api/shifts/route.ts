import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const DATA_DIR = path.join(process.cwd(), 'data')
const SHIFTS_FILE = path.join(DATA_DIR, 'shifts.json')

export interface ShiftRecord {
  id: string
  name: string
  startTime: string // "HH:MM" 24h
  endTime: string   // "HH:MM" 24h (may wrap past midnight)
  daysOfWeek: number[] // 0=Sun ... 6=Sat
  agents: string[]
  active: boolean
  createdAt: string
  updatedAt: string
}

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  if (!fs.existsSync(SHIFTS_FILE)) fs.writeFileSync(SHIFTS_FILE, '[]')
}

function readAll(): ShiftRecord[] {
  ensure()
  try {
    const raw = fs.readFileSync(SHIFTS_FILE, 'utf-8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeAll(rows: ShiftRecord[]) {
  ensure()
  fs.writeFileSync(SHIFTS_FILE, JSON.stringify(rows, null, 2))
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

function validateShiftBody(body: any): string | null {
  if (!body || typeof body !== 'object') return 'invalid body'
  if (!body.name || !String(body.name).trim()) return 'الاسم مطلوب'
  if (!TIME_RE.test(String(body.startTime || ''))) return 'وقت البداية غير صالح'
  if (!TIME_RE.test(String(body.endTime || ''))) return 'وقت النهاية غير صالح'
  if (!Array.isArray(body.daysOfWeek) || body.daysOfWeek.length === 0) {
    return 'اختر يوماً واحداً على الأقل'
  }
  for (const d of body.daysOfWeek) {
    if (!Number.isInteger(d) || d < 0 || d > 6) return 'يوم غير صالح'
  }
  if (!Array.isArray(body.agents) || body.agents.length === 0) {
    return 'أضف وكيلاً واحداً على الأقل'
  }
  return null
}

export async function GET() {
  return NextResponse.json({ shifts: readAll() })
}

export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }
  const err = validateShiftBody(body)
  if (err) return NextResponse.json({ error: err }, { status: 400 })

  const now = new Date().toISOString()
  const record: ShiftRecord = {
    id: `shift-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: String(body.name).trim(),
    startTime: body.startTime,
    endTime: body.endTime,
    daysOfWeek: Array.from(new Set(body.daysOfWeek as number[])).sort(),
    agents: (body.agents as string[]).map((a) => String(a).trim()).filter(Boolean),
    active: body.active !== false,
    createdAt: now,
    updatedAt: now,
  }

  const all = readAll()
  all.push(record)
  writeAll(all)
  return NextResponse.json({ shift: record })
}

export async function PUT(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }
  if (!body?.id) return NextResponse.json({ error: 'id مطلوب' }, { status: 400 })
  const err = validateShiftBody(body)
  if (err) return NextResponse.json({ error: err }, { status: 400 })

  const all = readAll()
  const idx = all.findIndex((s) => s.id === body.id)
  if (idx === -1) return NextResponse.json({ error: 'غير موجود' }, { status: 404 })

  all[idx] = {
    ...all[idx],
    name: String(body.name).trim(),
    startTime: body.startTime,
    endTime: body.endTime,
    daysOfWeek: Array.from(new Set(body.daysOfWeek as number[])).sort(),
    agents: (body.agents as string[]).map((a) => String(a).trim()).filter(Boolean),
    active: body.active !== false,
    updatedAt: new Date().toISOString(),
  }
  writeAll(all)
  return NextResponse.json({ shift: all[idx] })
}

export async function DELETE(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }
  if (!body?.id) return NextResponse.json({ error: 'id مطلوب' }, { status: 400 })
  const all = readAll()
  const next = all.filter((s) => s.id !== body.id)
  writeAll(next)
  return NextResponse.json({ ok: true })
}
