import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { ONLINE_CATALOGUE_KEY, withPricesEmbed, foldPricesEmbed } from '@/lib/catalogue'

// Product catalog changes rarely (admins add/edit products occasionally). It
// is read on nearly every order-creation and every dashboard render, so a
// 5-minute cache dramatically reduces egress. Edits happen through POST/PUT
// below, so freshness is bounded to <=5 minutes after an admin change.
export const revalidate = 300

// Lite column set — everything the order form + product pickers need,
// minus any heavy blob columns (image URLs may be huge base64, description
// text can be long-form Arabic marketing copy). Callers that need the
// full row (product admin page, editing a product) can omit ?columns=lite.
const PRODUCT_LITE_COLUMNS =
  'id, productName, productCategory, packagingType, pricingMode, basePrice, offerPrice, weightGrams, isActive, isTargeted, stockStatus, stockQuantity, onlineEnabled, createdAt, updatedAt'

function generateId() {
  return `prod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/** Upsert the 'online' catalogue's product_prices row so it mirrors the
 * legacy columns. Best-effort: failures are logged, never block the caller
 * (the legacy columns on `products` remain the source of truth for online). */
async function mirrorOnlineCataloguePrice(product: {
  id: string
  basePrice?: number | null
  offerPrice?: number | null
  stockStatus?: string | null
  stockQuantity?: number | null
}) {
  try {
    const { error } = await supabase.from('product_prices').upsert(
      {
        productId: product.id,
        catalogueKey: ONLINE_CATALOGUE_KEY,
        basePrice: product.basePrice ?? null,
        offerPrice: product.offerPrice ?? null,
        stockStatus: product.stockStatus || 'available',
        stockQuantity: product.stockQuantity ?? null,
        updatedAt: new Date().toISOString(),
      },
      { onConflict: 'productId,catalogueKey' },
    )
    if (error) console.warn('[products] mirror to product_prices(online) failed:', error.message)
  } catch (err) {
    console.warn('[products] mirror to product_prices(online) threw:', err)
  }
}

export async function GET(request: NextRequest) {
  try {
    const isLite = request.nextUrl.searchParams.get('columns') === 'lite'
    const baseCols: string = isLite ? PRODUCT_LITE_COLUMNS : '*'
    let products: any[] | null = null
    let error: any = null
    {
      const res = await supabase.from('products').select(withPricesEmbed(baseCols))
      products = res.data as any[] | null
      error = res.error
    }

    // Graceful fallback: product_prices table / FK not created yet (migration
    // not applied). Retry without the embed so the catalog keeps loading —
    // every product just behaves as 'online'-only until the migration runs.
    if (error && /relationship|schema cache|does not exist|42703/i.test(error.message || '')) {
      const retry = await supabase.from('products').select(baseCols)
      products = retry.data as any[] | null
      error = retry.error
    }

    if (error) {
      console.error('Error fetching products:', error)
      return NextResponse.json({ products: [] }, { status: 200 })
    }

    const normalized = (products || []).map((product: any) => ({
      ...foldPricesEmbed(product),
      productCategory: product.productCategory || 'غير محدد',
      packagingType: product.packagingType || 'غير محدد',
      isTargeted: Boolean(product.isTargeted),
    }))

    return NextResponse.json(
      { products: normalized },
      {
        status: 200,
        // Tier 1 caching: Vercel Edge holds the response for s-maxage seconds
        // and serves stale-while-revalidate up to swr seconds after that. All
        // clients within the window share one cached response — zero DB egress
        // for the repeat hits. Admin edits go through POST/PUT below (dynamic)
        // so freshness is bounded to <= s-maxage seconds after a change.
        headers: {
          'Cache-Control':
            'public, max-age=0, s-maxage=300, stale-while-revalidate=1800',
        },
      },
    )
  } catch (error) {
    console.error('Error fetching products:', error)
    return NextResponse.json(
      { error: 'Failed to fetch products' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Strip any incoming id: the create form sends `id: editingId` which is
    // null on a new product. If we let `...body` spread that in, it would
    // override the generated id with null and the insert would fail the NOT
    // NULL primary-key constraint (surfacing as "خطأ في حفظ المنتج").
    // `catalogueKey` is UI-only (which tab was active when "Add Product" was
    // clicked) — never persisted on the products row itself.
    const { id: _incomingId, catalogueKey, ...fields } = body
    const scopedCatalogueKey =
      typeof catalogueKey === 'string' && catalogueKey.trim() ? catalogueKey.trim() : null

    const newProduct = {
      ...fields,
      id: generateId(),
      productCategory: fields.productCategory || 'غير محدد',
      packagingType: fields.packagingType || 'غير محدد',
      // Creating a product while a non-'online' catalogue tab is active scopes
      // it to that catalogue only — it must never silently appear in Online/App.
      onlineEnabled:
        scopedCatalogueKey && scopedCatalogueKey !== ONLINE_CATALOGUE_KEY ? false : true,
    }

    const { data: inserted, error } = await supabase
      .from('products')
      .insert([newProduct])
      .select()
      .single()

    if (error) {
      console.error('Error creating product:', error)
      return NextResponse.json(
        { error: error.message || 'Failed to create product' },
        { status: 500 }
      )
    }

    const created = inserted || newProduct
    // Seed the 'online' catalogue row so this product behaves consistently
    // with every other catalogue-aware view (admin/branch tabs, order form).
    await mirrorOnlineCataloguePrice(created)

    // Scoped creation (e.g. added while the B2B tab was active): also seed a
    // product_prices row for THAT catalogue so it actually appears there —
    // membership for non-'online' catalogues is the presence of this row.
    if (scopedCatalogueKey && scopedCatalogueKey !== ONLINE_CATALOGUE_KEY) {
      await supabase.from('product_prices').upsert(
        {
          productId: created.id,
          catalogueKey: scopedCatalogueKey,
          basePrice: created.basePrice ?? null,
          offerPrice: created.offerPrice ?? null,
          stockStatus: created.stockStatus || 'available',
          stockQuantity: created.stockQuantity ?? null,
          updatedAt: new Date().toISOString(),
        },
        { onConflict: 'productId,catalogueKey' },
      )
    }

    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    console.error('Error creating product:', error)
    return NextResponse.json(
      { error: 'Failed to create product' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()

    if (!body.id) {
      return NextResponse.json({ error: 'Product ID required' }, { status: 400 })
    }

    const { data: existing, error: fetchError } = await supabase
      .from('products')
      .select('*')
      .eq('id', body.id)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    const updated = {
      ...existing,
      ...body,
      productCategory: body.productCategory || existing.productCategory || 'غير محدد',
      packagingType: body.packagingType || existing.packagingType || 'غير محدد',
    }

    const { data: result, error } = await supabase
      .from('products')
      .update(updated)
      .eq('id', body.id)
      .select()
      .single()

    if (error) {
      console.error('Error updating product:', error)
      return NextResponse.json(
        { error: 'Failed to update product' },
        { status: 500 }
      )
    }

    const saved = result || updated
    // Keep the 'online' catalogue row in sync with the legacy columns
    // whenever they change here (admin edit form, inline price save, CSV
    // import-apply for the default catalogue, stock toggles, etc.).
    await mirrorOnlineCataloguePrice(saved)

    return NextResponse.json(saved, { status: 200 })
  } catch (error) {
    console.error('Error updating product:', error)
    return NextResponse.json(
      { error: 'Failed to update product' },
      { status: 500 }
    )
  }
}


export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()

    if (!body.id) {
      return NextResponse.json({ error: 'Product ID required' }, { status: 400 })
    }

    const { error: deleteError } = await supabase
      .from('products')
      .delete()
      .eq('id', body.id)

    if (deleteError) {
      console.error('Error deleting product:', deleteError)
      // Postgres foreign_key_violation — this product still has historical
      // orders/prices referencing it. Deleting it globally would corrupt
      // that history, so surface a clear, actionable message instead of a
      // generic failure (same lesson as the delivery-zones FK issue).
      const isReferenced = deleteError.code === '23503'
      return NextResponse.json(
        {
          error: isReferenced
            ? 'لا يمكن حذف هذا المنتج نهائياً لوجود طلبات سابقة مرتبطة به. يمكنك إلغاء تفعيله (نشط) أو إزالته من كتالوج معين بدلاً من ذلك.'
            : 'Failed to delete product',
        },
        { status: isReferenced ? 409 : 500 }
      )
    }

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('Error deleting product:', error)
    return NextResponse.json(
      { error: 'Failed to delete product' },
      { status: 500 }
    )
  }
}
