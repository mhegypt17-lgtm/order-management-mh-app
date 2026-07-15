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

/** Strip UTF-8 BOM if present. */
function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s
}

/**
 * Canonicalises a product name for matching:
 *   - trims leading/trailing whitespace
 *   - collapses ALL whitespace runs (spaces, tabs, newlines) to a single space
 * Both the CSV row and the DB row should be run through this before
 * comparing. Exported so the preview route can normalise DB names too.
 */
export function normaliseProductName(name: string): string {
  return name.replace(/\s+/g, ' ').trim()
}

/**
 * Proper RFC 4180 CSV parser. Walks the whole text character-by-character
 * and tracks quote state, so newlines INSIDE a quoted field are treated
 * as part of the field value (not a row terminator). Google Sheets
 * exports multi-line cells this way.
 *
 * Returns an array of { fields, lineNumber } where lineNumber is the
 * 1-based line the row *starts* on.
 */
function parseCsvRecords(
  text: string,
): Array<{ fields: string[]; lineNumber: number; raw: string }> {
  const records: Array<{ fields: string[]; lineNumber: number; raw: string }> = []
  let cur = ''
  let field = ''
  let fields: string[] = []
  let inQuotes = false
  let rowStartLine = 1
  let currentLine = 1
  let rowHasContent = false

  const pushField = () => {
    fields.push(field)
    field = ''
  }
  const pushRecord = () => {
    // Only emit a record if the row had at least one visible character
    if (rowHasContent) {
      pushField()
      records.push({ fields, lineNumber: rowStartLine, raw: cur })
    }
    fields = []
    field = ''
    cur = ''
    rowHasContent = false
    rowStartLine = currentLine + 1
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    cur += ch

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          cur += text[i + 1]
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
        if (ch === '\n') currentLine++
      }
      rowHasContent = true
    } else {
      if (ch === '"' && field === '') {
        inQuotes = true
        rowHasContent = true
      } else if (ch === ',') {
        pushField()
        rowHasContent = true
      } else if (ch === '\r') {
        // ignore; \n will handle the row break
      } else if (ch === '\n') {
        pushRecord()
        currentLine++
      } else {
        field += ch
        if (ch.trim() !== '') rowHasContent = true
      }
    }
  }

  // Final record (no trailing newline)
  if (field !== '' || fields.length > 0 || rowHasContent) {
    pushField()
    if (fields.some((f) => f.trim() !== '')) {
      records.push({ fields, lineNumber: rowStartLine, raw: cur })
    }
  }

  return records
}

/**
 * Parses the raw CSV text from the Google Sheets published URL.
 * Skips the header row.
 */
export function parsePriceCsv(csv: string): PriceCsvParseResult {
  const text = stripBom(csv).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const records = parseCsvRecords(text)

  const rows: PriceCsvRow[] = []
  const invalid: PriceCsvParseResult['invalid'] = []

  // First record is the header — skip it.
  let headerSeen = false

  for (const rec of records) {
    if (!headerSeen) {
      headerSeen = true
      continue
    }

    const { fields, lineNumber, raw } = rec

    if (fields.length < 2) {
      invalid.push({
        lineNumber,
        raw,
        reason: 'أقل من عمودين — تحقق من التنسيق',
      })
      continue
    }

    const productName = normaliseProductName(fields[0] ?? '')
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
