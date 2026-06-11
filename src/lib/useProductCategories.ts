'use client'

import { useEffect, useState } from 'react'
import { PRODUCT_CATEGORY_ORDER } from './omsData'

export type ProductCategory = {
  id: string
  name: string
  sortOrder: number
  isActive: boolean
}

// Module-level cache so multiple components that mount at once share the
// same network round-trip (and don't all re-fetch on every navigation).
let cache: ProductCategory[] | null = null
let inflight: Promise<ProductCategory[]> | null = null
const subscribers = new Set<(c: ProductCategory[]) => void>()

function publish(list: ProductCategory[]) {
  cache = list
  subscribers.forEach((fn) => fn(list))
}

async function loadCategories(force = false): Promise<ProductCategory[]> {
  if (!force && cache) return cache
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const res = await fetch('/api/product-categories', { cache: 'no-store' })
      const data = await res.json()
      const list = Array.isArray(data?.categories) ? (data.categories as ProductCategory[]) : []
      const fallback = Array.isArray(data?.fallback) ? (data.fallback as string[]) : null
      const out =
        list.length > 0
          ? list
          : (fallback || PRODUCT_CATEGORY_ORDER).map((name, idx) => ({
              id: `fallback_${idx}`,
              name,
              sortOrder: idx + 1,
              isActive: true,
            }))
      publish(out)
      return out
    } catch {
      const out = PRODUCT_CATEGORY_ORDER.map((name, idx) => ({
        id: `fallback_${idx}`,
        name,
        sortOrder: idx + 1,
        isActive: true,
      }))
      publish(out)
      return out
    } finally {
      inflight = null
    }
  })()
  return inflight
}

// Lets the settings page push a freshly-saved list to all subscribers
// without making them re-fetch.
export function pushCategoriesUpdate(list: ProductCategory[]) {
  publish(list)
}

const normalize = (s?: string) => (s || '').replace(/\s+/g, ' ').trim()

/**
 * React hook used by every page that needs the live ordered category list.
 *
 *   const { categories, activeCategories, compareCategories, loading } = useProductCategories()
 *
 * `compareCategories` is a sort comparator that honors the user-defined
 * order saved in /admin/settings/categories. It falls back to alphabetic
 * for any category name not in the list (e.g. legacy products).
 */
export function useProductCategories() {
  const [list, setList] = useState<ProductCategory[]>(cache || [])
  const [loading, setLoading] = useState(!cache)

  useEffect(() => {
    const onUpdate = (next: ProductCategory[]) => setList(next)
    subscribers.add(onUpdate)
    if (!cache) {
      loadCategories().finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
    return () => {
      subscribers.delete(onUpdate)
    }
  }, [])

  const rank = (name?: string) => {
    const n = normalize(name)
    if (!n) return Number.MAX_SAFE_INTEGER
    const idx = list.findIndex((c) => normalize(c.name) === n)
    return idx === -1 ? Number.MAX_SAFE_INTEGER - 1 : idx
  }

  const compareCategories = (a?: string, b?: string): number => {
    const ra = rank(a)
    const rb = rank(b)
    if (ra !== rb) return ra - rb
    return normalize(a).localeCompare(normalize(b), 'ar')
  }

  return {
    categories: list,
    activeCategories: list.filter((c) => c.isActive),
    compareCategories,
    loading,
    reload: () => loadCategories(true),
  }
}
