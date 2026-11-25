'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuthStore } from '@/lib/auth'
import CustomerDetails from '@/components/retention/CustomerDetails'
import ContactLogger from '@/components/retention/ContactLogger'
import {
  bucketLabel,
  firstName,
  renderMessage,
  whatsappUrl,
  type ContactAction,
  type RetentionMessages,
} from '@/lib/retentionQueue'
import { matchesQuery, type ComplaintBrief } from '@/lib/retentionView'

type Card = {
  id: string
  name: string
  phone: string
  days: number
  stage: number
  bucket: number
  tag: string
  orders: number | null
  spend: number | null
  segment: string | null
  usualGapDays: number | null
  lateBy: number | null
  openComplaints: number
  complaints: ComplaintBrief[]
}

type Queue = {
  tableReady: boolean
  error: string | null
  actions: ContactAction[]
  messages: RetentionMessages
  edges: number[]
  bucketCounts: number[]
  service: Card[]
  winback: Card[]
  dailySize: number
  moreWaiting: number
  doneToday: number
  doneTodayByAgent: Record<string, number>
  instashopExcluded: number
  scoresUpdatedAt: string | null
}

// Yellow → red as the customer has been away longer.
const BUCKET_COLORS = ['bg-yellow-300', 'bg-amber-400', 'bg-orange-400', 'bg-orange-500', 'bg-red-500', 'bg-red-700']
const shortDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('ar-EG', { timeZone: 'Africa/Cairo' }) : '—')

function DaysChart({
  edges,
  counts,
  active,
  onPick,
}: {
  edges: number[]
  counts: number[]
  active: number | null
  onPick: (i: number | null) => void
}) {
  const max = Math.max(1, ...counts)
  const total = counts.reduce((s, c) => s + c, 0)
  return (
    <section className="bg-white border-2 border-gray-200 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="font-bold text-gray-900">⏳ مكالمات مطلوبة حسب مدة عدم الطلب — {total}</div>
        {active != null && (
          <button type="button" onClick={() => onPick(null)} className="text-xs text-indigo-700 underline">عرض الكل</button>
        )}
      </div>
      <div className="space-y-1.5">
        {edges.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onPick(active === i ? null : i)}
            className={`w-full flex items-center gap-2 rounded-lg px-2 py-1 text-right ${active === i ? 'bg-indigo-50 ring-2 ring-indigo-300' : 'hover:bg-gray-50'}`}
          >
            <span className="w-28 shrink-0 text-xs text-gray-700">{bucketLabel(i, edges)}</span>
            <span className="flex-1 h-5 bg-gray-100 rounded overflow-hidden">
              <span
                className={`block h-full rounded ${BUCKET_COLORS[Math.min(i, BUCKET_COLORS.length - 1)]}`}
                style={{ width: `${counts[i] > 0 ? Math.max(4, (counts[i] / max) * 100) : 0}%` }}
              />
            </span>
            <span className="w-10 shrink-0 text-sm font-bold text-gray-900 text-left" dir="ltr">{counts[i]}</span>
          </button>
        ))}
      </div>
      <div className="text-[11px] text-gray-500">اضغط على شريط لعرض عملائه فقط.</div>
    </section>
  )
}

