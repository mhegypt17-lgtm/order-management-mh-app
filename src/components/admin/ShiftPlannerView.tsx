'use client'

import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'

interface Shift {
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

interface Holiday {
  id: string
  date: string
  label: string
}

const DAY_LABELS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
const SUGGESTED_AGENTS = ['رنا', 'مى', 'ميرنا', 'أمل']

function emptyForm() {
  return {
    name: '',
    startTime: '09:00',
    endTime: '17:00',
    daysOfWeek: [0, 1, 2, 3, 4, 6] as number[], // Sun-Thu + Sat (Egypt-ish)
    agents: [] as string[],
    active: true,
  }
}

export default function ShiftPlannerView() {
  const [shifts, setShifts] = useState<Shift[]>([])
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [agentInput, setAgentInput] = useState('')

  const [holidayDate, setHolidayDate] = useState('')
  const [holidayLabel, setHolidayLabel] = useState('')
  const [savingHoliday, setSavingHoliday] = useState(false)

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [a, b] = await Promise.all([
        fetch('/api/shifts', { cache: 'no-store' }).then((r) => r.json()),
        fetch('/api/holidays', { cache: 'no-store' }).then((r) => r.json()),
      ])
      setShifts(Array.isArray(a?.shifts) ? a.shifts : [])
      setHolidays(Array.isArray(b?.holidays) ? b.holidays : [])
    } catch {
      toast.error('تعذر تحميل البيانات')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [])

  const resetForm = () => {
    setForm(emptyForm())
    setEditingId(null)
    setAgentInput('')
  }

  const startEdit = (s: Shift) => {
    setEditingId(s.id)
    setForm({
      name: s.name,
      startTime: s.startTime,
      endTime: s.endTime,
      daysOfWeek: [...s.daysOfWeek],
      agents: [...s.agents],
      active: s.active,
    })
    setAgentInput('')
  }

  const toggleDay = (d: number) => {
    setForm((prev) => ({
      ...prev,
      daysOfWeek: prev.daysOfWeek.includes(d)
        ? prev.daysOfWeek.filter((x) => x !== d)
        : [...prev.daysOfWeek, d].sort(),
    }))
  }

  const addAgent = (name: string) => {
    const v = name.trim()
    if (!v) return
    setForm((prev) => prev.agents.includes(v) ? prev : { ...prev, agents: [...prev.agents, v] })
    setAgentInput('')
  }

  const removeAgent = (name: string) => {
    setForm((prev) => ({ ...prev, agents: prev.agents.filter((a) => a !== name) }))
  }

