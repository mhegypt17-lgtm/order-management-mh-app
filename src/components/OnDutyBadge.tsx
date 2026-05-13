'use client'

import { useEffect, useState } from 'react'

interface Shift {
  id: string
  name: string
  startTime: string
  endTime: string
  agents: string[]
}

interface Holiday { id: string; date: string; label: string }

interface CurrentResponse {
  now: string
  today: string
  holiday: Holiday | null
  onDuty: { shift: Shift; minutesLeft: number }[]
  upcomingToday: { shift: Shift; startsInMinutes: number }[]
}

const POLL_MS = 60_000

export default function OnDutyBadge() {
  const [data, setData] = useState<CurrentResponse | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const res = await fetch('/api/shifts/current', { cache: 'no-store' })
        if (!res.ok) return
        const json = (await res.json()) as CurrentResponse
        if (alive) setData(json)
      } catch { /* silent */ }
    }
    load()
    const id = setInterval(load, POLL_MS)
    return () => { alive = false; clearInterval(id) }
  }, [])

  if (!data) return null

  const isHoliday = !!data.holiday
  const onDutyAgents = Array.from(
    new Set(data.onDuty.flatMap((d) => d.shift.agents)),
  )

  let label: string
  let cls: string
  if (isHoliday) {
    label = `🎉 ${data.holiday!.label}`
    cls = 'bg-amber-100 text-amber-800 border-amber-300'
  } else if (onDutyAgents.length > 0) {
    label = `🟢 على الوردية: ${onDutyAgents.length}`
    cls = 'bg-green-100 text-green-800 border-green-300'
  } else {
    label = '⚪ خارج الوردية'
    cls = 'bg-gray-100 text-gray-700 border-gray-300'
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${cls}`}
        title="الوردية الحالية"
      >
        {label}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div dir="rtl" className="absolute left-0 mt-2 w-[280px] sm:w-[300px] max-w-[calc(100vw-1rem)] bg-white rounded-xl shadow-2xl border border-gray-200 z-40 p-3">
            {isHoliday ? (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
                <div className="text-2xl mb-1">🎉</div>
                <div className="font-bold text-amber-900">{data.holiday!.label}</div>
                <div className="text-xs text-amber-700">إغلاق رسمي اليوم</div>
              </div>
            ) : data.onDuty.length === 0 ? (
              <>
                <div className="text-sm font-bold text-gray-700 mb-2">⚪ لا توجد وردية نشطة الآن</div>
                {data.upcomingToday.length > 0 && (
                  <div className="text-xs text-gray-600">
                    التالي: <strong>{data.upcomingToday[0].shift.name}</strong> بعد {Math.round(data.upcomingToday[0].startsInMinutes)} دقيقة
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="text-sm font-bold text-green-700 mb-2">🟢 الوردية الحالية</div>
                <div className="space-y-2">
                  {data.onDuty.map(({ shift, minutesLeft }) => (
                    <div key={shift.id} className="bg-green-50 border border-green-200 rounded-lg p-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-green-900 text-sm">{shift.name}</span>
                        <span className="text-[10px] text-green-700">يتبقى {Math.round(minutesLeft)} دقيقة</span>
                      </div>
                      <div className="text-[11px] text-gray-600 mb-1">{shift.startTime} – {shift.endTime}</div>
                      <div className="flex flex-wrap gap-1">
                        {shift.agents.map((a) => (
                          <span key={a} className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-white text-green-700 border border-green-300">👤 {a}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                {data.upcomingToday.length > 0 && (
                  <div className="text-[11px] text-gray-500 mt-2 pt-2 border-t border-gray-100">
                    التالي: <strong>{data.upcomingToday[0].shift.name}</strong> بعد {Math.round(data.upcomingToday[0].startsInMinutes)} دقيقة
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
