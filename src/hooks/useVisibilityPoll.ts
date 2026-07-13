'use client'

import { useEffect, useRef } from 'react'

// Phase 2H: after this many ms without user input (mouse / keyboard / touch /
// scroll) we treat the tab as "idle" and pause the poll — same effect as
// hiding the tab. Any input event resumes polling immediately with a
// catch-up fetch. 5 minutes is long enough that ordinary reading pauses
// don't trigger it, short enough to matter for AFK tabs left open all day.
const IDLE_MS = 5 * 60 * 1000

/**
 * Runs `callback` on a visibility-gated interval and refetches on tab focus.
 *
 * Behavior:
 *   • On mount, if the tab is visible AND the user is active, starts a
 *     `setInterval` at `intervalMs`. Interval ticks skip execution while the
 *     tab is hidden.
 *   • When the tab becomes hidden, the interval is cleared (not just skipped)
 *     so the browser doesn't wake the JS loop unnecessarily.
 *   • When the tab regains focus or `visibilitychange` flips back to visible,
 *     `callback` is fired immediately (catch-up) and the interval is restarted.
 *   • When the user is idle (no input for IDLE_MS), the interval is cleared
 *     the same way as when the tab is hidden. Any mouse move / key press /
 *     touch / scroll fires an immediate catch-up and resumes the interval.
 *   • If `intervalMs` is `null` or `<= 0`, no periodic poll is started but the
 *     focus / visibility / activity refetch still runs — useful for Realtime-
 *     primary components (e.g. chat) that only need the poll as a wake-up nudge.
 *   • `callback` is read from a ref, so passing a fresh closure per render
 *     does NOT restart the interval. The underlying effect only re-runs when
 *     `intervalMs` itself changes.
 *
 * Callers should still perform their own initial fetch — the hook intentionally
 * does not fire `callback` on mount, so it can be layered on top of an effect
 * that already fetches once and subscribes to Realtime.
 *
 * Egress notes:
 *   • Phase 2D.1a: extracted from duplicated blocks in `NotificationBell` and
 *     `ChatButton` to standardize visibility-aware polling. Cuts wasted
 *     requests from background tabs to zero.
 *   • Phase 2H: added idle detection so a foreground tab left open (user
 *     AFK) also stops polling after 5 min of no input, then resumes on the
 *     next mouse move / keystroke. Cuts idle-tab egress from ~1 MB/hr to ~0.
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
    let idleTimerId: ReturnType<typeof setTimeout> | null = null
    let isIdle = false

    const canPoll = () =>
      document.visibilityState === 'visible' && !isIdle

    const start = () => {
      if (!intervalMs || intervalMs <= 0) return
      if (intervalId != null) return
      if (!canPoll()) return
      intervalId = setInterval(() => {
        if (canPoll()) cbRef.current()
      }, intervalMs)
    }

    const stop = () => {
      if (intervalId == null) return
      clearInterval(intervalId)
      intervalId = null
    }

    const armIdleTimer = () => {
      if (idleTimerId != null) clearTimeout(idleTimerId)
      idleTimerId = setTimeout(() => {
        isIdle = true
        stop()
      }, IDLE_MS)
    }

    const onActivity = () => {
      const wasIdle = isIdle
      isIdle = false
      armIdleTimer()
      if (wasIdle && document.visibilityState === 'visible') {
        // User just came back — catch-up fetch, then resume the interval.
        cbRef.current()
        start()
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        // Focus / tab-switch counts as activity.
        onActivity()
        // Ensure we fire even if we weren't marked idle (e.g. tab was just
        // hidden, not idle-timed-out).
        if (intervalId == null) {
          cbRef.current()
          start()
        }
      } else {
        stop()
      }
    }

    // Passive listeners so we don't block scrolling / input handling.
    const activityEvents: Array<keyof DocumentEventMap> = [
      'mousemove',
      'mousedown',
      'keydown',
      'touchstart',
      'scroll',
      'wheel',
    ]
    activityEvents.forEach((evt) =>
      document.addEventListener(evt, onActivity, { passive: true }),
    )
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onVisibility)

    // Prime: assume active on mount, arm the idle timer, start polling.
    armIdleTimer()
    if (document.visibilityState === 'visible') start()

    return () => {
      stop()
      if (idleTimerId != null) clearTimeout(idleTimerId)
      activityEvents.forEach((evt) =>
        document.removeEventListener(evt, onActivity),
      )
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onVisibility)
    }
  }, [intervalMs])
}
