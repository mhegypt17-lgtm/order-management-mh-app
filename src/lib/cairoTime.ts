/**
 * Cairo timezone helpers.
 *
 * The whole app is operated from Egypt. Without these helpers, code like
 * `new Date().toISOString().slice(0, 10)` returns the *UTC* date, which on a
 * Vercel server (UTC) means an order placed in Cairo at 00:01 (just after
 * midnight, Cairo) would be tagged with *yesterday's* date — because UTC is
 * still 22:01 of the previous day.
 *
 * All helpers use the IANA zone `Africa/Cairo`, which automatically handles
 * any DST rules Egypt observes (the rules have flipped several times over the
 * past decade — letting the runtime handle it via Intl is the safest
 * approach).
 *
 * Convention:
 * - Business-day fields (e.g. `orderDate`) MUST be computed via these helpers
 *   so they always reflect the Cairo wall-clock day.
 * - Real timestamps (`createdAt`, `updatedAt`) stay as UTC ISO strings — that
 *   is the storage standard — but should be *displayed* via
 *   `formatCairoDateTime` / `formatCairoDate` so users see Cairo time.
 */

export const CAIRO_TIME_ZONE = 'Africa/Cairo'

function toDate(input?: Date | string | number | null): Date {
  if (input == null) return new Date()
  if (input instanceof Date) return input
  return new Date(input)
}

/** Returns the Cairo wall-clock date as "YYYY-MM-DD". */
export function cairoDateString(input?: Date | string | number | null): string {
  const d = toDate(input)
  // en-CA gives an ISO-like "YYYY-MM-DD" output.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CAIRO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

/** Returns the Cairo wall-clock time as "HH:MM" (24h). */
export function cairoTimeString(input?: Date | string | number | null): string {
  const d = toDate(input)
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: CAIRO_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
}

/** Returns the Cairo wall-clock month as "YYYY-MM". */
export function cairoMonthString(input?: Date | string | number | null): string {
  return cairoDateString(input).slice(0, 7)
}

/** Returns the Cairo wall-clock year-month-day parts as numbers. */
export function cairoYMD(input?: Date | string | number | null): { year: number; month: number; day: number } {
  const iso = cairoDateString(input)
  const [y, m, d] = iso.split('-').map(Number)
  return { year: y, month: m, day: d }
}

/** First day of the current Cairo month, as "YYYY-MM-DD". */
export function cairoFirstDayOfMonth(input?: Date | string | number | null): string {
  const { year, month } = cairoYMD(input)
  return `${year}-${String(month).padStart(2, '0')}-01`
}

/** Last day of the current Cairo month, as "YYYY-MM-DD". */
export function cairoLastDayOfMonth(input?: Date | string | number | null): string {
  const { year, month } = cairoYMD(input)
  // Day 0 of the next month = last day of this month, in the local
  // (Cairo-derived) calendar. Since we already extracted the calendar fields
  // in Cairo TZ, this arithmetic is safe.
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
}

/** Adds `n` days to a "YYYY-MM-DD" string. Negative values subtract. */
export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const t = new Date(Date.UTC(y, (m || 1) - 1, d || 1))
  t.setUTCDate(t.getUTCDate() + n)
  const yy = t.getUTCFullYear()
  const mm = String(t.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(t.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/**
 * Human-readable Cairo date+time string (e.g. "10/06/2026, 00:01").
 * Pass a UTC ISO string (or Date) and it will be rendered in Cairo TZ.
 */
export function formatCairoDateTime(
  input: Date | string | number | null | undefined,
  locale: string = 'en-GB',
): string {
  if (input == null || input === '') return ''
  const d = toDate(input)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(locale, {
    timeZone: CAIRO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
}

/** Human-readable Cairo date (no time). */
export function formatCairoDate(
  input: Date | string | number | null | undefined,
  locale: string = 'en-GB',
): string {
  if (input == null || input === '') return ''
  const d = toDate(input)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(locale, {
    timeZone: CAIRO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}
