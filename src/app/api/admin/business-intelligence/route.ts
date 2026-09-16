import { NextResponse } from 'next/server'
import { unstable_noStore as noStore } from 'next/cache'
import { supabase } from '@/lib/supabase'

// Lifetime "Business Intelligence" aggregates (avg order interval / avg
// order value / avg orders per customer) for the main Admin dashboard.
// Pure read from business_intelligence_summary — recomputed nightly (and
// on-demand via the Customer Intelligence "تحديث الآن" button) alongside
// per-customer scores, see src/lib/customerIntelligenceRecompute.ts. Never
// recalculated on page load.
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  noStore()
  try {
    const { data, error } = await supabase
      .from('business_intelligence_summary')
      .select('*')
      .eq('id', 'global')
      .maybeSingle()

    if (error) {
      console.error('[business-intelligence] read failed:', error)
      return NextResponse.json({ error: 'Failed to read business intelligence' }, { status: 500 })
    }

    return NextResponse.json({ summary: data || null }, { status: 200 })
  } catch (err) {
    console.error('[business-intelligence] failed:', err)
    return NextResponse.json({ error: 'Failed to read business intelligence' }, { status: 500 })
  }
}
