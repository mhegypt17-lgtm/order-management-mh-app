import { headers } from 'next/headers'
import Link from 'next/link'
import { readContactsSince, readOrdersSince } from '@/lib/retentionData'
import {
  WIN_WINDOW_DAYS,
  buildInsights,
  evaluateContacts,
  reasonLabel,
  resultLabel,
  summarize,
  type GroupSummary,
} from '@/lib/retentionQueue'
import { LIFECYCLE_LABELS } from '@/lib/retentionView'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const HISTORY_DAYS = 90
const fmtMoney = (n: number) => Math.round(n).toLocaleString('en-US')
const stageName = (s: string) => (s === '1' || s === '2' || s === '3' ? `المرحلة ${s}` : 'غير محدد')

function SummaryTable({ title, rows, labelOf }: { title: string; rows: GroupSummary[]; labelOf: (key: string) => string }) {
  return (
    <section className="bg-white border-2 border-gray-200 rounded-xl overflow-hidden">
      <header className="px-4 py-2 bg-gray-50 border-b border-gray-200 font-bold text-gray-900">{title}</header>
      {rows.length === 0 ? (
        <div className="p-4 text-sm text-gray-500 text-center">لا توجد بيانات بعد.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-700">
              <tr>
                <th className="text-right px-3 py-2">المجموعة</th>
                <th className="text-right px-3 py-2">مكالمات</th>
                <th className="text-right px-3 py-2">تم الرد</th>
                <th className="text-right px-3 py-2">طلبوا بعد المكالمة</th>
                <th className="text-right px-3 py-2">لم يطلبوا</th>
                <th className="text-right px-3 py-2">قيد الانتظار</th>
                <th className="text-right px-3 py-2">نسبة الاسترجاع</th>
                <th className="text-right px-3 py-2">إيراد مسترجع</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => (
                <tr key={g.key} className="border-t border-gray-100">
                  <td className="px-3 py-2 font-medium text-gray-900">{labelOf(g.key)}</td>
                  <td className="px-3 py-2">{g.contacts}</td>
                  <td className="px-3 py-2">{g.reached}</td>
                  <td className="px-3 py-2 text-emerald-700 font-bold">{g.won}</td>
                  <td className="px-3 py-2">{g.lost}</td>
                  <td className="px-3 py-2 text-gray-500">{g.pending}</td>
                  <td className="px-3 py-2 font-bold">{g.winRate != null ? `${g.winRate}%` : '—'}</td>
                  <td className="px-3 py-2">{fmtMoney(g.revenue)} ج.م</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export default async function RetentionOutcomesPage() {
  headers()
  const now = Date.now()
  const sinceISO = new Date(now - HISTORY_DAYS * 86_400_000).toISOString()

  const contactsRead = await readContactsSince(sinceISO)
  const contacts = contactsRead.rows.map((c) => ({ ...c, spendAtContact: c.spendAtContact != null ? Number(c.spendAtContact) : null }))
  const ordersRead = contacts.length
    ? await readOrdersSince(contacts.map((c) => c.customerId), sinceISO)
    : { rows: [], error: null }
  const evaluated = evaluateContacts(contacts, ordersRead.rows, now)

  const total = summarize(evaluated, () => 'all')[0]
  const customers = new Set(contacts.map((c) => c.customerId)).size
  const spendOfContacted = Array.from(
    new Map(contacts.map((c) => [c.customerId, Number(c.spendAtContact) || 0])).values(),
  ).reduce((s, v) => s + v, 0)
  const insights = buildInsights(evaluated, stageName)

  return (
    <div dir="rtl" className="min-h-screen bg-gray-50 p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📈 نتائج متابعة العملاء</h1>
          <p className="text-sm text-gray-600 mt-1">
            آخر {HISTORY_DAYS} يوم. «طلب بعد المكالمة» = طلب غير ملغي خلال {WIN_WINDOW_DAYS} يوم من المكالمة (أو قبل المكالمة التالية لنفس العميل). يُحسب تلقائياً من الطلبات دون أي إدخال إضافي.
          </p>
        </div>
        <Link href="/admin/retention" className="px-3 py-1.5 rounded-lg bg-white border-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50 text-sm font-medium">
          ← لوحة Retention
        </Link>
      </div>

      {contactsRead.tableMissing && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-sm">
          جدول سجل المكالمات غير موجود — شغّل <code>data/retention-contacts-migration.sql</code> في Supabase، ثم ابدأ تسجيل المكالمات من «قائمة الاتصال».
        </div>
      )}
      {(contactsRead.error && !contactsRead.tableMissing) || ordersRead.error ? (
        <div className="p-3 rounded-lg bg-red-50 border border-red-300 text-red-800 text-xs">
          تعذّر تحميل جزء من البيانات، قد تكون الأرقام ناقصة: {contactsRead.error || ordersRead.error}
        </div>
      ) : null}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { t: '📞 مكالمات', v: total?.contacts ?? 0, h: `${customers} عميل` },
          { t: '🗣️ نسبة الرد', v: total && total.contacts ? `${Math.round((total.reached / total.contacts) * 100)}%` : '—', h: `${total?.reached ?? 0} ردّوا` },
          { t: '🛒 طلبوا بعد المكالمة', v: total?.won ?? 0, h: `من ${(total?.won ?? 0) + (total?.lost ?? 0)} مكتملة المدة` },
          { t: '🎯 نسبة الاسترجاع', v: total?.winRate != null ? `${total.winRate}%` : '—', h: `${total?.pending ?? 0} قيد الانتظار` },
          { t: '💰 إيراد مسترجع', v: `${fmtMoney(total?.revenue ?? 0)} ج.م`, h: `إنفاق سابق للمتصل بهم ${fmtMoney(spendOfContacted)}` },
        ].map((k) => (
          <div key={k.t} className="bg-white border-2 border-gray-200 rounded-xl p-3">
            <div className="text-xs text-gray-600 font-medium">{k.t}</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{k.v}</div>
            <div className="text-[11px] text-gray-500 mt-0.5">{k.h}</div>
          </div>
        ))}
      </div>

      <section className="bg-indigo-50 border-2 border-indigo-200 rounded-xl p-4">
        <div className="font-bold text-indigo-900 mb-2">💡 توصيات من البيانات</div>
        <ul className="list-disc pr-5 space-y-1 text-sm text-indigo-900">
          {insights.map((i, n) => <li key={n}>{i}</li>)}
        </ul>
      </section>

      <SummaryTable title="حسب الموظف" rows={summarize(evaluated, (c) => c.agent)} labelOf={(k) => k} />
      <SummaryTable title="حسب المرحلة وقت المكالمة" rows={summarize(evaluated, (c) => String(c.stage ?? ''))} labelOf={stageName} />
      <SummaryTable title="حسب شريحة العميل" rows={summarize(evaluated, (c) => c.segment || '')} labelOf={(k) => LIFECYCLE_LABELS[k] || k} />
      <SummaryTable title="حسب نتيجة المكالمة" rows={summarize(evaluated, (c) => c.result)} labelOf={resultLabel} />
      <SummaryTable
        title="أسباب عدم الاهتمام"
        rows={summarize(evaluated.filter((c) => c.result === 'not_interested'), (c) => c.reason || '')}
        labelOf={(k) => reasonLabel(k) || '—'}
      />
      <SummaryTable title="حسب العرض المستخدم" rows={summarize(evaluated.filter((c) => c.offer), (c) => c.offer || '')} labelOf={(k) => k} />
    </div>
  )
}
