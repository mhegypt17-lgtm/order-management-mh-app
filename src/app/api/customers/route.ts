import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import {
  generateId,
  normalizePhone,
  readAddresses,
  readCustomers,
  CUSTOMER_COLUMNS,
  ADDRESS_COLUMNS,
} from '@/lib/omsData'

// Prevent edge-caching of API responses (avoids stale 405s on POST).
export const dynamic = 'force-dynamic'
export const revalidate = 0

// Detect when the Supabase customers table has not yet been migrated to
// include the `wallet` column. PostgREST returns PGRST204 when its cached
// schema lacks the column; Postgres returns 42703 (undefined_column) when the
// table is queried directly. Either way, retry without wallet so the request
// doesn't fail outright.
function isWalletColumnMissing(err: any): boolean {
  if (!err) return false
  const code = String(err.code || '')
  const msg = String(err.message || '').toLowerCase()
  if (code === 'PGRST204' || code === '42703') return true
  return msg.includes('wallet') && (msg.includes('column') || msg.includes('schema cache'))
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const rawPhone = searchParams.get('phone') || ''
    const phone = normalizePhone(rawPhone)
    const name = (searchParams.get('name') || '').trim().toLowerCase()

    if (!phone && !name) {
      return NextResponse.json({ customer: null, addresses: [] }, { status: 200 })
    }

    // Scoped fetch — previously read the WHOLE customers + addresses tables
    // just to filter one row in JS. Now we push phone/name filters to the DB
    // via ILIKE and only apply the strict normalizePhone match on the small
    // candidate set. Behaviour is preserved because we still run the same
    // JS matching logic on the returned rows.
    let candidates: any[] = []
    if (phone) {
      const { data } = await supabase
        .from('customers')
        .select(CUSTOMER_COLUMNS)
        .ilike('phone', `%${phone}%`)
        .limit(50)
      candidates = (data as any[]) || []
    }
    if (candidates.length === 0 && name) {
      const { data } = await supabase
        .from('customers')
        .select(CUSTOMER_COLUMNS)
        .ilike('customerName', `%${name}%`)
        .limit(50)
      candidates = (data as any[]) || []
    }

    let customer: any = null

    if (phone) {
      // Keep exact phone lookup priority for existing callers.
      customer = candidates.find((c: any) => normalizePhone(c.phone) === phone) || null
    }

    if (!customer) {
      customer =
        candidates.find((c: any) => {
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

    // Scoped address lookup for the single matched customer.
    const { data: addrRows } = await supabase
      .from('customer_addresses')
      .select(ADDRESS_COLUMNS)
      .eq('customerId', customer.id)
    const customerAddresses = (addrRows as any[]) || []

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

// Create a new customer (used by the CRM "+ إضافة" modal).
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({} as any))

    const phone = normalizePhone(String(body?.phone || ''))
    const customerName = String(body?.customerName || '').trim()

    if (!phone) {
      return NextResponse.json({ error: 'رقم الهاتف مطلوب' }, { status: 400 })
    }
    if (!customerName) {
      return NextResponse.json({ error: 'اسم العميل مطلوب' }, { status: 400 })
    }

    // Scoped duplicate check — previously read the WHOLE customers table
    // just to spot a phone collision.
    const { data: dupCandidates } = await supabase
      .from('customers')
      .select('id, phone, customerName')
      .ilike('phone', `%${phone}%`)
      .limit(20)
    const duplicate = ((dupCandidates as any[]) || []).find(
      (c: any) => normalizePhone(c.phone) === phone,
    )
    if (duplicate) {
      return NextResponse.json(
        { error: 'عميل آخر بنفس رقم الهاتف موجود بالفعل', customer: duplicate },
        { status: 409 }
      )
    }

    const walletRaw = body?.wallet
    let wallet = 0
    if (walletRaw !== undefined && walletRaw !== null && walletRaw !== '') {
      const w = Number(walletRaw)
      if (!Number.isFinite(w)) {
        return NextResponse.json({ error: 'قيمة المحفظة غير صحيحة' }, { status: 400 })
      }
      wallet = w
    }

    const email = String(body?.email || '').trim()
    const notes = String(body?.notes || '').trim()

    const now = new Date().toISOString()
    const newCustomer = {
      id: generateId('cust'),
      phone,
      customerName,
      email,
      notes,
      wallet,
      createdAt: now,
      updatedAt: now,
    }

    let { data, error } = await supabase
      .from('customers')
      .insert([newCustomer])
      .select()
      .single()

    // Fallback: if the wallet column hasn't been migrated yet, retry without it
    // so customer creation still succeeds. The wallet field is best-effort here.
    let walletWarning: string | null = null
    if (error && isWalletColumnMissing(error)) {
      const { wallet: _ignored, ...rest } = newCustomer as any
      const retry = await supabase
        .from('customers')
        .insert([rest])
        .select()
        .single()
      data = retry.data as any
      error = retry.error as any
      walletWarning = 'تم إنشاء العميل بدون رصيد المحفظة — يلزم تشغيل ملف الترحيل data/customer-wallet-migration.sql'
    }

    if (error) {
      console.error('Error creating customer:', error)
      return NextResponse.json(
        { error: 'تعذر إنشاء العميل', details: error.message },
        { status: 500 }
      )
    }

    // Optionally create a default address if any address field was provided.
    const streetAddress = String(body?.streetAddress || '').trim()
    const addressLabel = String(body?.addressLabel || '').trim()
    const area = String(body?.area || '').trim()
    const subArea = String(body?.subArea || '').trim()
    const googleMapsLink = String(body?.googleMapsLink || '').trim()

    if (streetAddress || area || subArea || addressLabel) {
      const { error: addrError } = await supabase
        .from('customer_addresses')
        .insert([
          {
            id: generateId('addr'),
            customerId: newCustomer.id,
            addressLabel: addressLabel || 'Home',
            area,
            subArea,
            streetAddress,
            googleMapsLink,
            createdAt: now,
          },
        ])
      if (addrError) {
        console.error('Error creating default address:', addrError)
      }
    }

    return NextResponse.json(
      { customer: data || newCustomer, warning: walletWarning || undefined },
      { status: 201 }
    )
  } catch (err) {
    console.error('POST /api/customers error:', err)
    return NextResponse.json({ error: 'تعذر إنشاء العميل' }, { status: 500 })
  }
}
