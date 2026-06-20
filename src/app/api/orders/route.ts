import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import {
  CustomerAddressRecord,
  OrderItemRecord,
  OrderRecord,
  appendEditHistory,
  evaluateDiscountCode,
  generateAppOrderNo,
  normalizePhone,
  readAddresses,
  readCustomers,
  readOrderItems,
  readOrderDelivery,
  readOrders,
  readDeliveryZones,
} from '@/lib/omsData'

function generateTextId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

type OrderInputItem = {
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
    const { data, error } = await supabase.from('products').select('*')
    if (error) return []
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

async function computeDeliveryFeeByArea(subtotal: number, area?: string, subArea?: string) {
  // Delegates to the shared helper in omsData so every route stays in sync.
  const { computeDeliveryFee } = await import('@/lib/omsData')
  return computeDeliveryFee(subtotal, area, subArea)
}

async function enrichOrder(
  order: OrderRecord,
  ctx: {
    customersById: Map<string, any>
    addressesById: Map<string, any>
    itemsByOrderId: Map<string, OrderItemRecord[]>
    deliveryByOrderId: Map<string, any>
    productsById: Map<string, any>
  },
) {
  const customer = ctx.customersById.get(order.customerId) || null
  const address = ctx.addressesById.get(order.deliveryAddressId) || null
  const items = (ctx.itemsByOrderId.get(order.id) || []).map((item) => {
    const product = ctx.productsById.get(item.productId)
    return {
      ...item,
      productName: product?.productName || 'منتج محذوف',
    }
  })

  const delivery =
    ctx.deliveryByOrderId.get(order.id) ||
    {
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

  return {
    ...order,
    customer,
    address,
    items,
    delivery,
  }
}

// Default to a 90-day rolling window unless caller specifies from/to/all.
// This keeps the per-request payload bounded as the orders table grows.
const DEFAULT_WINDOW_DAYS = 90

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const all = url.searchParams.get('all') === '1'
    const from = url.searchParams.get('from') // YYYY-MM-DD (orderDate)
    const to = url.searchParams.get('to') // YYYY-MM-DD (orderDate)

    let query = supabase
      .from('orders')
      .select('*')
      .order('createdAt', { ascending: false })

    if (!all) {
      if (from) query = query.gte('orderDate', from)
      else {
        // Default rolling window — orderDate >= today − 90 days (UTC ok; granularity is days)
        const cutoff = new Date(Date.now() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10)
        query = query.gte('orderDate', cutoff)
      }
      if (to) query = query.lte('orderDate', to)
    }

    const { data: orders, error } = await query

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 })
    }

    const orderList = (orders || []) as OrderRecord[]

    // Hoist enrichment lookups OUT of the per-order loop. Previously
    // enrichOrder ran 5 full-table reads PER ORDER (N×5 redundant reads).
    // Load each lookup table once, index by id, then enrich in-memory.
    const [customers, addresses, orderItems, orderDelivery, products] = await Promise.all([
      readCustomers(),
      readAddresses(),
      readOrderItems(),
      readOrderDelivery(),
      readProducts(),
    ])

    const customersById = new Map<string, any>()
    for (const c of customers) customersById.set(c.id, c)

    const addressesById = new Map<string, any>()
    for (const a of addresses) addressesById.set(a.id, a)

    const itemsByOrderId = new Map<string, OrderItemRecord[]>()
    for (const it of orderItems) {
      const arr = itemsByOrderId.get(it.orderId)
      if (arr) arr.push(it)
      else itemsByOrderId.set(it.orderId, [it])
    }

    const deliveryByOrderId = new Map<string, any>()
    for (const d of orderDelivery) deliveryByOrderId.set(d.orderId, d)

    const productsById = new Map<string, any>()
    for (const p of products) productsById.set(p.id, p)

    const ctx = { customersById, addressesById, itemsByOrderId, deliveryByOrderId, productsById }
    const enriched = await Promise.all(orderList.map((o) => enrichOrder(o, ctx)))

    return NextResponse.json({ orders: enriched }, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const now = new Date().toISOString()

    // 1. Find or create customer (select-then-insert to preserve stable FK id)
    const normalizedPhone = normalizePhone(body.phone)
    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('*')
      .eq('phone', normalizedPhone)
      .maybeSingle()

    let customerId: string
    if (existingCustomer) {
      customerId = existingCustomer.id
      // Update name in case it changed
      await supabase
        .from('customers')
        .update({ customerName: body.customerName, updatedAt: now })
        .eq('id', customerId)
    } else {
      customerId = generateTextId('cust')
      const { error: customerError } = await supabase
        .from('customers')
        .insert({
          id: customerId,
          phone: normalizedPhone,
          customerName: body.customerName,
          createdAt: now,
          updatedAt: now,
        })
      if (customerError) {
        console.error('Error inserting customer:', customerError)
      }
    }

    // 2. Resolve address: reuse if customer already has same label, else insert new.
    const incomingAddressId = String(body.deliveryAddressId || '').trim()
    const incomingLabel = (body.addressLabel || 'Home').toString().trim()
    const normalizedLabel = incomingLabel.toLowerCase()

    let addressId: string
    let resolvedArea = body.deliveryArea || ''
    let resolvedSubArea = body.deliverySubArea || ''

    // Fetch existing addresses for this customer.
    const { data: existingAddrs } = await supabase
      .from('customer_addresses')
      .select('*')
      .eq('customerId', customerId)

    const matchById =
      incomingAddressId && incomingAddressId !== '__new'
        ? (existingAddrs || []).find((a: any) => a.id === incomingAddressId)
        : null
    const matchByLabel = (existingAddrs || []).find(
      (a: any) => String(a.addressLabel || '').trim().toLowerCase() === normalizedLabel
    )
    const existingAddr = matchById || matchByLabel || null

    if (existingAddr) {
      addressId = existingAddr.id
      // Refresh the address fields so latest user input wins.
      const updatePayload: any = {
        addressLabel: incomingLabel,
        area: resolvedArea,
        subArea: resolvedSubArea,
        streetAddress: body.streetAddress,
        googleMapsLink: body.googleMapsLink || '',
      }
      const { error: addrUpdateError } = await supabase
        .from('customer_addresses')
        .update(updatePayload)
        .eq('id', addressId)
      if (addrUpdateError) {
        console.error('Error updating address:', addrUpdateError)
      }
    } else {
      addressId = generateTextId('addr')
      const deliveryAddress: CustomerAddressRecord = {
        id: addressId,
        customerId: customerId,
        addressLabel: incomingLabel,
        area: resolvedArea,
        subArea: resolvedSubArea,
        streetAddress: body.streetAddress,
        googleMapsLink: body.googleMapsLink || '',
        createdAt: now,
      }
      const { error: addressError } = await supabase
        .from('customer_addresses')
        .insert([deliveryAddress])
      if (addressError) {
        console.error('Error inserting address:', addressError)
      }
    }

    // Get products and normalize items
    const products = await readProducts()
    const items: OrderInputItem[] = Array.isArray(body.items) ? body.items : []
    const normalizedItems = items
      .map((i) => {
        const matchedProduct = findMatchedProduct(products, i.productNameInput)
        return {
          ...i,
          productId: i.productId || matchedProduct?.id || '',
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
      resolvedArea,
      resolvedSubArea
    )
    const orderTotal = subtotal + deliveryFee

    // Server-side re-validation of the discount code so the client can't
    // forge a discount amount. If the code is missing or invalid we just
    // store no discount (netTotal = orderTotal).
    let discountCode: string | null = null
    let discountAmount = 0
    if (body.discountCode) {
      const evald = await evaluateDiscountCode(String(body.discountCode), orderTotal)
      if (evald.ok && evald.code) {
        discountCode = evald.code.code
        discountAmount = Math.min(Number(evald.discount) || 0, orderTotal)
      }
    }
    const afterVoucher = Math.max(0, orderTotal - discountAmount)

    // Wallet-credit re-validation: cap to (a) the customer's available
    // wallet and (b) the amount still owed after the voucher, so we never
    // produce a negative net total or debit more than the customer has.
    // The customer's wallet is debited below, only after the order row is
    // successfully inserted.
    let walletUsed = 0
    if (Number(body.walletUsed) > 0) {
      const { data: walletRow } = await supabase
        .from('customers')
        .select('id, wallet')
        .eq('id', customerId)
        .maybeSingle()
      const available = Math.max(0, Number(walletRow?.wallet) || 0)
      walletUsed = Math.max(0, Math.min(Number(body.walletUsed), available, afterVoucher))
    }
    const netTotal = Math.max(0, afterVoucher - walletUsed)

    // Get existing orders for that same date+type only (cheap & accurate)
    const dateKey = (() => {
      try {
        const [y, m, d] = body.orderDate.split('-')
        return `${d}${m}${y.slice(-2)}`
      } catch { return '' }
    })()
    const typeSlug = String(body.orderType || '').toLowerCase()
    const { data: sameBucket = [] } = await supabase
      .from('orders')
      .select('appOrderNo')
      .ilike('appOrderNo', `${dateKey}${typeSlug}%`)

    // Pick suffix = max(existing trailing digits) + 1 to survive deletions/gaps
    const usedSuffixes = (sameBucket as { appOrderNo: string }[])
      .map((r) => {
        const m = (r.appOrderNo || '').match(/(\d+)$/)
        return m ? parseInt(m[1], 10) : 0
      })
      .filter((n) => Number.isFinite(n))
    let suffix = (usedSuffixes.length ? Math.max(...usedSuffixes) : 0) + 1
    let appOrderNo = `${dateKey}${typeSlug}${suffix}`

    // 3. Insert order
    const orderId = generateTextId('ord')
    const order: OrderRecord = {
      id: orderId,
      appOrderNo,
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
      customerId: customerId,
      deliveryAddressId: addressId,
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
      discountCode,
      discountAmount,
      netTotal,
      walletUsed,
      csAttachments: Array.isArray(body.csAttachments) ? body.csAttachments : [],
      createdBy: body.createdBy || 'unknown',
      createdAt: now,
      updatedAt: now,
    }

    const { data: createdOrder, error: orderError } = await supabase
      .from('orders')
      .insert([order])
      .select()
      .single()

    let finalOrder = createdOrder
    let finalError = orderError

    // Retry-on-unique-violation: bump suffix until a free appOrderNo is found.
    let attempts = 0
    while (
      finalError &&
      /unique constraint|duplicate key|orders_apporderno/i.test(finalError.message || '') &&
      attempts < 10
    ) {
      attempts++
      suffix++
      appOrderNo = `${dateKey}${typeSlug}${suffix}`
      order.appOrderNo = appOrderNo
      const retry = await supabase.from('orders').insert([order]).select().single()
      finalOrder = retry.data
      finalError = retry.error
    }

    // ─── Migration-fallback chain ──────────────────────────────────────
    // Each fallback is keyed off the actual column name in the Postgres
    // error message (code 42703 = undefined_column) so we never strip an
    // unrelated field. Track `csAttachmentsStripped` so the response can
    // tell the client "your photos were lost — run the migration".
    let csAttachmentsStripped = false
    const errorMentions = (err: any, ...names: string[]) => {
      if (!err) return false
      if (err.code === '42703') return true
      const msg = (err.message || '').toLowerCase()
      return names.some((n) => msg.includes(n.toLowerCase()))
    }

    // Fallback: DB may not yet have the scheduled columns from the new migration.
    if (finalError && errorMentions(finalError, 'isScheduled', 'scheduledDate', 'scheduledTimeSlot', 'scheduledSpecificTime')) {
      console.warn('[orders POST] scheduled columns missing in DB, retrying without them')
      const {
        isScheduled: _i,
        scheduledDate: _d,
        scheduledTimeSlot: _s,
        scheduledSpecificTime: _t,
        ...orderSafe
      } = order
      const retry = await supabase.from('orders').insert([orderSafe]).select().single()
      finalOrder = retry.data
      finalError = retry.error
    }

    // Fallback: DB may not yet have the discount columns from the new migration.
    if (finalError && errorMentions(finalError, 'discountCode', 'discountAmount', 'netTotal')) {
      console.warn('[orders POST] discount columns missing in DB, retrying without them')
      const {
        discountCode: _dc,
        discountAmount: _da,
        netTotal: _nt,
        ...orderSafe
      } = order
      const retry = await supabase.from('orders').insert([orderSafe]).select().single()
      finalOrder = retry.data
      finalError = retry.error
    }

    // Fallback: DB may not yet have the csAttachments column.
    if (finalError && errorMentions(finalError, 'csAttachments')) {
      console.warn('[orders POST] csAttachments column missing in DB, retrying without it')
      const { csAttachments: _ca, ...orderSafe } = order as any
      const retry = await supabase.from('orders').insert([orderSafe]).select().single()
      finalOrder = retry.data
      finalError = retry.error
      csAttachmentsStripped = Array.isArray((order as any).csAttachments) && (order as any).csAttachments.length > 0
    }

    // Fallback: DB may not yet have the walletUsed column. We can still
    // persist the order — wallet just won't be debited (and the operator
    // gets a warning so they know to run the migration).
    let walletUsedStripped = false
    if (finalError && errorMentions(finalError, 'walletUsed')) {
      console.warn('[orders POST] walletUsed column missing in DB, retrying without it')
      const { walletUsed: _wu, ...orderSafe } = order as any
      const retry = await supabase.from('orders').insert([orderSafe]).select().single()
      finalOrder = retry.data
      finalError = retry.error
      walletUsedStripped = walletUsed > 0
    }

    if (finalError || !finalOrder) {
      console.error('Error inserting order:', finalError)
      return NextResponse.json(
        { error: 'Failed to create order', details: finalError?.message || null },
        { status: 500 }
      )
    }

    // 4. Insert order items
    const newItems: OrderItemRecord[] = normalizedItems.map((i) => ({
      id: generateTextId('item'),
      orderId: orderId,
      productId: i.productId,
      quantity: i.quantity,
      weightGrams: i.weightGrams,
      unitPrice: i.unitPrice,
      lineTotal: i.lineTotal,
      specialInstructions: i.specialInstructions || '',
      createdAt: now,
    }))

    if (newItems.length > 0) {
      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(newItems)

      if (itemsError) {
        console.error('Error inserting order items:', itemsError)
      }
    }

    // 5. Insert delivery record
    const { error: deliveryError } = await supabase
      .from('order_delivery')
      .insert([{
        id: generateTextId('del'),
        orderId: orderId,
        deliveryStatus: 'لم يخرج بعد',
        branchComments: '',
        productPhotos: [],
        invoicePhoto: '',
        deliveredAt: null,
        updatedBy: '',
        updatedAt: now,
      }])

    if (deliveryError) {
      console.error('Error inserting delivery:', deliveryError)
    }

    // Debit the customer's wallet by the amount actually applied. Only
    // touch the column when (a) we actually used some credit and (b) the
    // walletUsed column made it onto the row — otherwise we'd hand the
    // customer credit for an order that was never debited.
    if (walletUsed > 0 && !walletUsedStripped) {
      const { data: walletRow } = await supabase
        .from('customers')
        .select('wallet')
        .eq('id', customerId)
        .maybeSingle()
      const current = Math.max(0, Number(walletRow?.wallet) || 0)
      const next = Math.max(0, current - walletUsed)
      const { error: walletErr } = await supabase
        .from('customers')
        .update({ wallet: next, updatedAt: now })
        .eq('id', customerId)
      if (walletErr) {
        console.error('[orders POST] failed to debit customer wallet:', walletErr)
      }
    }

    // Log edit history
    await appendEditHistory({
      entityType: 'order',
      entityId: orderId,
      orderId: orderId,
      action: 'created',
      changedBy: body.createdBy || 'unknown',
      summary: `تم إنشاء الطلب ${appOrderNo}`,
      details: {
        orderNo: appOrderNo,
        orderTotal,
        itemCount: newItems.length,
      },
    })

    // Return enriched order — build a one-shot context for this single row.
    const [allCustomers, allAddresses, allOrderItems, allDelivery, allProducts] = await Promise.all([
      readCustomers(),
      readAddresses(),
      readOrderItems(),
      readOrderDelivery(),
      readProducts(),
    ])
    const customersById = new Map<string, any>(allCustomers.map((c) => [c.id, c]))
    const addressesById = new Map<string, any>(allAddresses.map((a) => [a.id, a]))
    const itemsByOrderId = new Map<string, OrderItemRecord[]>()
    for (const it of allOrderItems) {
      const arr = itemsByOrderId.get(it.orderId)
      if (arr) arr.push(it)
      else itemsByOrderId.set(it.orderId, [it])
    }
    const deliveryByOrderId = new Map<string, any>(allDelivery.map((d) => [d.orderId, d]))
    const productsById = new Map<string, any>(allProducts.map((p: any) => [p.id, p]))
    const enrichedOrder = await enrichOrder(finalOrder || order, {
      customersById,
      addressesById,
      itemsByOrderId,
      deliveryByOrderId,
      productsById,
    })
    return NextResponse.json(
      {
        order: enrichedOrder,
        warning: walletUsedStripped
          ? 'تم حفظ الطلب لكن لم يُخصم الرصيد — العمود walletUsed غير موجود في قاعدة البيانات. شغّل data/wallet-used-migration.sql'
          : csAttachmentsStripped
            ? 'تم حفظ الطلب بدون مرفقات خدمة العملاء — العمود csAttachments غير موجود في قاعدة البيانات. شغّل data/cs-attachments-migration.sql'
            : null,
      },
      { status: 201 },
    )
  } catch (error) {
    console.error('Error creating order:', error)
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 })
  }
}
