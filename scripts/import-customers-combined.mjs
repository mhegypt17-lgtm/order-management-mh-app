// Imports the combined customers + addresses CSV into Supabase.
// Usage (PowerShell):
//   $env:NEXT_PUBLIC_SUPABASE_URL="https://xxxx.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY="eyJ..."          # service-role key (RLS bypass)
//   node scripts/import-customers-combined.mjs data/import-templates/customers-combined-template.csv
//
// CSV columns (header row required, in any order):
//   phone, customerName, email, notes, wallet,
//   addressLabel, area, subArea, streetAddress, googleMapsLink
//
// Rules:
//   • One row per ADDRESS. Repeat the same phone for a customer with multiple addresses.
//   • Customer is matched/deduped by `phone`. First occurrence creates the customer
//     (others reuse the existing id and only insert their address).
//   • Address is deduped by (customerId, lower(addressLabel)) — matches the app rule.
//   • Existing customers (same phone) are NOT overwritten; only missing addresses are added.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('❌  Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.')
  process.exit(1)
}
const supabase = createClient(url, key, { auth: { persistSession: false } })

const csvPath = process.argv[2]
if (!csvPath) {
  console.error('Usage: node scripts/import-customers-combined.mjs <path-to-csv>')
  process.exit(1)
}
const raw = readFileSync(path.resolve(csvPath), 'utf8').replace(/^\uFEFF/, '')

// Minimal CSV parser that supports double-quoted fields with commas/newlines.
function parseCsv(text) {
  const rows = []
  let row = []
  let cur = ''
  let inQuotes = false
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
  return rows.filter(r => r.some(v => String(v).trim() !== ''))
}

const matrix = parseCsv(raw)
const header = matrix.shift().map(h => h.trim())
const col = name => header.indexOf(name)

const required = ['phone', 'customerName', 'addressLabel', 'streetAddress']
for (const r of required) {
  if (col(r) === -1) { console.error(`❌  Missing required column: ${r}`); process.exit(1) }
}

const genId = prefix =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`

const nowIso = () => new Date().toISOString()

// Preload existing customers + addresses for dedupe.
const { data: existingCustomers, error: e1 } = await supabase
  .from('customers').select('id, phone')
if (e1) { console.error('❌  fetch customers failed:', e1.message); process.exit(1) }

const { data: existingAddresses, error: e2 } = await supabase
  .from('customer_addresses').select('id, customerId, addressLabel')
if (e2) { console.error('❌  fetch addresses failed:', e2.message); process.exit(1) }

const phoneToId = new Map(existingCustomers.map(c => [String(c.phone).trim(), c.id]))
const addrKey = (cid, label) => `${cid}::${String(label || 'Home').toLowerCase().trim()}`
const existingAddrSet = new Set(existingAddresses.map(a => addrKey(a.customerId, a.addressLabel)))

const customersToInsert = []
const addressesToInsert = []
let skippedCustomers = 0
let skippedAddresses = 0

for (const row of matrix) {
  const phone = String(row[col('phone')] || '').trim()
  if (!phone) continue

  let cid = phoneToId.get(phone)
  if (!cid) {
    cid = genId('cust')
    phoneToId.set(phone, cid)

    // Fold "phone 2" and "english customerName" into notes so nothing is lost
    // when the source spreadsheet has extra columns the schema doesn't store.
    const baseNotes = col('notes') >= 0 ? String(row[col('notes')] || '').trim() : ''
    const phone2 = col('phone 2') >= 0 ? String(row[col('phone 2')] || '').trim() : ''
    const englishName = col('english customerName') >= 0
      ? String(row[col('english customerName')] || '').trim()
      : ''
    const extras = []
    if (phone2) extras.push(`موبايل آخر: ${phone2}`)
    if (englishName) extras.push(`EN: ${englishName}`)
    const mergedNotes = [baseNotes, ...extras].filter(Boolean).join(' | ')

    customersToInsert.push({
      id: cid,
      phone,
      customerName: String(row[col('customerName')] || '').trim(),
      email: col('email') >= 0 ? String(row[col('email')] || '').trim() : '',
      notes: mergedNotes,
      wallet: col('wallet') >= 0 ? Number(row[col('wallet')] || 0) || 0 : 0,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    })
  } else {
    skippedCustomers++
  }

  const label = String(row[col('addressLabel')] || 'Home').trim() || 'Home'
  const street = String(row[col('streetAddress')] || '').trim()
  if (!street) continue

  const key = addrKey(cid, label)
  if (existingAddrSet.has(key) || addressesToInsert.some(a => addrKey(a.customerId, a.addressLabel) === key)) {
    skippedAddresses++
    continue
  }

  addressesToInsert.push({
    id: genId('addr'),
    customerId: cid,
    addressLabel: label,
    area: col('area') >= 0 ? String(row[col('area')] || '').trim() : '',
    subArea: col('subArea') >= 0 ? String(row[col('subArea')] || '').trim() : '',
    streetAddress: street,
    googleMapsLink: col('googleMapsLink') >= 0 ? String(row[col('googleMapsLink')] || '').trim() : '',
    createdAt: nowIso(),
  })
}

console.log(`📋  Customers — new: ${customersToInsert.length}, existing (skipped): ${skippedCustomers}`)
console.log(`📍  Addresses — new: ${addressesToInsert.length}, existing (skipped): ${skippedAddresses}`)

if (customersToInsert.length) {
  // chunked insert (Supabase max 1000)
  for (let i = 0; i < customersToInsert.length; i += 500) {
    const chunk = customersToInsert.slice(i, i + 500)
    const { error } = await supabase.from('customers').insert(chunk)
    if (error) { console.error('❌  customers insert failed:', error.message); process.exit(1) }
  }
}
if (addressesToInsert.length) {
  for (let i = 0; i < addressesToInsert.length; i += 500) {
    const chunk = addressesToInsert.slice(i, i + 500)
    const { error } = await supabase.from('customer_addresses').insert(chunk)
    if (error) { console.error('❌  addresses insert failed:', error.message); process.exit(1) }
  }
}

console.log('✅  Import done.')
