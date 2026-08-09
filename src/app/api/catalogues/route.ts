import { NextRequest, NextResponse } from 'next/server'
import { unstable_noStore as noStore } from 'next/cache'
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
 * Creates a new catalogue. It starts empty — no products are duplicated
 * in; an admin adds products to it explicitly (per-product "add to
 * catalogue" or the bulk import), same as any other independent LOB.
 */
export async function POST(request: NextRequest) {
  try {
    // Read-modify-write on the catalogues list (revalidate = 600 below, no
    // `dynamic`) — force this specific read fresh so a rapid second edit
    // can't silently overwrite the first one from a stale cached list.
    noStore()
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

    return NextResponse.json({ catalogues: nextCatalogues }, { status: 201 })
  } catch (error) {
    console.error('[catalogues] POST failed', error)
    return NextResponse.json({ error: 'Failed to create catalogue' }, { status: 500 })
  }
}

/** PATCH — rename / remap order types / enable-disable an existing catalogue. */
export async function PATCH(request: NextRequest) {
  try {
    // Same read-modify-write risk as POST above — force a fresh read.
    noStore()
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
