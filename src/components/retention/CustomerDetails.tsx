'use client'

import { useState } from 'react'

type Details = {
  favourites: Array<{ name: string; quantity: number }>
  lastOrder: { date: string; total: number; type: string | null; items: Array<{ name: string; quantity: number }> } | null
  isB2B: boolean
  wallet: number
  status: string
  statusReason: string | null
  survey: {
    count: number
    avg: number | null
    lastRating: number | null
    lastComment: string | null
    lastDate: string | null
    dimensions: Array<{ label: string; score: number }>
    weakDimension: { label: string; score: number } | null
    recommend: string | null
    followUpRequired: boolean
  } | null
  complaints: {
    count: number
    open: number
    totalCompensation: number
    last: { reason: string | null; subject: string | null; status: string; date: string | null }
  } | null
  intel: {
    lifecycleStage: string | null
    r: number | null
    f: number | null
    m: number | null
    healthScore: number | null
    healthBreakdown: Record<string, number> | null
    retentionPct: number | null
    cohortMonth: string | null
    isReactivated: boolean
    isSpendingUp: boolean
  } | null
  contacts: Array<{ at: string; agent: string; result: string; reason: string | null; note: string | null }>
  opening: string
}

const date = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('ar-EG', { timeZone: 'Africa/Cairo' }) : '—')

const HEALTH_LABELS: Record<string, string> = {
  recency: 'الحداثة', frequency: 'التكرار', monetary: 'الإنفاق', retention: 'الاحتفاظ', complaints: 'الشكاوى', survey: 'الاستبيان',
}