function QueueCard({
  card,
  agent,
  queue,
  onLogged,
}: {
  card: Card
  agent: string
  queue: Queue
  onLogged: (id: string) => void
}) {
  const [logging, setLogging] = useState(false)
  // Quick message from the card: lines needing data we don't have here (favourite product) are dropped;
  // the drawer builds the full message.
  const openComplaint = card.complaints.find((c) => c.status !== 'closed')
  const quickText = renderMessage(openComplaint ? queue.messages.complaint : queue.messages.winback, {
    name: firstName(card.name),
    agent,
    days: card.days,
    complaint: openComplaint?.title || '',
  })
  const wa = whatsappUrl(card.phone, quickText)
  return (
    <div className={`bg-white border-2 rounded-xl p-3 space-y-2 ${card.openComplaints > 0 ? 'border-red-300' : 'border-gray-200'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-bold text-gray-900">{card.name || '—'}</div>
          <div className="text-xs text-gray-500">{card.tag}</div>
        </div>
        <div className="flex items-center gap-1.5">
          {card.phone && (
            <a href={`tel:${card.phone}`} className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-800 text-sm font-medium" dir="ltr">
              📞 {card.phone}
            </a>
          )}
          {wa && (
            <a href={wa} target="_blank" rel="noreferrer" className="px-2.5 py-1 rounded-lg bg-green-50 border border-green-300 text-green-800 text-sm font-medium" title="فتح واتساب برسالة جاهزة">
              💬 واتساب
            </a>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-gray-700">
        <span>⏳ <b>{card.days}</b> يوم بدون طلب</span>
        {card.usualGapDays != null && <span>🔁 يطلب كل {card.usualGapDays} يوم{card.lateBy != null ? ` (متأخر ×${card.lateBy})` : ''}</span>}
        {card.orders != null && <span>🧾 {card.orders} طلب</span>}
        {card.spend != null && <span>💰 {card.spend.toLocaleString('en-US')} ج.م</span>}
      </div>

      {card.complaints.length > 0 && (
        <div className={`rounded-lg border p-2 text-xs ${card.openComplaints > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
          <div className="font-bold text-gray-700 mb-0.5">🎫 الشكاوى ({card.complaints.length})</div>
          <ul className="space-y-0.5 text-gray-700">
            {card.complaints.slice(0, 3).map((c, i) => (
              <li key={i}>
                <span dir="ltr" className="text-gray-500">{shortDate(c.date)}</span> — {c.title}{' '}
                <span className={c.status === 'closed' ? 'text-gray-500' : 'text-red-700 font-semibold'}>({c.status === 'closed' ? 'مغلقة' : 'مفتوحة'})</span>
              </li>
            ))}
          </ul>
          {card.complaints.length > 3 && <div className="text-gray-500 mt-0.5">+{card.complaints.length - 3} أخرى في التفاصيل</div>}
        </div>
      )}

      <CustomerDetails customerId={card.id} name={card.name} phone={card.phone} days={card.days} audience="cs" messages={queue.messages} agent={agent} />
      {logging ? (
        <div className="border-t border-gray-100 pt-2">
          <ContactLogger customerId={card.id} agent={agent} actions={queue.actions} onLogged={() => onLogged(card.id)} />
        </div>
      ) : (
        <button type="button" onClick={() => setLogging(true)} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700">
          ✅ تسجيل الإجراء
        </button>
      )}
    </div>
  )
}

