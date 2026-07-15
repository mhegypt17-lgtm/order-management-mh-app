import 'server-only'

/**
 * Row shape after parsing the price CSV.
 * The CSV must have exactly these columns (in this order):
 *   productName, basePrice, offerPrice
 *
 * offerPrice is optional per row — empty string means "no offer / clear
 * whatever is currently there".
 */
export interface PriceCsvRow {
  productName: string
  basePrice: number
  offerPrice: number | null
  /** 1-based line number in the source CSV (2 = first data row). */
  lineNumber: number
}

export interface PriceCsvParseResult {
  rows: PriceCsvRow[]
  invalid: Array<{ lineNumber: number; raw: string; reason: string }>
}

/**
 * Minimal RFC 4180 CSV row splitter. Handles:
 *   - "double""quote" escaping inside quoted fields
 *   - commas inside quoted fields
 *   - unquoted fields
 * Does NOT handle newlines inside quoted fields (fine — our data doesn't
 * have any). Google's published CSV always uses \n or \r\n between rows.
 */
function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
    } else {
      if (ch === ',') {
        out.push(cur)
        cur = ''
      } else if (ch === '"' && cur === '') {
        inQuotes = true
      } else {
        cur += ch
      }
    }
  }
  out.push(cur)
  return out
}

/** Strip UTF-8 BOM if present. */
function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s
}

/**
 * Parses the raw CSV text from the Google Sheets published URL.
 * Skips the header row.
 */
export function parsePriceCsv(csv: string): PriceCsvParseResult {
  const text = stripBom(csv).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = text.split('\n')

  const rows: PriceCsvRow[] = []
  const invalid: PriceCsvParseResult['invalid'] = []

  // First non-empty line is the header — skip it.
  let headerSeen = false

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    if (raw.trim() === '') continue

    if (!headerSeen) {
      headerSeen = true
      continue
    }

    const lineNumber = i + 1
    const fields = splitCsvLine(raw)

    if (fields.length < 2) {
      invalid.push({
        lineNumber,
        raw,
        reason: 'أقل من عمودين — تحقق من التنسيق',
      })
      continue
    }

    const productName = fields[0]?.trim() ?? ''
    const basePriceRaw = fields[1]?.trim() ?? ''
    const offerPriceRaw = (fields[2] ?? '').trim()

    if (!productName) {
      invalid.push({ lineNumber, raw, reason: 'اسم المنتج فارغ' })
      continue
    }
    if (!basePriceRaw) {
      invalid.push({
        lineNumber,
        raw,
        reason: `السعر الأساسي فارغ لـ "${productName}"`,
      })
      continue
    }

    const basePrice = Number(basePriceRaw)
    if (!Number.isFinite(basePrice) || basePrice < 0) {
      invalid.push({
        lineNumber,
        raw,
        reason: `السعر الأساسي غير صالح لـ "${productName}": ${basePriceRaw}`,
      })
      continue
    }

    let offerPrice: number | null = null
    if (offerPriceRaw !== '') {
      const parsed = Number(offerPriceRaw)
      if (!Number.isFinite(parsed) || parsed < 0) {
        invalid.push({
          lineNumber,
          raw,
          reason: `سعر العرض غير صالح لـ "${productName}": ${offerPriceRaw}`,
        })
        continue
      }
      offerPrice = parsed
    }

    rows.push({ productName, basePrice, offerPrice, lineNumber })
  }

  return { rows, invalid }
}

/**
 * Accepts either an /edit URL or a /pub URL and returns the URL that will
 * actually return CSV bytes. Returns null if the URL doesn't look like a
 * Google Sheets URL at all.
 *
 * Supported forms:
 *   1. https://docs.google.com/spreadsheets/d/e/{token}/pub?...&output=csv
 *      → returned as-is
 *   2. https://docs.google.com/spreadsheets/d/{id}/edit?...gid=123
 *      → NOT supported (requires publishing first). Returns null.
 */
export function normaliseSheetUrl(url: string): {
  csvUrl: string | null
  reason?: string
} {
  const trimmed = url.trim()
  if (!trimmed) return { csvUrl: null, reason: 'الرابط فارغ' }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return { csvUrl: null, reason: 'الرابط غير صالح' }
  }

  if (!parsed.hostname.endsWith('docs.google.com')) {
    return {
      csvUrl: null,
      reason: 'الرابط ليس من Google Sheets',
    }
  }

  // Published URL: /spreadsheets/d/e/{token}/pub*
  if (parsed.pathname.includes('/d/e/') && parsed.pathname.includes('/pub')) {
    // Force output=csv if it's a /pubhtml or missing output param
    const u = new URL(parsed.toString())
    u.searchParams.set('output', 'csv')
    // Some /pubhtml URLs need to be swapped
    u.pathname = u.pathname.replace(/\/pubhtml$/, '/pub')
    return { csvUrl: u.toString() }
  }

  // Private /edit URL — user needs to publish first
  if (parsed.pathname.includes('/edit') || parsed.pathname.match(/\/d\/[^/]+/)) {
    return {
      csvUrl: null,
      reason:
        'هذا رابط تعديل خاص. لازم أولاً: File → Share → Publish to web → CSV، ثم انسخ رابط النشر.',
    }
  }

  return { csvUrl: null, reason: 'شكل الرابط غير مدعوم' }
}
