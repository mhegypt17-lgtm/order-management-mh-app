import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parsePriceCsv, normaliseSheetUrl } from '@/lib/price-csv'

export const dynamic = 'force-dynamic'

interface PreviewRow {
  productId: string
  productName: string
  currentBasePrice: number | null
  currentOfferPrice: number | null
  newBasePrice: number
  newOfferPrice: number | null
  lineNumber: number
}

/**
 * POST /api/admin/products/import-preview
 *
 * Body: { url: string }
 *
 * Fetches the published Google Sheets CSV server-side (keeps egress off
 * the user's browser and lets us set our own timeout / caching), matches
 * each CSV row by trimmed productName to a row in the products table,
 * and returns 5 buckets:
 *   - willUpdate     : name found, at least one price field differs
 *   - noChange       : name found, both prices already match
 *   - notFoundInDb   : name in CSV, not in DB
 *   - duplicatesInDb : name in CSV maps to >1 DB row (must dedupe first)
 *   - invalid        : rows that failed to parse
 *
 * Also returns `unmatchedDbProducts` — names in the DB that are NOT in
 * the CSV, so admin can spot deletions/renames.
 */
export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdmin(request)
    if (guard instanceof NextResponse) return guard

    const body = (await request.json().catch(() => ({}))) as { url?: string }
    const inputUrl = typeof body.url === 'string' ? body.url : ''

    const { csvUrl, reason } = normaliseSheetUrl(inputUrl)
    if (!csvUrl) {
      return NextResponse.json(
        { error: reason || 'الرابط غير صالح' },
        { status: 400 },
      )
    }

    // Fetch the CSV. Google occasionally 302s to a login page if the sheet
    // isn't actually published — treat that as an error.
    const csvRes = await fetch(csvUrl, {
      cache: 'no-store',
      redirect: 'follow',
      headers: { Accept: 'text/csv, text/plain, */*' },
    })
    if (!csvRes.ok) {
      return NextResponse.json(
        {
          error: `تعذر تحميل الشيت (HTTP ${csvRes.status}). تأكد إن الشيت منشور Publish to web.`,
        },
        { status: 502 },
      )
    }
    const contentType = csvRes.headers.get('content-type') || ''
    const csvText = await csvRes.text()

    // If Google returned HTML (login page) instead of CSV, refuse.
    if (
      contentType.includes('text/html') ||
      csvText.trimStart().startsWith('<')
    ) {
      return NextResponse.json(
        {
          error:
            'الرابط رجّع HTML وليس CSV. تأكد إنك عملت Publish to web واختارت CSV كصيغة النشر.',
        },
        { status: 400 },
      )
    }

    const { rows, invalid } = parsePriceCsv(csvText)

    if (rows.length === 0 && invalid.length === 0) {
      return NextResponse.json(
        { error: 'الشيت فاضي' },
        { status: 400 },
      )
    }

    // Fetch every product with prices, only the columns we care about.
    const supabase = getSupabaseAdmin()
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id,"productName","basePrice","offerPrice","isActive"')

    if (productsError) {
      return NextResponse.json(
        { error: `تعذر قراءة المنتجات: ${productsError.message}` },
        { status: 500 },
      )
    }

    // Build name → product(s) index (trim + case-sensitive, Arabic-safe).
    const nameIndex = new Map<
      string,
      Array<{
        id: string
        productName: string
        basePrice: number | null
        offerPrice: number | null
      }>
    >()
    for (const p of products ?? []) {
      const key = (p.productName ?? '').trim()
      if (!key) continue
      const arr = nameIndex.get(key) ?? []
      arr.push({
        id: String(p.id),
        productName: String(p.productName),
        basePrice:
          p.basePrice === null || p.basePrice === undefined
            ? null
            : Number(p.basePrice),
        offerPrice:
          p.offerPrice === null || p.offerPrice === undefined
            ? null
            : Number(p.offerPrice),
      })
      nameIndex.set(key, arr)
    }

    const willUpdate: PreviewRow[] = []
    const noChange: PreviewRow[] = []
    const notFoundInDb: Array<{
      lineNumber: number
      productName: string
      basePrice: number
      offerPrice: number | null
    }> = []
    const duplicatesInDb: Array<{
      productName: string
      lineNumber: number
      matchingIds: string[]
    }> = []

    const csvNames = new Set<string>()

    for (const row of rows) {
      csvNames.add(row.productName)
      const matches = nameIndex.get(row.productName)
      if (!matches || matches.length === 0) {
        notFoundInDb.push({
          lineNumber: row.lineNumber,
          productName: row.productName,
          basePrice: row.basePrice,
          offerPrice: row.offerPrice,
        })
        continue
      }
      if (matches.length > 1) {
        duplicatesInDb.push({
          productName: row.productName,
          lineNumber: row.lineNumber,
          matchingIds: matches.map((m) => m.id),
        })
        continue
      }
      const dbRow = matches[0]
      const baseSame = dbRow.basePrice === row.basePrice
      const offerSame = dbRow.offerPrice === row.offerPrice
      const preview: PreviewRow = {
        productId: dbRow.id,
        productName: dbRow.productName,
        currentBasePrice: dbRow.basePrice,
        currentOfferPrice: dbRow.offerPrice,
        newBasePrice: row.basePrice,
        newOfferPrice: row.offerPrice,
        lineNumber: row.lineNumber,
      }
      if (baseSame && offerSame) {
        noChange.push(preview)
      } else {
        willUpdate.push(preview)
      }
    }

    // Names present in the DB but missing from the CSV. Informational only.
    const unmatchedDbProducts: Array<{
      id: string
      productName: string
      basePrice: number | null
      offerPrice: number | null
      isActive: boolean
    }> = []
    for (const p of products ?? []) {
      const key = (p.productName ?? '').trim()
      if (!key) continue
      if (!csvNames.has(key)) {
        unmatchedDbProducts.push({
          id: String(p.id),
          productName: String(p.productName),
          basePrice:
            p.basePrice === null || p.basePrice === undefined
              ? null
              : Number(p.basePrice),
          offerPrice:
            p.offerPrice === null || p.offerPrice === undefined
              ? null
              : Number(p.offerPrice),
          isActive: p.isActive !== false,
        })
      }
    }

    return NextResponse.json({
      csvUrl,
      totalCsvRows: rows.length,
      totalDbProducts: (products ?? []).length,
      willUpdate,
      noChange,
      notFoundInDb,
      duplicatesInDb,
      invalid,
      unmatchedDbProducts,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'خطأ غير متوقع'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
