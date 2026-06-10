'use client'

// SingleTabGuard
// ------------------------------------------------------------------
// Enforces a one-tab-per-browser policy to keep Supabase egress in check.
//
// How it works
//  * Each tab generates a random `tabId` on mount.
//  * Tabs talk to each other via the BroadcastChannel API (same-origin,
//    same-browser, free, no server round-trips).
//  * On mount, the new tab sends `claim` and listens 700 ms for any
//    existing tab to reply with `present`. If anyone replies, the new
//    tab marks itself as a duplicate and shows a blocking overlay
//    instead of mounting the app (so its polls/Realtime never start).
//  * The active tab also rebroadcasts `present` every 5 s so a tab that
//    misses the initial reply (e.g. throttled background tab) still
//    finds out.
//  * When the active tab closes (`pagehide`), it broadcasts `release`
//    so the next opened tab can take over.
//  * A "Use this tab" button on the duplicate-tab overlay forces a
//    takeover: it broadcasts `evict`; the previous active tab then
//    reloads into the duplicate state itself.
//
// Why BroadcastChannel (not localStorage events)
//  * Cleaner API, no JSON parsing of storage events, works in service
//    workers, and Safari/iOS supports it since 15.4.
//  * Falls back to localStorage 'storage' event for older Safari.
// ------------------------------------------------------------------

import { useEffect, useState } from 'react'

const CHANNEL_NAME = 'oms-tab-guard'
const HEARTBEAT_MS = 5_000
const CLAIM_TIMEOUT_MS = 700

type Msg =
  | { kind: 'claim'; tabId: string }
  | { kind: 'present'; tabId: string }
  | { kind: 'evict'; tabId: string } // tabId = the one that should KEEP being active
  | { kind: 'release'; tabId: string }

// BroadcastChannel is missing in very old Safari. Fall back to a
// localStorage-event-based shim so the guard still works there.
function openChannel(onMessage: (m: Msg) => void): {
  post: (m: Msg) => void
  close: () => void
} {
  if (typeof window === 'undefined') {
    return { post: () => {}, close: () => {} }
  }
  if ('BroadcastChannel' in window) {
    const ch = new BroadcastChannel(CHANNEL_NAME)
    ch.onmessage = (e) => onMessage(e.data as Msg)
    return {
      post: (m) => ch.postMessage(m),
      close: () => ch.close(),
    }
  }
  // Fallback: write to localStorage; sibling tabs receive a 'storage' event.
  const storageKey = `${CHANNEL_NAME}:msg`
  const onStorage = (e: StorageEvent) => {
    if (e.key !== storageKey || !e.newValue) return
    try {
      onMessage(JSON.parse(e.newValue) as Msg)
    } catch {
      /* ignore malformed */
    }
  }
  window.addEventListener('storage', onStorage)
  return {
    post: (m) => {
      try {
        // Include a nonce so identical consecutive messages still fire.
        window.localStorage.setItem(storageKey, JSON.stringify({ ...m, _n: Math.random() }))
      } catch {
        /* quota/private mode — ignore */
      }
    },
    close: () => window.removeEventListener('storage', onStorage),
  }
}

export default function SingleTabGuard({ children }: { children: React.ReactNode }) {
  // 'pending'  → asking other tabs, app not mounted yet
  // 'active'   → this tab owns the session, render children
  // 'duplicate'→ another tab already owns it, show blocking overlay
  const [state, setState] = useState<'pending' | 'active' | 'duplicate'>('pending')

  useEffect(() => {
    const tabId = Math.random().toString(36).slice(2)
    let duplicateFound = false
    let amActive = false

    const { post, close } = openChannel((msg) => {
      if (msg.tabId === tabId) return // ignore own messages
      switch (msg.kind) {
        case 'claim':
          // Another tab just opened. If we're the active one, answer so
          // it knows to back off.
          if (amActive) post({ kind: 'present', tabId })
          break
        case 'present':
          // Someone older than us is alive — we are the duplicate.
          if (!amActive) {
            duplicateFound = true
            setState('duplicate')
          }
          break
        case 'evict':
          // The user clicked "Use this tab" in another tab. If we are
          // currently active, step down.
          if (amActive && msg.tabId !== tabId) {
            amActive = false
            setState('duplicate')
          }
          break
        case 'release':
          // The active tab announced it's closing — we can take over.
          if (state === 'duplicate' && !amActive) {
            // The simplest reliable way to re-run the claim flow is a reload.
            window.location.reload()
          }
          break
      }
    })

    // Announce ourselves and wait briefly for a 'present' reply.
    post({ kind: 'claim', tabId })

    const claimTimer = setTimeout(() => {
      if (duplicateFound) return
      amActive = true
      setState('active')
    }, CLAIM_TIMEOUT_MS)

    // Heartbeat so any tab that joins later (or wakes from background)
    // discovers us without us having to listen for its 'claim'.
    const heartbeat = setInterval(() => {
      if (amActive) post({ kind: 'present', tabId })
    }, HEARTBEAT_MS)

    const onPageHide = () => {
      if (amActive) post({ kind: 'release', tabId })
    }
    window.addEventListener('pagehide', onPageHide)

    // Expose the eviction trigger for the overlay button.
    ;(window as unknown as { __omsForceTab?: () => void }).__omsForceTab = () => {
      // Tell the current active tab to step down, then take over here.
      post({ kind: 'evict', tabId })
      duplicateFound = false
      amActive = true
      setState('active')
    }

    return () => {
      clearTimeout(claimTimer)
      clearInterval(heartbeat)
      window.removeEventListener('pagehide', onPageHide)
      if (amActive) post({ kind: 'release', tabId })
      close()
      delete (window as unknown as { __omsForceTab?: () => void }).__omsForceTab
    }
    // intentional: run once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (state === 'pending') {
    // Brief flash (<700ms) while we negotiate; render nothing rather
    // than the full app to avoid kicking off duplicate polls/sockets.
    return null
  }

  if (state === 'duplicate') {
    return (
      <div
        dir="rtl"
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-gradient-to-br from-amber-50 to-orange-100 p-6"
      >
        <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl border-2 border-amber-300 p-8 text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-amber-900 mb-2">
            النظام مفتوح بالفعل في تبويب آخر
          </h1>
          <p className="text-sm text-gray-700 leading-relaxed mb-6">
            لتقليل استهلاك البيانات وحماية أداء النظام، يُسمح بتبويب واحد فقط لكل متصفح.
            <br />
            يرجى الرجوع إلى التبويب الأصلي، أو يمكنك تفعيل هذا التبويب بدلاً منه.
          </p>
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => {
                const force = (window as unknown as { __omsForceTab?: () => void }).__omsForceTab
                if (force) force()
              }}
              className="w-full py-3 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-base shadow-md transition"
            >
              🔁 استخدم هذا التبويب
            </button>
            <button
              type="button"
              onClick={() => window.close()}
              className="w-full py-2.5 rounded-xl bg-white hover:bg-gray-50 text-gray-700 font-semibold text-sm border border-gray-300"
            >
              إغلاق هذا التبويب
            </button>
          </div>
          <p className="text-[11px] text-gray-400 mt-5">
            هذه السياسة تساعد على البقاء ضمن حد البيانات الشهري.
          </p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
