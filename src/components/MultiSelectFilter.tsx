'use client'

import { useEffect, useRef, useState } from 'react'

// Checkbox dropdown filter. Empty selection = "all" (no filtering).
export default function MultiSelectFilter({
  allLabel,
  options,
  selected,
  onChange,
}: {
  allLabel: string
  options: string[]
  selected: string[]
  onChange: (next: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  // Keep any selected value visible even if it's no longer in the options list.
  const allOptions = [...selected.filter((s) => !options.includes(s)), ...options]

  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value])
  }

  const buttonLabel =
    selected.length === 0
      ? allLabel
      : selected.length <= 2
        ? selected.join('، ')
        : `${selected.length} محدد`

  return (
    <div ref={ref} className="relative" dir="rtl">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full px-3 py-2 border rounded-lg text-right flex items-center justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-red-500 ${
          selected.length > 0 ? 'border-red-400 bg-red-50' : 'border-gray-300 bg-white'
        }`}
      >
        <span className="truncate">{buttonLabel}</span>
        <span className="text-gray-500 text-xs">▾</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full min-w-[12rem] max-h-72 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg p-2 space-y-1">
          <button
            type="button"
            onClick={() => onChange([])}
            className="w-full text-right text-sm px-2 py-1 rounded hover:bg-gray-100 text-red-700"
          >
            {allLabel}
          </button>
          {allOptions.length === 0 && <div className="text-sm text-gray-400 px-2 py-1">لا توجد خيارات</div>}
          {allOptions.map((opt) => (
            <label key={opt} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={() => toggle(opt)}
                className="h-4 w-4 accent-red-600"
              />
              <span className="text-sm text-gray-800">{opt}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
