import { NextRequest, NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { supabase } from '@/lib/supabase'
import { orderPhotosTag } from '@/lib/photosCache'

// Phase 2H — On-demand photo fetch for a single order.
//
// The main branch order endpoint (/api/branch/orders/[id]) no longer returns
// productPhotos / invoicePhoto / csAttachments by default. The client renders
// counts (e.g. "3 صور محفوظة") and only calls THIS route when the user clicks
// the "عرض الصور" button. This turns a permanent ~4 MB per-open cost into an
// opt-in cost paid once per view.
//
// Response shape:
// {
//   productPhotos: string[]      // base64 data URLs, may be empty
//   invoicePhoto:  string        // base64 data URL, empty string if none
//   csAttachments: any[]         // { name, dataUrl, ... } records, may be empty
// }
//
// Errors return 404 { error } if the order doesn't exist; other failures
// return 500. Missing optional csAttachments column is tolerated.
//
// See the CS-side twin at /api/orders/[id]/photos for the full incident
// writeup (2026-08-09 stale-cache/lost-attachment bug, 2026-08-14 egress
// regression from the blanket no-store fix) — this route mirrors that same
// tag-based cache + explicit revalidateTag-on-save pattern, sharing the same
// `order-photos-${orderId}` tag so a save from either surface invalidates
// both.
//
// 2026-08-16 — removed a leftover SECOND, untagged unstable_cache layer that
// used to wrap this read (keyed only ['branch-order-photos'] + orderId,
// cached forever, no tag). revalidateTag() only ever busted the outer
// wrapper below — the inner one never got the memo, so this route kept
// serving whatever was cached the FIRST time an order's photos were ever
// fetched (often an empty result, before any photos existed) and never
// picked up real photos/attachments added later. That's the "branch can't
// view it" bug. Now there's exactly one cache layer, and it's the one
// revalidateTag actually targets.
export const dynamic = 'force-dynamic'

async function fetchPhotosData(orderId: string) {
  // Photos live on order_delivery; csAttachments lives on orders. Fire both
  // in parallel — each returns only the photo columns so total payload is
  // exactly the bytes the user asked for.
  const [deliveryRes, orderRes] = await Promise.all([
    supabase
      .from('order_delivery')
      .select('productPhotos, invoicePhoto')
      .eq('orderId', orderId)
      .maybeSingle(),
    // Order row may not have csAttachments column in older deployments.
    supabase
      .from('orders')
      .select('csAttachments')
      .eq('id', orderId)
      .maybeSingle(),
  ])

  if (deliveryRes.error) {
    console.error('[branch/orders/photos] delivery read failed:', deliveryRes.error)
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

  return { productPhotos, invoicePhoto, csAttachments }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const orderId = params.id
    const cached = unstable_cache(() => fetchPhotosData(orderId), ['branch-order-photos', orderId], {
      tags: [orderPhotosTag(orderId)],
      revalidate: false,
    })
    const data = await cached()

    return NextResponse.json(
      data,
      { status: 200 },
    )
  } catch (e) {
    console.error('[branch/orders/photos] failed:', e)
    return NextResponse.json({ error: 'Failed to fetch photos' }, { status: 500 })
  }
}
