/**
 * Minimal in-process TTL cache for slow-changing, frequently-polled reads
 * (order settings, the notifications "do not follow up" customer roster,
 * discount codes, etc).
 *
 * Egress context (2026-08-11): a single active session re-triggers a heavy
 * ~15-query bundle on nearly every page navigation via `/api/notifications`,
 * including several full-table reads of data that barely changes minute to
 * minute. This cache collapses repeated reads of that data within a short
 * window into one upstream Supabase call.
 *
 * Scope: per warm Node.js server instance only — not shared across
 * concurrent Vercel function instances, and cleared on cold start. Still
 * meaningfully cuts egress because most of this app's traffic comes from a
 * small internal team hitting the same warm instance repeatedly.
 *
 * Also de-dupes concurrent in-flight calls for the same key so a burst of
 * simultaneous requests (several tabs polling at once) triggers only one
 * upstream fetch instead of one per request.
 */

interface CacheEntry {
  value: unknown
  expiresAt: number
}

const store = new Map<string, CacheEntry>()
const inflight = new Map<string, Promise<unknown>>()

export async function getCached<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const now = Date.now()
  const hit = store.get(key)
  if (hit && hit.expiresAt > now) return hit.value as T

  const pending = inflight.get(key)
  if (pending) return pending as Promise<T>

  const promise = fetcher()
    .then((value) => {
      store.set(key, { value, expiresAt: Date.now() + ttlMs })
      return value
    })
    .finally(() => {
      inflight.delete(key)
    })

  inflight.set(key, promise)
  return promise as Promise<T>
}

/** Drop a cached key immediately — call right after a write that changes it. */
export function invalidateCache(key: string): void {
  store.delete(key)
  inflight.delete(key)
}
