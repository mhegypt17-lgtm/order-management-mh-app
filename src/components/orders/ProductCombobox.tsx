'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

interface ProductLike {
  id: string
  productName: string
  basePrice?: number | null
  offerPrice?: number | null
  stockStatus?: 'available' | 'low' | 'out' | string | null
  isActive?: boolean
}

interface Props<T extends ProductLike> {
  products: T[]
  value: string // current text in input (productNameInput)
  selectedProductId: string // empty string when nothing picked
  onSelect: (product: T) => void
  onClear: () => void
  placeholder?: string
  className?: string
  size?: 'sm' | 'md'
}

const norm = (s: string) =>
  String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

export default function ProductCombobox<T extends ProductLike>({
  products,
  value,
  selectedProductId,
  onSelect,
  onClear,
  placeholder = 'ابحث عن منتج',
  className = '',
  size = 'md',
}: Props<T>) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const [menuRect, setMenuRect] = useState<{ top: number; left: number; width: number; openUp: boolean } | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const hasSelection = Boolean(selectedProductId)

  // Position the menu relative to the input using fixed coordinates
  const recomputeMenuRect = () => {
    const el = wrapRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const spaceBelow = window.innerHeight - r.bottom
    const menuHeight = 256 // matches max-h-64 (16rem)
    const openUp = spaceBelow < menuHeight + 16 && r.top > spaceBelow
    setMenuRect({
      top: openUp ? Math.max(8, r.top - menuHeight - 4) : r.bottom + 4,
      left: r.left,
      width: r.width,
      openUp,
    })
  }

  useEffect(() => {
    if (!open) return
    recomputeMenuRect()
    const onScrollOrResize = () => recomputeMenuRect()
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
    }
  }, [open])

  // Close on outside click
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current) return
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const filtered = useMemo(() => {
    const q = norm(query)
    // When the box was just opened with a selection, show the full list (don't filter by the selected name)
    if (!q || (hasSelection && norm(value) === q)) return products
    return products.filter((p) => norm(p.productName).includes(q))
  }, [products, query, value, hasSelection])

  const openList = () => {
    setOpen(true)
    setQuery('') // start fresh so the full list shows
    setHighlight(0)
  }

  const handleInputFocus = () => openList()

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!open) setOpen(true)
    setQuery(e.target.value)
    setHighlight(0)
    if (hasSelection) onClear() // typing invalidates the previous selection
  }

  const pick = (p: T) => {
    if (!p.id) {
      // Defensive guard — a product with no id would silently fail at submit
      // eslint-disable-next-line no-console
      console.warn('[ProductCombobox] selected product has no id:', p)
      return
    }
    onSelect(p)
    setOpen(false)
    setQuery('')
    inputRef.current?.blur()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setHighlight((h) => Math.min(h + 1, Math.max(0, filtered.length - 1)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(0, h - 1))
    } else if (e.key === 'Enter') {
      if (open && filtered[highlight]) {
        e.preventDefault()
        pick(filtered[highlight])
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  // Display value: while open, show the typing query; when closed, show the bound value
  const displayValue = open ? query : value

  const padY = size === 'sm' ? 'py-1' : 'py-2'

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <div className="flex">
        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          onFocus={handleInputFocus}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`flex-1 px-3 ${padY} border border-gray-300 rounded-r text-right bg-white focus:outline-none focus:ring-2 focus:ring-red-400`}
          dir="rtl"
          autoComplete="off"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => (open ? setOpen(false) : openList())}
          className={`px-3 ${padY} border border-r-0 border-gray-300 rounded-l bg-gray-50 hover:bg-gray-100 text-gray-600 text-sm`}
          aria-label="فتح القائمة"
        >
          {open ? '▴' : '▾'}
        </button>
      </div>

      {open && menuRect && (
        <ul
          className="max-h-64 overflow-y-auto bg-white border border-gray-300 rounded shadow-lg"
          dir="rtl"
          style={{
            position: 'fixed',
            top: menuRect.top,
            left: menuRect.left,
            width: menuRect.width,
            zIndex: 1000,
          }}
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-gray-500 text-right">لا توجد نتائج</li>
          ) : (
            filtered.map((p, idx) => {
              const stock = p.stockStatus
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      pick(p)
                    }}
                    onMouseEnter={() => setHighlight(idx)}
                    className={`w-full text-right px-3 py-2 text-sm flex items-center justify-between gap-2 ${
                      idx === highlight ? 'bg-red-50' : 'hover:bg-gray-50'
                    } ${stock === 'out' ? 'opacity-60' : ''}`}
                  >
                    <span className="flex items-center gap-2">
                      {stock === 'out' && <span className="text-red-600">⛔</span>}
                      {stock === 'low' && <span className="text-amber-600">⚠️</span>}
                      <span className="font-medium text-gray-900">{p.productName}</span>
                    </span>
                    <span className="text-xs text-gray-500">
                      {p.offerPrice != null
                        ? `${Number(p.offerPrice).toLocaleString()} ج.م`
                        : p.basePrice != null
                        ? `${Number(p.basePrice).toLocaleString()} ج.م`
                        : ''}
                    </span>
                  </button>
                </li>
              )
            })
          )}
        </ul>
      )}
    </div>
  )
}
