import { NextRequest, NextResponse } from 'next/server'
import { evaluateDiscountCode } from '@/lib/omsData'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const code = searchParams.get('code') || ''
    const grossTotal = Number(searchParams.get('gross') || 0) || 0
    const result = evaluateDiscountCode(code, grossTotal)
    return NextResponse.json({
      ok: result.ok,
      reason: result.reason || null,
      discount: result.discount,
      type: result.code?.type || null,
      amount: result.code?.amount || null,
      code: result.code?.code || null,
    })
  } catch {
    return NextResponse.json({ ok: false, reason: 'خطأ في التحقق', discount: 0 }, { status: 500 })
  }
}
