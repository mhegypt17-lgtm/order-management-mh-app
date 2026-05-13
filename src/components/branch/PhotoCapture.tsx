'use client'

import { useEffect, useRef, useState } from 'react'

interface PhotoCaptureProps {
  label: string
  multiple?: boolean
  max?: number
  photos: string[]
  onChange: (next: string[]) => void
}

/**
 * PhotoCapture
 * - Two buttons: open camera (capture="environment") OR pick from gallery
 * - After each pick, opens a crop modal (drag a rectangle); user can Apply or Skip
 * - Returns data-URL JPEGs (downscaled to max 1280px on the long edge)
 */
export default function PhotoCapture({ label, multiple = false, max = 10, photos, onChange }: PhotoCaptureProps) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const [pendingDataUrl, setPendingDataUrl] = useState<string | null>(null)

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const arr = Array.from(files).slice(0, multiple ? max - photos.length : 1)
    const dataUrls = await Promise.all(arr.map(fileToDownscaledDataUrl))
    if (dataUrls.length === 1) {
      setPendingDataUrl(dataUrls[0])
    } else {
      onChange((multiple ? [...photos, ...dataUrls] : dataUrls).slice(0, max))
    }
    if (cameraRef.current) cameraRef.current.value = ''
    if (galleryRef.current) galleryRef.current.value = ''
  }

  const handleApplyCrop = (cropped: string) => {
    onChange((multiple ? [...photos, cropped] : [cropped]).slice(0, max))
    setPendingDataUrl(null)
  }

  const handleSkipCrop = () => {
    if (pendingDataUrl) {
      onChange((multiple ? [...photos, pendingDataUrl] : [pendingDataUrl]).slice(0, max))
    }
    setPendingDataUrl(null)
  }

  const removeAt = (idx: number) => {
    const next = photos.filter((_, i) => i !== idx)
    onChange(next)
  }

  const reachedMax = photos.length >= max

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2 text-right">{label}</label>

      {/* Camera input is intentionally single-shot. Mobile browsers ignore `capture` when `multiple` is set. */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      <div className="flex flex-col sm:flex-row gap-2">
        <button
          type="button"
          disabled={reachedMax}
          onClick={() => cameraRef.current?.click()}
          className="flex-1 px-4 py-3 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold min-h-[44px]"
        >
          📷 التقاط صورة بالكاميرا
        </button>
        <button
          type="button"
          disabled={reachedMax}
          onClick={() => galleryRef.current?.click()}
          className="flex-1 px-4 py-3 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-800 font-semibold min-h-[44px]"
        >
          📁 من المعرض
        </button>
      </div>

      {photos.length > 0 && (
        <div className={`mt-3 grid gap-2 ${multiple ? 'grid-cols-3 sm:grid-cols-4' : 'grid-cols-1'}`}>
          {photos.map((src, idx) => (
            <div key={idx} className="relative group">
              <img src={src} alt={`${label}-${idx}`} className={`w-full ${multiple ? 'h-20' : 'h-40 sm:h-48'} object-cover rounded border border-gray-200`} />
              <button
                type="button"
                onClick={() => removeAt(idx)}
                className="absolute top-1 left-1 w-7 h-7 rounded-full bg-black/70 hover:bg-red-600 text-white text-sm font-bold flex items-center justify-center"
                aria-label="حذف"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {pendingDataUrl && (
        <CropModal
          src={pendingDataUrl}
          onApply={handleApplyCrop}
          onSkip={handleSkipCrop}
          onCancel={() => setPendingDataUrl(null)}
        />
      )}
    </div>
  )
}

// ─── Crop modal ────────────────────────────────────────────────────────────────

interface CropModalProps {
  src: string
  onApply: (dataUrl: string) => void
  onSkip: () => void
  onCancel: () => void
}

function CropModal({ src, onApply, onSkip, onCancel }: CropModalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [crop, setCrop] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const dragRef = useRef<{ mode: 'new' | 'move' | 'resize-br' | null; startX: number; startY: number; orig: typeof crop }>({
    mode: null,
    startX: 0,
    startY: 0,
    orig: null,
  })

  // Initialise crop to centre 80% rectangle when image first loads
  const onImgLoad = () => {
    setImgLoaded(true)
    const img = imgRef.current
    if (!img) return
    const w = img.clientWidth
    const h = img.clientHeight
    const cw = Math.round(w * 0.8)
    const ch = Math.round(h * 0.8)
    setCrop({ x: Math.round((w - cw) / 2), y: Math.round((h - ch) / 2), w: cw, h: ch })
  }

  const getPoint = (e: React.PointerEvent | PointerEvent) => {
    const rect = imgRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const startDrag = (e: React.PointerEvent, mode: 'new' | 'move' | 'resize-br') => {
    e.preventDefault()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    const p = getPoint(e)
    dragRef.current = { mode, startX: p.x, startY: p.y, orig: crop }
    if (mode === 'new') {
      setCrop({ x: p.x, y: p.y, w: 0, h: 0 })
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d.mode || !imgRef.current) return
    const img = imgRef.current
    const W = img.clientWidth
    const H = img.clientHeight
    const p = getPoint(e)
    const clampX = (v: number) => Math.max(0, Math.min(W, v))
    const clampY = (v: number) => Math.max(0, Math.min(H, v))

    if (d.mode === 'new') {
      const x = Math.min(d.startX, p.x)
      const y = Math.min(d.startY, p.y)
      const w = Math.abs(p.x - d.startX)
      const h = Math.abs(p.y - d.startY)
      setCrop({ x: clampX(x), y: clampY(y), w: Math.min(w, W - clampX(x)), h: Math.min(h, H - clampY(y)) })
    } else if (d.mode === 'move' && d.orig) {
      const dx = p.x - d.startX
      const dy = p.y - d.startY
      const x = clampX(d.orig.x + dx)
      const y = clampY(d.orig.y + dy)
      setCrop({ x, y, w: Math.min(d.orig.w, W - x), h: Math.min(d.orig.h, H - y) })
    } else if (d.mode === 'resize-br' && d.orig) {
      const w = Math.max(20, clampX(p.x) - d.orig.x)
      const h = Math.max(20, clampY(p.y) - d.orig.y)
      setCrop({ ...d.orig, w, h })
    }
  }

  const endDrag = () => {
    dragRef.current.mode = null
  }

  const applyCrop = async () => {
    if (!imgRef.current || !crop || crop.w < 10 || crop.h < 10) return onSkip()
    const img = imgRef.current
    const sourceImg = new Image()
    await new Promise<void>((resolve, reject) => {
      sourceImg.onload = () => resolve()
      sourceImg.onerror = (err) => reject(err)
      sourceImg.src = src
    })
    const scaleX = sourceImg.naturalWidth / img.clientWidth
    const scaleY = sourceImg.naturalHeight / img.clientHeight
    const sx = Math.round(crop.x * scaleX)
    const sy = Math.round(crop.y * scaleY)
    const sw = Math.round(crop.w * scaleX)
    const sh = Math.round(crop.h * scaleY)

    const canvas = document.createElement('canvas')
    canvas.width = sw
    canvas.height = sh
    const ctx = canvas.getContext('2d')
    if (!ctx) return onSkip()
    ctx.drawImage(sourceImg, sx, sy, sw, sh, 0, 0, sw, sh)
    onApply(canvas.toDataURL('image/jpeg', 0.85))
  }

  // Lock body scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-3" onClick={onCancel}>
      <div
        className="bg-white rounded-xl shadow-xl w-[95vw] sm:w-[90vw] md:max-w-2xl max-h-[90vh] overflow-y-auto p-3 sm:p-4 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-gray-900 text-right">✂️ اقتصاص الصورة (اختياري)</h3>
        <p className="text-xs text-gray-500 text-right">اسحب لاختيار المنطقة، أو اضغط <strong>تخطي</strong> لاستخدام الصورة كما هي.</p>

        <div ref={containerRef} className="relative w-full bg-gray-900 rounded select-none touch-none" style={{ userSelect: 'none' }}>
          <img
            ref={imgRef}
            src={src}
            alt="crop-source"
            onLoad={onImgLoad}
            onPointerDown={(e) => startDrag(e, 'new')}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className="w-full max-h-[60vh] object-contain block mx-auto"
            draggable={false}
          />
          {imgLoaded && crop && crop.w > 0 && crop.h > 0 && (
            <>
              <div
                className="absolute border-2 border-yellow-400 bg-yellow-200/20 cursor-move"
                style={{ left: crop.x, top: crop.y, width: crop.w, height: crop.h }}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  startDrag(e, 'move')
                }}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
              />
              <div
                className="absolute w-5 h-5 bg-yellow-400 border-2 border-white rounded-full cursor-nwse-resize"
                style={{ left: crop.x + crop.w - 10, top: crop.y + crop.h - 10 }}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  startDrag(e, 'resize-br')
                }}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
              />
            </>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={applyCrop}
            className="w-full sm:flex-1 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-3 rounded-lg font-semibold min-h-[44px]"
          >
            ✂️ اقتصاص واستخدام
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="w-full sm:w-auto bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-3 rounded-lg font-semibold min-h-[44px]"
          >
            ⏭️ تخطي
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="w-full sm:w-auto bg-red-100 hover:bg-red-200 text-red-700 px-4 py-3 rounded-lg font-semibold min-h-[44px]"
          >
            ✕ إلغاء
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fileToDownscaledDataUrl(file: File): Promise<string> {
  // Read file → Image → draw to canvas at max 1280px on long edge → JPEG data URL
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = (err) => reject(err)
    img.src = dataUrl
  })

  const MAX = 1280
  let w = img.naturalWidth
  let h = img.naturalHeight
  if (w <= MAX && h <= MAX) return dataUrl
  const scale = w > h ? MAX / w : MAX / h
  w = Math.round(w * scale)
  h = Math.round(h * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return dataUrl
  ctx.drawImage(img, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', 0.85)
}
