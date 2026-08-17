import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export interface Holiday {
  id: string
  date: string // ISO date
  label: string
}

// Holidays change rarely (someone adds/removes a public-holiday date every
// few months) but the list is read on scheduling / date-picker renders across
// the app. Same Tier-1 caching pattern already used by /api/delivery-zones,
// /api/order-settings and /api/catalogues: `dynamic = 'force-dynamic'` keeps
// this route dynamically rendered (so the POST/DELETE mutations below never
// risk being edge-rejected with a 405 the way a statically-prerendered GET
// route would), while the explicit Cache-Control header still lets Vercel's
// edge share one cached response across every user/tab for up to 10 minutes.
export const dynamic = 'force-dynamic'

const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=0, s-maxage=600, stale-while-revalidate=3600',
}

// GET: List all holidays
export async function GET() {
  const { data, error } = await supabase.from('holidays').select('*').order('date', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ holidays: data || [] }, { status: 200, headers: CACHE_HEADERS })
}

// POST: Add a holiday
export async function POST(req: NextRequest) {
  try {
    const { date, label } = await req.json()
    if (!date || !label) return NextResponse.json({ error: 'Missing date or label' }, { status: 400 })
    const id = `holiday_${date}_${Math.random().toString(36).substr(2, 6)}`
    const { error } = await supabase.from('holidays').insert([{ id, date, label }])
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}

// DELETE: Remove a holiday by id
export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    const { error } = await supabase.from('holidays').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
