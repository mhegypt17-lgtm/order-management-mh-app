'use client'

// Tier 1 "Customer Intelligence" — hidden feature (2026-09).
// Not linked from any nav yet (visibility for admin/CS/branch to be decided
// later) — reachable only via direct URL. Read-only: computes RFM /
// lifecycle stage / health score / churn risk from data already collected
// (orders, complaints, feedback). See src/lib/customerIntelligence.ts for
// the formulas (all settings-driven, not hardcoded).
//
// Mobile-adaptable layout mirrors the CRM view's sidebar/detail toggle
// pattern (list hides on mobile once a customer is selected, back button
// returns to the list) so it's consistent with the rest of the app.

import { useEffect, useMemo, useState } from 'react'

interface CustomerIntel {
  id: string
  customerName: string
  phone: string
  rfm: { r: number; f: number; m: number; label: string }
  lifecycleStage: string
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
  isReactivatedOpportunity: boolean
  isSpendingUp: boolean
}

interface ApiResponse {
  generatedAt: string
  opportunities: { atRisk: number; reactivated: number; spendingUp: number }
  customers: CustomerIntel[]
}

const STAGE_COLORS: Record<string, string> = {
  'VIP': 'bg-amber-100 text-amber-800 border border-amber-300',
  'نشط': 'bg-emerald-100 text-emerald-800 border border-emerald-300',
  'جديد': 'bg-blue-100 text-blue-800 border border-blue-300',
  'قيد التطور': 'bg-sky-100 text-sky-800 border border-sky-300',
  'في خطر': 'bg-orange-100 text-orange-800 border border-orange-300',
  'خامل': 'bg-gray-200 text-gray-700 border border-gray-300',
  'تم استرجاعه': 'bg-purple-100 text-purple-800 border border-purple-300',
}

const CHURN_COLORS: Record<CustomerIntel['churnRisk'], string> = {
  Low: 'bg-emerald-100 text-emerald-800',
  Medium: 'bg-amber-100 text-amber-800',
  High: 'bg-red-100 text-red-800',
}

const HEALTH_LABELS: Record<keyof CustomerIntel['healthBreakdown'], string> = {
  recency: 'الحداثة',
  frequency: 'التكرار',
  monetary: 'الإنفاق',
  retention: 'الاستمرارية',
  complaints: 'الشكاوى',
  survey: 'التقييمات',
}

function healthColor(score: number) {
  if (score >= 70) return 'text-emerald-600'
  if (score >= 45) return 'text-amber-600'
  return 'text-red-600'
}

