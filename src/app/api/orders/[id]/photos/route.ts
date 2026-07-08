import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// Phase 2H — On-demand photo fetch for a single order (CS side).
//
// Mirrors /api/branch/orders/[id]/photos. The main CS order endpoint
// (/api/orders/[id]) no longer returns productPhotos / invoicePhoto /
// csAttachments by default; the OrderForm calls THIS route only when the
// user clicks "عرض الصور" / "عرض المرفقات". Turns a permanent multi-MB
// per-open cost into an opt-in cost paid once per view.
//
// Response shape:
// {
//   productPhotos: string[]      // base64 data URLs, may be empty
//   invoicePhoto:  string        // base64 data URL, empty string if none
//   csAttachments: any[]         // { id, name, dataUrl, ... } records
// }
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const orderId = params.id

    const [deliveryRes, orderRes] = await Promise.all([
      supabase
        .from('order_delivery')
        .select('productPhotos, invoicePhoto')
        .eq('orderId', orderId)
        .maybeSingle(),
      supabase
        .from('orders')
        .select('csAttachments')
        .eq('id', orderId)
        .maybeSingle(),
    ])

    if (deliveryRes.error) {
      console.error('[orders/photos] delivery read failed:', deliveryRes.error)
    }

    const productPhotos = Array.isArray(deliveryRes.data?.productPhotos)
      ? deliveryRes.data.productPhotos
      : []
    const invoicePhoto = (deliveryRes.data?.invoicePhoto as string) || ''

    let csAttachments: any[] = []
    if (
      orderRes.error &&
      /csAttachments|column .* does not exist/i.test(String(orderRes.error.message || ''))
    ) {
      csAttachments = []
    } else if (orderRes.data && Array.isArray((orderRes.data as any).csAttachments)) {
      csAttachments = (orderRes.data as any).csAttachments
    }

    return NextResponse.json(
      { productPhotos, invoicePhoto, csAttachments },
      { status: 200 },
    )
  } catch (e) {
    console.error('[orders/photos] failed:', e)
    return NextResponse.json({ error: 'Failed to fetch photos' }, { status: 500 })
  }
}
