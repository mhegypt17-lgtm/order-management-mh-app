'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import type { User } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { useVisibilityPoll } from '@/hooks/useVisibilityPoll'

interface NotificationItem {
  id: string
  type: string
  title: string
  body: string
  href: string
  createdAt: string
  actor?: string
  priority?: 'low' | 'normal' | 'high' | 'urgent'
}

interface NotificationBellProps {
  user: User
}

// Fallback poll when Realtime is unavailable / tab regains focus.
// Was 20s on every page — the single biggest egress source.
// Realtime subscriptions to orders/tasks/etc. now provide near-instant
// updates, so the poll is just a safety net. Bumped 90s → 180s in
// Phase 2D.1a now that visibility gating + focus refetch are guaranteed
// by useVisibilityPoll (background tabs make zero requests).
const FALLBACK_POLL_MS = 180_000
// Debounce window after a Realtime event — collapses bursts (e.g. when
// CS rapidly updates multiple orders) into a single refetch. Bumped from
// 2.5s → 5s (Phase 2B.1) so bigger bursts collapse into one API call.
const REALTIME_DEBOUNCE_MS = 5_000
// Cap the badge count display to keep the DOM cheap when the queue is
// deep. Was 99+ — dropped to 20+ so re-renders stay lightweight and the
// user isn't overwhelmed by a huge red pill.
const BADGE_CAP = 20

function lastSeenKey(userId: string) {
  return `notif:lastSeen:${userId}`
}

// Per-user quiet mode (Phase 2D.5): when the user toggles the bell to
// "quiet", all chimes and alarms are suppressed regardless of the time of
// day. Toasts still render. Stored in localStorage so the preference
// survives reloads / login.
function quietModeKey(userId: string) {
  return `notif:quietMode:${userId}`
}

// Silent hours window (Phase 2D.2): between 22:00 and 08:00 Cairo local time
// we suppress ALL audio (regular chime AND urgent alarm). Toasts still render
// silently — the queue is preserved, only the sound is skipped. Users can
// still see the badge count and toast history when they return.
function isCairoSilentHours(): boolean {
  try {
    const hourStr = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Africa/Cairo',
      hour: '2-digit',
      hour12: false,
    }).format(new Date())
    const hour = parseInt(hourStr, 10)
    if (!Number.isFinite(hour)) return false
    // Silent window: 22:00 up to (but not including) 08:00.
    return hour >= 22 || hour < 8
  } catch {
    return false
  }
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'الآن'
  if (min < 60) return `قبل ${min} دقيقة`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `قبل ${hr} ساعة`
  const d = Math.floor(hr / 24)
  return `قبل ${d} يوم`
}

