import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { FEEDBACK_DIMENSIONS } from '@/lib/feedbackDimensions'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// Server-side aggregation so the dashboard doesn't pull every feedback
// row + every delivered order over the network. Returns:
//   { avgRating, count, collectionRatePct, satisfactionPct, byRating, perAgent, recentLowRatings }
//
// Range defaults to the current calendar month if `from`/`to` not given.
export async function GET(req: NextRequest) {
  try {
    const url = req.nextUrl
    const today = new Date()
    const defaultFrom = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10)
    const defaultTo = today.toISOString().slice(0, 10)
    const from = url.searchParams.get('from') || defaultFrom
    const to = url.searchParams.get('to') || defaultTo
    const includeRecent = url.searchParams.get('recent') === '1'

    const fromIso = new Date(from).toISOString()
    const toEnd = new Date(to)
    toEnd.setHours(23, 59, 59, 999)
    const toIso = toEnd.toISOString()

    // 1) Pull feedback rows in range — include all 7 dimension columns so
    //    we can aggregate them server-side. Comments still excluded to keep
    //    payload small (use /api/feedback?from=&to= to pull full rows).
    const dimCols = FEEDBACK_DIMENSIONS.map((d) => `"${d.key}"`).join(',')
    const { data: rows, error: fbErr } = await supabase
      .from('order_feedback')
      .select(`id,orderId,rating,collectedBy,collectedAt,followUpRequired,${dimCols}`)
      .gte('collectedAt', fromIso)
      .lte('collectedAt', toIso)
    if (fbErr) {
      return NextResponse.json({ error: 'feedback read failed', details: fbErr.message }, { status: 500 })
    }
    const feedback = (rows || []) as Array<{
      id: string
      orderId: string
      rating: number
      collectedBy: string
      collectedAt: string
      followUpRequired: boolean
      [key: string]: unknown
    }>

    // 2) Count delivered orders in the same range — head-only, no payload.
    //    `deliveredAt` is set on the delivery row when status flips to "تم التوصيل".
    const { count: deliveredCount } = await supabase
      .from('order_delivery')
      .select('id', { count: 'exact', head: true })
      .eq('deliveryStatus', 'تم التوصيل')
      .gte('deliveredAt', fromIso)
      .lte('deliveredAt', toIso)

    const count = feedback.length
    const avgRating = count > 0 ? feedback.reduce((s, r) => s + (r.rating || 0), 0) / count : 0
    const collectionRatePct =
      deliveredCount && deliveredCount > 0 ? (count / deliveredCount) * 100 : 0
    const satisfiedCount = feedback.filter((r) => r.rating >= 4).length
    const satisfactionPct = count > 0 ? (satisfiedCount / count) * 100 : 0

    const byRating: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    for (const r of feedback) {
      const k = r.rating as 1 | 2 | 3 | 4 | 5
      if (byRating[k] !== undefined) byRating[k] += 1
    }

    const perAgentMap = new Map<string, { agent: string; count: number; total: number }>()
    for (const r of feedback) {
      const agent = r.collectedBy || '—'
      const prev = perAgentMap.get(agent) || { agent, count: 0, total: 0 }
      prev.count += 1
      prev.total += r.rating || 0
      perAgentMap.set(agent, prev)
    }
    const perAgent = Array.from(perAgentMap.values())
      .map((a) => ({ agent: a.agent, count: a.count, avgRating: a.count > 0 ? a.total / a.count : 0 }))
      .sort((a, b) => b.count - a.count)

    // 3) Per-dimension distributions. For each of the 7 dimensions we
    //    return { [optionValue]: count, _answered: <how many rows answered> }.
    //    Front-end uses _answered to compute % share within respondents,
    //    not over the full feedback count (so unanswered rows don't dilute).
    const byDimension: Record<
      string,
      { answered: number; counts: Record<string, number> }
    > = {}
    for (const dim of FEEDBACK_DIMENSIONS) {
      const counts: Record<string, number> = {}
      for (const opt of dim.options) counts[opt.value] = 0
      let answered = 0
      for (const r of feedback) {
        const v = r[dim.key]
        if (typeof v === 'string' && v.length > 0 && counts[v] !== undefined) {
          counts[v] += 1
          answered += 1
        }
      }
      byDimension[dim.key] = { answered, counts }
    }

    let recentLowRatings: Array<{
      id: string
      orderId: string
      rating: number
      comment: string
      collectedAt: string
      collectedBy: string
    }> = []
    if (includeRecent) {
      const { data: low } = await supabase
        .from('order_feedback')
        .select('id,orderId,rating,comment,collectedAt,collectedBy')
        .lte('rating', 2)
        .gte('collectedAt', fromIso)
        .lte('collectedAt', toIso)
        .order('collectedAt', { ascending: false })
        .limit(5)
      recentLowRatings = (low || []) as typeof recentLowRatings
    }

    return NextResponse.json(
      {
        from,
        to,
        count,
        deliveredCount: deliveredCount ?? 0,
        avgRating: Number(avgRating.toFixed(2)),
        collectionRatePct: Number(collectionRatePct.toFixed(1)),
        satisfactionPct: Number(satisfactionPct.toFixed(1)),
        byRating,
        byDimension,
        perAgent,
        recentLowRatings,
      },
      { status: 200 },
    )
  } catch (e: any) {
    return NextResponse.json({ error: 'failed', details: e?.message }, { status: 500 })
  }
}
