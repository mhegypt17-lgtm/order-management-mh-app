import { NextResponse } from 'next/server'
import { unstable_noStore as noStore } from 'next/cache'
import { supabase } from '@/lib/supabase'
import { readOrderSettings } from '@/lib/omsData'
import { cairoDateString, cairoFirstDayOfMonth, cairoPreviousMonthRange } from '@/lib/cairoTime'

// On-demand only (button click on the reports page) — never polled/auto-run,
// so there is no egress concern in making this always-fresh.
export const dynamic = 'force-dynamic'

type MegaOrderRow = { agent: string; mega_orders_count: number }

/**
 * "Mega Orders" per-agent count for a single [start, end] (inclusive,
 * "YYYY-MM-DD") orderDate range. Delegates the actual filtering/GROUP BY to
 * the `get_mega_orders_summary` Postgres function (data/mega-orders-migration.sql)
 * so only the small aggregated result set (one row per agent) crosses the
 * wire — NOT every matching order row.
 */
async function fetchMegaOrders(threshold: number, start: string, end: string) {
  const { data, error } = await supabase.rpc('get_mega_orders_summary', {
    p_threshold: threshold,
    p_start_date: start,
    p_end_date: end,
  })

  if (error) {
    throw new Error(error.message)
  }

  const rows = (Array.isArray(data) ? (data as MegaOrderRow[]) : []).map((row) => ({
    agent: row.agent || 'غير معروف',
    count: Number(row.mega_orders_count) || 0,
  }))

  return rows
}

function monthLabel(dateStr: string, isCurrentMonth: boolean): string {
  const label = new Date(`${dateStr}T00:00:00Z`).toLocaleDateString('ar-EG', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
  return isCurrentMonth ? `${label} (حتى الآن)` : label
}

export async function GET() {
  noStore()
  try {
    const settings = await readOrderSettings()
    const threshold = Math.max(1, Number(settings.megaOrderThreshold) || 3000)

    const today = cairoDateString()
    const currentStart = cairoFirstDayOfMonth()
    const prev = cairoPreviousMonthRange()

    const [currentRows, previousRows] = await Promise.all([
      fetchMegaOrders(threshold, currentStart, today),
      fetchMegaOrders(threshold, prev.start, prev.end),
    ])

    return NextResponse.json({
      threshold,
      currentMonth: {
        start: currentStart,
        end: today,
        label: monthLabel(currentStart, true),
        rows: currentRows,
      },
      previousMonth: {
        start: prev.start,
        end: prev.end,
        label: monthLabel(prev.start, false),
        rows: previousRows,
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to compute mega orders summary', details: error?.message },
      { status: 500 },
    )
  }
}
