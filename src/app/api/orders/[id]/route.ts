import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import {
  CustomerAddressRecord,
  OrderDeliveryRecord,
  OrderItemRecord,
  OrderRecord,
  appendEditHistory,
  evaluateDiscountCode,
  generateId,
  readAddresses,
  readCustomers,
  readOrderItems,
  readOrderDelivery,
  readOrders,
  readDeliveryZones,
  readOrderItemsByOrderIds,
  readOrderDeliveryByOrderIds,
  readProductsByIds,
  ORDER_COLUMNS,
  ORDER_COLUMNS_LIST,
  CUSTOMER_COLUMNS,
  ADDRESS_COLUMNS,
  ORDER_ITEM_COLUMNS,
  DELIVERY_COLUMNS_FULL,
  DELIVERY_COLUMNS_LIST,
  PRODUCT_COLUMNS,
} from '@/lib/omsData'

// Disable Next.js fetch caching — Supabase queries here must always
// return fresh data, otherwise a just-created order can 404 on its
// own edit page until the cache expires.
export const dynamic = 'force-dynamic'
export const revalidate = 0

type OrderUpdateItem = {
  productId: string
  productNameInput?: string
  quantity: number
  weightGrams: number
  unitPrice: number
  specialInstructions: string
}

function normalizeProductName(value: string) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function findMatchedProduct(products: any[], productNameInput?: string) {
  const normalizedInput = normalizeProductName(productNameInput || '')
  if (!normalizedInput) return null

  const exact = products.find((p: any) => normalizeProductName(p.productName || '') === normalizedInput)
  if (exact) return exact

  return (
    products.find((p: any) => {
      const normalizedProductName = normalizeProductName(p.productName || '')
      return normalizedProductName.includes(normalizedInput) || normalizedInput.includes(normalizedProductName)
    }) || null
  )
}

async function readProducts() {
  try {
    const { data: products, error } = await supabase
      .from('products')
      .select('*')
    
    if (error) return []
    return Array.isArray(products) ? products : []
  } catch {
    return []
  }
}

async function computeDeliveryFeeByArea(subtotal: number, area?: string, subArea?: string) {
  const { computeDeliveryFee } = await import('@/lib/omsData')
  return computeDeliveryFee(subtotal, area, subArea)
}

