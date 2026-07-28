'use client'

import { useEffect, useState } from 'react'
import { CatalogueEntry, DEFAULT_CATALOGUES } from './catalogue'

// Module-level cache so multiple components that mount at once share the
// same network round-trip (and don't all re-fetch on every navigation).
let cache: CatalogueEntry[] | null = null
let inflight: Promise<CatalogueEntry[]> | null = null
const subscribers = new Set<(c: CatalogueEntry[]) => void>()

function publish(list: CatalogueEntry[]) {
  cache = list
  subscribers.forEach((fn) => fn(list))
}

async function loadCatalogues(force = false): Promise<CatalogueEntry[]> {
  if (!force && cache) return cache
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const res = await fetch('/api/catalogues', { cache: 'no-store' })
      const data = await res.json()
      const list = Array.isArray(data?.catalogues) ? (data.catalogues as CatalogueEntry[]) : []
      const out = list.length > 0 ? list : DEFAULT_CATALOGUES
      publish(out)
      return out
    } catch {
      publish(DEFAULT_CATALOGUES)
      return DEFAULT_CATALOGUES
    } finally {
      inflight = null
    }
  })()
  return inflight
}

// Lets the catalogues settings page push a freshly-saved list to all
// subscribers without making them re-fetch.
export function pushCataloguesUpdate(list: CatalogueEntry[]) {
  publish(list)
}

/**
 * React hook used by every page that needs the live catalogue list
 * (admin/branch/CS product tabs, order form, import page).
 *
 *   const { catalogues, activeCatalogues, loading, refresh } = useCatalogues()
 */
export function useCatalogues() {
  const [list, setList] = useState<CatalogueEntry[]>(cache || DEFAULT_CATALOGUES)
  const [loading, setLoading] = useState(!cache)

  useEffect(() => {
    const onUpdate = (next: CatalogueEntry[]) => setList(next)
    subscribers.add(onUpdate)
    if (!cache) {
      loadCatalogues().finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
    return () => {
      subscribers.delete(onUpdate)
    }
  }, [])

  return {
    catalogues: list,
    activeCatalogues: [...list].filter((c) => c.isActive).sort((a, b) => a.sortOrder - b.sortOrder),
    loading,
    refresh: () => loadCatalogues(true).then(setList),
  }
}
