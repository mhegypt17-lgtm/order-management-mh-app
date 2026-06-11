import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { PRODUCT_CATEGORY_ORDER } from '@/lib/omsData'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type CategoryRow = {
  id: string
  name: string
  sortOrder: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

function generateCategoryId() {
  return `cat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

// On first call (empty table) seed with the default constant so existing
// installs don't see an empty dropdown.
async function ensureSeeded(): Promise<void> {
  const { count, error } = await supabase
    .from('product_categories')
    .select('id', { count: 'exact', head: true })
  if (error) return // table might not exist yet — surface in GET below
  if ((count ?? 0) > 0) return

  const now = new Date().toISOString()
  const seed: CategoryRow[] = PRODUCT_CATEGORY_ORDER.map((name, idx) => ({
    id: generateCategoryId(),
    name,
    sortOrder: idx + 1,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  }))
  await supabase.from('product_categories').insert(seed)
}

export async function GET(req: NextRequest) {
  try {
    await ensureSeeded()

    const activeOnly = req.nextUrl.searchParams.get('activeOnly') === '1'

    let query = supabase
      .from('product_categories')
      .select('*')
      .order('sortOrder', { ascending: true })
    if (activeOnly) query = query.eq('isActive', true)

    const { data, error } = await query
    if (error) {
      return NextResponse.json(
        {
          error: 'Failed to fetch product categories',
          details: error.message,
          // Graceful fallback: callers can still render the dropdown from
          // the compiled-in seed list if the DB read fails (e.g. table
          // hasn't been created yet).
          fallback: PRODUCT_CATEGORY_ORDER,
        },
        { status: 500 },
      )
    }

    return NextResponse.json({ categories: data || [] }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json(
      { error: 'Failed to fetch product categories', details: e?.message, fallback: PRODUCT_CATEGORY_ORDER },
      { status: 500 },
    )
  }
}

// Bulk replace: client sends the full ordered list. We compute insert /
// update / delete based on id presence. Delete is BLOCKED if any product
// still uses the category name (caller decides whether to reassign first).
export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const incoming = Array.isArray(body?.categories) ? body.categories : []

    const { data: dbRows, error: fetchErr } = await supabase
      .from('product_categories')
      .select('*')
    if (fetchErr) {
      return NextResponse.json({ error: 'Failed to load existing categories', details: fetchErr.message }, { status: 500 })
    }

    const existingById = new Map<string, CategoryRow>(
      (dbRows || []).map((r: any) => [String(r.id), r as CategoryRow]),
    )

    const now = new Date().toISOString()
    const normalized: CategoryRow[] = []
    const seenNames = new Set<string>()
    for (let i = 0; i < incoming.length; i++) {
      const c = incoming[i]
      const name = String(c?.name || '').trim()
      if (!name) continue
      const key = name.replace(/\s+/g, ' ').toLowerCase()
      if (seenNames.has(key)) continue // dedupe within payload
      seenNames.add(key)

      const incomingId = c?.id ? String(c.id) : ''
      const existing = incomingId ? existingById.get(incomingId) : undefined
      normalized.push({
        id: existing?.id || incomingId || generateCategoryId(),
        name,
        sortOrder: i + 1,
        isActive: c?.isActive !== false,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      })
    }

    const incomingIds = new Set(normalized.map((c) => c.id))
    const toDelete = (dbRows || [])
      .map((r: any) => r as CategoryRow)
      .filter((r) => !incomingIds.has(r.id))

    // Block deletes that would orphan products. Look up usage by NAME
    // (since products.productCategory stores the string).
    const errors: string[] = []
    const blockedDeletes: { id: string; name: string; productCount: number }[] = []
    for (const row of toDelete) {
      const { count } = await supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('productCategory', row.name)
      if ((count ?? 0) > 0) {
        blockedDeletes.push({ id: row.id, name: row.name, productCount: count ?? 0 })
      }
    }
    if (blockedDeletes.length > 0) {
      return NextResponse.json(
        {
          error: 'لا يمكن حذف تصنيف مستخدم في منتجات',
          blocked: blockedDeletes,
        },
        { status: 409 },
      )
    }

    if (toDelete.length > 0) {
      const { error: delErr } = await supabase
        .from('product_categories')
        .delete()
        .in('id', toDelete.map((d) => d.id))
      if (delErr) errors.push(`Delete: ${delErr.message}`)
    }

    for (const c of normalized) {
      if (existingById.has(c.id)) {
        const { error: updErr } = await supabase
          .from('product_categories')
          .update(c)
          .eq('id', c.id)
        if (updErr) errors.push(`Update ${c.name}: ${updErr.message}`)
      } else {
        const { error: insErr } = await supabase
          .from('product_categories')
          .insert([c])
        if (insErr) errors.push(`Insert ${c.name}: ${insErr.message}`)
      }
    }

    if (errors.length > 0) {
      return NextResponse.json({ error: 'Some updates failed', details: errors }, { status: 207 })
    }

    return NextResponse.json({ categories: normalized }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: 'Failed to save categories', details: e?.message }, { status: 500 })
  }
}
