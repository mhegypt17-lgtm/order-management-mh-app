// Shared config for the 7 detailed feedback dimensions.
// IMPORTANT: this is the single source of truth. The modal, the detail
// card, the list page, the dashboard widget, the summary API, and the
// auto-escalation logic all import from here. Do not duplicate.

import type { OrderFeedbackRecord } from './omsData'

export type FeedbackDimensionKey =
  | 'productQuality'
  | 'packaging'
  | 'deliveryTimeliness'
  | 'customerService'
  | 'pricingValue'
  | 'appUsability'
  | 'recommendToFriends'

export type FeedbackOptionTone = 'positive' | 'good' | 'neutral' | 'negative' | 'other'

export interface FeedbackOption {
  value: string
  tone: FeedbackOptionTone
  // Numeric weight 1..5 for cross-dim comparisons; null for non-rateable
  // (e.g., recommend = yes/no, app usability = ease scale, delivery = timing).
  // Set to null when a dimension is categorical and shouldn't be averaged.
  score: number | null
}

export interface FeedbackDimension {
  key: FeedbackDimensionKey
  label: string                 // Arabic label
  icon: string
  options: FeedbackOption[]
  hasOther?: boolean            // packaging + customerService
  otherField?: 'packagingOther' | 'customerServiceOther'
  // If the customer's answer matches any value in escalateOn, the API
  // auto-creates a complaint (in addition to overall rating <= 2).
  escalateOn: string[]
}

export const FEEDBACK_DIMENSIONS: FeedbackDimension[] = [
  {
    key: 'productQuality',
    label: 'جودة المنتج',
    icon: '🥩',
    options: [
      { value: 'جودة عالية جداً', tone: 'positive', score: 5 },
      { value: 'جودة عالية', tone: 'good', score: 4 },
      { value: 'جودة منخفضة', tone: 'negative', score: 2 },
      { value: 'جودة منخفضة جداً', tone: 'negative', score: 1 },
    ],
    escalateOn: ['جودة منخفضة', 'جودة منخفضة جداً'],
  },
  {
    key: 'packaging',
    label: 'التغليف',
    icon: '📦',
    options: [
      { value: 'ممتاز', tone: 'positive', score: 5 },
      { value: 'جيد جداً', tone: 'good', score: 4 },
      { value: 'جيد', tone: 'neutral', score: 3 },
      { value: 'غير مقبول', tone: 'negative', score: 1 },
      { value: 'أخرى', tone: 'other', score: null },
    ],
    hasOther: true,
    otherField: 'packagingOther',
    escalateOn: ['غير مقبول'],
  },
  {
    key: 'deliveryTimeliness',
    label: 'خدمة التوصيل',
    icon: '🚚',
    options: [
      { value: 'مبكراً', tone: 'positive', score: null },
      { value: 'في الوقت المحدد', tone: 'positive', score: null },
      { value: 'متأخر', tone: 'negative', score: null },
      { value: 'متأخر جداً', tone: 'negative', score: null },
    ],
    escalateOn: ['متأخر جداً'],
  },
  {
    key: 'customerService',
    label: 'خدمة العملاء',
    icon: '🎧',
    options: [
      { value: 'ممتاز', tone: 'positive', score: 5 },
      { value: 'جيد جداً', tone: 'good', score: 4 },
      { value: 'جيد', tone: 'neutral', score: 3 },
      { value: 'ضعيف', tone: 'negative', score: 1 },
      { value: 'أخرى', tone: 'other', score: null },
    ],
    hasOther: true,
    otherField: 'customerServiceOther',
    escalateOn: ['ضعيف'],
  },
  {
    key: 'pricingValue',
    label: 'الأسعار والعروض',
    icon: '💰',
    options: [
      { value: 'ممتاز', tone: 'positive', score: 5 },
      { value: 'جيد جداً', tone: 'good', score: 4 },
      { value: 'جيد', tone: 'neutral', score: 3 },
      { value: 'ضعيف', tone: 'negative', score: 1 },
    ],
    escalateOn: [],
  },
  {
    key: 'appUsability',
    label: 'سهولة استخدام التطبيق',
    icon: '📱',
    options: [
      { value: 'سهل الاستخدام', tone: 'positive', score: null },
      { value: 'ليس سهلاً ولا صعباً', tone: 'neutral', score: null },
      { value: 'صعب الاستخدام', tone: 'negative', score: null },
    ],
    escalateOn: [],
  },
  {
    key: 'recommendToFriends',
    label: 'ترشيح ميت هاوس للأصدقاء',
    icon: '👍',
    options: [
      { value: 'نعم', tone: 'positive', score: null },
      { value: 'لا', tone: 'negative', score: null },
    ],
    escalateOn: ['لا'],
  },
]

export const TONE_CLASSES: Record<FeedbackOptionTone, { chip: string; selected: string }> = {
  positive: {
    chip: 'bg-white border-gray-300 text-gray-700 hover:bg-emerald-50 hover:border-emerald-400',
    selected: 'bg-emerald-100 border-emerald-500 text-emerald-900 ring-2 ring-emerald-300',
  },
  good: {
    chip: 'bg-white border-gray-300 text-gray-700 hover:bg-green-50 hover:border-green-400',
    selected: 'bg-green-100 border-green-500 text-green-900 ring-2 ring-green-300',
  },
  neutral: {
    chip: 'bg-white border-gray-300 text-gray-700 hover:bg-yellow-50 hover:border-yellow-400',
    selected: 'bg-yellow-100 border-yellow-500 text-yellow-900 ring-2 ring-yellow-300',
  },
  negative: {
    chip: 'bg-white border-gray-300 text-gray-700 hover:bg-red-50 hover:border-red-400',
    selected: 'bg-red-100 border-red-500 text-red-900 ring-2 ring-red-300',
  },
  other: {
    chip: 'bg-white border-gray-300 text-gray-700 hover:bg-blue-50 hover:border-blue-400',
    selected: 'bg-blue-100 border-blue-500 text-blue-900 ring-2 ring-blue-300',
  },
}

export const TONE_BADGE: Record<FeedbackOptionTone, string> = {
  positive: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  good: 'bg-green-100 text-green-800 border-green-300',
  neutral: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  negative: 'bg-red-100 text-red-800 border-red-300',
  other: 'bg-blue-100 text-blue-800 border-blue-300',
}

export function findOption(
  dim: FeedbackDimension,
  value: string | null | undefined,
): FeedbackOption | null {
  if (!value) return null
  return dim.options.find((o) => o.value === value) ?? null
}

// Returns the dimensions that should auto-create a complaint based on the
// current feedback payload. The overall rating <= 2 trigger is handled
// separately in the API.
export function getEscalationReasons(
  fb: Partial<OrderFeedbackRecord>,
): Array<{ dim: FeedbackDimension; value: string }> {
  const reasons: Array<{ dim: FeedbackDimension; value: string }> = []
  for (const dim of FEEDBACK_DIMENSIONS) {
    const v = (fb as Record<string, unknown>)[dim.key] as string | null | undefined
    if (v && dim.escalateOn.includes(v)) {
      reasons.push({ dim, value: v })
    }
  }
  return reasons
}
