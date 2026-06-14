import { headers } from 'next/headers'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { DEFAULT_RETENTION_CONFIG, readOrderSettings, type RetentionConfig } from '@/lib/omsData'
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
  id: string
  customerId: string | null
  orderStatus: string
  createdAt: string
}

type TaskRow = {
  id: string
  linkedCustomerId: string | null
  status: string
  assignedTo: string | null
  createdAt: string
  updatedAt?: string | null
  completedAt?: string | null
  title: string
}

function stageForDays(days: number, ret: RetentionConfig): 0 | 1 | 2 | 3 {
  if (days >= ret.stage3.days) return 3
  if (days >= ret.stage2.days) return 2
  if (days >= ret.stage1.days) return 1
  return 0
}

export default async function RetentionDashboardPage() {
  // Ensure server-side fetch (avoids any caching surprises)
  headers()

  const settings = await readOrderSettings()
  const retention: RetentionConfig = settings.retention || DEFAULT_RETENTION_CONFIG

  // Pull recent orders + customers + auto-followup tasks in parallel.
  const inactivityCutoffISO = new Date(Date.now() - 400 * 86_400_000).toISOString()
  const monthStartISO = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

  const [ordersRes, customersRes, tasksRes] = await Promise.all([
    supabase
      .from('orders')
      .select('id,customerId,orderStatus,createdAt')
      .gte('createdAt', inactivityCutoffISO)
      .not('customerId', 'is', null),
    supabase
      .from('customers')
      .select('id,customerName,phone,doNotFollowUp,followUpSnoozeUntil'),
    supabase
      .from('tasks')
      .select('id,linkedCustomerId,status,assignedTo,createdAt,updatedAt,completedAt,title')
      .eq('source', 'auto-followup')
      .order('createdAt', { ascending: false }),
  ])

  let customers: CustomerRow[] = (customersRes.data as CustomerRow[]) || []
  if (customersRes.error && /doNotFollowUp|followUpSnoozeUntil/i.test(customersRes.error.message || '')) {
    const fallback = await supabase.from('customers').select('id,customerName,phone')
    customers = (fallback.data as CustomerRow[]) || []
  }
  const orders: OrderRow[] = (ordersRes.data as OrderRow[]) || []
  const tasks: TaskRow[] = (tasksRes.data as TaskRow[]) || []

  // Last (non-cancelled) order per customer
  const nowMs = Date.now()
  const lastOrderMs = new Map<string, number>()
  for (const o of orders) {
    if (!o.customerId) continue
    if (o.orderStatus === 'لاغي') continue
    const ts = new Date(o.createdAt).getTime()
    if (!isFinite(ts)) continue
    const prev = lastOrderMs.get(o.customerId) || 0
    if (ts > prev) lastOrderMs.set(o.customerId, ts)
  }

  // Stage buckets
  const buckets: Record<1 | 2 | 3, Array<{ c: CustomerRow; days: number; lastMs: number }>> = { 1: [], 2: [], 3: [] }
  for (const c of customers) {
    const lastMs = lastOrderMs.get(c.id)
    if (!lastMs) continue
    const days = Math.floor((nowMs - lastMs) / 86_400_000)
    const stage = stageForDays(days, retention)
    if (stage === 0) continue
    buckets[stage].push({ c, days, lastMs })
  }
  // Sort each bucket: longest inactivity first
  for (const k of [1, 2, 3] as const) buckets[k].sort((a, b) => b.days - a.days)

  // Task KPIs (this month)
  const monthStartMs = new Date(monthStartISO).getTime()
  const tasksThisMonth = tasks.filter((t) => new Date(t.createdAt).getTime() >= monthStartMs)
  const completedThisMonth = tasksThisMonth.filter((t) => t.status === 'مكتملة')
  const openTotal = tasks.filter((t) => t.status !== 'مكتملة').length
  const completionRate = tasksThisMonth.length === 0
    ? 0
    : Math.round((completedThisMonth.length / tasksThisMonth.length) * 100)

  // Opt-out / snoozed counts
  const optedOut = customers.filter((c) => c.doNotFollowUp).length
  const snoozed = customers.filter((c) => {
    if (!c.followUpSnoozeUntil) return false
    const ms = new Date(c.followUpSnoozeUntil).getTime()
    return isFinite(ms) && ms > nowMs
  }).length

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
          <h1 className="text-2xl font-bold text-gray-900">🔁 لوحة متابعة العملاء الخاملين</h1>
          <p className="text-sm text-gray-600 mt-1">
            نظرة عامة على مراحل عدم النشاط ({retention.stage1.days}/{retention.stage2.days}/{retention.stage3.days} يوم) وأداء فريق المتابعة
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

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <KPI title="🟡 مرحلة 1" value={buckets[1].length} hint={stageRange(1)} accent="border-yellow-300" />
        <KPI title="🟠 مرحلة 2" value={buckets[2].length} hint={stageRange(2)} accent="border-orange-300" />
        <KPI title="🔴 مرحلة 3" value={buckets[3].length} hint={stageRange(3)} accent="border-red-300" />
        <KPI title="📋 مهام مفتوحة" value={openTotal} hint="حالياً" accent="border-blue-300" />
        <KPI title="🆕 مهام الشهر" value={tasksThisMonth.length} hint="هذا الشهر" accent="border-indigo-300" />
        <KPI title="✅ معدل الإنجاز" value={`${completionRate}%`} hint={`${completedThisMonth.length}/${tasksThisMonth.length}`} accent="border-emerald-300" />
        <KPI title="🚫 مستبعدون / مؤجّلون" value={`${optedOut} / ${snoozed}`} hint="opt-out / snoozed" accent="border-gray-300" />
      </div>

      {/* Stage tables (3 → 2 → 1, highest priority first) */}
      {[3, 2, 1].map((n) => {
        const stage = n as 1 | 2 | 3
        const rows = buckets[stage]
        return (
          <section key={stage} className="bg-white border-2 border-gray-200 rounded-xl overflow-hidden">
            <header className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
              <div className="font-bold text-gray-900">{stageLabel(stage)} · {rows.length} عميل</div>
              <div className="text-xs text-gray-600">{stageRange(stage)}</div>
            </header>
            {rows.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-500">لا يوجد عملاء في هذه المرحلة حالياً.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-700">
                    <tr>
                      <th className="text-right px-3 py-2">العميل</th>
                      <th className="text-right px-3 py-2">الهاتف</th>
                      <th className="text-right px-3 py-2">أيام عدم النشاط</th>
                      <th className="text-right px-3 py-2">آخر طلب</th>
                      <th className="text-right px-3 py-2">المهمة المفتوحة</th>
                      <th className="text-right px-3 py-2">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 100).map(({ c, days, lastMs }) => {
                      const open = openTaskByCustomer.get(c.id)
                      return (
                        <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium text-gray-900">{c.customerName || '—'}</td>
                          <td className="px-3 py-2 text-gray-700">{c.phone || '—'}</td>
                          <td className="px-3 py-2 font-bold text-gray-900">{days}</td>
                          <td className="px-3 py-2 text-gray-700">{new Date(lastMs).toLocaleDateString('ar-EG')}</td>
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
                              customerId={c.id}
                              doNotFollowUp={!!c.doNotFollowUp}
                              followUpSnoozeUntil={c.followUpSnoozeUntil || null}
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {rows.length > 100 && (
                  <div className="px-3 py-2 text-xs text-gray-500 bg-gray-50 border-t">
                    عرض أول 100 من {rows.length} — استخدم CRM للفلترة الكاملة.
                  </div>
                )}
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
