// Quick sanity test — run: npx tsx scripts/test-csv-parse.ts
import { readFileSync } from 'node:fs'
import { parsePriceCsv, normaliseProductName } from '../src/lib/price-csv'

const csv = readFileSync('live-sheet.csv', 'utf-8')
const { rows, invalid } = parsePriceCsv(csv)

console.log('Total data rows parsed:', rows.length)
console.log('Invalid rows:', invalid.length)
if (invalid.length > 0) {
  console.log('\n--- Invalid ---')
  for (const inv of invalid) {
    console.log(`Line ${inv.lineNumber}: ${inv.reason}`)
    console.log(`  raw: ${JSON.stringify(inv.raw).slice(0, 120)}`)
  }
}

// Sample the previously-broken rows (originally on lines 14, 51, 102, 136, 152, 188)
console.log('\n--- Sample of rows on originally-broken lines ---')
for (const row of rows) {
  if ([14, 51, 102, 136, 152, 188].includes(row.lineNumber)) {
    console.log(`Line ${row.lineNumber}: name="${row.productName}" base=${row.basePrice} offer=${row.offerPrice}`)
  }
}

// Confirm normaliseProductName collapses multi-line names cleanly
console.log('\n--- Normalisation example ---')
const messy = 'ريش ضاني استرام\n              صولو ""'
console.log('Input :', JSON.stringify(messy))
console.log('Output:', JSON.stringify(normaliseProductName(messy)))
