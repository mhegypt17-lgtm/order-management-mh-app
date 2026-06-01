import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// Edit a specific address belonging to a customer.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; addrId: string } },
) {
  try {
    const body = await req.json().catch(() => ({} as any))

    const { data: existing, error: lookupErr } = await supabase
      .from('customer_addresses')
      .select('id, "customerId"')
      .eq('id', params.addrId)
      .maybeSingle()
    if (lookupErr) {
      console.error('Address lookup error:', lookupErr)
      return NextResponse.json({ error: 'تعذر تحميل العنوان' }, { status: 500 })
    }
    if (!existing || (existing as any).customerId !== params.id) {
      return NextResponse.json({ error: 'العنوان غير موجود' }, { status: 404 })
    }

    const updates: Record<string, any> = {}
    if (typeof body.addressLabel === 'string') updates.addressLabel = body.addressLabel.trim() || 'Home'
    if (typeof body.area === 'string') updates.area = body.area.trim()
    if (typeof body.subArea === 'string') updates.subArea = body.subArea.trim()
    if (typeof body.streetAddress === 'string') updates.streetAddress = body.streetAddress.trim()
    if (typeof body.googleMapsLink === 'string') updates.googleMapsLink = body.googleMapsLink.trim()

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'لا توجد حقول للتحديث' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('customer_addresses')
      .update(updates)
      .eq('id', params.addrId)
      .select()
      .single()

    if (error) {
      console.error('Address update error:', error)
      return NextResponse.json(
        { error: 'تعذر تحديث العنوان', details: error.message },
        { status: 500 },
      )
    }

    return NextResponse.json({ address: data })
  } catch (err) {
    console.error('PATCH address error:', err)
    return NextResponse.json({ error: 'تعذر تحديث العنوان' }, { status: 500 })
  }
}

// Delete an address. Blocked if any order still references it, to preserve
// historical order data.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; addrId: string } },
) {
  try {
    const { data: existing, error: lookupErr } = await supabase
      .from('customer_addresses')
      .select('id, "customerId"')
      .eq('id', params.addrId)
      .maybeSingle()
    if (lookupErr) {
      console.error('Address lookup error:', lookupErr)
      return NextResponse.json({ error: 'تعذر تحميل العنوان' }, { status: 500 })
    }
    if (!existing || (existing as any).customerId !== params.id) {
      return NextResponse.json({ error: 'العنوان غير موجود' }, { status: 404 })
    }

    // Refuse delete if any order points to this address.
    const { count, error: countErr } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('deliveryAddressId', params.addrId)
    if (countErr) {
      console.error('Orders-for-address count error:', countErr)
      return NextResponse.json({ error: 'تعذر التحقق من الطلبات' }, { status: 500 })
    }
    if ((count || 0) > 0) {
      return NextResponse.json(
        { error: `لا يمكن حذف العنوان — مرتبط بـ ${count} طلب` },
        { status: 409 },
      )
    }

    const { error } = await supabase
      .from('customer_addresses')
      .delete()
      .eq('id', params.addrId)
    if (error) {
      console.error('Address delete error:', error)
      return NextResponse.json(
        { error: 'تعذر حذف العنوان', details: error.message },
        { status: 500 },
      )
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('DELETE address error:', err)
    return NextResponse.json({ error: 'تعذر حذف العنوان' }, { status: 500 })
  }
}
