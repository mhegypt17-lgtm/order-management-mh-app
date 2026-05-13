import { NextRequest, NextResponse } from 'next/server'
import {
  generateId,
  normalizePhone,
  readAddresses,
  readCustomers,
  writeCustomers,
} from '@/lib/omsData'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const rawPhone = searchParams.get('phone') || ''
    const phone = normalizePhone(rawPhone)
    const name = (searchParams.get('name') || '').trim().toLowerCase()

    if (!phone && !name) {
      return NextResponse.json({ customer: null, addresses: [] }, { status: 200 })
    }

    const customers = readCustomers()
    const addresses = readAddresses()

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

// Create a new customer (CS / admin). Wallet defaults to 0 if omitted.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const phone = normalizePhone(String(body.phone || ''))
    const customerName = String(body.customerName || '').trim()
    const wallet = Number(body.wallet) || 0

    if (!phone) return NextResponse.json({ error: 'phone مطلوب' }, { status: 400 })
    if (!customerName) return NextResponse.json({ error: 'اسم العميل مطلوب' }, { status: 400 })

    const customers = readCustomers()
    const exists = customers.find((c) => normalizePhone(c.phone) === phone)
    if (exists) {
      return NextResponse.json({ error: 'يوجد عميل بنفس رقم الهاتف' }, { status: 409 })
    }

    const now = new Date().toISOString()
    const customer = {
      id: generateId('CUST'),
      phone,
      customerName,
      wallet,
      createdAt: now,
      updatedAt: now,
    }
    customers.push(customer)
    writeCustomers(customers)

    return NextResponse.json({ customer }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'تعذر إنشاء العميل' }, { status: 500 })
  }
}
