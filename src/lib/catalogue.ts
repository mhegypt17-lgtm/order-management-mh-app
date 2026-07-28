// Multi-catalogue (LOB) pricing/stock helpers.
//
// Each product is priced & stocked independently per "catalogue" (a named
// price list mapped to one or more order types, configured by admin). The
// default catalogue, key 'online', covers Online + App orders and is backed
// by the legacy products.basePrice/offerPrice/stockStatus/stockQuantity
// columns — every existing product "just works" with zero data migration.
// Any other catalogue (instashop, b2b, or a future one) is fully expressed
// by a row in `product_prices`, embedded onto each product as
// `prices[catalogueKey]` by GET /api/products.

export type StockStatus = 'available' | 'low' | 'out'

export interface CatalogueEntry {
  key: string
  label: string
  orderTypes: string[]
  isActive: boolean
  sortOrder: number
}

export const ONLINE_CATALOGUE_KEY = 'online'

// Used as a client-side fallback before /api/catalogues has loaded, and as
// the seed written to order_settings on first read.
export const DEFAULT_CATALOGUES: CatalogueEntry[] = [
  { key: 'online', label: 'أونلاين / تطبيق', orderTypes: ['Online', 'App'], isActive: true, sortOrder: 1 },
  { key: 'instashop', label: 'إنستاشوب', orderTypes: ['Instashop'], isActive: true, sortOrder: 2 },
  { key: 'b2b', label: 'B2B', orderTypes: ['B2B'], isActive: true, sortOrder: 3 },
]

export interface CataloguePrice {
  basePrice: number | null
  offerPrice: number | null
  stockStatus?: StockStatus
  stockQuantity?: number | null
}

export interface CataloguedProduct {
  basePrice?: number | null
  offerPrice?: number | null
  stockStatus?: StockStatus
  stockQuantity?: number | null
  /** Non-'online' catalogues only — 'online' always reads the columns above. */
  prices?: Record<string, CataloguePrice>
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Resolve which catalogue an order type belongs to. Falls back to 'online'. */
export function resolveCatalogueKey(
  orderType: string | null | undefined,
  catalogues: CatalogueEntry[] = DEFAULT_CATALOGUES,
): string {
  const t = String(orderType || '').trim().toLowerCase()
  if (!t) return ONLINE_CATALOGUE_KEY
  const match = (catalogues.length > 0 ? catalogues : DEFAULT_CATALOGUES).find((c) =>
    c.orderTypes.some((ot) => ot.trim().toLowerCase() === t),
  )
  return match?.key || ONLINE_CATALOGUE_KEY
}

export function catalogueBasePrice(p: CataloguedProduct, key: string): number | null {
  if (key === ONLINE_CATALOGUE_KEY) return num(p.basePrice)
  return num(p.prices?.[key]?.basePrice)
}

export function catalogueOfferPrice(p: CataloguedProduct, key: string): number | null {
  if (key === ONLINE_CATALOGUE_KEY) return num(p.offerPrice)
  return num(p.prices?.[key]?.offerPrice)
}

export function catalogueStockStatus(p: CataloguedProduct, key: string): StockStatus {
  if (key === ONLINE_CATALOGUE_KEY) return p.stockStatus || 'available'
  return p.prices?.[key]?.stockStatus || 'available'
}

export function catalogueStockQuantity(p: CataloguedProduct, key: string): number | null {
  if (key === ONLINE_CATALOGUE_KEY) return p.stockQuantity ?? null
  return p.prices?.[key]?.stockQuantity ?? null
}

/** A product is offered in a catalogue when it has a positive base price there. */
export function isAvailableInCatalogue(p: CataloguedProduct, key: string): boolean {
  const b = catalogueBasePrice(p, key)
  return b != null && b > 0
}

/** Effective per-unit price for a catalogue: offer price if set (>0), else base. */
export function catalogueUnitPrice(p: CataloguedProduct, key: string): number {
  const offer = catalogueOfferPrice(p, key)
  if (offer != null && offer > 0) return offer
  const base = catalogueBasePrice(p, key)
  return base != null ? base : 0
}

// --- Shared PostgREST embed helpers -----------------------------------
//
// Any server route reading `products` and needing non-'online' catalogue
// prices can reuse these two so the embed fragment / folding logic lives in
// exactly one place.

const PRICES_EMBED_FRAGMENT =
  'product_prices(catalogueKey,basePrice,offerPrice,stockStatus,stockQuantity)'

/** Append the product_prices embed to a `.select()` column string. */
export function withPricesEmbed(cols: string): string {
  return `${cols}, ${PRICES_EMBED_FRAGMENT}`
}

/** Fold the embedded product_prices[] array into a flat `prices` map keyed
 * by catalogueKey, dropping the raw array so callers get a compact shape. */
export function foldPricesEmbed<T extends { product_prices?: any[] }>(
  product: T,
): Omit<T, 'product_prices'> & { prices?: Record<string, CataloguePrice> } {
  const raw = Array.isArray(product.product_prices) ? product.product_prices : []
  const { product_prices: _drop, ...rest } = product as any
  if (raw.length === 0) return rest
  const prices: Record<string, CataloguePrice> = {}
  for (const row of raw) {
    if (!row?.catalogueKey || row.catalogueKey === ONLINE_CATALOGUE_KEY) continue
    prices[row.catalogueKey] = {
      basePrice: row.basePrice ?? null,
      offerPrice: row.offerPrice ?? null,
      stockStatus: row.stockStatus || 'available',
      stockQuantity: row.stockQuantity ?? null,
    }
  }
  return Object.keys(prices).length > 0 ? { ...rest, prices } : rest
}
