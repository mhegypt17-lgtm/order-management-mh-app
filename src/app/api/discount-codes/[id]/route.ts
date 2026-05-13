import { NextRequest, NextResponse } from 'next/server'
import { readDiscountCodes, writeDiscountCodes } from '@/lib/omsData'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json()
    const codes = readDiscountCodes()
    const idx = codes.findIndex((c) => c.id === params.id)
    if (idx < 0) return NextResponse.json({ error: 'الكود غير موجود' }, { status: 404 })

    const cur = codes[idx]
    const next = { ...cur }

    if (typeof body.code === 'string' && body.code.trim()) {
      const newCode = body.code.trim().toUpperCase()
      if (codes.some((c) => c.id !== cur.id && c.code.toUpperCase() === newCode)) {
        return NextResponse.json({ error: 'الكود مستخدم' }, { status: 409 })
      }
      next.code = newCode
    }
    if (body.type === 'percent' || body.type === 'value') next.type = body.type
    if (body.amount !== undefined) {
      const amt = Number(body.amount)
      if (!Number.isFinite(amt) || amt <= 0) {
        return NextResponse.json({ error: 'قيمة غير صحيحة' }, { status: 400 })
      }
      if (next.type === 'percent' && amt > 100) {
        return NextResponse.json({ error: 'النسبة لا تتجاوز 100%' }, { status: 400 })
      }
      next.amount = amt
    }
    if ('maxDiscount' in body) next.maxDiscount = body.maxDiscount === '' || body.maxDiscount == null ? null : Number(body.maxDiscount)
    if ('minOrderTotal' in body) next.minOrderTotal = body.minOrderTotal === '' || body.minOrderTotal == null ? null : Number(body.minOrderTotal)
    if (typeof body.isActive === 'boolean') next.isActive = body.isActive
    if ('expiresAt' in body) next.expiresAt = body.expiresAt ? String(body.expiresAt) : null
    if ('usageLimit' in body) next.usageLimit = body.usageLimit === '' || body.usageLimit == null ? null : Number(body.usageLimit)

    next.updatedAt = new Date().toISOString()
    codes[idx] = next
    writeDiscountCodes(codes)
    return NextResponse.json(next)
  } catch {
    return NextResponse.json({ error: 'تعذر تحديث الكود' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const codes = readDiscountCodes()
    const next = codes.filter((c) => c.id !== params.id)
    if (next.length === codes.length) {
      return NextResponse.json({ error: 'الكود غير موجود' }, { status: 404 })
    }
    writeDiscountCodes(next)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'تعذر حذف الكود' }, { status: 500 })
  }
}
