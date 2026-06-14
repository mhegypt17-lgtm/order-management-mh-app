'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

type Props = {
  customerId: string
  doNotFollowUp: boolean
  followUpSnoozeUntil: string | null
}

const SNOOZE_PRESETS: Array<{ label: string; days: number }> = [
  { label: '7 أيام',  days: 7 },
  { label: '30 يوم', days: 30 },
  { label: '90 يوم', days: 90 },
]

export default function RetentionCustomerControls({ customerId, doNotFollowUp, followUpSnoozeUntil }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [optOut, setOptOut] = useState(doNotFollowUp)
  const [snooze, setSnooze] = useState(followUpSnoozeUntil)

  const patch = async (body: Record<string, unknown>) => {
    const res = await fetch(`/api/crm/customers/${customerId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || 'failed')
    }
  }

  const toggleOptOut = async () => {
    const next = !optOut
    setOptOut(next)
    try {
      await patch({ doNotFollowUp: next })
      toast.success(next ? 'تم استبعاد العميل من المتابعة' : 'تم إرجاع العميل للمتابعة')
      startTransition(() => router.refresh())
    } catch {
      setOptOut(!next)
      toast.error('تعذر الحفظ')
    }
  }

  const snoozeFor = async (days: number) => {
    const until = new Date(Date.now() + days * 86_400_000).toISOString()
    setSnooze(until)
    try {
      await patch({ followUpSnoozeUntil: until })
      toast.success(`تم تأجيل المتابعة ${days} يوم`)
      startTransition(() => router.refresh())
    } catch {
      setSnooze(followUpSnoozeUntil)
      toast.error('تعذر التأجيل')
    }
  }

  const clearSnooze = async () => {
    setSnooze(null)
    try {
      await patch({ followUpSnoozeUntil: null })
      toast.success('تم إلغاء التأجيل')
      startTransition(() => router.refresh())
    } catch {
      setSnooze(followUpSnoozeUntil)
      toast.error('تعذر إلغاء التأجيل')
    }
  }

  const snoozeActive = !!snooze && new Date(snooze).getTime() > Date.now()

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        onClick={toggleOptOut}
        disabled={pending}
        className={`px-2 py-1 rounded text-xs font-medium border ${
          optOut
            ? 'bg-red-50 text-red-700 border-red-300 hover:bg-red-100'
            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
        }`}
        title="استبعاد دائم من محرّك المتابعة"
      >
        {optOut ? '✓ مستبعد' : '🚫 لا متابعة'}
      </button>
      {SNOOZE_PRESETS.map((p) => (
        <button
          key={p.days}
          onClick={() => snoozeFor(p.days)}
          disabled={pending || optOut}
          className="px-2 py-1 rounded text-xs font-medium border bg-white text-gray-700 border-gray-300 hover:bg-gray-50 disabled:opacity-50"
          title={`تأجيل المتابعة ${p.days} يوم`}
        >
          ⏸ {p.label}
        </button>
      ))}
      {snoozeActive && (
        <button
          onClick={clearSnooze}
          disabled={pending}
          className="px-2 py-1 rounded text-xs font-medium border bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100"
          title="إلغاء التأجيل الحالي"
        >
          ↺ إلغاء التأجيل ({new Date(snooze!).toLocaleDateString('ar-EG')})
        </button>
      )}
    </div>
  )
}
