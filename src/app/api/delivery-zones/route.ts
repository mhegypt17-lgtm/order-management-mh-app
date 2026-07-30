import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { DeliveryZoneRecord, generateId, readDeliveryZones } from '@/lib/omsData'

// Delivery zones change rarely (ops team edits area/cost lists occasionally)
// but are read on every OrderForm mount + several dashboard aggregates.
// PUT/POST/DELETE handlers below are naturally non-cacheable, so it's safe to
// let Next.js cache GET responses; the previous `force-dynamic` was overkill.
export const revalidate = 600
// PUT does: 1 select (ids only) + 1 delete + 1 upsert, over 200+ rows.
// Give it real headroom above the platform's 10s default so a slightly slow
// Supabase round trip doesn't get cut off AFTER the write already committed
// (which is what made saves look "failed" while the data was actually saved).
export const maxDuration = 30

export async function GET() {
  try {
    const zones = await readDeliveryZones()
    return NextResponse.json(
      { zones },
      {
        status: 200,
        // Tier 1 caching — shared across all users/tabs at the edge.
        headers: {
          'Cache-Control':
            'public, max-age=0, s-maxage=600, stale-while-revalidate=3600',
        },
      },
    )
  } catch {
    return NextResponse.json({ error: 'Failed to fetch delivery zones' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const incoming = Array.isArray(body?.zones) ? body.zones : []

    const { data: dbRows, error: fetchError } = await supabase
      .from('delivery_zones')
      .select('id, "createdAt"')
      .range(0, 99999)

    if (fetchError) {
      console.error('Error fetching delivery zones:', fetchError)
      return NextResponse.json(
        { error: 'Failed to load existing delivery zones', details: fetchError.message },
        { status: 500 }
      )
    }

    const existingById = new Map(
      (dbRows || []).map((r: any) => [String(r.id), r as DeliveryZoneRecord])
    )
    const now = new Date().toISOString()

    const normalized: DeliveryZoneRecord[] = []
    for (const z of incoming) {
      const zone = Number(z?.zone)
      const area = String(z?.area || '').trim()
      const subArea = String(z?.subArea || '').trim()
      if (!Number.isFinite(zone) || zone < 1) continue
      if (!area) continue

      const incomingId = z?.id ? String(z.id) : ''
      const existing = incomingId ? existingById.get(incomingId) : undefined

      normalized.push({
        id: existing?.id || incomingId || generateId('zone'),
        zone,
        area,
        subArea,
        averageDistanceKm: Number(z?.averageDistanceKm) || 0,
        deliveryCost: Number(z?.deliveryCost) || 0,
        customerDeliveryFee: Number(z?.customerDeliveryFee) || 0,
        freeDeliveryValue: Number(z?.freeDeliveryValue) || 0,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      })
    }

    const incomingIds = new Set(normalized.map((z) => z.id))
    const toDelete = (dbRows || [])
      .map((r: any) => String(r.id))
      .filter((id) => !incomingIds.has(id))

    const errors: string[] = []

    if (toDelete.length > 0) {
      const { error: deleteErr } = await supabase
        .from('delivery_zones')
        .delete()
        .in('id', toDelete)
      if (deleteErr) {
        // Non-fatal: a removed zone can still be referenced by historical
        // orders (foreign key), which blocks its deletion. That's just
        // cleanup of an old row — it must NOT fail the save the user is
        // actually performing (the upsert below), which is what previously
        // caused "save failed" toasts even though the new/edited zone had
        // already been written successfully.
        console.error('Non-fatal: failed to delete removed zones (likely still referenced by orders):', deleteErr)
      }
    }

    // Upsert every row in ONE round trip instead of looping update/insert
    // per row. With 200+ zones, the old per-row loop meant 200+ sequential
    // awaits on every save — easily enough to blow past the serverless
    // function's execution timeout, which is what made saves fail (not
    // just for new rows — any save, once the table grew large enough).
    if (normalized.length > 0) {
      const { error: upsertErr } = await supabase
        .from('delivery_zones')
        .upsert(normalized, { onConflict: 'id' })
      if (upsertErr) {
        console.error('Error upserting zones:', upsertErr)
        errors.push(`Upsert: ${upsertErr.message}`)
      }
    }

    if (errors.length > 0) {
      return NextResponse.json(
        { error: 'Failed to update delivery zones', details: errors },
        { status: 500 }
      )
    }

    // Return the rows we just wrote directly instead of re-querying the
    // whole table again — saves a third round trip on top of the select
    // + upsert above, which is what mattered most for staying under the
    // function timeout with 200+ rows.
    const zones = [...normalized].sort((a, b) => {
      if (a.zone !== b.zone) return a.zone - b.zone
      return a.averageDistanceKm - b.averageDistanceKm
    })
    return NextResponse.json({ zones }, { status: 200 })
  } catch (error: any) {
    console.error('Error in delivery-zones PUT:', error)
    return NextResponse.json(
      { error: 'Failed to update delivery zones', details: error?.message || String(error) },
      { status: 500 }
    )
  }
}
