// Import historical orders from the Arabic Sheet1 CSV (no template re-shaping needed).
// Reads your file as-is, normalizes everything in code, and writes to Supabase
// across customers / customer_addresses / orders / order_items / order_delivery.
//
// EXISTING DATA IS NEVER ALTERED:
//   • Customers matched by phone are reused (no UPDATE).
//   • Addresses matched by (customerId, lower(addressLabel)) are reused (no UPDATE).
//   • Products matched by normalized productName are reused (no UPDATE).
//   • Only INSERTs happen, and only for rows the script believes are new.
//
// Usage (PowerShell):
//   $env:NEXT_PUBLIC_SUPABASE_URL="https://xxxx.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY="eyJ..."   # service-role key (RLS bypass)
//   node scripts/import-orders-history-arabic.mjs "C:\path\to\order items final v4 - Sheet1.csv" --dry-run
//   # review the report, then drop --dry-run to actually write:
//   node scripts/import-orders-history-arabic.mjs "C:\path\to\order items final v4 - Sheet1.csv"
//
// Flags:
//   --dry-run        do everything except DB inserts; print summary + first 5 unmatched products
//   --create-missing-products   if a productName doesn't match any existing product,
//                               create a stub product (isActive=false) so the line item still links.
//                               Without this flag, unmatched rows are skipped and reported.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

// ─── env / args ───────────────────────────────────────────────────────────────
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('❌  Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.')
  process.exit(1)
}
const supabase = createClient(url, key, { auth: { persistSession: false } })

const args = process.argv.slice(2)
const csvPath = args.find((a) => !a.startsWith('--'))
const DRY = args.includes('--dry-run')
const CREATE_MISSING = args.includes('--create-missing-products')
if (!csvPath) {
  console.error('Usage: node scripts/import-orders-history-arabic.mjs <csv> [--dry-run] [--create-missing-products]')
  process.exit(1)
}
const raw = readFileSync(path.resolve(csvPath), 'utf8').replace(/^\uFEFF/, '')

// ─── csv parser (quoted fields, commas/newlines safe) ────────────────────────
function parseCsv(text) {
  const rows = []
  let row = [], cur = '', inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++ }
      else if (c === '"') inQuotes = false
      else cur += c
    } else {
      if (c === '"') inQuotes = true
      else if (c === ',') { row.push(cur); cur = '' }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = '' }
      else if (c === '\r') { /* skip */ }
      else cur += c
    }
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row) }
  return rows.filter((r) => r.some((v) => String(v).trim() !== ''))
}

const matrix = parseCsv(raw)
const header = matrix.shift().map((h) => h.trim())
const col = (name) => header.indexOf(name)

// ─── helpers ─────────────────────────────────────────────────────────────────
const genId = (p) => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
const nowIso = () => new Date().toISOString()
const trim = (v) => String(v ?? '').trim()
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()
const num = (v) => {
  const n = Number(String(v ?? '').replace(/[, ]/g, ''))
  return Number.isFinite(n) ? n : 0
}

// DD/MM/YYYY  or  D/M/YYYY  →  YYYY-MM-DD
function normalizeDate(s) {
  const t = trim(s)
  if (!t) return ''
  // already ISO?
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10)
  const m = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/)
  if (!m) return ''
  const dd = m[1].padStart(2, '0')
  const mm = m[2].padStart(2, '0')
  let yy = m[3]
  if (yy.length === 2) yy = (Number(yy) >= 70 ? '19' : '20') + yy
  return `${yy}-${mm}-${dd}`
}

// "10:00:00"  →  "10:00"   (DB keeps HH:mm)
function normalizeTime(s) {
  const t = trim(s)
  if (!t) return ''
  const m = t.match(/^(\d{1,2}):(\d{2})/)
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : t
}

// kg → grams (accept "1", "0.5", "0,5"); if value already looks like grams (>50), keep it
function kgToGrams(v) {
  const n = num(v)
  if (n <= 0) return 0
  return n < 50 ? Math.round(n * 1000) : Math.round(n)
}

const ORDER_TYPES = new Set(['B2B', 'Online', 'Instashop', 'App'])
function normalizeOrderType(v) {
  const t = trim(v)
  if (ORDER_TYPES.has(t)) return t
  return 'Online' // default for historical
}

const METHOD_MAP = new Map([
  ['whatsapp', 'WhatsApp'], ['wa', 'WhatsApp'], ['watsapp', 'WhatsApp'],
  ['fb', 'FB'], ['facebook', 'FB'],
  ['call', 'Call'], ['phone', 'Call'],
  ['app', 'App'], ['b2b', 'B2B'], ['w.s', 'W.S'], ['ws', 'W.S'],
  ['ig', 'FB'], ['instagram', 'FB'], // your CSV has Instagram → fold into FB bucket
])
function normalizeMethod(v) {
  const t = trim(v)
  if (!t) return 'Call'
  return METHOD_MAP.get(t.toLowerCase()) || t
}

