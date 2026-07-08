/**
 * Client-side image compression for photo uploads.
 *
 * Purpose: dramatically reduce the base64 payload we push into Postgres jsonb
 * columns (order_delivery.productPhotos, order_delivery.invoicePhoto,
 * orders.csAttachments). A raw 4 MB camera JPEG becomes ~5.3 MB when base64-
 * encoded — running it through this compressor first gets it to ~200-350 KB
 * on the wire and in the DB, which is 15-20× smaller for the same visible
 * quality on a 400px thumbnail or a full-screen modal preview.
 *
 * Behaviour:
 * - Downscale so the longest edge is at most `maxSize` (default 1280px).
 * - Re-encode as JPEG at the given quality (default 0.72).
 * - Non-image files (PDFs, etc.) fall through unchanged as base64.
 * - Anything that throws returns the original file as base64 — never worse
 *   than the current behaviour.
 */

export type CompressOptions = {
  maxSize?: number
  quality?: number
  mimeType?: 'image/jpeg' | 'image/webp'
}

const DEFAULT_MAX = 1280
const DEFAULT_QUALITY = 0.72

/**
 * Fallback: read a File as a base64 data URL without any compression.
 * Used for non-image files and for browsers that fail to decode.
 */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/**
 * Compress a single image File. Returns a base64 data URL of the compressed
 * image. If the file is not an image, or compression fails for any reason,
 * returns the original file as an uncompressed base64 data URL so callers
 * never end up with an empty upload.
 */
export async function compressImage(
  file: File,
  opts: CompressOptions = {},
): Promise<string> {
  const maxSize = opts.maxSize ?? DEFAULT_MAX
  const quality = opts.quality ?? DEFAULT_QUALITY
  const outMime = opts.mimeType ?? 'image/jpeg'

  // Non-images (PDFs, etc.) → return as-is.
  if (!file.type.startsWith('image/')) {
    return readAsDataUrl(file)
  }

  try {
    // Load the file into an HTMLImageElement via ObjectURL so we don't have
    // to decode a huge base64 string first.
    const url = URL.createObjectURL(file)
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('image decode failed'))
      el.src = url
    })

    try {
      const { naturalWidth: w0, naturalHeight: h0 } = img
      const longest = Math.max(w0, h0)
      const scale = longest > maxSize ? maxSize / longest : 1
      const w = Math.round(w0 * scale)
      const h = Math.round(h0 * scale)

      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return readAsDataUrl(file)
      ctx.drawImage(img, 0, 0, w, h)

      const compressed = canvas.toDataURL(outMime, quality)
      // If the encoder returned something suspiciously small (image failed to
      // draw), fall back to the raw file.
      if (!compressed || compressed.length < 100) {
        return readAsDataUrl(file)
      }
      return compressed
    } finally {
      URL.revokeObjectURL(url)
    }
  } catch {
    return readAsDataUrl(file)
  }
}

/**
 * Convenience helper: compress every image in a FileList (or Array<File>)
 * in parallel and return their data URLs in input order.
 */
export async function compressImages(
  files: FileList | File[],
  opts: CompressOptions = {},
): Promise<string[]> {
  const list = Array.from(files as ArrayLike<File>)
  return Promise.all(list.map((f) => compressImage(f, opts)))
}
