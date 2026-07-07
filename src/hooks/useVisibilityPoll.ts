'use client'

import { useEffect, useRef } from 'react'

/**
 * Runs `callback` on a visibility-gated interval and refetches on tab focus.
 *
 * Behavior:
 *   • On mount, if the tab is visible, starts a `setInterval` at `intervalMs`.
 *     Interval ticks skip execution while the tab is hidden.
 *   • When the tab becomes hidden, the interval is cleared (not just skipped)
 *     so the browser doesn't wake the JS loop unnecessarily.
 *   • When the tab regains focus or `visibilitychange` flips back to visible,
 *     `callback` is fired immediately (catch-up) and the interval is restarted.
 *   • If `intervalMs` is `null` or `<= 0`, no periodic poll is started but the
 *     focus / visibility refetch still runs — useful for Realtime-primary
 *     components (e.g. chat) that only need the poll as a wake-up nudge.
 *   • `callback` is read from a ref, so passing a fresh closure per render
 *     does NOT restart the interval. The underlying effect only re-runs when
 *     `intervalMs` itself changes.
 *
 * Callers should still perform their own initial fetch — the hook intentionally
 * does not fire `callback` on mount, so it can be layered on top of an effect
 * that already fetches once and subscribes to Realtime.
 *
 * Egress note (Phase 2D.1a): extracted from duplicated blocks in
 * `NotificationBell` and `ChatButton` to standardize visibility-aware polling
 * across the app. Cuts wasted requests from background tabs to zero.
 */
export function useVisibilityPoll(
  callback: () => void,
  intervalMs: number | null,
): void {
  const cbRef = useRef(callback)
  useEffect(() => {
    cbRef.current = callback
  }, [callback])

  useEffect(() => {
    if (typeof document === 'undefined') return

    let intervalId: ReturnType<typeof setInterval> | null = null

    const start = () => {
      if (!intervalMs || intervalMs <= 0) return
      if (intervalId != null) return
      intervalId = setInterval(() => {
        if (document.visibilityState === 'visible') cbRef.current()
      }, intervalMs)
    }

    const stop = () => {
      if (intervalId == null) return
      clearInterval(intervalId)
      intervalId = null
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        // Catch-up fetch, then resume the interval.
        cbRef.current()
        start()
      } else {
        stop()
      }
    }

    if (document.visibilityState === 'visible') start()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onVisibility)

    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onVisibility)
    }
  }, [intervalMs])
}
