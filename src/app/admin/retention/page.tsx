import { headers } from 'next/headers'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { DEFAULT_RETENTION_CONFIG, fetchRowsIn, readOrderSettings, type RetentionConfig } from '@/lib/omsData'
import { readAllPages } from '@/lib/pagedRead'
import {
  CHURN_LABELS,
  LIFECYCLE_LABELS,
  RETENTION_SORTS,
  matchesQuery,
  overdueRatio,
  parseSort,
  sortRows,
  stageTotals,
  type RetentionRow,
} from '@/lib/retentionView'
import RetentionCustomerControls from './CustomerControls'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type CustomerRow = {
  id: string
  customerName: string | null
  phone: string | null
  doNotFollowUp?: boolean | null
  followUpSnoozeUntil?: string | null
}

type OrderRow = {
  customerId: string | null
  createdAt: string
}

type TaskRow = {
  linkedCustomerId: string | null
  status: string
  assignedTo: string | null
  createdAt: string
}

type IntelDbRow = {
  customerId: string
  lifecycleStage: string | null
  churnRisk: string | null
  healthScore: number | null
  totalOrders: number | null
  totalRevenue: number | null
  typicalIntervalDays: number | null
  computedAt: string | null
}

const fmtMoney = (n: number) => Math.round(n).toLocaleString('en-US')

function stageForDays(days: number, ret: RetentionConfig): 0 | 1 | 2 | 3 {
  if (days >= ret.stage3.days) return 3
  if (days >= ret.stage2.days) return 2
  if (days >= ret.stage1.days) return 1
  return 0
}

