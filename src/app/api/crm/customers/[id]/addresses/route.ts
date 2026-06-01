import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { generateId } from '@/lib/omsData'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// Create a new address for an existing customer.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json().catch(() => ({} as any))

    const addressLabel = String(body?.addressLabel ?? '').trim() || 'Home'
    const area = String(body?.area ?? '').trim()
    const subArea = String(body?.subArea ?? '').trim()
    const streetAddress = String(body?.streetAddress ?? '').trim()
    const googleMapsLink = String(body?.googleMapsLink ?? '').trim()

    if (!streetAddress && !area && !subArea) {
      return NextResponse.json(
        { error: 'أدخل المنطقة أو العنوان التفصيلي على الأقل' },
        { status: 400 },
      )
    }

    // Make sure the parent customer exists.
    const { data: customer, error: custErr } = await supabase
      .from('customers')
      .select('id')
      .eq('id', params.id)
      .maybeSingle()
    if (custErr) {
      console.error('Customer lookup error:', custErr)
      return NextResponse.json({ error: 'تعذر التحقق من العميل' }, { status: 500 })
    }
    if (!customer) {
      return NextResponse.json({ error: 'العميل غير موجود' }, { status: 404 })
    }

    const newAddress = {
      id: generateId('addr'),
      customerId: params.id,
      addressLabel,
      area,
      subArea,
      streetAddress,
      googleMapsLink,
      createdAt: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('customer_addresses')
      .insert([newAddress])
      .select()
      .single()

    if (error) {
      console.error('Address insert error:', error)
      return NextResponse.json(
        { error: 'تعذر إنشاء العنوان', details: error.message },
        { status: 500 },
      )
    }

    return NextResponse.json({ address: data || newAddress }, { status: 201 })
  } catch (err) {
    console.error('POST /api/crm/customers/[id]/addresses error:', err)
    return NextResponse.json({ error: 'تعذر إنشاء العنوان' }, { status: 500 })
  }
}
