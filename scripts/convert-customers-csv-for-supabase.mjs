// Offline converter: takes the combined customers CSV and produces TWO
// Supabase-ready CSVs (customers.csv + customer_addresses.csv) with IDs
// already filled in. Nothing is uploaded — you import the resulting files
// directly via Supabase → Table Editor → Insert → Import data from CSV.
//
// Usage (PowerShell):
//   node scripts/convert-customers-csv-for-supabase.mjs "C:\path\to\source.csv"
//
// Output: writes customers-supabase.csv and customer_addresses-supabase.csv
// next to the source file.

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const src = process.argv[2]
if (!src) {
  console.error('Usage: node scripts/convert-customers-csv-for-supabase.mjs <path-to-csv>')
  process.exit(1)
}
const srcAbs = path.resolve(src)
const raw = readFileSync(srcAbs, 'utf8').replace(/^\uFEFF/, '')

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
  return rows.filter(r => r.some(v => String(v).trim() !== ''))
}

function csvEscape(v) {
  const s = v == null ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
function toCsv(headers, rows) {
  const lines = [headers.join(',')]
  for (const r of rows) lines.push(headers.map(h => csvEscape(r[h])).join(','))
  return '\ufeff' + lines.join('\r\n') + '\r\n'
}

const matrix = parseCsv(raw)
const header = matrix.shift().map(h => h.trim())
const col = name => header.indexOf(name)

for (const r of ['phone', 'customerName']) {
  if (col(r) === -1) { console.error(`❌ Missing required column: ${r}`); process.exit(1) }
}

let counter = 0
const genId = prefix => {
  counter++
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36).padStart(4, '0')}`
}
const nowIso = () => new Date().toISOString()

const phoneToId = new Map()
const customers = []
const addresses = []
let skippedAddrNoStreet = 0
let skippedNoPhone = 0

for (const row of matrix) {
  const phone = String(row[col('phone')] || '').trim()
  if (!phone) { skippedNoPhone++; continue }

  let cid = phoneToId.get(phone)
  if (!cid) {
    cid = genId('cust')
    phoneToId.set(phone, cid)

    const baseNotes = col('notes') >= 0 ? String(row[col('notes')] || '').trim() : ''
    const phone2 = col('phone 2') >= 0 ? String(row[col('phone 2')] || '').trim() : ''
    const englishName = col('english customerName') >= 0
      ? String(row[col('english customerName')] || '').trim() : ''
    const extras = []
    if (phone2) extras.push(`موبايل آخر: ${phone2}`)
    if (englishName) extras.push(`EN: ${englishName}`)
    const mergedNotes = [baseNotes, ...extras].filter(Boolean).join(' | ')

    customers.push({
      id: cid,
      phone,
      customerName: String(row[col('customerName')] || '').trim(),
      email: col('email') >= 0 ? String(row[col('email')] || '').trim() : '',
      notes: mergedNotes,
      wallet: col('wallet') >= 0 ? (Number(row[col('wallet')] || 0) || 0) : 0,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    })
  }

  const street = col('streetAddress') >= 0 ? String(row[col('streetAddress')] || '').trim() : ''
  if (!street) { skippedAddrNoStreet++; continue }

  const label = (col('addressLabel') >= 0 ? String(row[col('addressLabel')] || '').trim() : '') || 'Home'
  const mapLink = col('googleMapsLink') >= 0 ? String(row[col('googleMapsLink')] || '').trim() : ''
  const cleanMap = mapLink === '#N/A' ? '' : mapLink

  addresses.push({
    id: genId('addr'),
    customerId: cid,
    addressLabel: label,
    area: col('area') >= 0 ? String(row[col('area')] || '').trim() : '',
    subArea: col('subArea') >= 0 ? String(row[col('subArea')] || '').trim() : '',
    streetAddress: street,
    googleMapsLink: cleanMap,
    createdAt: nowIso(),
  })
}

const dir = path.dirname(srcAbs)
const custOut = path.join(dir, 'customers-supabase.csv')
const addrOut = path.join(dir, 'customer_addresses-supabase.csv')

writeFileSync(custOut, toCsv(
  ['id', 'phone', 'customerName', 'email', 'notes', 'wallet', 'createdAt', 'updatedAt'],
  customers,
))
writeFileSync(addrOut, toCsv(
  ['id', 'customerId', 'addressLabel', 'area', 'subArea', 'streetAddress', 'googleMapsLink', 'createdAt'],
  addresses,
))

console.log(`📋  Customers written: ${customers.length}  → ${custOut}`)
console.log(`📍  Addresses written: ${addresses.length}  → ${addrOut}`)
if (skippedNoPhone)        console.log(`⚠️   Skipped ${skippedNoPhone} row(s) with no phone.`)
if (skippedAddrNoStreet)   console.log(`ℹ️   ${skippedAddrNoStreet} row(s) had no streetAddress → customer created, address skipped.`)
console.log('✅  Done. Now import the two files into Supabase Table Editor.')
