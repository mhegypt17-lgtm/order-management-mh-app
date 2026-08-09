// Read-only diagnostic: inspect a single order's line-item pricing vs the
// product's CURRENT catalogue price, to explain "order shows an old/wrong
// unit price" reports. Prints raw rows — no writes, ever.
//
// Usage (PowerShell):
//   $env:NEXT_PUBLIC_SUPABASE_URL="https://xxxx.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY="eyJ..."
//   node scripts/diagnose-order-pricing.mjs 060826app1
//
// Or pass an order id directly with --id:
//   node scripts/diagnose-order-pricing.mjs --id ord_...

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.')
  process.exit(1)
}
const supabase = createClient(url, key)

const args = process.argv.slice(2)
const idFlagIdx = args.indexOf('--id')
const byId = idFlagIdx >= 0 ? args[idFlagIdx + 1] : null
const appOrderNo = byId ? null : args[0]

if (!byId && !appOrderNo) {
  console.error('Usage: node scripts/diagnose-order-pricing.mjs <appOrderNo>  OR  --id <orderId>')
  process.exit(1)
}

async function main() {
  let order
  if (byId) {
    const { data, error } = await supabase.from('orders').select('*').eq('id', byId).maybeSingle()
    if (error) throw error
    order = data
  } else {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('appOrderNo', appOrderNo)
      .maybeSingle()
    if (error) throw error
    order = data
  }
  if (!order) {
    console.error('Order not found.')
    process.exit(1)
  }

  console.log('\n=== ORDER ===')
  console.log({
    id: order.id,
    appOrderNo: order.appOrderNo,
    orderDate: order.orderDate,
    orderType: order.orderType,
    orderStatus: order.orderStatus,
    isScheduled: order.isScheduled,
    scheduledDate: order.scheduledDate,
    subtotal: order.subtotal,
    deliveryFee: order.deliveryFee,
    discountAmount: order.discountAmount,
    walletUsed: order.walletUsed,
    orderTotal: order.orderTotal,
    netTotal: order.netTotal,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  })

  const { data: items, error: itemsErr } = await supabase
    .from('order_items')
    .select('*')
    .eq('orderId', order.id)
  if (itemsErr) throw itemsErr

  console.log(`\n=== ORDER ITEMS (${items.length}) ===`)
  const productIds = [...new Set(items.map((i) => i.productId))]
  const { data: products } = await supabase.from('products').select('*').in('id', productIds)
  const productById = new Map((products || []).map((p) => [p.id, p]))

  const { data: priceRows } = await supabase
    .from('product_prices')
    .select('*')
    .in('productId', productIds)
    .then((r) => r)
    .catch(() => ({ data: [] }))

  const { data: catalogues } = await supabase
    .from('order_settings')
    .select('*')
    .eq('key', 'catalogues')
    .maybeSingle()
    .then((r) => r)
    .catch(() => ({ data: null }))

  for (const it of items) {
    const p = productById.get(it.productId)
    console.log('\n--- line item', it.id, '---')
    console.log({
      productId: it.productId,
      productName: p?.productName,
      quantity: it.quantity,
      weightGrams: it.weightGrams,
      unitPrice: it.unitPrice,
      lineTotal: it.lineTotal,
      basePriceSnapshot: it.basePriceSnapshot,
      offerPriceSnapshot: it.offerPriceSnapshot,
      originalQuantity: it.originalQuantity,
      originalWeightGrams: it.originalWeightGrams,
    })
    if (p) {
      console.log('CURRENT product catalogue (online/basePrice+offerPrice columns):', {
        basePrice: p.basePrice,
        offerPrice: p.offerPrice,
        pricingMode: p.pricingMode,
        weightGrams: p.weightGrams,
        isActive: p.isActive,
        updatedAt: p.updatedAt,
      })
    } else {
      console.log('!! Product not found (deleted?) for productId', it.productId)
    }
    const rowsForProduct = (priceRows || []).filter((r) => r.productId === it.productId)
    if (rowsForProduct.length) {
      console.log('product_prices rows (non-online catalogues):', rowsForProduct)
    }
  }

  console.log('\n=== order_settings.catalogues (if configured) ===')
  console.log(catalogues?.value || '(none — using DEFAULT_CATALOGUES fallback)')
}

main().catch((e) => {
  console.error('FAILED:', e)
  process.exit(1)
})