const CUSTOMER_TYPES = new Set(['جديد', 'قديم', 'عائد', 'استكمال', 'استرجاع', 'استبدال', 'تسويق', 'تعويض', 'فحص', 'تحصيل'])
function normalizeCustomerType(v) {
  const t = trim(v)
  return CUSTOMER_TYPES.has(t) ? t : 'قديم'
}

// formatDateDDMMYY equivalent (matches src/lib/omsData.ts)
function ddmmyy(iso) {
  const d = new Date(iso)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(-2)
  return `${dd}${mm}${yy}`
}

// ─── column map for the Arabic CSV ───────────────────────────────────────────
const C = {
  orderType:     col('نوع الطلب'),
  date:          col('التاريخ'),
  time:          col('الساعة'),
  receiver:      col('متلقي الطلب'),
  method:        col('طريقة الطلب'),
  phone:         col('رقم الهاتف'),
  customerName:  col('اسم العميل'),
  customerType:  col('نوع العميل'),
  customerSource:col('مصدر العميل'),
  addrDelivery:  col('عنوان التوصيل'),
  addressLabel:  col('تسمية العنوان'),
  area:          col('المنطقة'),
  subArea:       col('المنطقة الفرعية'),
  street:        col('العنوان'),
  maps:          col('رابط Google Maps'),
  productName:   col('المنتج'),
  price:         col('السعر'),
  promoPrice:    col('سعر البرومو'),
  qty:           col('الكمية'),
  weight:        col('الوزن'),
  unitPrice:     col('سعر الوحدة'),
  lineTotal:     col('الإجمالي'),
  specialInstr:  col('تعليمات خاصة'),
}
for (const [k, v] of Object.entries(C)) {
  if (v === -1) console.warn(`⚠️  CSV is missing column "${k}" — will use defaults.`)
}
if (C.phone === -1 || C.date === -1 || C.productName === -1) {
  console.error('❌  CSV must contain at least: رقم الهاتف, التاريخ, المنتج')
  process.exit(1)
}

// ─── load existing data from Supabase ────────────────────────────────────────
async function fetchAll(table, select = '*') {
  const all = []
  let from = 0, page = 1000
  while (true) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + page - 1)
    if (error) { console.error(`❌  fetch ${table}:`, error.message); process.exit(1) }
    if (!data?.length) break
    all.push(...data)
    if (data.length < page) break
    from += page
  }
  return all
}

console.log('🔎  Loading existing customers / addresses / products / orders ...')
const [existingCustomers, existingAddresses, existingProducts, existingOrders] = await Promise.all([
  fetchAll('customers', 'id, phone, customerName'),
  fetchAll('customer_addresses', 'id, customerId, addressLabel'),
  fetchAll('products', 'id, productName, unitPrice'),
  fetchAll('orders', 'id, appOrderNo, orderDate, orderType'),
])

const phoneToCust = new Map(existingCustomers.map((c) => [trim(c.phone), c]))
const addrKey = (cid, label) => `${cid}::${(label || 'Home').toLowerCase().trim()}`
const existingAddrSet = new Set(existingAddresses.map((a) => addrKey(a.customerId, a.addressLabel)))
const productByNorm = new Map(existingProducts.map((p) => [norm(p.productName), p]))

// ─── group rows by legacy order key (phone + date + time) ────────────────────
const groupOf = new Map() // key → { rows, head, items }
for (const row of matrix) {
  const phone = trim(row[C.phone])
  if (!phone) continue
  const date = normalizeDate(C.date >= 0 ? row[C.date] : '')
  const time = normalizeTime(C.time >= 0 ? row[C.time] : '')
  const key = `${phone}|${date}|${time}`
  if (!groupOf.has(key)) groupOf.set(key, { phone, date, time, rows: [] })
  groupOf.get(key).rows.push(row)
}

console.log(`📦  Grouped into ${groupOf.size} historical orders (from ${matrix.length} CSV lines).`)

// ─── prepare inserts ─────────────────────────────────────────────────────────
const customersToInsert = []
const addressesToInsert = []
const ordersToInsert    = []
const itemsToInsert     = []
const deliveriesToInsert= []
const productsToCreate  = []

const newPhoneToCid = new Map()         // dedupe new customers within this run
const newAddrKeys   = new Set()         // dedupe new addresses within this run
const newProdNorm   = new Map()         // dedupe new products within this run
const unmatchedProducts = new Map()     // norm → original name (for the report)