export default function CustomerIntelligencePage() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [data, setData] = useState<ApiResponse | null>(null)
  const [search, setSearch] = useState('')
  const [opportunityFilter, setOpportunityFilter] = useState<'all' | 'atRisk' | 'reactivated' | 'spendingUp'>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/customer-intelligence', { cache: 'no-store' })
      const json = await res.json()
      setData(json)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  // Scores are computed nightly by the cron job — this only asks the server
  // to run that same recompute early, then re-reads the (now fresh) table.
  const handleRefreshNow = async () => {
    setRefreshing(true)
    try {
      await fetch('/api/admin/customer-intelligence', { method: 'POST' })
      await load()
    } finally {
      setRefreshing(false)
    }
  }

  const filtered = useMemo(() => {
    if (!data) return []
    let list = data.customers
    if (opportunityFilter === 'atRisk') list = list.filter((c) => c.lifecycleStage === 'في خطر')
    if (opportunityFilter === 'reactivated') list = list.filter((c) => c.isReactivatedOpportunity)
    if (opportunityFilter === 'spendingUp') list = list.filter((c) => c.isSpendingUp)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((c) => c.customerName.toLowerCase().includes(q) || c.phone.includes(q))
    }
    return list.slice().sort((a, b) => a.healthScore - b.healthScore)
  }, [data, search, opportunityFilter])

  const selected = filtered.find((c) => c.id === selectedId) || data?.customers.find((c) => c.id === selectedId) || null

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* ── Header + Today's Opportunities ──────────────────────────────── */}
      <div className="p-4 bg-white border-b border-gray-200">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <h1 className="text-lg font-bold text-gray-900">🧠 ذكاء العملاء (تجريبي)</h1>
          <div className="flex items-center gap-2">
            {data?.generatedAt && (
              <span className="text-xs text-gray-400">
                آخر تحديث: {new Date(data.generatedAt).toLocaleString('ar-EG')}
              </span>
            )}
            <button
              type="button"
              onClick={handleRefreshNow}
              disabled={refreshing}
              className="text-xs bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-700 font-bold px-2 py-1 rounded"
            >
              {refreshing ? '⏳ جاري التحديث...' : '🔄 تحديث الآن'}
            </button>
          </div>
        </div>
        {loading ? (
          <div className="text-sm text-gray-500">⏳ جاري التحميل...</div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setOpportunityFilter(opportunityFilter === 'atRisk' ? 'all' : 'atRisk')}
              className={`rounded-lg border p-2 text-center transition-colors ${
                opportunityFilter === 'atRisk' ? 'bg-orange-100 border-orange-400' : 'bg-orange-50 border-orange-200 hover:bg-orange-100'
              }`}
            >
              <div className="text-xl font-bold text-orange-700">{data?.opportunities.atRisk ?? 0}</div>
              <div className="text-xs text-orange-800">عملاء في خطر</div>
            </button>
            <button
              type="button"
              onClick={() => setOpportunityFilter(opportunityFilter === 'reactivated' ? 'all' : 'reactivated')}
              className={`rounded-lg border p-2 text-center transition-colors ${
                opportunityFilter === 'reactivated' ? 'bg-purple-100 border-purple-400' : 'bg-purple-50 border-purple-200 hover:bg-purple-100'
              }`}
            >
              <div className="text-xl font-bold text-purple-700">{data?.opportunities.reactivated ?? 0}</div>
              <div className="text-xs text-purple-800">تم استرجاعهم</div>
            </button>
            <div className="rounded-lg border p-2 text-center bg-emerald-50 border-emerald-200">
              <div className="text-xl font-bold text-emerald-700">{data?.opportunities.spendingUp ?? 0}</div>
              <div className="text-xs text-emerald-800">إنفاق متزايد</div>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Sidebar: Customer List ────────────────────────────────────── */}
        <div className={`${selectedId ? 'hidden md:flex' : 'flex'} w-full md:w-80 flex-shrink-0 border-l border-gray-200 bg-white flex-col`}>
          <div className="p-3 border-b border-gray-200">
            <input
              type="text"
              placeholder="بحث بالاسم أو الهاتف..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-gray-500 text-sm">⏳ جاري التحميل...</div>
            ) : filtered.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">لا يوجد عملاء</div>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full text-right px-3 py-3 border-b border-gray-100 hover:bg-red-50 transition-colors ${selectedId === c.id ? 'bg-red-50 border-r-4 border-r-red-500' : ''}`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap ${STAGE_COLORS[c.lifecycleStage] || 'bg-gray-100 text-gray-700'}`}>
                      {c.lifecycleStage}
                    </span>
                    <span className="font-semibold text-sm text-gray-900 truncate">{c.customerName}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1 text-right">{c.phone}</div>
                  <div className="flex justify-between items-center mt-1">
                    <span className={`text-xs font-bold ${healthColor(c.healthScore)}`}>{c.healthScore}/100</span>
                    <span className="text-xs text-gray-600">RFM {c.rfm.label}</span>
                  </div>
                </button>
              ))
            )}
          </div>
          <div className="p-2 text-xs text-center text-gray-400 border-t border-gray-100">
            {filtered.length} عميل
          </div>
        </div>

        {/* ── Detail Panel ──────────────────────────────────────────────── */}
        <div className={`${selectedId ? 'flex' : 'hidden md:flex'} flex-1 flex-col overflow-y-auto bg-gray-50`}>
          {selectedId && (
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="md:hidden flex items-center gap-1 px-4 py-3 text-sm font-semibold text-gray-700 border-b border-gray-200 bg-white"
            >
              → رجوع لقائمة العملاء
            </button>
          )}
          {!selected ? (
            <div className="flex items-center justify-center h-full text-gray-400">
              <div className="text-center">
                <div className="text-5xl mb-4">🧠</div>
                <p className="text-lg">اختر عميلاً من القائمة</p>
              </div>
            </div>
          ) : (
            <div className="p-4 md:p-5 space-y-4">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                  <h2 className="text-xl font-bold text-gray-900">{selected.customerName}</h2>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-sm font-bold ${STAGE_COLORS[selected.lifecycleStage] || 'bg-gray-100 text-gray-700'}`}>
                      {selected.lifecycleStage}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-sm font-bold ${CHURN_COLORS[selected.churnRisk]}`}>
                      مخاطرة فقدان: {selected.churnRisk === 'Low' ? 'منخفضة' : selected.churnRisk === 'Medium' ? 'متوسطة' : 'عالية'}
                    </span>
                  </div>
                </div>
                <div className="text-sm text-gray-500">{selected.phone}</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <div className="text-lg font-bold text-gray-900">{selected.totalOrders}</div>
                    <div className="text-xs text-gray-500">إجمالي الطلبات</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <div className="text-lg font-bold text-gray-900">{selected.totalRevenue.toLocaleString('en-US')} ج.م</div>
                    <div className="text-xs text-gray-500">إجمالي الإنفاق</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <div className="text-lg font-bold text-gray-900">{selected.daysSinceLastOrder ?? '—'}</div>
                    <div className="text-xs text-gray-500">يوم منذ آخر طلب</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <div className="text-lg font-bold text-gray-900">{selected.typicalIntervalDays ?? '—'}</div>
                    <div className="text-xs text-gray-500">معدل التكرار المعتاد (يوم)</div>
                  </div>
                </div>
              </div>

              {/* ── Health Score ─────────────────────────────────────────── */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-gray-800">مؤشر صحة العميل</h3>
                  <div className={`text-3xl font-extrabold ${healthColor(selected.healthScore)}`}>{selected.healthScore}/100</div>
                </div>
                <div className="space-y-2">
                  {(Object.keys(selected.healthBreakdown) as Array<keyof CustomerIntel['healthBreakdown']>).map((k) => (
                    <div key={k}>
                      <div className="flex justify-between text-xs text-gray-600 mb-0.5">
                        <span>{selected.healthBreakdown[k]}</span>
                        <span>{HEALTH_LABELS[k]}</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div
                          className="h-2 rounded-full bg-red-500"
                          style={{ width: `${Math.max(0, Math.min(100, selected.healthBreakdown[k]))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── RFM ──────────────────────────────────────────────────── */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <h3 className="font-bold text-gray-800 mb-3">RFM Score</h3>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <div className="text-2xl font-bold text-gray-900">{selected.rfm.r}</div>
                    <div className="text-xs text-gray-500">Recency (الحداثة)</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-gray-900">{selected.rfm.f}</div>
                    <div className="text-xs text-gray-500">Frequency (التكرار)</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-gray-900">{selected.rfm.m}</div>
                    <div className="text-xs text-gray-500">Monetary (الإنفاق)</div>
                  </div>
                </div>
                <div className="text-center text-xs text-gray-400 mt-3">
                  الاحتفاظ (Retention): {selected.retentionPct}% · مجموعة الانضمام: {selected.cohortMonth || '—'}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