export default async function RetentionDashboardPage({
  searchParams,
}: {
  searchParams?: { q?: string; sort?: string }
}) {
  // Ensure server-side fetch (avoids any caching surprises)
  headers()

  const query = String(searchParams?.q || '').trim()
  const sortKey = parseSort(searchParams?.sort)

  const settings = await readOrderSettings()
  const retention: RetentionConfig = settings.retention || DEFAULT_RETENTION_CONFIG

  // Pull recent orders + auto-followup tasks (every page — PostgREST caps a
  // single request at 1000 rows) and cheap head-only counts for the customer
  // totals, so no customer list is downloaded just to be counted.
  const nowIso = new Date().toISOString()
  const inactivityCutoffISO = new Date(Date.now() - 400 * 86_400_000).toISOString()
  const monthStartISO = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

  const [ordersRead, tasksRead, totalCustomersRes, optedOutRes, snoozedRes] = await Promise.all([
    readAllPages<OrderRow>((from, to) =>
      supabase
        .from('orders')
        .select('customerId,createdAt')
        .gte('createdAt', inactivityCutoffISO)
        .not('customerId', 'is', null)
        .neq('orderStatus', 'لاغي')
        .order('id', { ascending: true })
        .range(from, to) as any,
    ),
    readAllPages<TaskRow>((from, to) =>
      supabase
        .from('tasks')
        .select('linkedCustomerId,status,assignedTo,createdAt')
        .eq('source', 'auto-followup')
        .order('createdAt', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to) as any,
    ),
    supabase.from('customers').select('id', { count: 'exact', head: true }),
    supabase.from('customers').select('id', { count: 'exact', head: true }).eq('doNotFollowUp', true),
    supabase.from('customers').select('id', { count: 'exact', head: true }).gt('followUpSnoozeUntil', nowIso),
  ])

  // Schema diagnostic — when the migration hasn't been applied,
  // Supabase rejects the follow-up column filters; surface it in the header.
  const customersErrorMsg = optedOutRes.error?.message || snoozedRes.error?.message || totalCustomersRes.error?.message || ''
  const missingFollowUpColumns =
    /doNotFollowUp|followUpSnoozeUntil|column .* does not exist/i.test(customersErrorMsg)
  const readErrorMsg = ordersRead.error || tasksRead.error || ''
  const orders: OrderRow[] = ordersRead.rows
  const tasks: TaskRow[] = tasksRead.rows

  // Last (non-cancelled) order per customer
  const nowMs = Date.now()
  const lastOrderMs = new Map<string, number>()
  for (const o of orders) {
    if (!o.customerId) continue
    const ts = new Date(o.createdAt).getTime()
    if (!isFinite(ts)) continue
    const prev = lastOrderMs.get(o.customerId) || 0
    if (ts > prev) lastOrderMs.set(o.customerId, ts)
  }

  // Which customers fall in a stage, then load details for just those.
  const staged: Array<{ id: string; days: number; lastMs: number; stage: 1 | 2 | 3 }> = []
  for (const [id, lastMs] of lastOrderMs) {
    const days = Math.floor((nowMs - lastMs) / 86_400_000)
    const stage = stageForDays(days, retention)
    if (stage !== 0) staged.push({ id, days, lastMs, stage })
  }
  const stagedIds = staged.map((s) => s.id)
  const [customerRecords, intelRecords, complaintRecords] = await Promise.all([
    fetchRowsIn<CustomerRow>(
      'customers',
      'id',
      stagedIds,
      missingFollowUpColumns ? 'id,customerName,phone' : 'id,customerName,phone,doNotFollowUp,followUpSnoozeUntil',
    ),
    fetchRowsIn<IntelDbRow>(
      'customer_intelligence_scores',
      'customerId',
      stagedIds,
      'customerId,lifecycleStage,churnRisk,healthScore,totalOrders,totalRevenue,typicalIntervalDays,computedAt',
    ),
    fetchRowsIn<{ customerId: string; status: string }>('complaints', 'customerId', stagedIds, 'customerId,status'),
  ])
  const customerById = new Map(customerRecords.map((c) => [c.id, c]))
  const intelById = new Map(intelRecords.map((r) => [r.customerId, r]))
  const openComplaintsById = new Map<string, number>()
  for (const cp of complaintRecords) {
    if (cp.status === 'closed') continue
    openComplaintsById.set(cp.customerId, (openComplaintsById.get(cp.customerId) || 0) + 1)
  }
  const scoresUpdatedAt = intelRecords.reduce((latest, r) => (r.computedAt && r.computedAt > latest ? r.computedAt : latest), '')

  // Stage buckets (unfiltered, used for the KPI cards and diagnostics)
  const allBuckets: Record<1 | 2 | 3, RetentionRow[]> = { 1: [], 2: [], 3: [] }
  for (const s of staged) {
    const c = customerById.get(s.id)
    if (!c) continue
    const intel = intelById.get(s.id)
    allBuckets[s.stage].push({
      id: s.id,
      name: c.customerName || '',
      phone: c.phone || '',
      days: s.days,
      lastMs: s.lastMs,
      intel: intel
        ? {
            lifecycleStage: intel.lifecycleStage,
            churnRisk: intel.churnRisk,
            healthScore: intel.healthScore,
            totalOrders: intel.totalOrders,
            totalRevenue: intel.totalRevenue,
            typicalIntervalDays: intel.typicalIntervalDays,
          }
        : null,
      openComplaints: openComplaintsById.get(s.id) || 0,
    })
  }
  // Rows shown: filtered by the search box and sorted by the chosen key
  const buckets: Record<1 | 2 | 3, RetentionRow[]> = {
    1: sortRows(allBuckets[1].filter((r) => matchesQuery(r, query)), sortKey),
    2: sortRows(allBuckets[2].filter((r) => matchesQuery(r, query)), sortKey),
    3: sortRows(allBuckets[3].filter((r) => matchesQuery(r, query)), sortKey),
  }

  // Task KPIs (this month)
  const monthStartMs = new Date(monthStartISO).getTime()
  const tasksThisMonth = tasks.filter((t) => new Date(t.createdAt).getTime() >= monthStartMs)
  const completedThisMonth = tasksThisMonth.filter((t) => t.status === 'مكتملة')
  const openTotal = tasks.filter((t) => t.status !== 'مكتملة').length
  const completionRate = tasksThisMonth.length === 0
    ? 0
    : Math.round((completedThisMonth.length / tasksThisMonth.length) * 100)

  // Opt-out / snoozed counts (head-only counts above)
  const optedOut = optedOutRes.count || 0
  const snoozed = snoozedRes.count || 0

  // Per-customer current open task lookup
  const openTaskByCustomer = new Map<string, TaskRow>()
  for (const t of tasks) {
    if (!t.linkedCustomerId) continue
    if (t.status === 'مكتملة') continue
    if (!openTaskByCustomer.has(t.linkedCustomerId)) openTaskByCustomer.set(t.linkedCustomerId, t)
  }

  const stageLabel = (n: 1 | 2 | 3) => (n === 3 ? '🔴 المرحلة 3' : n === 2 ? '🟠 المرحلة 2' : '🟡 المرحلة 1')
  const stageRange = (n: 1 | 2 | 3) => {
    if (n === 3) return `${retention.stage3.days}+ يوم`
    if (n === 2) return `${retention.stage2.days}–${retention.stage3.days - 1} يوم`
    return `${retention.stage1.days}–${retention.stage2.days - 1} يوم`
  }

  return (
    <div dir="rtl" className="min-h-screen bg-gray-50 p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🔁 Retention</h1>
          <p className="text-sm text-gray-600 mt-1">
            مراحل عدم النشاط ({retention.stage1.days}/{retention.stage2.days}/{retention.stage3.days} يوم) وأداء فريق المتابعة
            {retention.enabled === false && (
              <span className="ms-2 inline-block px-2 py-0.5 rounded bg-red-100 text-red-700 text-xs font-medium">
                المحرك متوقّف حالياً
              </span>
            )}
          </p>
        </div>
        <Link
          href="/admin/settings"
          className="px-3 py-1.5 rounded-lg bg-white border-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50 text-sm font-medium"
        >
          ⚙️ ضبط المراحل
        </Link>
      </div>

      {/* Diagnostics: explain what's loaded so the user understands an empty dashboard. */}
      {(() => {
        const totalCustomers = totalCustomersRes.count || 0
        const customersWithOrders = lastOrderMs.size
        const inAnyStage = allBuckets[1].length + allBuckets[2].length + allBuckets[3].length
        const ordersInWindow = orders.length
        const issues: Array<{ tone: 'red' | 'amber' | 'blue'; text: string }> = []
        if (missingFollowUpColumns) {
          issues.push({
            tone: 'red',
            text: 'الأعمدة doNotFollowUp / followUpSnoozeUntil غير موجودة في قاعدة البيانات — قم بتشغيل data/customer-followup-controls.sql في Supabase لتفعيل خيارات الاستبعاد والتأجيل.',
          })
        } else if (customersErrorMsg) {
          issues.push({ tone: 'red', text: `خطأ في تحميل العملاء: ${customersErrorMsg}` })
        }
        if (readErrorMsg) {
          issues.push({ tone: 'red', text: `تعذّر تحميل جزء من البيانات، قد تكون الأرقام ناقصة: ${readErrorMsg}` })
        }
        if (totalCustomers === 0) {
          issues.push({ tone: 'amber', text: 'لا يوجد عملاء مسجّلون في قاعدة البيانات.' })
        } else if (ordersInWindow === 0) {
          issues.push({ tone: 'amber', text: 'لا توجد طلبات خلال آخر 400 يوم.' })
        } else if (customersWithOrders === 0) {
          issues.push({ tone: 'amber', text: 'لا يوجد عملاء مربوطون بأي طلب فعّال خلال آخر 400 يوم.' })
        } else if (inAnyStage === 0) {
          issues.push({
            tone: 'blue',
            text: `كل العملاء النشطين طلبوا خلال آخر ${retention.stage1.days} يوم — لا أحد في أي مرحلة متابعة حالياً. يمكنك خفض حد المرحلة الأولى من الإعدادات لاختبار النظام.`,
          })
        } else if (intelRecords.length === 0) {
          issues.push({
            tone: 'amber',
            text: 'لا توجد بيانات تقييم (RFM) لهؤلاء العملاء بعد — تُحسب ليلاً، أو اضغط «تحديث الآن» في صفحة Customers.',
          })
        }
        return (
          <div className="bg-white border-2 border-gray-200 rounded-xl p-3">
            <div className="text-xs font-bold text-gray-700 mb-2">تشخيص البيانات</div>
            <div className="flex flex-wrap gap-3 text-xs text-gray-700">
              <span>👥 إجمالي العملاء: <b>{totalCustomers}</b></span>
              <span>📦 طلبات (غير ملغاة) خلال 400 يوم: <b>{ordersInWindow}</b></span>
              <span>🔗 عملاء لديهم طلب فعّال: <b>{customersWithOrders}</b></span>
              <span>📊 في إحدى المراحل: <b>{inAnyStage}</b></span>
              {scoresUpdatedAt && (
                <span>🕒 آخر تحديث للتقييمات: <b>{new Date(scoresUpdatedAt).toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' })}</b></span>
              )}
            </div>

            {issues.length > 0 && (
              <div className="mt-2 space-y-1">
                {issues.map((iss, i) => {
                  const cls =
                    iss.tone === 'red'
                      ? 'bg-red-50 border-red-300 text-red-800'
                      : iss.tone === 'amber'
                      ? 'bg-amber-50 border-amber-300 text-amber-800'
                      : 'bg-blue-50 border-blue-300 text-blue-800'
                  return (
                    <div key={i} className={`text-xs px-2 py-1.5 rounded border ${cls}`}>
                      {iss.text}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })()}

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <KPI title="🟡 مرحلة 1" value={allBuckets[1].length} hint={stageRange(1)} accent="border-yellow-300" />
        <KPI title="🟠 مرحلة 2" value={allBuckets[2].length} hint={stageRange(2)} accent="border-orange-300" />
        <KPI title="🔴 مرحلة 3" value={allBuckets[3].length} hint={stageRange(3)} accent="border-red-300" />
        <KPI title="📋 مهام مفتوحة" value={openTotal} hint="حالياً" accent="border-blue-300" />
        <KPI title="🆕 مهام الشهر" value={tasksThisMonth.length} hint="هذا الشهر" accent="border-indigo-300" />
        <KPI title="✅ معدل الإنجاز" value={`${completionRate}%`} hint={`${completedThisMonth.length}/${tasksThisMonth.length}`} accent="border-emerald-300" />
        <KPI title="🚫 مستبعدون / مؤجّلون" value={`${optedOut} / ${snoozed}`} hint="opt-out / snoozed" accent="border-gray-300" />
      </div>

      {/* Search + sort (plain GET form — no client code, no extra requests) */}
      <form method="get" className="flex flex-wrap items-center gap-2 bg-white border-2 border-gray-200 rounded-xl p-3">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="بحث بالاسم أو رقم الهاتف"
          className="flex-1 min-w-[180px] px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
        />
        <label className="text-xs text-gray-600 flex items-center gap-1">
          ترتيب حسب
          <select name="sort" defaultValue={sortKey} className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white">
            {RETENTION_SORTS.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700">
          تطبيق
        </button>
        {(query || sortKey !== 'days') && (
          <Link href="/admin/retention" className="text-xs text-gray-600 underline">مسح</Link>
        )}
      </form>

      {/* Stage tables (3 → 2 → 1, highest priority first) */}
      {[3, 2, 1].map((n) => {
        const stage = n as 1 | 2 | 3
        const rows = buckets[stage]
        const totals = stageTotals(allBuckets[stage])
        return (
          <section key={stage} className="bg-white border-2 border-gray-200 rounded-xl overflow-hidden">
            <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-gray-50 border-b border-gray-200">
              <div className="font-bold text-gray-900">
                {stageLabel(stage)} · {rows.length} عميل
                {query && rows.length !== totals.count ? ` (من ${totals.count})` : ''}
              </div>
              <div className="text-xs text-gray-600 flex flex-wrap items-center gap-3">
                <span title="مجموع إنفاق عملاء هذه المرحلة سابقاً — الإيراد المعرّض للفقد">
                  💰 إنفاق سابق: <b>{fmtMoney(totals.revenue)} ج.م</b>
                </span>
                {totals.withoutScore > 0 && <span className="text-amber-700">{totals.withoutScore} بدون تقييم بعد</span>}
                <span>{stageRange(stage)}</span>
              </div>
            </header>
            {rows.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-500">
                {query ? 'لا نتائج مطابقة للبحث في هذه المرحلة.' : 'لا يوجد عملاء في هذه المرحلة حالياً.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-700">
                    <tr>
                      <th className="text-right px-3 py-2">العميل</th>
                      <th className="text-right px-3 py-2">الهاتف</th>
                      <th className="text-right px-3 py-2">أيام عدم النشاط</th>
                      <th className="text-right px-3 py-2">المعتاد / التأخير</th>
                      <th className="text-right px-3 py-2">آخر طلب</th>
                      <th className="text-right px-3 py-2">الطلبات / الإنفاق</th>
                      <th className="text-right px-3 py-2">خطر الفقد</th>
                      <th className="text-right px-3 py-2">المهمة المفتوحة</th>
                      <th className="text-right px-3 py-2">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const c = customerById.get(r.id)
                      const open = openTaskByCustomer.get(r.id)
                      const intel = r.intel
                      const ratio = intel ? overdueRatio(r.days, intel.typicalIntervalDays) : null
                      const riskCls =
                        intel?.churnRisk === 'High'
                          ? 'bg-red-100 text-red-800'
                          : intel?.churnRisk === 'Medium'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-800'
                      return (
                        <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium text-gray-900">
                            <div>{r.name || '—'}</div>
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {intel?.lifecycleStage && (
                                <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[11px] font-medium">
                                  {LIFECYCLE_LABELS[intel.lifecycleStage] || intel.lifecycleStage}
                                </span>
                              )}
                              {r.openComplaints > 0 && (
                                <span
                                  className="px-1.5 py-0.5 rounded bg-red-50 text-red-700 text-[11px] font-medium"
                                  title="لديه شكوى مفتوحة — يحتاج مكالمة خدمة قبل أي رسالة استرجاع"
                                >
                                  ⚠️ شكوى مفتوحة{r.openComplaints > 1 ? ` (${r.openComplaints})` : ''}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-gray-700">{r.phone || '—'}</td>
                          <td className="px-3 py-2 font-bold text-gray-900">{r.days}</td>
                          <td className="px-3 py-2 text-gray-700">
                            {intel && intel.typicalIntervalDays != null && Number(intel.typicalIntervalDays) > 0 ? (
                              <>
                                <div className="text-xs">كل {Math.round(Number(intel.typicalIntervalDays))} يوم</div>
                                {ratio != null && (
                                  <div className={`text-xs font-bold ${ratio >= 3 ? 'text-red-700' : ratio >= 1.5 ? 'text-amber-700' : 'text-gray-600'}`}>
                                    متأخر ×{ratio}
                                  </div>
                                )}
                              </>
                            ) : (
                              <span className="text-xs text-gray-400">{intel ? 'طلب واحد' : '—'}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-gray-700">{new Date(r.lastMs).toLocaleDateString('ar-EG')}</td>
                          <td className="px-3 py-2 text-gray-700">
                            {intel ? (
                              <>
                                <div className="text-xs">{Number(intel.totalOrders) || 0} طلب</div>
                                <div className="text-xs font-bold text-gray-900">{fmtMoney(Number(intel.totalRevenue) || 0)} ج.م</div>
                              </>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {intel?.churnRisk ? (
                              <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${riskCls}`}>
                                {CHURN_LABELS[intel.churnRisk] || intel.churnRisk}
                                {intel.healthScore != null ? ` · ${Math.round(Number(intel.healthScore))}` : ''}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {open ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-blue-800 text-xs">
                                {open.status} · {open.assignedTo || '—'}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <RetentionCustomerControls
                              customerId={r.id}
                              doNotFollowUp={!!c?.doNotFollowUp}
                              followUpSnoozeUntil={c?.followUpSnoozeUntil || null}
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

function KPI({ title, value, hint, accent }: { title: string; value: number | string; hint?: string; accent: string }) {
  return (
    <div className={`bg-white border-2 ${accent} rounded-xl p-3`}>
      <div className="text-xs text-gray-600 font-medium">{title}</div>
      <div className="text-2xl font-bold text-gray-900 mt-1">{value}</div>
      {hint && <div className="text-[11px] text-gray-500 mt-0.5">{hint}</div>}
    </div>
  )
}
