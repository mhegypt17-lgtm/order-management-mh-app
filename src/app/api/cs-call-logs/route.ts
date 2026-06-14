import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { generateId, readCustomers } from '@/lib/omsData'
import { cairoDateString, cairoTimeString } from '@/lib/cairoTime'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// CS Call Log — every inbound inquiry CS handles (existing customer or
// prospect).
//
// GET  /api/cs-call-logs?from=YYYY-MM-DD&to=YYYY-MM-DD&q=<phone or name>
// POST /api/cs-call-logs    — body: full log row (auto-fills id/timestamps)

const TABLE = 'cs_call_logs'

function normalisePhone(p: string) {
  return String(p || '').replace(/\D/g, '')
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const from = (searchParams.get('from') || '').slice(0, 10)
    const to = (searchParams.get('to') || '').slice(0, 10)
    const q = (searchParams.get('q') || '').trim()

    let query = supabase.from(TABLE).select('*').order('createdAt', { ascending: false })

    if (from) query = query.gte('callDate', from)
    if (to) query = query.lte('callDate', to)

    // Use ilike on phone OR customerName when a search term is provided.
    // Supabase's .or() takes a comma-separated filter string.
    if (q) {
      const safe = q.replace(/[(),]/g, ' ')
      query = query.or(`phone.ilike.%${safe}%,customerName.ilike.%${safe}%,email.ilike.%${safe}%`)
    }

    const { data, error } = await query
    if (error) {
      console.error('GET /api/cs-call-logs:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ logs: data || [] })
  } catch (e: any) {
    console.error('GET /api/cs-call-logs threw:', e)
    return NextResponse.json({ error: e?.message || 'فشل تحميل السجلات' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const now = new Date().toISOString()
    const phone = String(body.phone || '').trim()

    // Best-effort link to an existing customer when their phone is on file.
    // Non-fatal if the lookup fails — prospects are still valid log entries.
    let customerId: string | null = body.customerId || null
    if (!customerId && phone) {
      try {
        const customers = await readCustomers()
        const digits = normalisePhone(phone)
        const match = customers.find((c: any) => normalisePhone(c.phone) === digits)
        if (match) customerId = match.id
      } catch (e) {
        console.warn('cs-call-logs: customer lookup failed', e)
      }
    }

    const row = {
      id: generateId('call'),
      callDate: String(body.callDate || cairoDateString()).slice(0, 10),
      callTime: String(body.callTime || cairoTimeString()).slice(0, 5),
      customerName: String(body.customerName || '').trim(),
      phone,
      email: String(body.email || '').trim(),
      inquiry: String(body.inquiry || '').trim(),
      response: String(body.response || '').trim(),
      customerId,
      loggedBy: String(body.loggedBy || '').trim(),
      createdAt: now,
      updatedAt: now,
    }

    if (!row.customerName && !row.phone) {
      return NextResponse.json(
        { error: 'يجب إدخال اسم العميل أو رقم الهاتف على الأقل' },
        { status: 400 },
      )
    }

    const { data, error } = await supabase.from(TABLE).insert(row).select().single()
    if (error) {
      console.error('POST /api/cs-call-logs:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ log: data }, { status: 201 })
  } catch (e: any) {
    console.error('POST /api/cs-call-logs threw:', e)
    return NextResponse.json({ error: e?.message || 'فشل حفظ السجل' }, { status: 500 })
  }
}