// Track historical appOrderNo allocations per (date,type) so we don't collide.
const appOrderCounter = new Map()
for (const o of existingOrders) {
  const k = `${ddmmyy(o.orderDate)}|${(o.orderType || '').toLowerCase()}`
  appOrderCounter.set(k, (appOrderCounter.get(k) || 0) + 1)
}
function nextAppOrderNo(orderDate, orderType) {
  const dateKey = ddmmyy(orderDate)
  const slug = orderType.toLowerCase()
  const k = `${dateKey}|${slug}`
  const n = (appOrderCounter.get(k) || 0) + 1
  appOrderCounter.set(k, n)
  return `${dateKey}${slug}${n}`
}

let skippedRowsNoProduct = 0
let skippedGroupsNoDate  = 0

for (const grp of groupOf.values()) {
  if (!grp.date) { skippedGroupsNoDate++; continue }

  const first = grp.rows[0]
  const phone = grp.phone
  const customerName = trim(C.customerName >= 0 ? first[C.customerName] : '') || 'عميل'

  // ── customer ──────────────────────────────────────────────────────────────
  let cid = phoneToCust.get(phone)?.id || newPhoneToCid.get(phone)
  if (!cid) {
    cid = genId('cust')
    newPhoneToCid.set(phone, cid)
    customersToInsert.push({
      id: cid,
      phone,
      customerName,
      email: '',
      notes: 'استيراد من السجل التاريخي',
      wallet: 0,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    })
  }

  // ── address ───────────────────────────────────────────────────────────────
  const label  = trim(C.addressLabel >= 0 ? first[C.addressLabel] : '') || 'Home'
  const street = trim(C.street >= 0 ? first[C.street] : '') ||
                 trim(C.addrDelivery >= 0 ? first[C.addrDelivery] : '')
  let aid
  const aKey = addrKey(cid, label)
  if (!existingAddrSet.has(aKey) && !newAddrKeys.has(aKey)) {
    aid = genId('addr')
    newAddrKeys.add(aKey)
    addressesToInsert.push({
      id: aid,
      customerId: cid,
      addressLabel: label,
      area:    trim(C.area    >= 0 ? first[C.area]    : ''),
      subArea: trim(C.subArea >= 0 ? first[C.subArea] : ''),
      streetAddress:  street,
      googleMapsLink: trim(C.maps >= 0 ? first[C.maps] : ''),
      createdAt: nowIso(),
    })
  } else {
    aid = existingAddresses.find((a) => addrKey(a.customerId, a.addressLabel) === aKey)?.id
       || addressesToInsert.find((a) => addrKey(a.customerId, a.addressLabel) === aKey)?.id
  }

  // ── line items (resolve products) ─────────────────────────────────────────
  const items = []
  let subtotal = 0
  for (const row of grp.rows) {
    const pname = trim(C.productName >= 0 ? row[C.productName] : '')
    if (!pname) { skippedRowsNoProduct++; continue }

    let prod = productByNorm.get(norm(pname)) || newProdNorm.get(norm(pname))
    if (!prod) {
      if (CREATE_MISSING) {
        const newProd = {
          id: genId('prod'),
          productName: pname,
          unitPrice: num(C.unitPrice >= 0 ? row[C.unitPrice] : 0) || num(row[C.price]) || 0,
          isActive: false,
          createdAt: nowIso(),
        }
        productsToCreate.push(newProd)
        newProdNorm.set(norm(pname), newProd)
        prod = newProd
      } else {
        unmatchedProducts.set(norm(pname), pname)
        skippedRowsNoProduct++
        continue
      }
    }

    const qtyRaw = num(C.qty >= 0 ? row[C.qty] : 0)
    // Heuristic: the CSV occasionally has a kg/price value pasted into الكمية (e.g. 190).
    // Anything > 50 is almost certainly not an item count → fall back to 1.
    const quantity = qtyRaw > 0 && qtyRaw <= 50 ? qtyRaw : 1
    const weight = kgToGrams(C.weight >= 0 ? row[C.weight] : 0)
    const unitPrice = num(C.unitPrice >= 0 ? row[C.unitPrice] : 0) ||
                      num(C.promoPrice >= 0 ? row[C.promoPrice] : 0) ||
                      num(C.price >= 0 ? row[C.price] : 0) ||
                      num(prod.unitPrice)
    let lineTotal = num(C.lineTotal >= 0 ? row[C.lineTotal] : 0)
    if (lineTotal <= 0) lineTotal = Math.round(quantity * unitPrice)

    items.push({
      id: genId('item'),
      productId: prod.id,
      quantity,
      weightGrams: weight,
      unitPrice,
      lineTotal,
      specialInstructions: trim(C.specialInstr >= 0 ? row[C.specialInstr] : ''),
      createdAt: nowIso(),
    })
    subtotal += lineTotal
  }

  if (!items.length) continue   // whole group lost — no matchable products

  // ── order header ──────────────────────────────────────────────────────────
  const orderType = normalizeOrderType(C.orderType >= 0 ? first[C.orderType] : '')
  const oid = genId('ord')
  const appOrderNo = nextAppOrderNo(grp.date, orderType)
  const time = grp.time || '12:00'

  ordersToInsert.push({
    id: oid,
    appOrderNo,
    orderDate: grp.date,
    orderTime: time,
    orderType,
    orderReceiver: trim(C.receiver >= 0 ? first[C.receiver] : '') || 'استيراد',
    orderMethod:   normalizeMethod(C.method >= 0 ? first[C.method] : ''),
    customerType:  normalizeCustomerType(C.customerType >= 0 ? first[C.customerType] : ''),
    customerSource:trim(C.customerSource >= 0 ? first[C.customerSource] : '') || 'Other',
    orderStatus:   'تم',
    cancellationReason: null,
    paymentMethod: 'Cash',
    customerId: cid,
    deliveryAddressId: aid || '',
    notes: 'مستورد من السجل التاريخي',
    followUp: false,
    followUpNotes: '',
    subtotal,
    deliveryFee: 0,
    orderTotal: subtotal,
    createdBy: 'history-import',
    createdAt: `${grp.date}T${time}:00.000Z`,
    updatedAt: nowIso(),
    isScheduled: false,
  })

  for (const it of items) itemsToInsert.push({ ...it, orderId: oid })

  // historical orders are delivered
  deliveriesToInsert.push({
    id: genId('del'),
    orderId: oid,
    deliveryStatus: 'تم التوصيل',
    branchComments: '',
    productPhotos: [],
    invoicePhoto: '',
    deliveredAt: `${grp.date}T${time}:00.000Z`,
    updatedBy: 'history-import',
    updatedAt: nowIso(),
  })
}

