// Shared cache-tag helper for the order photos/attachments lazy-load
// endpoints (/api/orders/[id]/photos and /api/branch/orders/[id]/photos).
//
// Both routes read the exact same underlying data (order_delivery's
// productPhotos/invoicePhoto + orders.csAttachments) for a given order id,
// so they intentionally share ONE tag per order. Any write path that
// touches those fields — from either the CS or branch side — must call
// `revalidateTag(orderPhotosTag(orderId))` right after a successful update
// so the next "عرض المرفقات" view (on either surface) reads fresh data.
export function orderPhotosTag(orderId: string): string {
  return `order-photos-${orderId}`
}
