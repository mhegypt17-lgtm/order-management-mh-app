import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { ONLINE_CATALOGUE_KEY } from '@/lib/catalogue'

type StockStatus = 'available' | 'low' | 'out'
const ALLOWED_STOCK: StockStatus[] = ['available', 'low', 'out']

/**
 * PATCH /api/products/prices
 *
 * Upserts one product's price and/or stock for one catalogue.
 *
 * Body: { productId, catalogueKey, basePrice?, offerPrice?, stockStatus?,
 *         stockQuantity?, role, actor }
 *
 * - catalogueKey === 'online' mirrors straight onto the legacy
 *   products.basePrice/offerPrice/stockStatus/stockQuantity columns (the
 *   source every dashboard/report/CSV-import already reads), AND upserts the
 *   matching product_prices row so embedded reads stay consistent.
 * - Any other catalogueKey only touches product_prices — zero impact on the
 *   legacy columns or anything that reads them.
 * - Price fields require role 'admin'. Stock-only edits allow 'branch' too
 *   (matches the existing /api/products/stock convention).
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const productId: string = body?.productId
    const catalogueKey: string = String(body?.catalogueKey || '').trim()
    const role: string = body?.role || ''
    const actor: string = body?.actor || 'unknown'

    if (!productId) return NextResponse.json({ error: 'productId is required' }, { status: 400 })
    if (!catalogueKey) return NextResponse.json({ error: 'catalogueKey is required' }, { status: 400 })

    const hasPriceFields = body?.basePrice !== undefined || body?.offerPrice !== undefined
    const hasStockFields = body?.stockStatus !== undefined || body?.stockQuantity !== undefined

    if (hasPriceFields && role !== 'admin') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    if (!hasPriceFields && hasStockFields && !['branch', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    let basePrice: number | null | undefined
    if (body?.basePrice !== undefined) {
      basePrice = body.basePrice === null || body.basePrice === '' ? null : Number(body.basePrice)
      if (basePrice != null && !Number.isFinite(basePrice)) {
        return NextResponse.json({ error: 'invalid basePrice' }, { status: 400 })
      }
    }
    let offerPrice: number | null | undefined
    if (body?.offerPrice !== undefined) {
      offerPrice = body.offerPrice === null || body.offerPrice === '' ? null : Number(body.offerPrice)
      if (offerPrice != null && !Number.isFinite(offerPrice)) {
        return NextResponse.json({ error: 'invalid offerPrice' }, { status: 400 })
      }
    }
    let stockStatus: StockStatus | undefined
    if (body?.stockStatus !== undefined) {
      stockStatus = body.stockStatus as StockStatus
      if (!ALLOWED_STOCK.includes(stockStatus)) {
        return NextResponse.json({ error: 'invalid stockStatus' }, { status: 400 })
      }
    }
    let stockQuantity: number | null | undefined
    if (body?.stockQuantity !== undefined) {
      stockQuantity = body.stockQuantity === null || body.stockQuantity === '' ? null : Number(body.stockQuantity)
      if (stockQuantity != null && !Number.isFinite(stockQuantity)) {
        return NextResponse.json({ error: 'invalid stockQuantity' }, { status: 400 })
      }
    }

    const now = new Date().toISOString()

    if (catalogueKey === ONLINE_CATALOGUE_KEY) {
      // Source of truth stays the products table for 'online' — every
      // existing dashboard/report/import reads it directly.
      const patch: Record<string, any> = { updatedAt: now }
      if (basePrice !== undefined) patch.basePrice = basePrice
      if (offerPrice !== undefined) patch.offerPrice = offerPrice
      if (stockStatus !== undefined) patch.stockStatus = stockStatus
      if (stockQuantity !== undefined) patch.stockQuantity = stockQuantity
      if (stockStatus !== undefined || stockQuantity !== undefined) {
        patch.stockUpdatedAt = now
        patch.stockUpdatedBy = actor
      }

      const { data: updated, error } = await supabase
        .from('products')
        .update(patch)
        .eq('id', productId)
        .select()
        .single()

      if (error || !updated) {
        return NextResponse.json({ error: error?.message || 'update failed' }, { status: 500 })
      }

      // Best-effort mirror into product_prices so embedded reads agree.
      await supabase.from('product_prices').upsert(
        {
          productId,
          catalogueKey: ONLINE_CATALOGUE_KEY,
          basePrice: updated.basePrice ?? null,
          offerPrice: updated.offerPrice ?? null,
          stockStatus: updated.stockStatus || 'available',
          stockQuantity: updated.stockQuantity ?? null,
          updatedAt: now,
          updatedBy: actor,
        },
        { onConflict: 'productId,catalogueKey' },
      )

      return NextResponse.json({ product: updated }, { status: 200 })
    }

    // Non-'online' catalogue: read existing row (if any) so a partial patch
    // (e.g. stock-only from branch) doesn't null out the other fields.
    const { data: existingRow } = await supabase
      .from('product_prices')
      .select('*')
      .eq('productId', productId)
      .eq('catalogueKey', catalogueKey)
      .maybeSingle()

    const row = {
      productId,
      catalogueKey,
      basePrice: basePrice !== undefined ? basePrice : existingRow?.basePrice ?? null,
      offerPrice: offerPrice !== undefined ? offerPrice : existingRow?.offerPrice ?? null,
      stockStatus: stockStatus !== undefined ? stockStatus : existingRow?.stockStatus || 'available',
      stockQuantity: stockQuantity !== undefined ? stockQuantity : existingRow?.stockQuantity ?? null,
      updatedAt: now,
      updatedBy: actor,
    }

    const { data: saved, error } = await supabase
      .from('product_prices')
      .upsert(row, { onConflict: 'productId,catalogueKey' })
      .select()
      .single()

    if (error || !saved) {
      return NextResponse.json({ error: error?.message || 'update failed' }, { status: 500 })
    }

    return NextResponse.json({ price: saved }, { status: 200 })
  } catch (error) {
    console.error('[products/prices] PATCH failed', error)
    return NextResponse.json({ error: 'Failed to update price' }, { status: 500 })
  }
}
