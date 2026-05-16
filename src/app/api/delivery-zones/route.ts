import { NextResponse } from 'next/server'
import { DeliveryZoneRecord, readDeliveryZones, writeDeliveryZones } from '@/lib/omsData'

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

    const existing = await readDeliveryZones()
    const existingByZone = new Map(existing.map((z) => [z.zone, z]))
    const now = new Date().toISOString()

    const normalized: DeliveryZoneRecord[] = (incoming
      .map((z: any): DeliveryZoneRecord | null => {
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
      .filter((z: DeliveryZoneRecord | null): z is DeliveryZoneRecord => z !== null) as DeliveryZoneRecord[])
      .sort((a, b) => a.zone - b.zone)

    if (normalized.length === 0) {
      return NextResponse.json({ error: 'Invalid zones payload' }, { status: 400 })
    }

    await writeDeliveryZones(normalized)
    return NextResponse.json({ zones: normalized }, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Failed to update delivery zones' }, { status: 500 })
  }
}