async function enrichOrder(order: OrderRecord, opts: { includePhotos: boolean } = { includePhotos: false }) {
  // Egress fix (mirrors /api/branch/orders/[id]::enrich). Previous version
  // read FIVE full tables (customers, addresses, order_items, order_delivery,
  // products) just to hydrate ONE order — every CS click paid ~1.5 MB of
  // egress for that. This version uses scoped queries keyed off THIS order's
  // ids only, with column allowlists so we never leak heavy fields.
  const orderId = order.id
  const customerId = (order as any).customerId as string | undefined
  const addressId = (order as any).deliveryAddressId as string | undefined

  const [customerRes, addressRes, itemRows, deliveryRows] = await Promise.all([
    customerId
      ? supabase.from('customers').select(CUSTOMER_COLUMNS).eq('id', customerId).maybeSingle()
      : Promise.resolve({ data: null, error: null } as any),
    addressId
      ? supabase.from('customer_addresses').select(ADDRESS_COLUMNS).eq('id', addressId).maybeSingle()
      : Promise.resolve({ data: null, error: null } as any),
    readOrderItemsByOrderIds([orderId], ORDER_ITEM_COLUMNS),
    readOrderDeliveryByOrderIds(
      [orderId],
      // Phase 2H — DELIVERY_COLUMNS_LIST omits productPhotos/invoicePhoto.
      opts.includePhotos ? DELIVERY_COLUMNS_FULL : DELIVERY_COLUMNS_LIST,
    ),
  ])

  const customer = (customerRes as any)?.data || null
  const address = (addressRes as any)?.data || null

  // Products — only those actually referenced by this order's items, with a
  // slim column list.
  const productIds = (itemRows as OrderItemRecord[])
    .map((i) => i.productId)
    .filter((v): v is string => Boolean(v))
  const productRows = await readProductsByIds(productIds, PRODUCT_COLUMNS)
  const productsById = new Map<string, any>()
  for (const p of productRows as any[]) productsById.set(p.id, p)

  const items = (itemRows as OrderItemRecord[]).map((item) => {
    const product = productsById.get(item.productId)
    return {
      ...item,
      productName: product?.productName || 'منتج محذوف',
    }
  })

  let fullDelivery = (deliveryRows as OrderDeliveryRecord[])[0]
  if (!fullDelivery) {
    fullDelivery = {
      id: '',
      orderId: order.id,
      deliveryStatus: 'لم يخرج بعد',
      branchComments: '',
      productPhotos: [],
      invoicePhoto: '',
      deliveredAt: null,
      updatedBy: '',
      updatedAt: order.updatedAt,
    }
  }

  // Phase 2H — same lazy-load pattern as /api/branch/orders/[id]:
  // strip productPhotos/invoicePhoto/csAttachments by default and expose
  // counts so the UI can show "N صور محفوظة — اضغط للعرض" without paying
  // egress for photos the user never asks to see. Client re-fetches the
  // bytes from /api/orders/[id]/photos on demand.
  let productPhotosCount = 0
  let hasInvoicePhoto = false
  let hasCsAttachments = false
  let csAttachmentsCount = 0

  if (opts.includePhotos) {
    productPhotosCount = Array.isArray((fullDelivery as any).productPhotos)
      ? (fullDelivery as any).productPhotos.length
      : 0
    hasInvoicePhoto = Boolean((fullDelivery as any).invoicePhoto)
    hasCsAttachments =
      Array.isArray((order as any).csAttachments) && (order as any).csAttachments.length > 0
    csAttachmentsCount = Array.isArray((order as any).csAttachments)
      ? (order as any).csAttachments.length
      : 0
  } else {
    // Cheap size-only lookups so the UI can render the "N صور محفوظة" pill
    // without downloading the base64 blobs.
    try {
      const { data: metaDelivery } = await supabase
        .from('order_delivery')
        .select('productPhotos, invoicePhoto')
        .eq('orderId', orderId)
        .maybeSingle()
      if (metaDelivery) {
        productPhotosCount = Array.isArray((metaDelivery as any).productPhotos)
          ? (metaDelivery as any).productPhotos.length
          : 0
        hasInvoicePhoto = Boolean((metaDelivery as any).invoicePhoto)
      }
    } catch {}
    try {
      const { data: metaOrder } = await supabase
        .from('orders')
        .select('csAttachments')
        .eq('id', orderId)
        .maybeSingle()
      if (metaOrder) {
        const arr = (metaOrder as any).csAttachments
        hasCsAttachments = Array.isArray(arr) && arr.length > 0
        csAttachmentsCount = Array.isArray(arr) ? arr.length : 0
      }
    } catch {}
  }

  let delivery: any = fullDelivery
  let orderOut: any = { ...order }
  if (!opts.includePhotos) {
    delivery = { ...fullDelivery, productPhotos: [], invoicePhoto: '' }
    delete orderOut.csAttachments
  }

  return {
    ...orderOut,
    customer,
    address,
    items,
    delivery,
    productPhotosCount,
    hasInvoicePhoto,
    hasCsAttachments,
    csAttachmentsCount,
    photosLoaded: opts.includePhotos,
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const url = new URL(request.url)
    const includePhotos = url.searchParams.get('includePhotos') === '1'

    // Scoped order fetch — used to `readOrders()` (full table scan) and then
    // `.find(id)` in memory. Now a single indexed lookup. Photo columns are
    // excluded by default via ORDER_COLUMNS_LIST (they're re-fetched on
    // demand by the /photos endpoint), and we gracefully fall back if a
    // deployment predates the csAttachments column.
    const baseOrderCols = includePhotos ? ORDER_COLUMNS : ORDER_COLUMNS_LIST
    const runOrder = (cols: string) =>
      supabase.from('orders').select(cols).eq('id', params.id).maybeSingle()

    let orderRes = await runOrder(baseOrderCols)
    if (
      orderRes.error &&
      /csAttachments|column .* does not exist/i.test(String(orderRes.error.message || ''))
    ) {
      const fallbackCols = baseOrderCols
        .split(',')
        .filter((c) => c.trim() !== 'csAttachments')
        .join(',')
      orderRes = await runOrder(fallbackCols)
    }
    if (orderRes.error || !orderRes.data) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }
    const order = orderRes.data as unknown as OrderRecord

    return NextResponse.json(
      { order: await enrichOrder(order, { includePhotos }) },
      { status: 200 },
    )
  } catch {
    return NextResponse.json({ error: 'Failed to fetch order' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const now = new Date().toISOString()

    // Egress fix — previously read entire orders + order_items + addresses
    // tables just to find one row. Now we do one indexed order lookup and
    // one scoped items fetch. Addresses are pulled lazily below only when
    // we actually need them (dedupe / edit path).
    const runExisting = (cols: string) =>
      supabase.from('orders').select(cols).eq('id', params.id).maybeSingle()
    let existingRes = await runExisting(ORDER_COLUMNS)
    if (
      existingRes.error &&
      /csAttachments|column .* does not exist/i.test(String(existingRes.error.message || ''))
    ) {
      const fb = ORDER_COLUMNS
        .split(',')
        .filter((c) => c.trim() !== 'csAttachments')
        .join(',')
      existingRes = await runExisting(fb)
    }
    if (existingRes.error || !existingRes.data) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }
    const existing = existingRes.data as unknown as OrderRecord
    const orderItems = (await readOrderItemsByOrderIds(
      [params.id],
      ORDER_ITEM_COLUMNS,
    )) as OrderItemRecord[]

    // 🔒 Lock edits once branch starts delivery (unless admin)
    const requesterRole = String(body.role || new URL(request.url).searchParams.get('role') || '').toLowerCase()
    if (requesterRole !== 'admin') {
      const { data: currentDelivery } = await supabase
        .from('order_delivery')
        .select('deliveryStatus')
        .eq('orderId', params.id)
        .maybeSingle()
      const lockingStatuses = ['في الطريق', 'تم التوصيل']
      if (currentDelivery && lockingStatuses.includes((currentDelivery as any).deliveryStatus)) {
        // Exception: CS may still add/edit attachments (proof of payment,
        // post-delivery receipts, etc.) on a locked order. The client sends
        // `attachmentsOnly: true` to opt into this narrow patch; nothing
        // else on the order is touched.
        if (body.attachmentsOnly === true) {
          const incomingAttachments = Array.isArray(body.csAttachments) ? body.csAttachments : []
          const attUpd = await supabase
            .from('orders')
            .update({ csAttachments: incomingAttachments, updatedAt: now })
            .eq('id', params.id)
          if (attUpd.error) {
            const msg = (attUpd.error.message || '').toLowerCase()
            if (attUpd.error.code === '42703' || msg.includes('csattachments')) {
              return NextResponse.json(
                {
                  error:
                    'تعذّر حفظ المرفقات — العمود csAttachments غير موجود في قاعدة البيانات. شغّل data/cs-attachments-migration.sql',
                },
                { status: 500 },
              )
            }
            console.error('[orders PUT attachmentsOnly] update failed:', attUpd.error)
            return NextResponse.json(
              { error: 'فشل حفظ المرفقات', details: attUpd.error.message || null },
              { status: 500 },
            )
          }
          await appendEditHistory({
            entityType: 'order',
            entityId: params.id,
            orderId: params.id,
            action: 'updated',
            changedBy: body.createdBy || 'unknown',
            summary: 'تم تحديث مرفقات خدمة العملاء (الطلب مقفل بعد التوصيل)',
            details: { attachmentCount: incomingAttachments.length, lockedStatus: (currentDelivery as any).deliveryStatus },
          })
          const refreshed = { ...existing, csAttachments: incomingAttachments, updatedAt: now } as OrderRecord
          return NextResponse.json(
            { order: await enrichOrder(refreshed), warning: null },
            { status: 200 },
          )
        }
        return NextResponse.json(
          {
            error: 'الطلب مقفل — الفرع بدأ التوصيل ولا يمكن التعديل',
            deliveryStatus: (currentDelivery as any).deliveryStatus,
            locked: true,
          },
          { status: 423 }
        )
      }
    }

    let deliveryAddress: CustomerAddressRecord | undefined

    if (body.deliveryAddressId && body.deliveryAddressId !== '__new') {
      // Scoped address lookup by id — replaces `addresses.find(a => a.id === …)`
      // over the full table.
      const { data: addr } = await supabase
        .from('customer_addresses')
        .select(ADDRESS_COLUMNS)
        .eq('id', body.deliveryAddressId)
        .maybeSingle()
      deliveryAddress = (addr as unknown as CustomerAddressRecord) || undefined
    }

    // Dedupe by (customerId, addressLabel) — never create a second "Home" for the same customer.
    if (!deliveryAddress && body.streetAddress) {
      const customerId = existing.customerId
      const incomingLabel = (body.addressLabel || 'Home').toString().trim()
      const normalizedLabel = incomingLabel.toLowerCase()
      // Scoped fetch — only this customer's addresses (typically 1–3 rows).
      const { data: customerAddresses } = await supabase
        .from('customer_addresses')
        .select(ADDRESS_COLUMNS)
        .eq('customerId', customerId)
      const sameLabel = ((customerAddresses as any[]) || []).find(
        (a: any) =>
          String(a.addressLabel || '').trim().toLowerCase() === normalizedLabel
      )
      if (sameLabel) {
        deliveryAddress = sameLabel as CustomerAddressRecord
      }
    }

    if (!deliveryAddress && body.streetAddress) {
      deliveryAddress = {
        id: generateId('addr'),
        customerId: existing.customerId,
        addressLabel: body.addressLabel || 'Home',
        area: body.deliveryArea || '',
        subArea: body.deliverySubArea || '',
        streetAddress: body.streetAddress,
        googleMapsLink: body.googleMapsLink || '',
        createdAt: now,
      }
      // Insert new address into Supabase
      await supabase.from('customer_addresses').insert([deliveryAddress])
    } else if (deliveryAddress) {
      const updatedLabel = (body.addressLabel || deliveryAddress.addressLabel || 'Home').toString().trim()
      const updatedArea = body.deliveryArea || deliveryAddress.area || ''
      const updatedSubArea =
        body.deliverySubArea !== undefined
          ? String(body.deliverySubArea || '')
          : deliveryAddress.subArea || ''
      const updatedStreet =
        body.streetAddress !== undefined && body.streetAddress !== ''
          ? String(body.streetAddress)
          : deliveryAddress.streetAddress
      const updatedMaps =
        body.googleMapsLink !== undefined
          ? String(body.googleMapsLink || '')
          : deliveryAddress.googleMapsLink || ''
      deliveryAddress.addressLabel = updatedLabel
      deliveryAddress.area = updatedArea
      deliveryAddress.subArea = updatedSubArea
      deliveryAddress.streetAddress = updatedStreet
      deliveryAddress.googleMapsLink = updatedMaps
      await supabase
        .from('customer_addresses')
        .update({
          addressLabel: updatedLabel,
          area: updatedArea,
          subArea: updatedSubArea,
          streetAddress: updatedStreet,
          googleMapsLink: updatedMaps,
        })
        .eq('id', deliveryAddress.id)
    }

    const products = await readProducts()
    const items: OrderUpdateItem[] = Array.isArray(body.items) ? body.items : []
    const normalizedItems = items
      .map((i) => {
        const matchedProduct = findMatchedProduct(products, i.productNameInput)
        return {
          ...i,
          productId: i.productId || (matchedProduct ? matchedProduct.id : ''),
        }
      })
      .filter((i) => i.productId && Number(i.quantity) > 0)
      .map((i) => {
        const quantity = Number(i.quantity) || 1
        const unitPrice = Number(i.unitPrice) || 0
        const weightGrams = Number(i.weightGrams) || 0
        return {
          ...i,
          quantity,
          unitPrice,
          weightGrams,
          lineTotal: quantity * unitPrice,
        }
      })

    const subtotal = normalizedItems.reduce((sum, i) => sum + i.lineTotal, 0)
    const deliveryFee = await computeDeliveryFeeByArea(
      subtotal,
      body.deliveryArea || deliveryAddress?.area,
      body.deliverySubArea || deliveryAddress?.subArea
    )
    const orderTotal = subtotal + deliveryFee

    // `existing` was already fetched via a scoped `.eq('id', params.id)` at
    // the top of the handler — no need to re-index into a whole-table array.

    // Re-evaluate the discount against the new gross total. The client sends
    // `discountCode` only when CS explicitly applies/removes a voucher; when
    // the field is omitted we preserve whatever was previously saved (so a
    // partial PUT for branch comments/status doesn't accidentally wipe the
    // voucher). `discountCode: null` explicitly clears the voucher.
    let nextDiscountCode: string | null = existing.discountCode ?? null
    let nextDiscountAmount = Number(existing.discountAmount) || 0
    if (Object.prototype.hasOwnProperty.call(body, 'discountCode')) {
      if (body.discountCode) {
        const evald = await evaluateDiscountCode(String(body.discountCode), orderTotal)
        if (evald.ok && evald.code) {
          nextDiscountCode = evald.code.code
          nextDiscountAmount = Math.min(Number(evald.discount) || 0, orderTotal)
        } else {
          nextDiscountCode = null
          nextDiscountAmount = 0
        }
      } else {
        nextDiscountCode = null
        nextDiscountAmount = 0
      }
    } else if (nextDiscountCode) {
      // Voucher was unchanged by the client but the basket may have shifted.
      // Re-validate it against the new gross to keep the saved amount honest.
      const evald = await evaluateDiscountCode(nextDiscountCode, orderTotal)
      if (evald.ok) {
        nextDiscountAmount = Math.min(Number(evald.discount) || 0, orderTotal)
      } else {
        nextDiscountAmount = Math.min(nextDiscountAmount, orderTotal)
      }
    }
    const afterVoucher = Math.max(0, orderTotal - nextDiscountAmount)

    // Wallet-credit handling on edit. We treat the incoming walletUsed as
    // a *target* and reconcile against (a) what was previously debited on
    // this same order and (b) the customer's current balance. The customer's
    // wallet is then credited/debited by the delta (new - previous) below.
    const previousWalletUsed = Math.max(0, Number((existing as any).walletUsed) || 0)
    let nextWalletUsed = previousWalletUsed
    if (Object.prototype.hasOwnProperty.call(body, 'walletUsed')) {
      const requested = Math.max(0, Number(body.walletUsed) || 0)
      const { data: walletRow } = await supabase
        .from('customers')
        .select('wallet')
        .eq('id', existing.customerId)
        .maybeSingle()
      const currentBalance = Math.max(0, Number(walletRow?.wallet) || 0)
      // Customer can spend at most (currentBalance + previousWalletUsed),
      // because the previousWalletUsed amount has already been debited.
      const cap = Math.min(currentBalance + previousWalletUsed, afterVoucher)
      nextWalletUsed = Math.max(0, Math.min(requested, cap))
    } else {
      // Client didn't send walletUsed at all (partial PUT). Keep whatever
      // was saved, but clamp it to the new owed amount so we never debit
      // more than the customer actually has to pay.
      nextWalletUsed = Math.min(previousWalletUsed, afterVoucher)
    }
    const nextNetTotal = Math.max(0, afterVoucher - nextWalletUsed)

    const changedFields: string[] = []
    if (existing.orderStatus !== body.orderStatus) changedFields.push('orderStatus')
    if (existing.paymentMethod !== body.paymentMethod) changedFields.push('paymentMethod')
    if (existing.orderMethod !== body.orderMethod) changedFields.push('orderMethod')
    if (existing.orderReceiver !== body.orderReceiver) changedFields.push('orderReceiver')
    if (existing.customerSource !== body.customerSource) changedFields.push('customerSource')
    if ((existing.notes || '') !== (body.notes || '')) changedFields.push('notes')

    const remainingItems = orderItems.filter((i) => i.orderId !== params.id)
    // Existing items for this order, used to preserve branch-amend snapshots
    // (originalQuantity / originalWeightGrams) across a CS save. We match
    // surviving lines by productId since CS regenerates item ids on save.
    const existingForOrder = orderItems.filter((i) => i.orderId === params.id)
    const rewrittenItems: OrderItemRecord[] = normalizedItems.map((i) => {
      const prior = existingForOrder.find((p) => p.productId === i.productId)
      return {
        id: generateId('item'),
        orderId: params.id,
        productId: i.productId,
        quantity: i.quantity,
        weightGrams: i.weightGrams,
        unitPrice: i.unitPrice,
        lineTotal: i.lineTotal,
        specialInstructions: i.specialInstructions || '',
        createdAt: now,
        // Preserve branch's "original CS value" snapshot if branch had
        // amended this line before — otherwise stay null.
        originalQuantity: prior?.originalQuantity ?? null,
        originalWeightGrams: prior?.originalWeightGrams ?? null,
      }
    })

    // Update order in Supabase
    const updatedOrder = {
      ...existing,
      orderDate: body.orderDate,
      orderTime: body.orderTime,
      orderType: body.orderType,
      orderReceiver: body.orderReceiver,
      orderMethod: body.orderMethod,
      customerType: body.customerType,
      customerSource: body.customerSource,
      orderStatus: body.orderStatus,
      cancellationReason: body.orderStatus === 'لاغي' ? body.cancellationReason || null : null,
      paymentMethod: body.paymentMethod,
      deliveryAddressId: deliveryAddress?.id || existing.deliveryAddressId,
      notes: body.notes || '',
      followUp: Boolean(body.followUp),
      followUpNotes: body.followUpNotes || '',
      isScheduled: body.orderStatus === 'حجز' || Boolean(body.isScheduled),
      scheduledDate: body.orderStatus === 'حجز' ? (body.scheduledDate || null) : null,
      scheduledTimeSlot: body.orderStatus === 'حجز' ? (body.scheduledTimeSlot || null) : null,
      scheduledSpecificTime: body.orderStatus === 'حجز' ? (body.scheduledSpecificTime || null) : null,
      subtotal,
      deliveryFee,
      orderTotal,
      discountCode: nextDiscountCode,
      discountAmount: nextDiscountAmount,
      netTotal: nextNetTotal,
      walletUsed: nextWalletUsed,
      csAttachments: Array.isArray(body.csAttachments)
        ? body.csAttachments
        : (existing as any).csAttachments || [],
      updatedAt: now,
    }
    const updRes = await supabase.from('orders').update(updatedOrder).eq('id', params.id)

    // ─── Migration-fallback chain ──────────────────────────────────────
    // If a column referenced in `updatedOrder` doesn't exist yet on this
    // Supabase instance, Postgres returns error code 42703 with a message
    // that names the missing column. We isolate each fallback to its own
    // column set (looking at the actual column name in the message rather
    // than the loose "column does not exist" string) so we don't ever
    // strip an unrelated field. After every retry we capture the NEW
    // error — not the original — so the next fallback only fires when
    // there really is more work to do.
    let lastError = updRes.error
    const stripped = { scheduled: false, discount: false, csAttachments: false, walletUsed: false }

    const errorMentions = (err: any, ...names: string[]) => {
      if (!err) return false
      if (err.code === '42703') return true // undefined_column — always retry
      const msg = (err.message || '').toLowerCase()
      return names.some((n) => msg.includes(n.toLowerCase()))
    }

    if (lastError && errorMentions(lastError, 'isScheduled', 'scheduledDate', 'scheduledTimeSlot', 'scheduledSpecificTime')) {
      console.warn('[orders PUT] scheduled columns missing, retrying without them')
      const { isScheduled: _i, scheduledDate: _d, scheduledTimeSlot: _s, scheduledSpecificTime: _t, ...safe } = updatedOrder as any
      const retry = await supabase.from('orders').update(safe).eq('id', params.id)
      lastError = retry.error
      stripped.scheduled = true
    }
    if (lastError && errorMentions(lastError, 'discountCode', 'discountAmount', 'netTotal')) {
      console.warn('[orders PUT] discount columns missing, retrying without them')
      const { discountCode: _dc, discountAmount: _da, netTotal: _nt, ...safe } = updatedOrder as any
      const retry = await supabase.from('orders').update(safe).eq('id', params.id)
      lastError = retry.error
      stripped.discount = true
    }
    if (lastError && errorMentions(lastError, 'csAttachments')) {
      // csAttachments column hasn't been added yet — retry without it.
      // The order will save but the uploaded photos are LOST. We capture
      // a warning so the response can tell the client to run
      // data/cs-attachments-migration.sql; the client surfaces a toast
      // so the operator never thinks the photos were persisted.
      console.warn('[orders PUT] csAttachments column missing in DB, retrying without it')
      const { csAttachments: _ca, ...safe } = updatedOrder as any
      const retry = await supabase.from('orders').update(safe).eq('id', params.id)
      lastError = retry.error
      stripped.csAttachments = (updatedOrder as any).csAttachments && (updatedOrder as any).csAttachments.length > 0
    }
    if (lastError && errorMentions(lastError, 'walletUsed')) {
      // walletUsed column hasn't been added yet — retry without it. Wallet
      // won't be debited/refunded in this branch; the client warning tells
      // the operator to run data/wallet-used-migration.sql.
      console.warn('[orders PUT] walletUsed column missing in DB, retrying without it')
      const { walletUsed: _wu, ...safe } = updatedOrder as any
      const retry = await supabase.from('orders').update(safe).eq('id', params.id)
      lastError = retry.error
      stripped.walletUsed = nextWalletUsed > 0 || previousWalletUsed > 0
    }
    if (lastError) {
      console.error('[orders PUT] update failed after fallbacks:', lastError)
      return NextResponse.json(
        { error: 'Failed to update order', details: lastError.message || null },
        { status: 500 },
      )
    }

    // Replace order items: delete old, insert new
    await supabase.from('order_items').delete().eq('orderId', params.id)
    if (rewrittenItems.length > 0) {
      await supabase.from('order_items').insert(rewrittenItems)
    }

    // Reconcile the customer's wallet by the delta (new - previous). If
    // CS bumped walletUsed from 50 to 80 we debit 30 more; if they dropped
    // it from 80 to 50 we refund 30. We skip this entirely when the column
    // was stripped (migration not run) so we don't refund money the order
    // never actually claimed.
    if (!stripped.walletUsed && nextWalletUsed !== previousWalletUsed) {
      const delta = nextWalletUsed - previousWalletUsed
      const { data: walletRow } = await supabase
        .from('customers')
        .select('wallet')
        .eq('id', existing.customerId)
        .maybeSingle()
      const current = Math.max(0, Number(walletRow?.wallet) || 0)
      const next = Math.max(0, current - delta)
      const { error: walletErr } = await supabase
        .from('customers')
        .update({ wallet: next, updatedAt: now })
        .eq('id', existing.customerId)
      if (walletErr) {
        console.error('[orders PUT] failed to reconcile customer wallet:', walletErr)
      }
    }

    await appendEditHistory({
      entityType: 'order',
      entityId: params.id,
      orderId: params.id,
      action: 'updated',
      changedBy: body.createdBy || 'unknown',
      summary: `تم تعديل الطلب ${updatedOrder.appOrderNo}`,
      details: {
        changedFields,
        itemCount: rewrittenItems.length,
        orderTotal,
      },
    })

    return NextResponse.json(
      {
        order: await enrichOrder(updatedOrder as OrderRecord),
        warning: stripped.walletUsed
          ? 'تم حفظ الطلب لكن لم يُخصم الرصيد — العمود walletUsed غير موجود في قاعدة البيانات. شغّل data/wallet-used-migration.sql'
          : stripped.csAttachments
            ? 'تم حفظ الطلب بدون مرفقات خدمة العملاء — العمود csAttachments غير موجود في قاعدة البيانات. شغّل data/cs-attachments-migration.sql'
            : null,
      },
      { status: 200 },
    )
  } catch {
    return NextResponse.json({ error: 'Failed to update order' }, { status: 500 })
  }
}