  const saveShift = async () => {
    if (!form.name.trim()) return toast.error('اسم الوردية مطلوب')
    if (form.daysOfWeek.length === 0) return toast.error('اختر يوماً واحداً على الأقل')
    if (form.agents.length === 0) return toast.error('أضف وكيلاً واحداً على الأقل')
    setSaving(true)
    try {
      const method = editingId ? 'PUT' : 'POST'
      const res = await fetch('/api/shifts', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingId ? { ...form, id: editingId } : form),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error || 'failed')
      }
      toast.success(editingId ? 'تم تحديث الوردية' : 'تمت إضافة الوردية')
      resetForm()
      fetchAll()
    } catch (e: any) {
      toast.error(e?.message || 'تعذر حفظ الوردية')
    } finally {
      setSaving(false)
    }
  }

  const deleteShift = async (id: string) => {
    if (!confirm('حذف هذه الوردية؟')) return
    try {
      const res = await fetch('/api/shifts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) throw new Error()
      toast.success('تم الحذف')
      if (editingId === id) resetForm()
      fetchAll()
    } catch {
      toast.error('تعذر الحذف')
    }
  }

  const addHoliday = async () => {
    if (!holidayDate) return toast.error('اختر التاريخ')
    if (!holidayLabel.trim()) return toast.error('أضف اسم العطلة')
    setSavingHoliday(true)
    try {
      const res = await fetch('/api/holidays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: holidayDate, label: holidayLabel.trim() }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error || 'failed')
      }
      toast.success('تمت إضافة العطلة')
      setHolidayDate('')
      setHolidayLabel('')
      fetchAll()
    } catch (e: any) {
      toast.error(e?.message || 'تعذر الإضافة')
    } finally {
      setSavingHoliday(false)
    }
  }

  const deleteHoliday = async (id: string) => {
    if (!confirm('حذف هذه العطلة؟')) return
    try {
      const res = await fetch('/api/holidays', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) throw new Error()
      toast.success('تم الحذف')
      fetchAll()
    } catch {
      toast.error('تعذر الحذف')
    }
  }

  const upcomingHolidays = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return holidays
      .filter((h) => new Date(h.date) >= today)
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [holidays])

  const pastHolidays = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return holidays
      .filter((h) => new Date(h.date) < today)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 10)
  }, [holidays])

  // ---------- Calendar state ----------
  const today = new Date()
  const [calCursor, setCalCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))

  const calendarDays = useMemo(() => {
    const year = calCursor.getFullYear()
    const month = calCursor.getMonth()
    const first = new Date(year, month, 1)
    const startWeekday = first.getDay() // 0 = Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate()

    const cells: Array<{ date: Date | null; dateStr: string | null }> = []
    for (let i = 0; i < startWeekday; i++) cells.push({ date: null, dateStr: null })
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(year, month, d)
      const dateStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
      cells.push({ date: dt, dateStr })
    }
    while (cells.length % 7 !== 0) cells.push({ date: null, dateStr: null })
    return cells
  }, [calCursor])

  const holidaysByDate = useMemo(() => {
    const m = new Map<string, Holiday>()
    holidays.forEach((h) => m.set(h.date, h))
    return m
  }, [holidays])

  const monthLabel = useMemo(() => {
    return calCursor.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' })
  }, [calCursor])

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const shiftsOnDay = (date: Date) =>
    shifts.filter((s) => s.active && s.daysOfWeek.includes(date.getDay()))

  const prevMonth = () => setCalCursor(new Date(calCursor.getFullYear(), calCursor.getMonth() - 1, 1))
  const nextMonth = () => setCalCursor(new Date(calCursor.getFullYear(), calCursor.getMonth() + 1, 1))
  const goToday = () => setCalCursor(new Date(today.getFullYear(), today.getMonth(), 1))

  return (
    <div dir="rtl" className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">🕐 مخطط الورديات</h1>
        <p className="text-sm text-gray-500 mt-1">إدارة ورديات خدمة العملاء وأيام العطلات الرسمية</p>
      </div>

      {/* SHIFT FORM */}
      <div className="bg-white rounded-xl border-2 border-blue-200 p-5 shadow-sm">
        <h2 className="text-lg font-bold text-blue-900 mb-4">
          {editingId ? '✏️ تعديل وردية' : '➕ إضافة وردية جديدة'}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">اسم الوردية</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="مثال: الوردية الصباحية"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">من</label>
            <input
              type="time"
              value={form.startTime}
              onChange={(e) => setForm({ ...form, startTime: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">إلى</label>
            <input
              type="time"
              value={form.endTime}
              onChange={(e) => setForm({ ...form, endTime: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-bold text-gray-700 mb-2">أيام العمل</label>
          <div className="flex flex-wrap gap-2">
            {DAY_LABELS.map((label, i) => {
              const on = form.daysOfWeek.includes(i)
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleDay(i)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition ${
                    on
                      ? 'bg-blue-600 text-white border-blue-700'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-bold text-gray-700 mb-2">الوكلاء على الوردية</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {form.agents.map((a) => (
              <span key={a} className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-bold border border-blue-300">
                {a}
                <button type="button" onClick={() => removeAgent(a)} className="text-blue-600 hover:text-red-600 font-bold">×</button>
              </span>
            ))}
            {form.agents.length === 0 && (
              <span className="text-xs text-gray-400">لم يتم إضافة وكلاء بعد</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2 mb-2">
            <span className="text-[11px] text-gray-500 self-center">اقتراحات:</span>
            {SUGGESTED_AGENTS.filter((a) => !form.agents.includes(a)).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => addAgent(a)}
                className="px-2 py-1 rounded-md text-xs bg-gray-100 hover:bg-blue-100 text-gray-700 border border-gray-200"
              >
                + {a}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={agentInput}
              onChange={(e) => setAgentInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAgent(agentInput) } }}
              placeholder="أو اكتب اسماً جديداً واضغط Enter"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <button type="button" onClick={() => addAgent(agentInput)} className="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm">
              إضافة
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
              className="w-4 h-4"
            />
            <span className="text-sm text-gray-700">الوردية مفعّلة</span>
          </label>
          <div className="flex gap-2">
            {editingId && (
              <button type="button" onClick={resetForm} className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm">
                إلغاء
              </button>
            )}
            <button type="button" onClick={saveShift} disabled={saving} className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm disabled:opacity-50">
              {saving ? 'جاري الحفظ...' : (editingId ? '💾 حفظ التعديلات' : '➕ إضافة الوردية')}
            </button>
          </div>
        </div>
      </div>

      {/* CALENDAR */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-lg font-bold text-gray-900">📅 التقويم — {monthLabel}</h2>
          <div className="flex items-center gap-2">
            <button onClick={prevMonth} className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm">← السابق</button>
            <button onClick={goToday} className="px-3 py-1.5 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-700 font-bold text-sm">اليوم</button>
            <button onClick={nextMonth} className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm">التالي →</button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 mb-3 text-[11px]">
          <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-blue-100 border border-blue-300" /> وردية نشطة</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-amber-100 border border-amber-300" /> عطلة</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-red-100 border border-red-400" /> اليوم</span>
        </div>

        {/* Weekday header */}
        <div className="grid grid-cols-7 gap-1 mb-1 text-center">
          {DAY_LABELS.map((d) => (
            <div key={d} className="text-[11px] font-bold text-gray-500 py-1">{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((cell, idx) => {
            if (!cell.date) return <div key={idx} className="h-24 bg-gray-50 rounded-lg" />
            const isToday = cell.dateStr === todayStr
            const holiday = cell.dateStr ? holidaysByDate.get(cell.dateStr) : null
            const dayShifts = holiday ? [] : shiftsOnDay(cell.date)
            const isPast = cell.date < new Date(today.getFullYear(), today.getMonth(), today.getDate())

            return (
              <div
                key={idx}
                className={`relative h-24 rounded-lg border-2 p-1.5 overflow-hidden text-right transition ${
                  isToday
                    ? 'border-red-400 bg-red-50'
                    : holiday
                    ? 'border-amber-300 bg-amber-50'
                    : dayShifts.length > 0
                    ? 'border-blue-200 bg-blue-50/40'
                    : 'border-gray-100 bg-white'
                } ${isPast ? 'opacity-60' : ''}`}
                title={
                  holiday
                    ? `🎉 ${holiday.label}`
                    : dayShifts.length > 0
                    ? dayShifts.map((s) => `${s.name} (${s.startTime}-${s.endTime}): ${s.agents.join('، ')}`).join('\n')
                    : ''
                }
              >
                <div className={`text-xs font-bold ${isToday ? 'text-red-700' : 'text-gray-700'}`}>
                  {cell.date.getDate()}
                </div>

                {holiday ? (
                  <div className="mt-1 text-[10px] font-bold text-amber-800 truncate">
                    🎉 {holiday.label}
                  </div>
                ) : (
                  <div className="mt-1 space-y-0.5">
                    {dayShifts.slice(0, 2).map((s) => (
                      <div
                        key={s.id}
                        className="text-[9px] bg-blue-600 text-white rounded px-1 py-0.5 truncate"
                      >
                        {s.startTime}–{s.endTime} · {s.name}
                      </div>
                    ))}
                    {dayShifts.length > 2 && (
                      <div className="text-[9px] text-blue-700 font-bold">+{dayShifts.length - 2}</div>
                    )}
                    {dayShifts.length === 0 && !isPast && (
                      <div className="text-[10px] text-gray-300">—</div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <p className="text-[11px] text-gray-400 mt-3 text-center">
          مرر الفأرة فوق اليوم لرؤية تفاصيل الورديات والوكلاء.
        </p>
      </div>

      {/* SHIFT LIST */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <h2 className="text-lg font-bold text-gray-900 mb-4">📋 الورديات المُعرَّفة ({shifts.length})</h2>
        {loading ? (
          <p className="text-sm text-gray-400">جاري التحميل...</p>
        ) : shifts.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">لا توجد ورديات. أضف وردية من النموذج أعلاه.</p>
        ) : (
          <div className="space-y-3">
            {shifts.map((s) => (
              <div key={s.id} className={`rounded-lg border-2 p-4 ${s.active ? 'border-blue-200 bg-blue-50/40' : 'border-gray-200 bg-gray-50 opacity-60'}`}>
                <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                  <div>
                    <h3 className="font-bold text-gray-900">{s.name}</h3>
                    <p className="text-xs text-gray-500">من {s.startTime} إلى {s.endTime}{toMinutesHelper(s.endTime) <= toMinutesHelper(s.startTime) ? ' (يمتد بعد منتصف الليل)' : ''}</p>
                  </div>
                  <div className="flex gap-2">
                    {!s.active && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-300 text-gray-700">متوقفة</span>}
                    <button onClick={() => startEdit(s)} className="px-3 py-1 rounded text-xs font-bold bg-blue-100 text-blue-700 hover:bg-blue-200">✏️ تعديل</button>
                    <button onClick={() => deleteShift(s.id)} className="px-3 py-1 rounded text-xs font-bold bg-red-100 text-red-700 hover:bg-red-200">🗑️ حذف</button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 mb-2">
                  {DAY_LABELS.map((d, i) => (
                    <span key={i} className={`px-2 py-0.5 rounded text-[10px] font-bold border ${s.daysOfWeek.includes(i) ? 'bg-blue-600 text-white border-blue-700' : 'bg-white text-gray-400 border-gray-200'}`}>
                      {d}
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1">
                  {s.agents.map((a) => (
                    <span key={a} className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-white text-blue-700 border border-blue-300">👤 {a}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* HOLIDAYS */}
      <div className="bg-white rounded-xl border-2 border-amber-200 p-5 shadow-sm">
        <h2 className="text-lg font-bold text-amber-900 mb-1">🎉 العطلات الرسمية</h2>
        <p className="text-xs text-gray-500 mb-4">في هذه الأيام يتم اعتبار اليوم مغلقاً (لا توجد ورديات نشطة).</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <input
            type="date"
            value={holidayDate}
            onChange={(e) => setHolidayDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg"
          />
          <input
            type="text"
            value={holidayLabel}
            onChange={(e) => setHolidayLabel(e.target.value)}
            placeholder="مثال: عيد الفطر"
            className="px-3 py-2 border border-gray-300 rounded-lg"
          />
          <button onClick={addHoliday} disabled={savingHoliday} className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm disabled:opacity-50">
            {savingHoliday ? 'جاري الحفظ...' : '➕ إضافة عطلة'}
          </button>
        </div>

        <div>
          <h3 className="text-sm font-bold text-gray-800 mb-2">القادمة ({upcomingHolidays.length})</h3>
          {upcomingHolidays.length === 0 ? (
            <p className="text-xs text-gray-400 mb-4">لا توجد عطلات قادمة.</p>
          ) : (
            <div className="space-y-2 mb-4">
              {upcomingHolidays.map((h) => (
                <div key={h.id} className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <div>
                    <span className="font-bold text-amber-900">{h.label}</span>
                    <span className="text-xs text-gray-500 mr-2">— {h.date}</span>
                  </div>
                  <button onClick={() => deleteHoliday(h.id)} className="px-3 py-1 rounded text-xs font-bold bg-red-100 text-red-700 hover:bg-red-200">🗑️ حذف</button>
                </div>
              ))}
            </div>
          )}

          {pastHolidays.length > 0 && (
            <details className="text-xs text-gray-500">
              <summary className="cursor-pointer hover:text-gray-700">السابقة ({pastHolidays.length})</summary>
              <div className="mt-2 space-y-1">
                {pastHolidays.map((h) => (
                  <div key={h.id} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded p-2">
                    <span>{h.label} — {h.date}</span>
                    <button onClick={() => deleteHoliday(h.id)} className="text-red-600 hover:underline">حذف</button>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  )
}

function toMinutesHelper(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}
