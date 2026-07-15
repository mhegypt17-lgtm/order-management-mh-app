import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

interface ApplyChange {
  productId: string
  newBasePrice: number
  newOfferPrice: number | null
}

/**
 * POST /api/admin/products/import-apply
 *
 * Body: { changes: Array<{ productId, newBasePrice, newOfferPrice }> }
 *
 * Only touches "basePrice" and "offerPrice" — never any other column.
 * Loops the changes and issues a targeted UPDATE per row (small volumes,
 * clear per-row error reporting). Returns { updated, errors[] }.
 */
export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdmin(request)
    if (guard instanceof NextResponse) return guard

    const body = (await request.json().catch(() => ({}))) as {
      changes?: unknown
    }
    if (!Array.isArray(body.changes) || body.changes.length === 0) {
      return NextResponse.json(
        { error: 'لا توجد تعديلات لتطبيقها' },
        { status: 400 },
      )
    }

    const changes: ApplyChange[] = []
    for (const c of body.changes) {
      if (typeof c !== 'object' || c === null) continue
      const obj = c as Record<string, unknown>
      const productId = obj.productId
      const newBasePrice = obj.newBasePrice
      const newOfferPrice = obj.newOfferPrice
      if (typeof productId !== 'string' || !productId) continue
      if (typeof newBasePrice !== 'number' || !Number.isFinite(newBasePrice))
        continue
      if (newBasePrice < 0) continue
      let offer: number | null = null
      if (newOfferPrice === null || newOfferPrice === undefined) {
        offer = null
      } else if (
        typeof newOfferPrice === 'number' &&
        Number.isFinite(newOfferPrice) &&
        newOfferPrice >= 0
      ) {
        offer = newOfferPrice
      } else {
        continue
      }
      changes.push({ productId, newBasePrice, newOfferPrice: offer })
    }

    if (changes.length === 0) {
      return NextResponse.json(
        { error: 'كل التعديلات غير صالحة' },
        { status: 400 },
      )
    }

    const supabase = getSupabaseAdmin()
    const updatedAt = new Date().toISOString()
    let updated = 0
    const errors: Array<{ productId: string; message: string }> = []

    for (const c of changes) {
      const { error } = await supabase
        .from('products')
        .update({
          basePrice: c.newBasePrice,
          offerPrice: c.newOfferPrice,
          updatedAt,
        })
        .eq('id', c.productId)

      if (error) {
        errors.push({ productId: c.productId, message: error.message })
      } else {
        updated++
      }
    }

    return NextResponse.json({ updated, errors, total: changes.length })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'خطأ غير متوقع'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
