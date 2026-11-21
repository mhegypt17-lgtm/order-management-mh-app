'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuthStore } from '@/lib/auth'
import CustomerDetails from '@/components/retention/CustomerDetails'
import ContactLogger from '@/components/retention/ContactLogger'

type Card = {
  id: string
  name: string
  phone: string
  days: number
  stage: number
  tag: string
  orders: number | null
  spend: number | null
  segment: string | null
  usualGapDays: number | null
  lateBy: number | null
  openComplaints: number
}

type Queue = {
  tableReady: boolean
  error: string | null
  service: Card[]
  winback: Card[]
  moreWaiting: number
  doneToday: number
  doneTodayByAgent: Record<string, number>
  scoresUpdatedAt: string | null
}

const whatsappLink = (phone: string) => {
  const digits = phone.replace(/\D/g, '')
  if (!digits) return null
  return `https://wa.me/${digits.startsWith('0') ? `20${digits.slice(1)}` : digits}`
}

function QueueCard({ card, agent, onLogged }: { card: Card; agent: string; onLogged: (id: string) => void }) {
  const [logging, setLogging] = useState(false)
  const wa = whatsappLink(card.phone)
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
            <a href={wa} target="_blank" rel="noreferrer" className="px-2 py-1 rounded-lg bg-green-50 border border-green-300 text-green-800 text-sm" title="واتساب">
              💬
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
      <CustomerDetails customerId={card.id} name={card.name} days={card.days} audience="cs" />
      {logging ? (
        <div className="border-t border-gray-100 pt-2">
          <ContactLogger customerId={card.id} agent={agent} onLogged={() => onLogged(card.id)} />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setLogging(true)}
          className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
        >
          ✅ تسجيل نتيجة المكالمة
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

  // A logged customer leaves the list at once; the next load confirms it from the server.
  const handleLogged = (id: string) =>
    setQueue((q) =>
      q
        ? {
            ...q,
            service: q.service.filter((c) => c.id !== id),
            winback: q.winback.filter((c) => c.id !== id),
            doneToday: q.doneToday + 1,
            doneTodayByAgent: { ...q.doneTodayByAgent, [agent]: (q.doneTodayByAgent[agent] || 0) + 1 },
          }
        : q,
    )

  return (
    <div dir="rtl" className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📞 اتصل بهم اليوم</h1>
          <p className="text-sm text-gray-600 mt-1">عملاء توقفوا عن الطلب، مرتّبون حسب القيمة ثم التأخر عن عادتهم. سجّل نتيجة كل مكالمة لتختفي من القائمة.</p>
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
              سجل المكالمات غير مفعّل بعد — على الإدارة تشغيل <code>data/retention-contacts-migration.sql</code> في Supabase. حتى ذلك الحين لن يمكن تسجيل النتائج.
            </div>
          )}
          {queue.error && <div className="p-3 rounded-lg bg-red-50 border border-red-300 text-red-800 text-xs">تعذّر تحميل جزء من البيانات: {queue.error}</div>}

          <div className="flex flex-wrap gap-3 text-sm">
            <span className="px-3 py-1 rounded-lg bg-white border border-gray-200">✅ تم اليوم (الفريق): <b>{queue.doneToday}</b></span>
            {agent && <span className="px-3 py-1 rounded-lg bg-white border border-gray-200">أنا: <b>{queue.doneTodayByAgent[agent] || 0}</b></span>}
            <span className="px-3 py-1 rounded-lg bg-white border border-gray-200">المتبقي في القائمة: <b>{queue.service.length + queue.winback.length}</b></span>
          </div>

          {queue.service.length > 0 && (
            <section className="space-y-2">
              <h2 className="font-bold text-red-800">⚠️ مكالمة خدمة أولاً (لديهم شكوى مفتوحة) — {queue.service.length}</h2>
              {queue.service.map((c) => <QueueCard key={c.id} card={c} agent={agent} onLogged={handleLogged} />)}
            </section>
          )}

          <section className="space-y-2">
            <h2 className="font-bold text-gray-900">🔁 استرجاع العملاء — {queue.winback.length}</h2>
            {queue.winback.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-500 bg-white border border-gray-200 rounded-xl">لا يوجد عملاء في القائمة الآن 🎉</div>
            ) : (
              queue.winback.map((c) => <QueueCard key={c.id} card={c} agent={agent} onLogged={handleLogged} />)
            )}
            {queue.moreWaiting > 0 && <div className="text-xs text-gray-500">يوجد {queue.moreWaiting} عميل آخر ينتظر — يظهرون تلقائياً بعد إنهاء هذه القائمة.</div>}
          </section>
        </>
      )}
    </div>
  )
}
