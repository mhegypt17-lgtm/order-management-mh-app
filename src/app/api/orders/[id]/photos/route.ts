import { NextRequest, NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { supabase } from '@/lib/supabase'
import { orderPhotosTag } from '@/lib/photosCache'

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
//
// 2026-08-09 — this was the ONE order-related route missing the
// force-dynamic/no-cache directive every sibling route has. Without it, a
// just-saved attachment could be served stale from Next's cache on the very
// next "عرض المرفقات" fetch; the OrderForm then trusted that stale (missing)
// list as authoritative and re-saved it, permanently wiping the attachment
// that had actually persisted fine. Fixed by forcing this route fully
// dynamic/no-store.
//
// 2026-08-14 — that blanket no-store made EVERY "عرض المرفقات" click re-pull
// the full base64 photo/attachment payload from Supabase with zero caching,
// which is exactly the multi-MB cost this whole lazy-load design (Phase 2H)
// was built to avoid paying repeatedly. This landed same-day as a real
// egress spike. Fix: cache the read indefinitely, keyed per order, and
// explicitly bust that one order's cache entry (`revalidateTag`) from every
// write path that can touch these fields (orders/[id] PUT — both the normal
// and attachmentsOnly branches — and branch/orders/[id] PUT). This keeps
// the exact same freshness guarantee (a fresh save always invalidates before
// the next read) while letting repeat views of an untouched order be served
// from cache instead of re-hitting Supabase every time.
//
// 2026-08-16 — removed a leftover SECOND, untagged unstable_cache layer that
// used to wrap this read (keyed only ['order-photos'] + orderId, cached
// forever, no tag). revalidateTag() only ever busted the outer wrapper below
// — the inner one never got the memo, so a save's invalidation silently did
// nothing and every view kept serving whatever was cached the FIRST time
// that order's photos were ever fetched. Now there's exactly one cache
// layer, and it's the one revalidateTag actually targets.
export const dynamic = 'force-dynamic'

async function fetchPhotosData(orderId: string) {
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

  return { productPhotos, invoicePhoto, csAttachments }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const orderId = params.id
    const cached = unstable_cache(() => fetchPhotosData(orderId), ['order-photos', orderId], {
      tags: [orderPhotosTag(orderId)],
      revalidate: false,
    })
    const data = await cached()
    return NextResponse.json(data, { status: 200 })
  } catch (e) {
    console.error('[orders/photos] failed:', e)
    return NextResponse.json({ error: 'Failed to fetch photos' }, { status: 500 })
  }
}
