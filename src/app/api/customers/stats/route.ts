import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// Returns counts of customers by status — used by the admin dashboard.
export async function GET() {
  try {
    const [activeRes, warnRes, suspRes] = await Promise.all([
      supabase.from('customers').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('customers').select('id', { count: 'exact', head: true }).eq('status', 'warning'),
      supabase.from('customers').select('id', { count: 'exact', head: true }).eq('status', 'suspended'),
    ])
    return NextResponse.json({
      active: activeRes.count || 0,
      warning: warnRes.count || 0,
      suspended: suspRes.count || 0,
    })
  } catch (err) {
    console.error('customers/stats error:', err)
    return NextResponse.json({ active: 0, warning: 0, suspended: 0 })
  }
}