export default function NotificationBell({ user }: NotificationBellProps) {
  const router = useRouter()
  const [items, setItems] = useState<NotificationItem[]>([])
  const [open, setOpen] = useState(false)
  const [lastSeen, setLastSeen] = useState<number>(() => {
    if (typeof window === 'undefined') return 0
    const v = window.localStorage.getItem(lastSeenKey(user.id))
    return v ? parseInt(v, 10) : 0
  })
  const [quietMode, setQuietMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(quietModeKey(user.id)) === '1'
  })
  // Latest quietMode read inside fetch callback via ref, so toggling
  // doesn't invalidate the fetchNotifications closure.
  const quietModeRef = useRef(quietMode)
  useEffect(() => { quietModeRef.current = quietMode }, [quietMode])
  const knownIdsRef = useRef<Set<string>>(new Set())
  const initialLoadRef = useRef(true)
  const dropdownRef = useRef<HTMLDivElement | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  // Read lastSeen from a ref inside fetchNotifications so the callback
  // stays stable — was being re-created (and re-firing the effect)
  // every time the bell was opened. Net effect: redundant requests.
  const lastSeenRef = useRef(lastSeen)
  useEffect(() => { lastSeenRef.current = lastSeen }, [lastSeen])

  // Play a short two-tone chime via Web Audio API (no asset file needed)
  const playChime = useCallback(() => {
    try {
      if (typeof window === 'undefined') return
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!Ctx) return
      if (!audioCtxRef.current) audioCtxRef.current = new Ctx()
      const ctx = audioCtxRef.current
      if (ctx.state === 'suspended') ctx.resume().catch(() => {})

      const now = ctx.currentTime
      const playTone = (freq: number, start: number, dur: number) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0, now + start)
        gain.gain.linearRampToValueAtTime(0.25, now + start + 0.01)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur)
        osc.connect(gain).connect(ctx.destination)
        osc.start(now + start)
        osc.stop(now + start + dur + 0.05)
      }
      // Pleasant two-note ding (E5 → A5)
      playTone(659.25, 0, 0.18)
      playTone(880.0, 0.16, 0.28)
    } catch {
      /* ignore */
    }
  }, [])

  // Urgent alarm: a louder, repeating alert pattern for priority orders
  const playAlarm = useCallback(() => {
    try {
      if (typeof window === 'undefined') return
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!Ctx) return
      if (!audioCtxRef.current) audioCtxRef.current = new Ctx()
      const ctx = audioCtxRef.current
      if (ctx.state === 'suspended') ctx.resume().catch(() => {})

      const now = ctx.currentTime
      const beep = (freq: number, start: number, dur: number, vol = 0.5) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'square'
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0, now + start)
        gain.gain.linearRampToValueAtTime(vol, now + start + 0.005)
        gain.gain.setValueAtTime(vol, now + start + dur - 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur)
        osc.connect(gain).connect(ctx.destination)
        osc.start(now + start)
        osc.stop(now + start + dur + 0.02)
      }
      // Three-pulse siren-like alert: high-low-high-low-high
      const pattern = [880, 660, 880, 660, 880]
      pattern.forEach((f, i) => beep(f, i * 0.28, 0.22))
    } catch {
      /* ignore */
    }
  }, [])

  const fetchNotifications = useCallback(async () => {
    try {
      const params = new URLSearchParams({ role: user.role, user: user.name })
      const res = await fetch(`/api/notifications?${params.toString()}`, { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      const next: NotificationItem[] = Array.isArray(data.items) ? data.items : []
      setItems(next)

      // Detect newly arrived items (ids we haven't seen this session)
      if (!initialLoadRef.current) {
        const fresh = next.filter((n) => !knownIdsRef.current.has(n.id))
        // Show toast & chime only for items newer than lastSeen and not in this session yet
        const reallyNew = fresh.filter(
          (n) => new Date(n.createdAt).getTime() > lastSeenRef.current
        )
        if (reallyNew.length > 0) {
          // Audio is suppressed if EITHER (a) user has toggled quiet mode
          // (Phase 2D.5) OR (b) we're inside Cairo silent hours (Phase 2D.2).
          const silent = quietModeRef.current || isCairoSilentHours()
          const urgent = reallyNew.find((n) => n.priority === 'urgent' || n.type === 'priority-order')
          if (urgent) {
            if (!silent) playAlarm()
            toast(`${urgent.title}\n${urgent.body}`, {
              duration: 8000,
              icon: '🚨',
              style: { textAlign: 'right', direction: 'rtl', background: '#fee2e2', color: '#7f1d1d', fontWeight: 'bold', border: '2px solid #dc2626' },
            })
          } else {
            // Audio chime (skipped during silent hours)
            if (!silent) playChime()
            // Toast for the most recent (avoid spamming)
            const top = reallyNew[0]
            toast(`${top.title}\n${top.body}`, {
              duration: 5000,
              icon: '🔔',
              style: { textAlign: 'right', direction: 'rtl' },
            })
          }
        }
      }
      knownIdsRef.current = new Set(next.map((n) => n.id))
      initialLoadRef.current = false
    } catch {
      /* network errors silenced — bell just won't update */
    }
  }, [user.role, user.name, playChime, playAlarm])

  // Initial fetch + Realtime triggers. Fallback polling & focus refetch
  // are handled by useVisibilityPoll below — this effect only owns the
  // one-shot initial fetch and the Supabase channel lifecycle.
  //
  // Phase 2B.1 narrowing:
  //   • Kept orders/tasks/complaints with event:'*' — status updates,
  //     priority flips, and comment appends all drive live notifications.
  //   • Dropped daily_briefings sub — briefings are rare and the fallback
  //     poll surfaces them fast enough.
  //   • Dropped edit_history INSERT sub — every edit_history row is
  //     written as a side-effect of an orders/tasks/complaints change
  //     already covered above, so it was 100 % duplicate traffic.
  // When any subscribed table changes we debounce a single refetch — so a
  // CS agent updating 10 orders in 30 seconds triggers ~1 refetch instead
  // of 90 polls.
  useEffect(() => {
    fetchNotifications()

    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    const scheduleRefetch = () => {
      if (document.visibilityState !== 'visible') return // skip while hidden
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => fetchNotifications(), REALTIME_DEBOUNCE_MS)
    }

    const channel = supabase
      .channel('notifications-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, scheduleRefetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, scheduleRefetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'complaints' }, scheduleRefetch)
      .subscribe()

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      supabase.removeChannel(channel)
    }
  }, [fetchNotifications])

  // Visibility-gated fallback poll (180 s) + immediate refetch on tab focus.
  useVisibilityPoll(fetchNotifications, FALLBACK_POLL_MS)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const unreadItems = items.filter((n) => new Date(n.createdAt).getTime() > lastSeen)
  const unreadCount = unreadItems.length

  const markAllRead = () => {
    const now = Date.now()
    window.localStorage.setItem(lastSeenKey(user.id), String(now))
    setLastSeen(now)
  }

  const toggleQuietMode = () => {
    setQuietMode((prev) => {
      const next = !prev
      window.localStorage.setItem(quietModeKey(user.id), next ? '1' : '0')
      return next
    })
  }

  const handleItemClick = (item: NotificationItem) => {
    setOpen(false)
    // Mark read up to this item's timestamp at minimum
    const ts = new Date(item.createdAt).getTime()
    if (ts > lastSeen) {
      window.localStorage.setItem(lastSeenKey(user.id), String(Date.now()))
      setLastSeen(Date.now())
    }
    router.push(item.href)
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => {
          // First user gesture also unlocks AudioContext on most browsers
          if (audioCtxRef.current?.state === 'suspended') {
            audioCtxRef.current.resume().catch(() => {})
          }
          setOpen((v) => !v)
        }}
        className="relative p-2 rounded-lg hover:bg-gray-100 transition"
        aria-label="الإشعارات"
        title="الإشعارات"
      >
        <span className="text-xl">🔔</span>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-600 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center border-2 border-white">
            {unreadCount > BADGE_CAP ? `${BADGE_CAP}+` : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute left-0 rtl:left-auto rtl:right-0 mt-2 w-80 sm:w-96 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden"
          dir="rtl"
        >
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50">
            <span className="text-sm font-bold text-gray-800">🔔 الإشعارات</span>
            <div className="flex items-center gap-3">
              <button
                onClick={toggleQuietMode}
                className={`text-xs hover:underline ${quietMode ? 'text-orange-600 font-semibold' : 'text-gray-500'}`}
                title={quietMode ? 'تفعيل الأصوات' : 'إيقاف الأصوات لهذا المتصفح'}
              >
                {quietMode ? '🔕 صامت' : '🔔 فعّال'}
              </button>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-blue-600 hover:underline"
                >
                  تعليم الكل كمقروء
                </button>
              )}
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-sm">
                لا توجد إشعارات
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {items.map((n) => {
                  const isUnread = new Date(n.createdAt).getTime() > lastSeen
                  const isUrgent = n.priority === 'urgent' || n.type === 'priority-order'
                  return (
                    <li key={n.id}>
                      <button
                        onClick={() => handleItemClick(n)}
                        className={`w-full text-right px-4 py-3 hover:bg-gray-50 transition flex flex-col gap-0.5 ${
                          isUrgent ? 'bg-red-50 border-r-4 border-r-red-500' : isUnread ? 'bg-blue-50/50' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] text-gray-400">
                            {formatRelative(n.createdAt)}
                          </span>
                          <span className={`text-sm font-semibold flex items-center gap-1 ${isUrgent ? 'text-red-800' : 'text-gray-900'}`}>
                            {isUnread && (
                              <span className={`w-2 h-2 rounded-full inline-block ${isUrgent ? 'bg-red-600 animate-pulse' : 'bg-blue-500'}`} />
                            )}
                            {n.title}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 line-clamp-2 leading-snug">
                          {n.body}
                        </p>
                        {n.actor && (
                          <p className="text-[10px] text-gray-400">من: {n.actor}</p>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="px-4 py-2 text-center border-t border-gray-100 bg-gray-50">
            <span className="text-[10px] text-gray-400">
              تحديث فوري عبر Realtime
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
