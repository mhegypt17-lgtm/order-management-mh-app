// Tier 1 "Customer Intelligence" scoring — RFM, lifecycle stage, health
// score, and churn risk, all computed in-memory from data already collected
// (orders, complaints, feedback). No new data collection, no external calls.
//
// Every threshold/weight below is settings-driven (CustomerIntelligenceConfig,
// stored in order_settings.customerIntelligence) rather than hardcoded, so
// tuning the formulas later is an admin-settings edit, not a code change.
//
// Hidden feature (2026-09) — not yet linked from any nav/role. Visibility
// will be decided later; for now only reachable via direct URL
// (/admin/customer-intelligence).

export interface CustomerIntelligenceConfig {
  /** Master switch — mirrors RetentionConfig.enabled. */
  enabled: boolean
  rfm: {
    /** Ascending days-since-last-order cutoffs for Recency score 5→1. */
    recencyThresholdsDays: [number, number, number, number]
    /** Ascending order-count cutoffs for Frequency score 1→5. */
    frequencyThresholds: [number, number, number, number]
    /** Ascending lifetime-revenue (EGP) cutoffs for Monetary score 1→5. */
    monetaryThresholds: [number, number, number, number]
  }
  lifecycle: {
    /** <= this many completed orders AND age since first order <= newMaxAgeDays => "New". */
    newMaxOrders: number
    newMaxAgeDays: number
    /** >= these => "VIP" (either condition, not both). */
    vipMinOrders: number
    vipMinRevenue: number
    /** current gap > typicalInterval * this => "At Risk". */
    atRiskGapMultiplier: number
    /** current gap > typicalInterval * this => "Dormant". */
    dormantGapMultiplier: number
    /** A dormant/at-risk customer who just ordered within this many days => "Reactivated". */
    reactivatedWindowDays: number
  }
  healthScore: {
    /** Relative weights of the 6 components — normalized automatically, don't need to sum to 1. */
    weights: {
      recency: number
      frequency: number
      monetary: number
      retention: number
      complaints: number
      survey: number
    }
    /** Points deducted (0-100 scale) per complaint, by priority. */
    complaintSeverityPenalty: { low: number; medium: number; high: number }
    /** Extra multiplier applied to a complaint's penalty while still open/in-progress. */
    unresolvedComplaintMultiplier: number
    /** Survey component used for customers with zero feedback rows (neutral, not punitive). */
    neutralSurveyScore: number
  }
  opportunities: {
    /** Revenue increase (%) over the trailing 3 orders vs. prior average to flag "Spending Up". */
    spendingUpMinIncreasePct: number
    /** How far back a "reactivated" order still counts for the Opportunities list. */
    reactivationLookbackDays: number
  }
}

export const DEFAULT_CUSTOMER_INTELLIGENCE_CONFIG: CustomerIntelligenceConfig = {
  enabled: true,
  rfm: {
    recencyThresholdsDays: [7, 21, 45, 90],
    frequencyThresholds: [1, 3, 6, 10],
    monetaryThresholds: [500, 1500, 4000, 8000],
  },
  lifecycle: {
    newMaxOrders: 1,
    newMaxAgeDays: 30,
    vipMinOrders: 8,
    vipMinRevenue: 6000,
    atRiskGapMultiplier: 1.5,
    dormantGapMultiplier: 3,
    reactivatedWindowDays: 14,
  },
  healthScore: {
    weights: { recency: 0.25, frequency: 0.2, monetary: 0.15, retention: 0.15, complaints: 0.15, survey: 0.1 },
    complaintSeverityPenalty: { low: 5, medium: 12, high: 25 },
    unresolvedComplaintMultiplier: 1.5,
    neutralSurveyScore: 75,
  },
  opportunities: {
    spendingUpMinIncreasePct: 20,
    reactivationLookbackDays: 30,
  },
}

