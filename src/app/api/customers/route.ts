import { NextRequest, NextResponse } from 'next/server'
import {
  normalizePhone,
  readAddresses,
  readCustomers,
} from '@/lib/omsData'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const rawPhone = searchParams.get('phone') || ''
    const phone = normalizePhone(rawPhone)
    const name = (searchParams.get('name') || '').trim().toLowerCase()

    if (!phone && !name) {
      return NextResponse.json({ customer: null, addresses: [] }, { status: 200 })
    }

    const customers = await readCustomers()
    const addresses = await readAddresses()

    let customer = null

    if (phone) {
      // Keep exact phone lookup priority for existing callers.
      customer = customers.find((c) => normalizePhone(c.phone) === phone) || null
    }

    if (!customer) {
      customer =
        customers.find((c) => {
          const customerPhone = normalizePhone(c.phone)
          const customerName = (c.customerName || '').trim().toLowerCase()

          const matchesPhone = phone ? customerPhone.includes(phone) : true
          const matchesName = name ? customerName.includes(name) : true

          return matchesPhone && matchesName
        }) || null
    }

    if (!customer) {
      return NextResponse.json({ customer: null, addresses: [] }, { status: 200 })
    }

    const customerAddresses = addresses.filter((a) => a.customerId === customer.id)

    return NextResponse.json(
      {
        customer,
        addresses: customerAddresses,
      },
      { status: 200 }
    )
  } catch {
    return NextResponse.json({ error: 'Failed to lookup customer' }, { status: 500 })
  }
}