export default function RetentionQueuePage() {
  const { user } = useAuthStore()
  const agent = user?.name || ''
  const [queue, setQueue] = useState<Queue | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [bucket, setBucket] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [showAll, setShowAll] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setFailed(false)
    try {
      const res = await fetch('/api/retention/queue', { cache: 'no-store' })
      if (!res.ok) throw new Error('failed')
      setQueue(await res.json())
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // A logged customer leaves the list at once (and the chart); the next load confirms it from the server.
  const handleLogged = (id: string) =>
    setQueue((q) => {
      if (!q) return q
      const gone = [...q.service, ...q.winback].find((c) => c.id === id)
      const bucketCounts = q.bucketCounts.slice()
      if (gone && gone.bucket >= 0) bucketCounts[gone.bucket] = Math.max(0, bucketCounts[gone.bucket] - 1)
      return {
        ...q,
        bucketCounts,
        service: q.service.filter((c) => c.id !== id),
        winback: q.winback.filter((c) => c.id !== id),
        doneToday: q.doneToday + 1,
        doneTodayByAgent: { ...q.doneTodayByAgent, [agent]: (q.doneTodayByAgent[agent] || 0) + 1 },
      }
    })

  const filtering = bucket != null || search.trim() !== ''
  const view = useMemo(() => {
    if (!queue) return { service: [] as Card[], winback: [] as Card[], hidden: 0 }
    const pass = (c: Card) => (bucket == null || c.bucket === bucket) && matchesQuery({ name: c.name, phone: c.phone }, search)
    const service = queue.service.filter(pass)
    const matching = queue.winback.filter(pass)
    // Without a filter only today's quota is shown; a filter or "show all" widens it.
    const limit = filtering || showAll ? matching.length : queue.dailySize
    return { service, winback: matching.slice(0, limit), hidden: Math.max(0, matching.length - limit) }
  }, [queue, bucket, search, filtering, showAll])

  return (
    <div dir="rtl" className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🔁 Retention</h1>
          <p className="text-sm text-gray-600 mt-1">عملاء توقفوا عن الطلب، مرتّبون حسب القيمة ثم التأخر عن عادتهم. سجّل الإجراء بعد كل تواصل لتختفي البطاقة من القائمة.</p>
        </div>
        <button type="button" onClick={load} disabled={loading} className="px-3 py-1.5 rounded-lg bg-white border border-gray-300 text-sm hover:bg-gray-50 disabled:opacity-50">
          🔄 تحديث
        </button>
      </div>

      {loading && !queue && <div className="p-8 text-center text-gray-500">⏳ جاري تحميل القائمة...</div>}
      {failed && <div className="p-3 rounded-lg bg-red-50 border border-red-300 text-red-800 text-sm">تعذر تحميل القائمة. اضغط «تحديث» للمحاولة مرة أخرى.</div>}

      {queue && (
        <>
          {!queue.tableReady && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-sm">
              سجل الإجراءات غير مفعّل بعد — على الإدارة تشغيل <code>data/retention-contacts-migration.sql</code> في Supabase. حتى ذلك الحين لن يمكن تسجيل النتائج.
            </div>
          )}
          {queue.error && <div className="p-3 rounded-lg bg-red-50 border border-red-300 text-red-800 text-xs">تعذّر تحميل جزء من البيانات: {queue.error}</div>}

          <div className="flex flex-wrap gap-3 text-sm">
            <span className="px-3 py-1 rounded-lg bg-white border border-gray-200">✅ تم اليوم (الفريق): <b>{queue.doneToday}</b></span>
            {agent && <span className="px-3 py-1 rounded-lg bg-white border border-gray-200">أنا: <b>{queue.doneTodayByAgent[agent] || 0}</b></span>}
            <span className="px-3 py-1 rounded-lg bg-white border border-gray-200">المتبقي في القائمة: <b>{queue.bucketCounts.reduce((s, c) => s + c, 0)}</b></span>
          </div>

          <DaysChart edges={queue.edges} counts={queue.bucketCounts} active={bucket} onPick={setBucket} />

          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو رقم الهاتف"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
          />

          {view.service.length > 0 && (
            <section className="space-y-2">
              <h2 className="font-bold text-red-800">⚠️ مكالمة خدمة أولاً (لديهم شكوى مفتوحة) — {view.service.length}</h2>
              {view.service.map((c) => <QueueCard key={c.id} card={c} agent={agent} queue={queue} onLogged={handleLogged} />)}
            </section>
          )}

          <section className="space-y-2">
            <h2 className="font-bold text-gray-900">
              🔁 استرجاع العملاء — {view.winback.length}
              {bucket != null ? ` (${bucketLabel(bucket, queue.edges)})` : ''}
            </h2>
            {view.winback.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-500 bg-white border border-gray-200 rounded-xl">
                {filtering ? 'لا نتائج مطابقة.' : 'لا يوجد عملاء في القائمة الآن 🎉'}
              </div>
            ) : (
              view.winback.map((c) => <QueueCard key={c.id} card={c} agent={agent} queue={queue} onLogged={handleLogged} />)
            )}
            {view.hidden > 0 && (
              <button type="button" onClick={() => setShowAll(true)} className="text-sm text-indigo-700 underline">
                يوجد {view.hidden} عميل آخر — عرض الكل
              </button>
            )}
          </section>

          {queue.instashopExcluded > 0 && (
            <div className="text-[11px] text-gray-400">لا تشمل القائمة {queue.instashopExcluded} عميل Instashop.</div>
          )}
        </>
      )}
    </div>
  )
}
