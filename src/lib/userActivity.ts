// Shared user-activity tracker.
//
// A single set of passive `document`-level listeners records the timestamp of
// the last user input (mouse / keyboard / touch / scroll / wheel). Any part of
// the app can then call `isUserIdle(ms)` to decide whether to skip work whose
// only purpose is updating a UI no human is currently watching.
//
// Phase 2H: introduced so `NotificationBell`'s Realtime-triggered refetch can
// skip while the user is AFK — mirroring the visibility-hidden guard that was
// already in place. `useVisibilityPoll` keeps its own listeners for now
// (it needs to also START/STOP the interval on activity, not just gate it);
// migrating that hook to consume this shared tracker is a future cleanup.

const ACTIVITY_EVENTS = [
  'mousemove',
  'mousedown',
  'keydown',
  'touchstart',
  'scroll',
  'wheel',
] as const

let lastActivityAt = 0
let installed = false

function install(): void {
  if (installed) return
  if (typeof document === 'undefined') return
  installed = true
  lastActivityAt = Date.now()

  const bump = () => {
    lastActivityAt = Date.now()
  }

  ACTIVITY_EVENTS.forEach((evt) =>
    document.addEventListener(evt, bump, { passive: true }),
  )
  // Coming back to the tab (or refocusing the window) counts as activity —
  // matches the semantics used inside useVisibilityPoll.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') bump()
  })
  window.addEventListener('focus', bump)
}

/**
 * Returns `true` if the user has not produced any input for at least
 * `idleMs` milliseconds. Safe to call during SSR (always returns `false`).
 * Listeners are installed lazily on first call in the browser.
 */
export function isUserIdle(idleMs: number): boolean {
  if (typeof document === 'undefined') return false
  install()
  return Date.now() - lastActivityAt > idleMs
}