export default function CustomerDetails({
  customerId,
  name,
  days,
  audience,
}: {
  customerId: string
  name: string
  days: number
  /** CS sees talking points only; admin also sees scores and health breakdown. */
  audience: 'admin' | 'cs'
}) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<Details | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')

  const load = async () => {
    setState('loading')
    try {
      const res = await fetch(`/api/retention/customers/${encodeURIComponent(customerId)}?days=${days}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('failed')
      setData(await res.json())
      setState('idle')
    } catch {
      setState('error')
    }
  }

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next && !data && state !== 'loading') void load()
  }

  return (
    <>
      <button type="button" onClick={toggle} className="mt-1 text-xs text-indigo-700 underline hover:text-indigo-900">
        📋 تفاصيل وما يُقال في المكالمة
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex" dir="rtl">
          <div className="flex-1 bg-black/30" onClick={() => setOpen(false)} />
          <aside className="w-full max-w-md bg-white shadow-2xl overflow-y-auto p-4 space-y-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-bold text-gray-900 text-base">{name || '—'}</div>
                <div className="text-xs text-gray-500">{days} يوم بدون طلب</div>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="text-gray-500 hover:text-gray-800 text-lg leading-none">✕</button>
            </div>

            {state === 'loading' && <div className="text-gray-500">⏳ جاري التحميل...</div>}
            {state === 'error' && (
              <div className="text-red-700">
                تعذر التحميل. <button type="button" className="underline" onClick={load}>إعادة المحاولة</button>
              </div>
            )}

            {data && (
              <>
                <section className="rounded-lg bg-emerald-50 border border-emerald-200 p-3">
                  <div className="text-xs font-bold text-emerald-800 mb-1">💬 جملة افتتاحية مقترحة</div>
                  <div className="text-gray-900">{data.opening}</div>
                </section>

                {(data.status !== 'active' || data.isB2B || data.wallet > 0) && (
                  <section className="flex flex-wrap gap-1.5">
                    {data.status !== 'active' && (
                      <span className="px-2 py-0.5 rounded bg-red-100 text-red-800 text-xs">
                        ⛔ {data.status === 'suspended' ? 'موقوف' : 'تحذير'}{data.statusReason ? `: ${data.statusReason}` : ''}
                      </span>
                    )}
                    {data.isB2B && <span className="px-2 py-0.5 rounded bg-sky-100 text-sky-800 text-xs">🏢 عميل B2B</span>}
                    {data.wallet > 0 && (
                      <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-xs">💳 رصيد محفظة {Math.round(data.wallet)} ج.م</span>
                    )}
                  </section>
                )}

                <section>
                  <div className="text-xs font-bold text-gray-700 mb-1">🥩 الأكثر طلباً</div>
                  {data.favourites.length === 0 ? (
                    <div className="text-gray-400">—</div>
                  ) : (
                    <ul className="space-y-0.5">
                      {data.favourites.map((f) => (
                        <li key={f.name}>{f.name} <span className="text-gray-500">({f.quantity})</span></li>
                      ))}
                    </ul>
                  )}
                </section>

                {data.lastOrder && (
                  <section>
                    <div className="text-xs font-bold text-gray-700 mb-1">🧾 آخر طلب — {date(data.lastOrder.date)} · {Math.round(data.lastOrder.total)} ج.م{data.lastOrder.type ? ` · ${data.lastOrder.type}` : ''}</div>
                    <div className="text-gray-700">{data.lastOrder.items.map((i) => `${i.name} (${i.quantity})`).join('، ') || '—'}</div>
                  </section>
                )}

                {data.complaints && (
                  <section className={`rounded-lg border p-2 ${data.complaints.open > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
                    <div className="text-xs font-bold text-gray-700 mb-1">
                      🎫 الشكاوى: {data.complaints.count}{data.complaints.open > 0 ? ` (مفتوحة ${data.complaints.open})` : ''}
                      {data.complaints.totalCompensation > 0 ? ` · تعويضات ${Math.round(data.complaints.totalCompensation)} ج.م` : ''}
                    </div>
                    <div className="text-gray-700">
                      آخر شكوى ({date(data.complaints.last.date)}): {data.complaints.last.reason || data.complaints.last.subject || '—'} — {data.complaints.last.status === 'closed' ? 'مغلقة' : 'مفتوحة'}
                    </div>
                  </section>
                )}

                {data.survey && (
                  <section>
                    <div className="text-xs font-bold text-gray-700 mb-1">
                      ⭐ الاستبيان: متوسط {data.survey.avg ?? '—'} ({data.survey.count}) · آخر تقييم {data.survey.lastRating ?? '—'} · {date(data.survey.lastDate)}
                    </div>
                    {data.survey.dimensions.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-1">
                        {data.survey.dimensions.map((d) => (
                          <span key={d.label} className={`px-1.5 py-0.5 rounded text-[11px] ${d.score <= 2 ? 'bg-red-100 text-red-800' : d.score >= 4 ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-700'}`}>
                            {d.label} {d.score}/5
                          </span>
                        ))}
                      </div>
                    )}
                    {data.survey.lastComment && <div className="text-gray-700">«{data.survey.lastComment}»</div>}
                    {data.survey.recommend && <div className="text-gray-600 text-xs mt-0.5">هيرشحنا لأصحابه؟ {data.survey.recommend}</div>}
                    {data.survey.followUpRequired && <div className="text-amber-700 text-xs mt-0.5">⚠️ طلب متابعة في الاستبيان</div>}
                  </section>
                )}

                {data.intel && (data.intel.isReactivated || data.intel.isSpendingUp) && (
                  <section className="flex flex-wrap gap-1.5">
                    {data.intel.isSpendingUp && <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-xs">📈 إنفاقه في ازدياد</span>}
                    {data.intel.isReactivated && <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 text-xs">🔄 عاد للنشاط مؤخراً</span>}
                  </section>
                )}

                {audience === 'admin' && data.intel && (
                  <section>
                    <div className="text-xs font-bold text-gray-700 mb-1">
                      📊 RFM {data.intel.r ?? '–'}-{data.intel.f ?? '–'}-{data.intel.m ?? '–'} · صحة {data.intel.healthScore != null ? Math.round(Number(data.intel.healthScore)) : '—'}
                      {data.intel.retentionPct != null ? ` · احتفاظ ${Math.round(Number(data.intel.retentionPct))}%` : ''}
                      {data.intel.cohortMonth ? ` · أول طلب ${data.intel.cohortMonth}` : ''}
                    </div>
                    {data.intel.healthBreakdown && (
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(data.intel.healthBreakdown).map(([k, v]) => (
                          <span key={k} className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 text-[11px]">
                            {HEALTH_LABELS[k] || k} {Math.round(Number(v))}
                          </span>
                        ))}
                      </div>
                    )}
                  </section>
                )}

                <section>
                  <div className="text-xs font-bold text-gray-700 mb-1">📞 مكالمات المتابعة السابقة</div>
                  {data.contacts.length === 0 ? (
                    <div className="text-gray-400">لا توجد مكالمات سابقة</div>
                  ) : (
                    <ul className="space-y-1">
                      {data.contacts.map((c, i) => (
                        <li key={i} className="text-gray-700">
                          {date(c.at)} · {c.agent} · <b>{c.result}</b>{c.reason ? ` (${c.reason})` : ''}{c.note ? ` — ${c.note}` : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </>
            )}
          </aside>
        </div>
      )}
    </>
  )
}
