import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { DeliveryZoneRecord, readDeliveryZones } from '@/lib/omsData'

export async function GET() {
  try {
    const zones = (await readDeliveryZones()).sort((a, b) => a.zone - b.zone)
    return NextResponse.json({ zones }, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch delivery zones' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const incoming = Array.isArray(body?.zones) ? body.zones : []

    if (incoming.length === 0) {
      return NextResponse.json({ error: 'No zones payload provided' }, { status: 400 })
    }

    // Read existing rows straight from Supabase so we get real DB ids
    // (and can tell apart inserts vs updates).
    const { data: dbRows, error: fetchError } = await supabase
      .from('delivery_zones')
      .select('*')

    if (fetchError) {
      console.error('Error fetching delivery zones:', fetchError)
      return NextResponse.json(
        { error: 'Failed to load existing delivery zones' },
        { status: 500 }
      )
    }

    const existingByZone = new Map(
      (dbRows || []).map((r: any) => [Number(r.zone), r as DeliveryZoneRecord])
    )
    const now = new Date().toISOString()

    const normalized: DeliveryZoneRecord[] = incoming
      .map((z: any) => {
        const zone = Number(z.zone)
        if (!Number.isFinite(zone) || zone < 1 || zone > 8) return null

        const existingZone = existingByZone.get(zone)
        return {
          id: existingZone?.id || `zone_${Date.now()}_${zone}`,
          zone,
          area: String(z.area || '').trim() || `منطقة ${zone}`,
          averageDistanceKm: Number(z.averageDistanceKm) || 0,
          deliveryCost: Number(z.deliveryCost) || 0,
          customerDeliveryFee: Number(z.customerDeliveryFee) || 0,
          freeDeliveryValue: Number(z.freeDeliveryValue) || 0,
          createdAt: existingZone?.createdAt || now,
          updatedAt: now,
        }
      })
      .filter(Boolean)
      .sort((a, b) => a.zone - b.zone) as DeliveryZoneRecord[]

    if (normalized.length === 0) {
      return NextResponse.json({ error: 'Invalid zones payload' }, { status: 400 })
    }

    // Update existing rows by id, insert new ones. Avoids relying on a
    // unique constraint on the `zone` column (which the table doesn't have).
    const errors: string[] = []
    for (const z of normalized) {
      const exists = existingByZone.has(z.zone)
      if (exists) {
        const { error: updateErr } = await supabase
          .from('delivery_zones')
          .update(z)
          .eq('id', z.id)
        if (updateErr) {
          console.error('Error updating zone:', z.zone, updateErr)
          errors.push(`Zone ${z.zone}: ${updateErr.message}`)
        }
      } else {
        const { error: insertErr } = await supabase
          .from('delivery_zones')
          .insert([z])
        if (insertErr) {
          console.error('Error inserting zone:', z.zone, insertErr)
          errors.push(`Zone ${z.zone}: ${insertErr.message}`)
        }
      }
    }

    if (errors.length > 0) {
      return NextResponse.json(
        { error: 'Failed to update delivery zones', details: errors },
        { status: 500 }
      )
    }

    return NextResponse.json({ zones: normalized }, { status: 200 })
  } catch (error) {
    console.error('Error in delivery-zones PUT:', error)
    return NextResponse.json({ error: 'Failed to update delivery zones' }, { status: 500 })
  }
}
