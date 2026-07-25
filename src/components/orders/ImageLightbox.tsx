'use client'

import { useEffect } from 'react'

// Full-screen image preview (lightbox). Displays a picture inline — inside the
// app, without downloading it — by reusing the *exact same* src string that is
// already rendered in the thumbnail. Because the browser already loaded that
// data (base64 data URI, or an http URL served from cache), opening the preview
// triggers NO new network request and therefore NO additional egress.

interface Props {
  src: string | null
  alt?: string
  onClose: () => void
}

export default function ImageLightbox({ src, alt, onClose }: Props) {
  useEffect(() => {
    if (!src) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [src, onClose])

  if (!src) return null

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 left-4 bg-white/90 hover:bg-white text-gray-800 w-10 h-10 rounded-full flex items-center justify-center text-xl font-bold shadow"
        title="إغلاق"
      >
        ✕
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt || 'preview'}
        className="max-w-full max-h-[90vh] object-contain rounded shadow-lg"
        onClick={(e) => e.stopPropagation()}
      />
      {alt && (
        <div
          className="absolute bottom-4 inset-x-0 text-center text-white/90 text-sm px-4"
          onClick={(e) => e.stopPropagation()}
        >
          {alt}
        </div>
      )}
    </div>
  )
}