export type LifecycleStage =
  | 'جديد'
  | 'قيد التطور'
  | 'نشط'
  | 'VIP'
  | 'في خطر'
  | 'خامل'
  | 'تم استرجاعه'

export interface CustomerIntelligenceInput {
  customerId: string
  /** Non-cancelled orders only, oldest→newest not required. */
  orders: Array<{ createdAt: string; orderTotal: number }>
  complaints: Array<{ priority: 'low' | 'medium' | 'high'; status: 'open' | 'in-progress' | 'closed' }>
  /** Per-order feedback rows for this customer. */
  feedback: Array<{
    rating: number
    dimensionScores: number[] // already-resolved 1..5 scores for whichever dimensions were answered
  }>
  now?: number
}

export interface CustomerIntelligenceResult {
  rfm: { r: number; f: number; m: number; label: string }
  lifecycleStage: LifecycleStage
  healthScore: number
  healthBreakdown: {
    recency: number
    frequency: number
    monetary: number
    retention: number
    complaints: number
    survey: number
  }
  churnRisk: 'Low' | 'Medium' | 'High'
  retentionPct: number
  daysSinceLastOrder: number | null
  typicalIntervalDays: number | null
  totalOrders: number
  totalRevenue: number
  cohortMonth: string | null
}

function scoreDescending(value: number, thresholds: [number, number, number, number]): number {
  if (value <= thresholds[0]) return 5
  if (value <= thresholds[1]) return 4
  if (value <= thresholds[2]) return 3
  if (value <= thresholds[3]) return 2
  return 1
}

function scoreAscending(value: number, thresholds: [number, number, number, number]): number {
  if (value <= thresholds[0]) return 1
  if (value <= thresholds[1]) return 2
  if (value <= thresholds[2]) return 3
  if (value <= thresholds[3]) return 4
  return 5
}

/** Median gap (days) between consecutive orders, sorted oldest→newest. */
function typicalIntervalDays(sortedTimestamps: number[]): number | null {
  if (sortedTimestamps.length < 2) return null
  const gaps: number[] = []
  for (let i = 1; i < sortedTimestamps.length; i++) {
    gaps.push((sortedTimestamps[i] - sortedTimestamps[i - 1]) / 86400000)
  }
  gaps.sort((a, b) => a - b)
  const mid = Math.floor(gaps.length / 2)
  return gaps.length % 2 === 0 ? (gaps[mid - 1] + gaps[mid]) / 2 : gaps[mid]
}

