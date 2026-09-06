// One-time backfill: move EXISTING base64 image data (still stored inline in
// Postgres) into the same Supabase Storage bucket that new uploads already
// use (src/lib/attachmentStorage.ts), to reclaim database size right now
// instead of only slowing future growth.
//
// Safe by design:
// - Idempotent: any value that isn't a `data:` URL (already migrated, or
//   never had a photo) is left completely untouched.
// - Per-row, per-item: if uploading one attachment fails, that ONE item
//   stays as its original base64 (exactly like today) while every other
//   item/row in the same run still gets migrated normally - one failure
//   never aborts the whole script or loses data.
// - Read-only by default. Nothing is written to the database unless you
//   pass --apply. Run without it first to preview counts/sizes.
//
// Usage (PowerShell), from the "Order Management MH APP" folder:
//   node scripts/migrate-attachments-to-storage.mjs            (dry run)
//   node scripts/migrate-attachments-to-storage.mjs --apply     (writes)

import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}
loadEnvLocal()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (checked .env.local).')
  process.exit(1)
}
const supabase = createClient(url, key)

const BUCKET = 'attachments'
const APPLY = process.argv.includes('--apply')

let uploadedCount = 0
let uploadedBytes = 0
let failedCount = 0

function isDataUrl(value) {
  return typeof value === 'string' && value.startsWith('data:')
}

function decodeDataUrl(dataUrl) {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl)
  if (!match) return null
  const contentType = match[1] || 'image/jpeg'
  const buffer = Buffer.from(match[2], 'base64')
  const ext = contentType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg'
  return { buffer, contentType, ext }
}

async function migrateOne(value, pathPrefix) {
  if (!isDataUrl(value)) return value
  const decoded = decodeDataUrl(value)
  if (!decoded) return value
  if (!APPLY) {
    uploadedCount += 1
    uploadedBytes += decoded.buffer.length
    return value // dry run: report only, never touch the value
  }
  try {
    const objectPath = `${pathPrefix}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${decoded.ext}`
    const { error } = await supabase.storage.from(BUCKET).upload(objectPath, decoded.buffer, {
      contentType: decoded.contentType,
      upsert: false,
    })
    if (error) {
      console.error(`  ! upload failed (${pathPrefix}): ${error.message} — keeping original`)
      failedCount += 1
      return value
    }
    uploadedCount += 1
    uploadedBytes += decoded.buffer.length
    return supabase.storage.from(BUCKET).getPublicUrl(objectPath).data.publicUrl
  } catch (err) {
    console.error(`  ! upload threw (${pathPrefix}): ${err.message} — keeping original`)
    failedCount += 1
    return value
  }
}

async function migrateCsAttachments() {
  const { data, error } = await supabase.from('orders').select('id, csAttachments')
  if (error) {
    console.error('orders read failed:', error.message)
    return
  }
  let touched = 0
  for (const row of data || []) {
    const list = Array.isArray(row.csAttachments) ? row.csAttachments : []
    if (!list.some((a) => isDataUrl(a?.url))) continue
    const migrated = await Promise.all(
      list.map(async (a) => ({ ...a, url: await migrateOne(a.url, `cs-attachments/${row.id}`) })),
    )
    touched += 1
    if (APPLY) {
      const { error: updErr } = await supabase.from('orders').update({ csAttachments: migrated }).eq('id', row.id)
      if (updErr) console.error(`  ! failed saving order ${row.id}: ${updErr.message}`)
    }
  }
  console.log(`orders.csAttachments: ${touched} row(s) with base64 attachments ${APPLY ? 'migrated' : 'found'}`)
}

async function migrateOrderPhotos() {
  // This is the known-heaviest table (photos/invoice images) — a single
  // unbounded select times out server-side, so page through it in batches.
  const BATCH = 25
  let from = 0
  let touched = 0
  for (;;) {
    const { data, error } = await supabase
      .from('order_delivery')
      .select('orderId, productPhotos, invoicePhoto')
      .order('orderId')
      .range(from, from + BATCH - 1)
    if (error) {
      console.error(`order_delivery read failed at offset ${from}:`, error.message)
      break
    }
    if (!data || data.length === 0) break

    for (const row of data) {
      const photos = Array.isArray(row.productPhotos) ? row.productPhotos : []
      const hasInline = photos.some(isDataUrl) || isDataUrl(row.invoicePhoto)
      if (!hasInline) continue
      const migratedPhotos = await Promise.all(photos.map((p) => migrateOne(p, `order-photos/${row.orderId}`)))
      const migratedInvoice = row.invoicePhoto ? await migrateOne(row.invoicePhoto, `order-photos/${row.orderId}`) : row.invoicePhoto
      touched += 1
      if (APPLY) {
        const { error: updErr } = await supabase
          .from('order_delivery')
          .update({ productPhotos: migratedPhotos, invoicePhoto: migratedInvoice })
          .eq('orderId', row.orderId)
        if (updErr) console.error(`  ! failed saving order_delivery ${row.orderId}: ${updErr.message}`)
      }
    }
    from += BATCH
  }
  console.log(`order_delivery photos: ${touched} row(s) with base64 photos ${APPLY ? 'migrated' : 'found'}`)
}

async function migrateComplaintAttachments() {
  const { data, error } = await supabase.from('complaints').select('id, attachments')
  if (error) {
    // Column may not exist yet on older DBs — treat as "nothing to migrate".
    if (/attachments|does not exist/i.test(error.message || '')) {
      console.log('complaints.attachments: column not present, skipping')
      return
    }
    console.error('complaints read failed:', error.message)
    return
  }
  let touched = 0
  for (const row of data || []) {
    const list = Array.isArray(row.attachments) ? row.attachments : []
    if (!list.some((a) => isDataUrl(a?.url))) continue
    const migrated = await Promise.all(
      list.map(async (a) => ({ ...a, url: await migrateOne(a.url, `complaint-attachments/${row.id}`) })),
    )
    touched += 1
    if (APPLY) {
      const { error: updErr } = await supabase.from('complaints').update({ attachments: migrated }).eq('id', row.id)
      if (updErr) console.error(`  ! failed saving complaint ${row.id}: ${updErr.message}`)
    }
  }
  console.log(`complaints.attachments: ${touched} row(s) with base64 attachments ${APPLY ? 'migrated' : 'found'}`)
}

async function main() {
  console.log(APPLY ? '=== APPLY MODE (will write to DB + Storage) ===' : '=== DRY RUN (no writes) — pass --apply to actually migrate ===')
  await migrateCsAttachments()
  await migrateOrderPhotos()
  await migrateComplaintAttachments()
  console.log('---')
  console.log(`Images ${APPLY ? 'uploaded' : 'that would be uploaded'}: ${uploadedCount} (~${(uploadedBytes / 1024 / 1024).toFixed(2)} MB)`)
  if (failedCount) console.log(`Failed uploads (kept as original base64): ${failedCount}`)
}

main().catch((err) => {
  console.error('Migration script crashed:', err)
  process.exit(1)
})