// Delete an order (CS or admin). Cascade-removes related items, delivery,
// and any edit-history rows tied to the order. Returns 404 if not found.
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const url = new URL(request.url)
    const role = String(url.searchParams.get('role') || '').toLowerCase()
    const deletedBy = String(url.searchParams.get('by') || 'unknown')

    const allowed = role === 'admin' || role === 'cs'
    if (!allowed) {
      return NextResponse.json(
        { error: 'صلاحية غير كافية لحذف الطلب' },
        { status: 403 }
      )
    }

    // Confirm the order exists first so we can return a clean 404.
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('id, "appOrderNo"')
      .eq('id', params.id)
      .maybeSingle()

    if (fetchError) {
      console.error('DELETE /orders: fetch failed', fetchError)
      return NextResponse.json({ error: 'Failed to delete order' }, { status: 500 })
    }
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Cascade-delete dependents first (best-effort; errors are logged but not fatal
    // so the order row itself still gets removed even if a child table is empty).
    await supabase.from('order_items').delete().eq('orderId', params.id)
    await supabase.from('order_delivery').delete().eq('orderId', params.id)
    // Edit-history table name may differ; ignore failures gracefully.
    try {
      await supabase.from('order_edit_history').delete().eq('orderId', params.id)
    } catch (err) {
      console.warn('order_edit_history cleanup skipped:', err)
    }

    const { error: deleteError } = await supabase
      .from('orders')
      .delete()
      .eq('id', params.id)

    if (deleteError) {
      console.error('DELETE /orders: delete failed', deleteError)
      return NextResponse.json({ error: 'Failed to delete order' }, { status: 500 })
    }

    // Best-effort audit entry (do not fail the delete if history write errors).
    try {
      await appendEditHistory({
        entityType: 'order',
        entityId: params.id,
        orderId: params.id,
        action: 'deleted',
        changedBy: deletedBy,
        summary: `تم حذف الطلب ${(order as any).appOrderNo || params.id}`,
        details: { role },
      })
    } catch (err) {
      console.warn('appendEditHistory after delete failed:', err)
    }

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (err) {
    console.error('DELETE /orders unexpected:', err)
    return NextResponse.json({ error: 'Failed to delete order' }, { status: 500 })
  }
}
