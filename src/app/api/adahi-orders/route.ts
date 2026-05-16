import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import {
  AdahiOrderItemRecord,
  AdahiOrderRecord,
  generateId,
  normalizePhone,
  readAdahiOrders,
} from '@/lib/omsData'

type AdahiOrderInputItem = {
  productName: string
  quantity: number
  unitPrice: number
}

function normalizeItems(items: AdahiOrderInputItem[]): AdahiOrderItemRecord[] {
  return items
    .map((item) => {
      const quantity = Number(item.quantity) || 0
      const unitPrice = Number(item.unitPrice) || 0
      return {
        id: generateId('adahi_item'),
        productName: String(item.productName || '').trim(),
        quantity,
        unitPrice,
        lineTotal: quantity * unitPrice,
      }
    })
    .filter((item) => item.productName && item.quantity > 0 && item.unitPrice >= 0)
}

export async function GET() {
  try {
    const orders = (await readAdahiOrders()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    return NextResponse.json({ orders }, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch adahi orders' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const now = new Date().toISOString()

    const phone = normalizePhone(body.phone || '')
    const customerName = String(body.customerName || '').trim()
    const streetAddress = String(body.streetAddress || '').trim()
    const deliveryArea = String(body.deliveryArea || '').trim()

    if (!phone) return NextResponse.json({ error: 'Phone is required' }, { status: 400 })
    if (!customerName) return NextResponse.json({ error: 'Customer name is required' }, { status: 400 })
    if (!streetAddress) return NextResponse.json({ error: 'Street address is required' }, { status: 400 })
    if (!deliveryArea) return NextResponse.json({ error: 'Delivery area is required' }, { status: 400 })

    const inputItems: AdahiOrderInputItem[] = Array.isArray(body.items) ? body.items : []
    const items = normalizeItems(inputItems)
    if (items.length === 0) {
      return NextResponse.json({ error: 'At least one valid adahi item is required' }, { status: 400 })
    }

    const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0)
    const paidAmount = Math.max(0, Number(body.paidAmount) || 0)
    const remainingAmount = Math.max(0, subtotal - paidAmount)
    const collectionPercent = subtotal > 0 ? Math.min(100, Math.round((paidAmount / subtotal) * 100)) : 0

    // 1. Find or create customer
    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('id')
      .eq('phone', phone)
      .maybeSingle()

    let customerId: string
    if (existingCustomer) {
      customerId = existingCustomer.id
      await supabase
        .from('customers')
        .update({ customerName, updatedAt: now })
        .eq('id', customerId)
    } else {
      customerId = generateId('cust')
      await supabase.from('customers').insert({
        id: customerId,
        phone,
        customerName,
        createdAt: now,
        updatedAt: now,
      })
    }

    // 2. Find or create address
    let addressId: string
    let addressLabel: string

    if (body.deliveryAddressId && body.deliveryAddressId !== '__new') {
      const { data: existingAddr } = await supabase
        .from('customer_addresses')
        .select('id, addressLabel')
        .eq('id', body.deliveryAddressId)
        .maybeSingle()

      if (existingAddr) {
        addressId = existingAddr.id
        addressLabel = String(body.addressLabel || existingAddr.addressLabel || 'Home').trim() || 'Home'
        await supabase
          .from('customer_addresses')
          .update({
            addressLabel,
            area: deliveryArea,
            streetAddress,
            googleMapsLink: String(body.googleMapsLink || '').trim(),
          })
          .eq('id', addressId)
      } else {
        addressId = generateId('addr')
        addressLabel = String(body.addressLabel || 'Home').trim() || 'Home'
        await supabase.from('customer_addresses').insert({
          id: addressId,
          customerId,
          addressLabel,
          area: deliveryArea,
          streetAddress,
          googleMapsLink: String(body.googleMapsLink || '').trim(),
          createdAt: now,
        })
      }
    } else {
      addressId = generateId('addr')
      addressLabel = String(body.addressLabel || 'Home').trim() || 'Home'
      await supabase.from('customer_addresses').insert({
        id: addressId,
        customerId,
        addressLabel,
        area: deliveryArea,
        streetAddress,
        googleMapsLink: String(body.googleMapsLink || '').trim(),
        createdAt: now,
      })
    }

    // 3. Insert adahi order
    const order: AdahiOrderRecord = {
      id: generateId('adahi'),
      seasonLabel: String(body.seasonLabel || `${new Date().getFullYear()} موسم الأضاحي`),
      orderDate: String(body.orderDate || now.slice(0, 10)),
      orderTime: String(body.orderTime || now.slice(11, 16)),
      orderReceiver: body.orderReceiver,
      orderMethod: body.orderMethod,
      customerId,
      customerName,
      phone,
      deliveryAddressId: addressId,
      addressLabel,
      deliveryArea,
      streetAddress,
      googleMapsLink: String(body.googleMapsLink || '').trim(),
      items,
      subtotal,
      paidAmount,
      remainingAmount,
      collectionPercent,
      slaughterDay: body.slaughterDay === 'اليوم الثاني' ? 'اليوم الثاني' : 'اليوم الأول',
      cuttingDetails: String(body.cuttingDetails || '').trim(),
      cleanOffal: Boolean(body.cleanOffal),
      hasDelivery: Boolean(body.hasDelivery),
      willWitnessSacrifice: Boolean(body.willWitnessSacrifice),
      notes: String(body.notes || '').trim(),
      createdBy: String(body.createdBy || 'unknown'),
      createdAt: now,
      updatedAt: now,
    }

    const { error: insertError } = await supabase.from('adahi_orders').insert([order])
    if (insertError) {
      console.error('Error inserting adahi order:', insertError)
      return NextResponse.json({ error: 'Failed to create adahi order' }, { status: 500 })
    }

    return NextResponse.json({ order }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create adahi order' }, { status: 500 })
  }
}
