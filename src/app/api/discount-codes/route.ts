import { NextRequest, NextResponse } from 'next/server'
import {
  generateId,
  readDiscountCodes,
  writeDiscountCodes,
  type DiscountCodeRecord,
} from '@/lib/omsData'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const codes = readDiscountCodes().sort((a, b) =>
      (b.createdAt || '').localeCompare(a.createdAt || '')
    )
    return NextResponse.json(codes)
  } catch {
    return NextResponse.json({ error: 'تعذر تحميل الأكواد' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const code = String(body.code || '').trim().toUpperCase()
    const type = body.type === 'value' ? 'value' : 'percent'
    const amount = Number(body.amount)

    if (!code) return NextResponse.json({ error: 'الكود مطلوب' }, { status: 400 })
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'القيمة يجب أن تكون رقمًا موجبًا' }, { status: 400 })
    }
    if (type === 'percent' && amount > 100) {
      return NextResponse.json({ error: 'النسبة لا تتجاوز 100%' }, { status: 400 })
    }

    const codes = readDiscountCodes()
    if (codes.some((c) => c.code.toUpperCase() === code)) {
      return NextResponse.json({ error: 'الكود موجود مسبقًا' }, { status: 409 })
    }

    const now = new Date().toISOString()
    const record: DiscountCodeRecord = {
      id: generateId('disc'),
      code,
      type,
      amount,
      maxDiscount: body.maxDiscount != null && body.maxDiscount !== '' ? Number(body.maxDiscount) : null,
      minOrderTotal: body.minOrderTotal != null && body.minOrderTotal !== '' ? Number(body.minOrderTotal) : null,
      isActive: body.isActive !== false,
      expiresAt: body.expiresAt ? String(body.expiresAt) : null,
      usageLimit: body.usageLimit != null && body.usageLimit !== '' ? Number(body.usageLimit) : null,
      usedCount: 0,
      createdAt: now,
      updatedAt: now,
    }

    codes.push(record)
    writeDiscountCodes(codes)
    return NextResponse.json(record, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'تعذر إنشاء الكود' }, { status: 500 })
  }
}
