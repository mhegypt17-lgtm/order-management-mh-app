import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const DATA_DIR = path.join(process.cwd(), 'data')
const SHIFTS_FILE = path.join(DATA_DIR, 'shifts.json')
const HOLIDAYS_FILE = path.join(DATA_DIR, 'holidays.json')

interface ShiftRecord {
  id: string
  name: string
  startTime: string
  endTime: string
  daysOfWeek: number[]
  agents: string[]
  active: boolean
}

interface HolidayRecord { id: string; date: string; label: string }

function readJson<T>(p: string): T[] {
  try {
    if (!fs.existsSync(p)) return []
    const raw = fs.readFileSync(p, 'utf-8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

function localDateString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export async function GET() {
  const shifts = readJson<ShiftRecord>(SHIFTS_FILE).filter((s) => s.active)
  const holidays = readJson<HolidayRecord>(HOLIDAYS_FILE)

  const now = new Date()
  const today = localDateString(now)
  const holiday = holidays.find((h) => h.date === today) || null

  const dow = now.getDay() // 0=Sun
  const nowMin = now.getHours() * 60 + now.getMinutes()

  const onDuty: { shift: ShiftRecord; minutesLeft: number }[] = []
  for (const s of shifts) {
    if (!s.daysOfWeek.includes(dow)) continue
    const start = toMinutes(s.startTime)
    const end = toMinutes(s.endTime)
    const wraps = end <= start
    let active = false
    let minutesLeft = 0
    if (!wraps) {
      if (nowMin >= start && nowMin < end) {
        active = true
        minutesLeft = end - nowMin
      }
    } else {
      // shift crosses midnight
      if (nowMin >= start || nowMin < end) {
        active = true
        minutesLeft = nowMin >= start ? (24 * 60 - nowMin) + end : end - nowMin
      }
    }
    if (active) onDuty.push({ shift: s, minutesLeft })
  }

  // Next upcoming today (not currently on)
  const upcomingToday = shifts
    .filter((s) => s.daysOfWeek.includes(dow))
    .map((s) => ({ s, start: toMinutes(s.startTime) }))
    .filter(({ start }) => start > nowMin)
    .sort((a, b) => a.start - b.start)
    .map(({ s, start }) => ({ shift: s, startsInMinutes: start - nowMin }))

  return NextResponse.json({
    now: now.toISOString(),
    today,
    holiday,
    onDuty,
    upcomingToday,
  })
}