export function computeCustomerIntelligence(
  input: CustomerIntelligenceInput,
  config: CustomerIntelligenceConfig = DEFAULT_CUSTOMER_INTELLIGENCE_CONFIG,
): CustomerIntelligenceResult {
  const now = input.now ?? Date.now()
  const timestamps = input.orders
    .map((o) => new Date(o.createdAt).getTime())
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b)

  const totalOrders = timestamps.length
  const totalRevenue = input.orders.reduce((s, o) => s + (Number(o.orderTotal) || 0), 0)
  const lastOrderTs = timestamps[timestamps.length - 1] ?? null
  const firstOrderTs = timestamps[0] ?? null
  const daysSinceLastOrder = lastOrderTs != null ? Math.floor((now - lastOrderTs) / 86400000) : null
  const ageDays = firstOrderTs != null ? Math.floor((now - firstOrderTs) / 86400000) : null
  const typicalInterval = typicalIntervalDays(timestamps)

  // ── RFM ──────────────────────────────────────────────────────────────────
  const r = daysSinceLastOrder == null ? 1 : scoreDescending(daysSinceLastOrder, config.rfm.recencyThresholdsDays)
  const f = scoreAscending(totalOrders, config.rfm.frequencyThresholds)
  const m = scoreAscending(totalRevenue, config.rfm.monetaryThresholds)
  const rfm = { r, f, m, label: `${r}${f}${m}` }

  // ── Lifecycle stage ──────────────────────────────────────────────────────
  let lifecycleStage: LifecycleStage
  const gapRatio = typicalInterval && typicalInterval > 0 && daysSinceLastOrder != null
    ? daysSinceLastOrder / typicalInterval
    : null
  const justReactivated =
    daysSinceLastOrder != null && daysSinceLastOrder <= config.lifecycle.reactivatedWindowDays && totalOrders >= 2

  if (totalOrders === 0) {
    lifecycleStage = 'جديد'
  } else if (
    totalOrders >= config.lifecycle.vipMinOrders ||
    totalRevenue >= config.lifecycle.vipMinRevenue
  ) {
    lifecycleStage = 'VIP'
  } else if (gapRatio != null && gapRatio > config.lifecycle.dormantGapMultiplier) {
    lifecycleStage = justReactivated ? 'تم استرجاعه' : 'خامل'
  } else if (gapRatio != null && gapRatio > config.lifecycle.atRiskGapMultiplier) {
    lifecycleStage = 'في خطر'
  } else if (totalOrders <= config.lifecycle.newMaxOrders && (ageDays ?? 0) <= config.lifecycle.newMaxAgeDays) {
    lifecycleStage = 'جديد'
  } else if (totalOrders <= config.lifecycle.newMaxOrders) {
    lifecycleStage = 'قيد التطور'
  } else {
    lifecycleStage = 'نشط'
  }

  // ── Health score components (each 0-100) ────────────────────────────────
  const recencyComponent = r * 20
  const frequencyComponent = f * 20
  const monetaryComponent = m * 20

  const retentionComponent =
    typicalInterval && typicalInterval > 0 && daysSinceLastOrder != null
      ? Math.max(0, Math.min(100, 100 - (daysSinceLastOrder / typicalInterval - 1) * 100))
      : totalOrders <= 1
        ? 100
        : 50

  const complaintPenalty = input.complaints.reduce((sum, c) => {
    const base = config.healthScore.complaintSeverityPenalty[c.priority] ?? 0
    const mult = c.status === 'closed' ? 1 : config.healthScore.unresolvedComplaintMultiplier
    return sum + base * mult
  }, 0)
  const complaintsComponent = Math.max(0, 100 - complaintPenalty)

  const surveyComponent =
    input.feedback.length === 0
      ? config.healthScore.neutralSurveyScore
      : input.feedback.reduce((sum, fb) => {
          const scores = [fb.rating, ...fb.dimensionScores].filter((v) => Number.isFinite(v) && v > 0)
          const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : fb.rating
          return sum + avg * 20
        }, 0) / input.feedback.length

  const w = config.healthScore.weights
  const weightSum = w.recency + w.frequency + w.monetary + w.retention + w.complaints + w.survey || 1
  const healthScore = Math.round(
    (w.recency * recencyComponent +
      w.frequency * frequencyComponent +
      w.monetary * monetaryComponent +
      w.retention * retentionComponent +
      w.complaints * complaintsComponent +
      w.survey * surveyComponent) /
      weightSum,
  )

  const churnRisk: CustomerIntelligenceResult['churnRisk'] =
    healthScore >= 70 ? 'Low' : healthScore >= 45 ? 'Medium' : 'High'

  const cohortMonth = firstOrderTs != null ? new Date(firstOrderTs).toISOString().slice(0, 7) : null

  return {
    rfm,
    lifecycleStage,
    healthScore,
    healthBreakdown: {
      recency: Math.round(recencyComponent),
      frequency: Math.round(frequencyComponent),
      monetary: Math.round(monetaryComponent),
      retention: Math.round(retentionComponent),
      complaints: Math.round(complaintsComponent),
      survey: Math.round(surveyComponent),
    },
    churnRisk,
    retentionPct: Math.round(retentionComponent),
    daysSinceLastOrder,
    typicalIntervalDays: typicalInterval != null ? Math.round(typicalInterval) : null,
    totalOrders,
    totalRevenue,
    cohortMonth,
  }
}
