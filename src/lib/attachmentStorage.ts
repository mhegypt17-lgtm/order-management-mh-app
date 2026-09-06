import { supabase } from '@/lib/supabase'

// Moves NEW base64 attachment uploads out of Postgres jsonb columns and into
// Supabase Storage (public bucket, see data/attachments-storage-migration.sql).
// Only reduces DATABASE SIZE, not egress (Storage bandwidth counts the same
// as DB bandwidth on the plan) — see chat discussion 2026-09-06.
//
// Deliberately additive/idempotent, "new uploads only":
// - Anything that isn't a base64 data URL (already an http(s) Storage URL,
//   or any other already-migrated value) passes through untouched, so old
//   rows are never rewritten and existing display code needs zero changes
//   (an <img src> renders a Storage URL exactly like a data URL).
// - Any upload failure falls back to keeping the original base64 inline —
//   a Storage hiccup must never break a save, same philosophy as
//   compressImage's own fallback-to-uncompressed behavior.
const BUCKET = 'attachments'

function isDataUrl(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('data:')
}

function decodeDataUrl(dataUrl: string): { buffer: Buffer; contentType: string; ext: string } | null {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl)
  if (!match) return null
  const contentType = match[1] || 'image/jpeg'
  const buffer = Buffer.from(match[2], 'base64')
  const ext = contentType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg'
  return { buffer, contentType, ext }
}

/** Uploads one base64 data URL to Storage, returns its public URL. */
export async function persistAttachment(dataUrl: string, pathPrefix: string): Promise<string> {
  if (!isDataUrl(dataUrl)) return dataUrl
  const decoded = decodeDataUrl(dataUrl)
  if (!decoded) return dataUrl
  try {
    const path = `${pathPrefix}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${decoded.ext}`
    const { error } = await supabase.storage.from(BUCKET).upload(path, decoded.buffer, {
      contentType: decoded.contentType,
      upsert: false,
    })
    if (error) {
      console.error('[attachmentStorage] upload failed, keeping inline base64:', error.message)
      return dataUrl
    }
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
  } catch (err) {
    console.error('[attachmentStorage] upload threw, keeping inline base64:', err)
    return dataUrl
  }
}

/** Same as persistAttachment, applied to every item in an array (in parallel). */
export async function persistAttachments(dataUrls: string[], pathPrefix: string): Promise<string[]> {
  return Promise.all(dataUrls.map((u) => persistAttachment(u, pathPrefix)))
}
