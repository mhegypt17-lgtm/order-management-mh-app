import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { DeliveryZoneRecord, generateId, readDeliveryZones } from '@/lib/omsData'

// Prevent Vercel from edge-caching this route (especially the 405 that gets
// served for non-GET methods if the route is treated as static).
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const zones = await readDeliveryZones()
    return NextResponse.json({ zones }, { status: 200 })
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
      .select('*')
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
        console.error('Error deleting zones:', deleteErr)
        errors.push(`Delete: ${deleteErr.message}`)
      }
    }

    for (const z of normalized) {
      if (existingById.has(z.id)) {
        const { error: updateErr } = await supabase
          .from('delivery_zones')
          .update(z)
          .eq('id', z.id)
        if (updateErr) {
          console.error('Error updating zone row:', z.id, updateErr)
          errors.push(`Update ${z.area}/${z.subArea || '-'}: ${updateErr.message}`)
        }
      } else {
        const { error: insertErr } = await supabase
          .from('delivery_zones')
          .insert([z])
        if (insertErr) {
          console.error('Error inserting zone row:', z.id, insertErr)
          errors.push(`Insert ${z.area}/${z.subArea || '-'}: ${insertErr.message}`)
        }
      }
    }

    if (errors.length > 0) {
      return NextResponse.json(
        { error: 'Failed to update delivery zones', details: errors },
        { status: 500 }
      )
    }

    const zones = await readDeliveryZones()
    return NextResponse.json({ zones }, { status: 200 })
  } catch (error: any) {
    console.error('Error in delivery-zones PUT:', error)
    return NextResponse.json(
      { error: 'Failed to update delivery zones', details: error?.message || String(error) },
      { status: 500 }
    )
  }
}
