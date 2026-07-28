import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { supabase } from '@/lib/supabase'
import { ONLINE_CATALOGUE_KEY } from '@/lib/catalogue'

type StockStatus = 'available' | 'low' | 'out'
const ALLOWED: StockStatus[] = ['available', 'low', 'out']

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const id: string = body?.id
    const status: StockStatus = (body?.stockStatus || 'available') as StockStatus
    const qtyRaw = body?.stockQuantity
    const role: string = body?.role || ''
    const actor: string = body?.actor || 'unknown'
    const catalogueKey: string = String(body?.catalogueKey || ONLINE_CATALOGUE_KEY).trim() || ONLINE_CATALOGUE_KEY

    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    if (!ALLOWED.includes(status)) return NextResponse.json({ error: 'invalid stockStatus' }, { status: 400 })
    if (!['branch', 'admin'].includes(role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

    const stockQuantity = qtyRaw == null || qtyRaw === '' ? null : Number(qtyRaw)
    if (stockQuantity != null && !Number.isFinite(stockQuantity)) {
      return NextResponse.json({ error: 'invalid stockQuantity' }, { status: 400 })
    }

    const now = new Date().toISOString()

    // Non-'online' catalogues only ever touch product_prices — the legacy
    // products columns (and everything that reads them) stay untouched.
    if (catalogueKey !== ONLINE_CATALOGUE_KEY) {
      const { data: existingRow } = await supabase
        .from('product_prices')
        .select('*')
        .eq('productId', id)
        .eq('catalogueKey', catalogueKey)
        .maybeSingle()

      const row = {
        productId: id,
        catalogueKey,
        basePrice: existingRow?.basePrice ?? null,
        offerPrice: existingRow?.offerPrice ?? null,
        stockStatus: status,
        stockQuantity,
        updatedAt: now,
        updatedBy: actor,
      }
      const { data: saved, error } = await supabase
        .from('product_prices')
        .upsert(row, { onConflict: 'productId,catalogueKey' })
        .select()
        .single()

      if (error || !saved) {
        console.error('[products/stock] catalogue update failed', error)
        return NextResponse.json(
          { error: 'Failed to update stock', details: error?.message || null },
          { status: 500 },
        )
      }

      try { revalidatePath('/api/products') } catch {}
      return NextResponse.json({ price: saved }, { headers: { 'Cache-Control': 'no-store' } })
    }

    const patch: Record<string, any> = {
      stockStatus: status,
      stockQuantity,
      stockUpdatedAt: now,
      stockUpdatedBy: actor,
    }

    let { data: updated, error } = await supabase
      .from('products')
      .update(patch)
      .eq('id', id)
      .select()
      .single()

    // Fallback: DB may not yet have stock columns — retry with whichever exist.
    if (error && /column .* does not exist|stockStatus|stockQuantity|stockUpdatedAt|stockUpdatedBy/i.test(error.message || '')) {
      console.warn('[products/stock] some stock columns missing, retrying with minimal payload', error.message)
      const attempts: Record<string, any>[] = [
        { stockStatus: status, stockQuantity },
        { stockStatus: status },
      ]
      for (const tryPatch of attempts) {
        const r = await supabase.from('products').update(tryPatch).eq('id', id).select().single()
        if (!r.error) {
          updated = r.data
          error = null
          break
        }
        error = r.error
      }
    }

    if (error || !updated) {
      console.error('[products/stock] update failed', error)
      return NextResponse.json(
        { error: 'Failed to update stock', details: error?.message || null },
        { status: 500 }
      )
    }

    // Best-effort mirror into product_prices('online') so embedded reads
    // (admin/branch catalogue tabs) agree with the legacy columns.
    await supabase.from('product_prices').upsert(
      {
        productId: id,
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

    // Bust the /api/products cache so branch / CS reads see the new stock
    // status immediately instead of waiting up to 5 minutes for the CDN
    // (s-maxage=300) or Next.js data cache (revalidate = 300) to expire.
    try { revalidatePath('/api/products') } catch {}

    return NextResponse.json({ product: updated }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err: any) {
    console.error('[products/stock] unexpected error', err)
    return NextResponse.json({ error: 'Failed to update stock', details: err?.message || null }, { status: 500 })
  }
}
