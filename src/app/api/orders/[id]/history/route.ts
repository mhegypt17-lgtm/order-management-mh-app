import { NextRequest, NextResponse } from 'next/server'
import { readEditHistory } from '@/lib/omsData'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const rows = (await readEditHistory())
      .filter((r) => r.orderId === params.id)
      .sort((a, b) => (a.changedAt < b.changedAt ? 1 : -1))

    return NextResponse.json({ history: rows }, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Failed to load edit history' }, { status: 500 })
  }
}
