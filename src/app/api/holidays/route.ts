import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const DATA_DIR = path.join(process.cwd(), 'data')
const HOLIDAYS_FILE = path.join(DATA_DIR, 'holidays.json')

export interface HolidayRecord {
  id: string
  date: string  // YYYY-MM-DD
  label: string
  createdAt: string
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  if (!fs.existsSync(HOLIDAYS_FILE)) fs.writeFileSync(HOLIDAYS_FILE, '[]')
}

function readAll(): HolidayRecord[] {
  ensure()
  try {
    const raw = fs.readFileSync(HOLIDAYS_FILE, 'utf-8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeAll(rows: HolidayRecord[]) {
  ensure()
  fs.writeFileSync(HOLIDAYS_FILE, JSON.stringify(rows, null, 2))
}

export async function GET() {
  const rows = readAll().sort((a, b) => a.date.localeCompare(b.date))
  return NextResponse.json({ holidays: rows })
}

export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }
  const date = String(body?.date || '').trim()
  const label = String(body?.label || '').trim()
  if (!DATE_RE.test(date)) return NextResponse.json({ error: 'تاريخ غير صالح (YYYY-MM-DD)' }, { status: 400 })
  if (!label) return NextResponse.json({ error: 'الاسم مطلوب' }, { status: 400 })

  const all = readAll()
  if (all.some((h) => h.date === date)) {
    return NextResponse.json({ error: 'هذا التاريخ مسجل بالفعل' }, { status: 409 })
  }
  const record: HolidayRecord = {
    id: `hol-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    date,
    label,
    createdAt: new Date().toISOString(),
  }
  all.push(record)
  writeAll(all)
  return NextResponse.json({ holiday: record })
}

export async function DELETE(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }
  if (!body?.id) return NextResponse.json({ error: 'id مطلوب' }, { status: 400 })
  const all = readAll()
  writeAll(all.filter((h) => h.id !== body.id))
  return NextResponse.json({ ok: true })
}