// ─── report ──────────────────────────────────────────────────────────────────
console.log('')
console.log('───────────────  IMPORT PLAN  ───────────────')
console.log(`👤  Customers   — new: ${customersToInsert.length}, reused: ${groupOf.size - newPhoneToCid.size - skippedGroupsNoDate}`)
console.log(`📍  Addresses   — new: ${addressesToInsert.length}`)
console.log(`📦  Orders      — new: ${ordersToInsert.length}`)
console.log(`🛒  Line items  — new: ${itemsToInsert.length}`)
console.log(`🚚  Deliveries  — new: ${deliveriesToInsert.length}`)
console.log(`🏷️   Products   — ${CREATE_MISSING ? `auto-created stubs: ${productsToCreate.length}` : `unmatched (skipped lines): ${unmatchedProducts.size}`}`)
console.log(`⚠️   Skipped rows (no product / unmatched): ${skippedRowsNoProduct}`)
console.log(`⚠️   Skipped groups (no/invalid date): ${skippedGroupsNoDate}`)
if (!CREATE_MISSING && unmatchedProducts.size) {
  const sample = [...unmatchedProducts.values()].slice(0, 10)
  console.log(`\n   First ${sample.length} unmatched product names:`)
  sample.forEach((n, i) => console.log(`      ${i + 1}. ${n}`))
  console.log(`\n   Re-run with --create-missing-products to auto-create them as inactive products.`)
}
console.log('────────────────────────────────────────────\n')

if (DRY) {
  console.log('🧪  Dry run — nothing was written to Supabase.')
  process.exit(0)
}

// ─── insert in dependency order, in chunks ───────────────────────────────────
async function insertChunked(table, rows) {
  if (!rows.length) return
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500)
    const { error } = await supabase.from(table).insert(chunk)
    if (error) { console.error(`❌  ${table} insert failed:`, error.message); process.exit(1) }
    process.stdout.write(`   ${table}: ${Math.min(i + chunk.length, rows.length)}/${rows.length}\r`)
  }
  process.stdout.write('\n')
}

console.log('💾  Writing to Supabase ...')
await insertChunked('customers',          customersToInsert)
await insertChunked('customer_addresses', addressesToInsert)
await insertChunked('products',           productsToCreate)
await insertChunked('orders',             ordersToInsert)
await insertChunked('order_items',        itemsToInsert)
await insertChunked('order_delivery',     deliveriesToInsert)

console.log('✅  Historical import complete.')
