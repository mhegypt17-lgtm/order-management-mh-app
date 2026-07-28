import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { readOrderSettings, CatalogueRecord } from '@/lib/omsData'
import { ONLINE_CATALOGUE_KEY } from '@/lib/catalogue'

// Catalogues change rarely — same cache posture as /api/order-settings.
export const revalidate = 600
const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=0, s-maxage=600, stale-while-revalidate=3600',
}

function slugify(label: string): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  return base || 'catalogue'
}

async function saveCatalogues(catalogues: CatalogueRecord[]) {
  const settings = await readOrderSettings()
  await supabase.from('order_settings').upsert({ id: 'singleton', ...settings, catalogues })
}

export async function GET() {
  try {
    const settings = await readOrderSettings()
    return NextResponse.json({ catalogues: settings.catalogues || [] }, { status: 200, headers: CACHE_HEADERS })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch catalogues' }, { status: 500 })
  }
}

/**
 * POST /api/catalogues
 *
 * Body: { label: string, orderTypes: string[] }
 *
 * Creates a new catalogue AND duplicates the full 'online' price+stock list
 * (every product row) as its starting point — per the agreed design, a new
 * catalogue is never empty on day one.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    if (String(body?.role || '') !== 'admin') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const label = String(body?.label || '').trim()
    const orderTypes = Array.isArray(body?.orderTypes)
      ? body.orderTypes.map((t: unknown) => String(t)).filter(Boolean)
      : []

    if (!label) return NextResponse.json({ error: 'الاسم مطلوب' }, { status: 400 })

    const settings = await readOrderSettings()
    const existing = settings.catalogues || []

    let key = slugify(label)
    if (existing.some((c) => c.key === key) || key === ONLINE_CATALOGUE_KEY) {
      key = `${key}-${Date.now().toString(36)}`
    }

    const nextCatalogues: CatalogueRecord[] = [
      ...existing,
      {
        key,
        label,
        orderTypes,
        isActive: true,
        sortOrder: existing.length + 1,
      },
    ]
    await saveCatalogues(nextCatalogues)

    // Duplicate every 'online' product_prices row into the new catalogue.
    // Products with no explicit 'online' row yet (i.e. still only on the
    // legacy products columns) are seeded straight from `products`.
    const { data: onlineRows } = await supabase
      .from('product_prices')
      .select('productId,basePrice,offerPrice,stockStatus,stockQuantity')
      .eq('catalogueKey', ONLINE_CATALOGUE_KEY)

    const seededIds = new Set((onlineRows || []).map((r: any) => r.productId))
    const { data: allProducts } = await supabase
      .from('products')
      .select('id,basePrice,offerPrice,stockStatus,stockQuantity')

    const now = new Date().toISOString()
    const seedRows = [
      ...(onlineRows || []).map((r: any) => ({
        productId: r.productId,
        catalogueKey: key,
        basePrice: r.basePrice ?? null,
        offerPrice: r.offerPrice ?? null,
        stockStatus: r.stockStatus || 'available',
        stockQuantity: r.stockQuantity ?? null,
        updatedAt: now,
      })),
      ...(allProducts || [])
        .filter((p: any) => !seededIds.has(p.id))
        .map((p: any) => ({
          productId: p.id,
          catalogueKey: key,
          basePrice: p.basePrice ?? null,
          offerPrice: p.offerPrice ?? null,
          stockStatus: p.stockStatus || 'available',
          stockQuantity: p.stockQuantity ?? null,
          updatedAt: now,
        })),
    ]

    if (seedRows.length > 0) {
      const { error: seedError } = await supabase
        .from('product_prices')
        .upsert(seedRows, { onConflict: 'productId,catalogueKey' })
      if (seedError) {
        console.error('[catalogues] duplicate-from-online seed failed:', seedError.message)
      }
    }

    return NextResponse.json({ catalogues: nextCatalogues, seeded: seedRows.length }, { status: 201 })
  } catch (error) {
    console.error('[catalogues] POST failed', error)
    return NextResponse.json({ error: 'Failed to create catalogue' }, { status: 500 })
  }
}

/** PATCH — rename / remap order types / enable-disable an existing catalogue. */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    if (String(body?.role || '') !== 'admin') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const key = String(body?.key || '').trim()
    if (!key) return NextResponse.json({ error: 'key is required' }, { status: 400 })

    const settings = await readOrderSettings()
    const existing = settings.catalogues || []
    const idx = existing.findIndex((c) => c.key === key)
    if (idx === -1) return NextResponse.json({ error: 'Catalogue not found' }, { status: 404 })

    const next = [...existing]
    next[idx] = {
      ...next[idx],
      label: body.label !== undefined ? String(body.label).trim() || next[idx].label : next[idx].label,
      orderTypes: Array.isArray(body.orderTypes)
        ? body.orderTypes.map((t: unknown) => String(t)).filter(Boolean)
        : next[idx].orderTypes,
      isActive: body.isActive !== undefined ? Boolean(body.isActive) : next[idx].isActive,
    }
    await saveCatalogues(next)

    return NextResponse.json({ catalogues: next }, { status: 200 })
  } catch (error) {
    console.error('[catalogues] PATCH failed', error)
    return NextResponse.json({ error: 'Failed to update catalogue' }, { status: 500 })
  }
}
