import 'server-only'

/**
 * All report timing is anchored to Africa/Cairo. Vercel Cron fires in UTC,
 * so we always compute "yesterday in Cairo" from the wall clock — never
 * from the server's local date.
 */
export const REPORT_TIMEZONE = 'Africa/Cairo'

/**
 * Returns the YYYY-MM-DD string for a given date in Cairo time.
 * Uses en-CA formatter which conveniently outputs ISO-style YYYY-MM-DD.
 */
export function cairoDateString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: REPORT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/**
 * Yesterday in Cairo (YYYY-MM-DD). This is the primary reporting window
 * for the daily report — "what happened yesterday, sent to you this morning".
 */
export function cairoYesterdayString(now: Date = new Date()): string {
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  return cairoDateString(yesterday)
}

/**
 * The date exactly 7 days before the given Cairo date. Used for
 * "same weekday last week" comparisons — Mon→Mon, Tue→Tue, etc.
 */
export function sameWeekdayLastWeek(dateString: string): string {
  const [y, m, d] = dateString.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() - 7)
  return cairoDateString(dt)
}

/**
 * Formats a date string (YYYY-MM-DD) in a human-readable Arabic form.
 * Example: 'الأربعاء ١٦ يوليو ٢٠٢٦'
 */
export function formatArabicDate(dateString: string): string {
  const [y, m, d] = dateString.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return new Intl.DateTimeFormat('ar-EG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(dt)
}

/** Formats a date string in ISO-like English form. */
export function formatEnglishDate(dateString: string): string {
  const [y, m, d] = dateString.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(dt)
}

/** Formats a whole number with thousand separators. */
export function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(n)
}

/** Formats a currency amount in EGP (rounded to whole pounds). */
export function formatCurrency(n: number): string {
  return `${formatNumber(Math.round(n))} ج`
}

/**
 * Computes a % change and returns a formatted string + a sign token that
 * the email template can use to pick a color.
 */
export function pctChange(
  current: number,
  previous: number,
): { text: string; sign: 'up' | 'down' | 'flat' | 'na' } {
  if (previous === 0) {
    if (current === 0) return { text: '—', sign: 'flat' }
    return { text: 'جديد', sign: 'up' }
  }
  const pct = ((current - previous) / previous) * 100
  if (Math.abs(pct) < 0.5) return { text: '±0%', sign: 'flat' }
  const rounded = Math.round(pct)
  if (rounded > 0) return { text: `▲ +${rounded}%`, sign: 'up' }
  return { text: `▼ ${rounded}%`, sign: 'down' }
}
