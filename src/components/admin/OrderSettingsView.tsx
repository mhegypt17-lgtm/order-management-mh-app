'use client'

import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'

type SectionKey =
  | 'orderReceivers'
  | 'orderMethods'
  | 'customerSources'
  | 'orderTypes'
  | 'paymentMethods'
  | 'orderStatuses'
  | 'complaintChannels'
  | 'complaintReasons'

type AgentNotice = {
  message: string
  type: 'info' | 'promo' | 'warning' | 'success'
  isActive: boolean
}

const NOTICE_STYLES: Record<AgentNotice['type'], { bg: string; border: string; icon: string; text: string }> = {
  info:    { bg: 'bg-blue-50',   border: 'border-blue-400',   icon: '💬', text: 'text-blue-900' },
  promo:   { bg: 'bg-purple-50', border: 'border-purple-400', icon: '🎉', text: 'text-purple-900' },
  warning: { bg: 'bg-yellow-50', border: 'border-yellow-400', icon: '⚠️', text: 'text-yellow-900' },
  success: { bg: 'bg-green-50',  border: 'border-green-400',  icon: '✅', text: 'text-green-900' },
}

function NoticeCallout({ type, message }: { type: AgentNotice['type']; message: string }) {
  const s = NOTICE_STYLES[type] || NOTICE_STYLES.info
  return (
    <div className={`flex items-start gap-3 rounded-xl border-2 ${s.border} ${s.bg} px-4 py-3`}>
      <span className="text-xl mt-0.5 shrink-0">{s.icon}</span>
      <p className={`text-sm font-medium leading-relaxed ${s.text} whitespace-pre-wrap text-right`} dir="rtl">
        {message}
      </p>
    </div>
  )
}

type LookupItem = {
  id: string
  label: string
  isActive: boolean
  sortOrder: number
}

type SettingsState = Record<SectionKey, LookupItem[]>

const SECTION_META: { key: SectionKey; title: string; hint: string }[] = [
  { key: 'orderReceivers', title: 'متلقي الطلب', hint: 'الأشخاص الذين يستقبلون الطلبات' },
  { key: 'orderMethods', title: 'طرق الطلب', hint: 'مثل Call و WhatsApp' },
  { key: 'orderTypes', title: 'نوع الطلب', hint: 'مثل Online و B2B و App' },
  { key: 'customerSources', title: 'مصادر العملاء', hint: 'مثل Facebook و Google' },
  { key: 'paymentMethods', title: 'طرق الدفع', hint: 'مثل Cash و Instapay و Visa' },
  { key: 'orderStatuses', title: 'حالات الطلب', hint: 'مثل تم و مؤجل و لاغي' },
  { key: 'complaintChannels', title: 'قنوات الشكاوى', hint: 'مثل App و Instashop و Branch' },
  { key: 'complaintReasons', title: 'أسباب الشكاوى', hint: 'مثل تأخير التوصيل أو جودة المنتج' },
]

function normalizeItems(items: LookupItem[]): LookupItem[] {
  return items
    .map((item, idx) => ({
      ...item,
      label: String(item.label || '').trim(),
      sortOrder: idx + 1,
    }))
    .filter((item) => item.label.length > 0)
}

export default function OrderSettingsView() {
  const [loading, setLoading] = useState(true)
  const [savingSection, setSavingSection] = useState<SectionKey | null>(null)
  const [savingNotice, setSavingNotice] = useState(false)
  const [savingBudget, setSavingBudget] = useState(false)
  const [savingSla, setSavingSla] = useState(false)
  const [savingLoyalty, setSavingLoyalty] = useState(false)
  const [savingRetention, setSavingRetention] = useState(false)
  const [monthlyCompensationBudget, setMonthlyCompensationBudget] = useState(0)
  const [slaHours, setSlaHours] = useState(4)
  const [loyaltyMode, setLoyaltyMode] = useState<'frequency' | 'revenue'>('frequency')
  const [loyaltyTiers, setLoyaltyTiers] = useState<Array<{ name: string; threshold: number; color: string; icon: string }>>([
    { name: 'برونزي',  threshold: 0,  color: 'bg-amber-100 text-amber-800',   icon: '🥉' },
    { name: 'فضي',     threshold: 5,  color: 'bg-gray-100 text-gray-700',     icon: '🥈' },
    { name: 'ذهبي',    threshold: 10, color: 'bg-yellow-100 text-yellow-800', icon: '🥇' },
    { name: 'بلاتيني',  threshold: 20, color: 'bg-purple-100 text-purple-800', icon: '💎' },
  ])
  type RetentionAction = 'reminder' | 'task' | 'off'
  type RetentionAgent = 'رنا' | 'مى' | 'ميرنا' | 'أمل' | 'auto'
  interface RetentionStageState { days: number; action: RetentionAction; assignedTo: RetentionAgent }
  const [retention, setRetention] = useState<{ stage1: RetentionStageState; stage2: RetentionStageState; stage3: RetentionStageState }>({
    stage1: { days: 30, action: 'reminder', assignedTo: 'auto' },
    stage2: { days: 60, action: 'reminder', assignedTo: 'auto' },
    stage3: { days: 90, action: 'task',     assignedTo: 'auto' },
  })
  const [agentNotice, setAgentNotice] = useState<AgentNotice>({
    message: '',
    type: 'info',
    isActive: false,
  })
  const [settings, setSettings] = useState<SettingsState>({
    orderReceivers: [],
    orderMethods: [],
    customerSources: [],
    orderTypes: [],
    paymentMethods: [],
    orderStatuses: [],
    complaintChannels: [],
    complaintReasons: [],
  })
  const [newValues, setNewValues] = useState<Record<SectionKey, string>>({
    orderReceivers: '',
    orderMethods: '',
    customerSources: '',
    orderTypes: '',
    paymentMethods: '',
    orderStatuses: '',
    complaintChannels: '',
    complaintReasons: '',
  })

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch('/api/order-settings')
        if (!response.ok) throw new Error('failed')
        const data = await response.json()

        setSettings({
          orderReceivers: Array.isArray(data.settings?.orderReceivers) ? data.settings.orderReceivers : [],
          orderMethods: Array.isArray(data.settings?.orderMethods) ? data.settings.orderMethods : [],
          customerSources: Array.isArray(data.settings?.customerSources) ? data.settings.customerSources : [],
          orderTypes: Array.isArray(data.settings?.orderTypes) ? data.settings.orderTypes : [],
          paymentMethods: Array.isArray(data.settings?.paymentMethods) ? data.settings.paymentMethods : [],
          orderStatuses: Array.isArray(data.settings?.orderStatuses) ? data.settings.orderStatuses : [],
          complaintChannels: Array.isArray(data.settings?.complaintChannels) ? data.settings.complaintChannels : [],
          complaintReasons: Array.isArray(data.settings?.complaintReasons) ? data.settings.complaintReasons : [],
        })

        if (data.settings?.agentNotice) {
          setAgentNotice({
            message: data.settings.agentNotice.message || '',
            type: data.settings.agentNotice.type || 'info',
            isActive: Boolean(data.settings.agentNotice.isActive),
          })
        }

        setMonthlyCompensationBudget(Number(data.settings?.monthlyCompensationBudget) || 0)

        if (data.loyalty || data.settings?.loyalty) {
          const ly = data.loyalty || data.settings.loyalty
          if (ly?.mode === 'revenue' || ly?.mode === 'frequency') setLoyaltyMode(ly.mode)
          if (Array.isArray(ly?.tiers) && ly.tiers.length === 4) {
            setLoyaltyTiers(ly.tiers.map((t: any, i: number) => ({
              name: String(t.name || ['برونزي','فضي','ذهبي','بلاتيني'][i]),
              threshold: Number(t.threshold) || 0,
              color: String(t.color || ''),
              icon: String(t.icon || ''),
            })))
          }
        }

        if (data.slaHours) {
          setSlaHours(data.slaHours)
        }

        const ret = data.retention || data.settings?.retention
        if (ret && ret.stage1 && ret.stage2 && ret.stage3) {
          const validActions: RetentionAction[] = ['reminder', 'task', 'off']
          const validAgents: RetentionAgent[] = ['رنا', 'مى', 'ميرنا', 'أمل', 'auto']
          const norm = (s: any, def: RetentionStageState): RetentionStageState => ({
            days: Number(s?.days) > 0 ? Math.floor(Number(s.days)) : def.days,
            action: validActions.includes(s?.action) ? s.action : def.action,
            assignedTo: validAgents.includes(s?.assignedTo) ? s.assignedTo : def.assignedTo,
          })
          setRetention({
            stage1: norm(ret.stage1, { days: 30, action: 'reminder', assignedTo: 'auto' }),
            stage2: norm(ret.stage2, { days: 60, action: 'reminder', assignedTo: 'auto' }),
            stage3: norm(ret.stage3, { days: 90, action: 'task',     assignedTo: 'auto' }),
          })
        }
      } catch {
        toast.error('تعذر تحميل إعدادات النظام')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  const activeCounts = useMemo(
    () => ({
      orderReceivers: settings.orderReceivers.filter((x) => x.isActive).length,
      orderMethods: settings.orderMethods.filter((x) => x.isActive).length,
      customerSources: settings.customerSources.filter((x) => x.isActive).length,
      orderTypes: settings.orderTypes.filter((x) => x.isActive).length,
      paymentMethods: settings.paymentMethods.filter((x) => x.isActive).length,
      orderStatuses: settings.orderStatuses.filter((x) => x.isActive).length,
      complaintChannels: settings.complaintChannels.filter((x) => x.isActive).length,
      complaintReasons: settings.complaintReasons.filter((x) => x.isActive).length,
    }),
    [settings]
  )

  const updateItem = (section: SectionKey, id: string, patch: Partial<LookupItem>) => {
    setSettings((prev) => ({
      ...prev,
      [section]: prev[section].map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }))
  }

  const moveItem = (section: SectionKey, index: number, direction: 'up' | 'down') => {
    setSettings((prev) => {
      const next = [...prev[section]]
      const targetIndex = direction === 'up' ? index - 1 : index + 1
      if (targetIndex < 0 || targetIndex >= next.length) return prev

      const current = next[index]
      next[index] = next[targetIndex]
      next[targetIndex] = current

      return {
        ...prev,
        [section]: next.map((item, idx) => ({ ...item, sortOrder: idx + 1 })),
      }
    })
  }

  const removeItem = (section: SectionKey, id: string) => {
    setSettings((prev) => {
      const filtered = prev[section].filter((item) => item.id !== id)
      return {
        ...prev,
        [section]: filtered.map((item, idx) => ({ ...item, sortOrder: idx + 1 })),
      }
    })
  }

  const addItem = (section: SectionKey) => {
    const label = newValues[section].trim()
    if (!label) return

    const exists = settings[section].some((item) => item.label.toLowerCase() === label.toLowerCase())
    if (exists) {
      toast.error('هذه القيمة موجودة بالفعل')
      return
    }

    setSettings((prev) => ({
      ...prev,
      [section]: [
        ...prev[section],
        {
          id: `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          label,
          isActive: true,
          sortOrder: prev[section].length + 1,
        },
      ],
    }))

    setNewValues((prev) => ({ ...prev, [section]: '' }))
  }

  const saveSection = async (section: SectionKey) => {
    const normalized = normalizeItems(settings[section])
    if (normalized.length === 0) {
      toast.error('يجب إدخال قيمة واحدة على الأقل')
      return
    }

    setSavingSection(section)
    try {
      const response = await fetch('/api/order-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section, items: normalized }),
      })

      if (!response.ok) throw new Error('failed')
      const data = await response.json()

      setSettings({
        orderReceivers: data.settings.orderReceivers,
        orderMethods: data.settings.orderMethods,
        customerSources: data.settings.customerSources,
        orderTypes: data.settings.orderTypes,
        paymentMethods: data.settings.paymentMethods,
        orderStatuses: data.settings.orderStatuses,
        complaintChannels: data.settings.complaintChannels,
        complaintReasons: data.settings.complaintReasons,
      })

      toast.success('تم حفظ الإعدادات')
    } catch {
      toast.error('تعذر حفظ الإعدادات')
    } finally {
      setSavingSection(null)
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-gray-500">⏳ جاري تحميل إعدادات الإدارة...</div>
  }

  return (
    <div className="space-y-5">
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h1 className="text-2xl font-bold text-gray-900">⚙️ إعدادات النظام</h1>
        <p className="text-sm text-gray-600 mt-1">إدارة القيم المستخدمة في النماذج مثل مصادر العملاء وطرق الطلب.</p>
      </div>

      {SECTION_META.map((meta) => (
        <section key={meta.key} className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{meta.title}</h2>
              <p className="text-xs text-gray-500">{meta.hint}</p>
            </div>
            <div className="text-sm text-gray-600">القيم المفعلة: {activeCounts[meta.key]}</div>
          </div>

          <div className="space-y-2">
            {settings[meta.key].map((item, index) => (
              <div key={item.id} className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-center border border-gray-200 rounded-lg p-2">
                <input
                  value={item.label}
                  onChange={(e) => updateItem(meta.key, item.id, { label: e.target.value })}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  dir="rtl"
                />
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={item.isActive}
                    onChange={(e) => updateItem(meta.key, item.id, { isActive: e.target.checked })}
                  />
                  مفعلة
                </label>
                <button
                  type="button"
                  onClick={() => moveItem(meta.key, index, 'up')}
                  className="px-2 py-1 rounded bg-gray-100 text-gray-700"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveItem(meta.key, index, 'down')}
                  className="px-2 py-1 rounded bg-gray-100 text-gray-700"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => removeItem(meta.key, item.id)}
                  className="px-2 py-1 rounded bg-red-100 text-red-700"
                >
                  حذف
                </button>
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-col md:flex-row gap-2">
            <input
              value={newValues[meta.key]}
              onChange={(e) => setNewValues((prev) => ({ ...prev, [meta.key]: e.target.value }))}
              placeholder="أضف قيمة جديدة"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
              dir="rtl"
            />
            <button
              type="button"
              onClick={() => addItem(meta.key)}
              className="px-3 py-2 rounded-lg bg-gray-100 text-gray-800 hover:bg-gray-200"
            >
              + إضافة
            </button>
            <button
              type="button"
              disabled={savingSection === meta.key}
              onClick={() => saveSection(meta.key)}
              className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
            >
              {savingSection === meta.key ? 'جاري الحفظ...' : 'حفظ القسم'}
            </button>
          </div>
        </section>
      ))}

      <section className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">ميزانية التعويض الشهرية</h2>
            <p className="text-xs text-gray-500">تستخدم في لوحات المتابعة لمقارنة إجمالي التعويض الشهري مقابل الحد المسموح.</p>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-2">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1 text-right">قيمة الميزانية (ج.م)</label>
            <input
              type="number"
              min={0}
              value={monthlyCompensationBudget}
              onChange={(e) => setMonthlyCompensationBudget(Number(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
              dir="ltr"
            />
          </div>

          <div className="md:self-end">
            <button
              type="button"
              disabled={savingBudget}
              onClick={async () => {
                setSavingBudget(true)
                try {
                  const res = await fetch('/api/order-settings', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ monthlyCompensationBudget }),
                  })

                  if (!res.ok) throw new Error()
                  toast.success('تم حفظ ميزانية التعويض الشهرية')
                } catch {
                  toast.error('تعذر حفظ ميزانية التعويض الشهرية')
                } finally {
                  setSavingBudget(false)
                }
              }}
              className="px-5 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 font-medium"
            >
              {savingBudget ? 'جاري الحفظ...' : '💾 حفظ الميزانية'}
            </button>
          </div>
        </div>
      </section>

      {/* Customer Loyalty / Tier Settings */}
      <section className="bg-white border-2 border-purple-300 rounded-xl p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">🏆 ولاء العملاء (Customer Tiers)</h2>
            <p className="text-xs text-gray-500">حدد قاعدة الترقية واختر العتبات الخاصة بكل مستوى. يتم حساب المستوى تلقائياً ويُعرض في صفحة CRM.</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className={`rounded-lg p-3 border-2 ${loyaltyMode === 'frequency' ? 'border-blue-300 bg-blue-50' : 'border-emerald-300 bg-emerald-50'}`} dir="rtl">
            <p className="text-sm font-bold">
              ✅ القاعدة المُفعَّلة حالياً: {loyaltyMode === 'frequency' ? '📦 عدد الطلبات المكتملة' : '💰 إجمالي الإيرادات'}
            </p>
            <p className="text-xs text-gray-600 mt-1">
              يتم تطبيق قاعدة واحدة فقط في كل مرة. يتم تجاهل القاعدة الأخرى عند الحساب.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 text-right">اختر قاعدة الترقية (واحدة فقط)</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <label className={`cursor-pointer px-4 py-3 rounded-lg border-2 text-right transition ${loyaltyMode === 'frequency' ? 'border-purple-500 bg-purple-50 text-purple-900 font-semibold ring-2 ring-purple-200' : 'border-gray-200 text-gray-500 bg-white opacity-70 hover:opacity-100'}`}>
                <input
                  type="radio"
                  name="loyaltyMode"
                  className="sr-only"
                  checked={loyaltyMode === 'frequency'}
                  onChange={() => setLoyaltyMode('frequency')}
                />
                <div className="flex items-center justify-between">
                  <span>{loyaltyMode === 'frequency' ? '🟢 مفعَّل' : '⚪ غير مفعَّل'}</span>
                  <span>📦 عدد الطلبات المكتملة (Frequency)</span>
                </div>
              </label>
              <label className={`cursor-pointer px-4 py-3 rounded-lg border-2 text-right transition ${loyaltyMode === 'revenue' ? 'border-purple-500 bg-purple-50 text-purple-900 font-semibold ring-2 ring-purple-200' : 'border-gray-200 text-gray-500 bg-white opacity-70 hover:opacity-100'}`}>
                <input
                  type="radio"
                  name="loyaltyMode"
                  className="sr-only"
                  checked={loyaltyMode === 'revenue'}
                  onChange={() => setLoyaltyMode('revenue')}
                />
                <div className="flex items-center justify-between">
                  <span>{loyaltyMode === 'revenue' ? '🟢 مفعَّل' : '⚪ غير مفعَّل'}</span>
                  <span>💰 إجمالي الإيرادات (Revenue)</span>
                </div>
              </label>
            </div>
            <p className="text-[11px] text-gray-500 mt-2 text-right">
              {loyaltyMode === 'revenue'
                ? 'يتم حساب المستوى بناءً على إجمالي الإيرادات (ج.م) من جميع الطلبات (ما عدا الملغاة).'
                : 'يتم حساب المستوى بناءً على عدد الطلبات (ما عدا الملغاة).'}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-700">
                  <th className="px-3 py-2 text-right font-semibold">المستوى</th>
                  <th className="px-3 py-2 text-right font-semibold">الاسم</th>
                  <th className="px-3 py-2 text-right font-semibold">
                    الحد الأدنى ({loyaltyMode === 'revenue' ? 'ج.م' : 'طلب'})
                  </th>
                </tr>
              </thead>
              <tbody>
                {loyaltyTiers.map((t, idx) => (
                  <tr key={idx} className="border-t border-gray-100">
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${t.color}`}>
                        <span>{t.icon}</span>
                        <span>{t.name || '—'}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={t.name}
                        onChange={(e) => {
                          const v = e.target.value
                          setLoyaltyTiers((prev) => prev.map((p, i) => (i === idx ? { ...p, name: v } : p)))
                        }}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-right"
                        dir="rtl"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        step={loyaltyMode === 'revenue' ? 100 : 1}
                        value={t.threshold}
                        disabled={idx === 0}
                        onChange={(e) => {
                          const v = Math.max(0, Number(e.target.value) || 0)
                          setLoyaltyTiers((prev) => prev.map((p, i) => (i === idx ? { ...p, threshold: v } : p)))
                        }}
                        className="w-32 px-2 py-1.5 border border-gray-300 rounded-lg text-left disabled:bg-gray-100 disabled:text-gray-500"
                        dir="ltr"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-gray-500 mt-1 text-right">المستوى الأول يبدأ تلقائياً من 0 وهو الافتراضي لكل عميل جديد.</p>
          </div>

          <div>
            <button
              type="button"
              disabled={savingLoyalty}
              onClick={async () => {
                // Validate: thresholds must be strictly increasing (after first)
                const sorted = [...loyaltyTiers]
                for (let i = 1; i < sorted.length; i++) {
                  if (sorted[i].threshold <= sorted[i - 1].threshold) {
                    toast.error('الحد الأدنى لكل مستوى يجب أن يكون أكبر من السابق')
                    return
                  }
                }
                setSavingLoyalty(true)
                try {
                  const res = await fetch('/api/order-settings', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ loyalty: { mode: loyaltyMode, tiers: loyaltyTiers } }),
                  })
                  if (!res.ok) throw new Error()
                  toast.success('تم حفظ إعدادات ولاء العملاء')
                } catch {
                  toast.error('تعذر حفظ إعدادات الولاء')
                } finally {
                  setSavingLoyalty(false)
                }
              }}
              className="px-5 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 font-medium"
            >
              {savingLoyalty ? 'جاري الحفظ...' : '💾 حفظ إعدادات الولاء'}
            </button>
          </div>
        </div>
      </section>

      {/* Customer Retention Section */}
      <section className="bg-white border-2 border-orange-300 rounded-xl p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">🔁 متابعة العملاء الخاملين (Retention)</h2>
            <p className="text-xs text-gray-500">
              حدد عدد الأيام لكل مرحلة ونوع الإجراء (تذكير فقط أو إنشاء مهمة) والوكيل المسؤول.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {([
            { key: 'stage1', label: 'المرحلة الأولى', emoji: '🟡', color: 'border-yellow-300 bg-yellow-50' },
            { key: 'stage2', label: 'المرحلة الثانية', emoji: '🟠', color: 'border-orange-300 bg-orange-50' },
            { key: 'stage3', label: 'المرحلة الثالثة', emoji: '🔴', color: 'border-red-300 bg-red-50' },
          ] as const).map((s) => {
            const cur = retention[s.key]
            const update = (patch: Partial<RetentionStageState>) =>
              setRetention((prev) => ({ ...prev, [s.key]: { ...prev[s.key], ...patch } }))
            return (
              <div key={s.key} className={`rounded-lg p-3 border-2 ${s.color}`} dir="rtl">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-600">
                    {cur.action === 'task' ? '🛠️ يُنشئ مهمة تلقائياً' : cur.action === 'off' ? '⛔ مُعطَّلة' : '🔔 تذكير فقط'}
                  </span>
                  <h3 className="font-bold text-gray-900">{s.emoji} {s.label}</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-gray-700 mb-1 text-right">عدد الأيام بدون طلب</label>
                    <input
                      type="number"
                      min={1}
                      value={cur.days}
                      onChange={(e) => update({ days: Math.max(1, Number(e.target.value) || 1) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-700 mb-1 text-right">الإجراء</label>
                    <select
                      value={cur.action}
                      onChange={(e) => update({ action: e.target.value as RetentionAction })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-right bg-white"
                    >
                      <option value="reminder">🔔 تذكير فقط (Notification)</option>
                      <option value="task">🛠️ إنشاء مهمة متابعة</option>
                      <option value="off">⛔ تعطيل هذه المرحلة</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-700 mb-1 text-right">يُسند إلى</label>
                    <select
                      value={cur.assignedTo}
                      onChange={(e) => update({ assignedTo: e.target.value as RetentionAgent })}
                      disabled={cur.action === 'off'}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-right bg-white disabled:bg-gray-100 disabled:opacity-60"
                    >
                      <option value="auto">🎲 توزيع تلقائي (Round Robin)</option>
                      <option value="رنا">رنا</option>
                      <option value="مى">مى</option>
                      <option value="ميرنا">ميرنا</option>
                      <option value="أمل">أمل</option>
                    </select>
                  </div>
                </div>
              </div>
            )
          })}

          <p className="text-[11px] text-gray-500 text-right">
            عدد الأيام يجب أن يتزايد بين المراحل (الأولى &lt; الثانية &lt; الثالثة).
            عند اختيار وكيل محدد، تُنشأ المهمة باسمه (إن كان الإجراء = إنشاء مهمة)، ويظهر اسمه أيضاً في تذكير الجرس.
          </p>

          <div>
            <button
              type="button"
              disabled={savingRetention}
              onClick={async () => {
                if (retention.stage2.days <= retention.stage1.days) {
                  toast.error('أيام المرحلة الثانية يجب أن تكون أكبر من الأولى')
                  return
                }
                if (retention.stage3.days <= retention.stage2.days) {
                  toast.error('أيام المرحلة الثالثة يجب أن تكون أكبر من الثانية')
                  return
                }
                setSavingRetention(true)
                try {
                  const res = await fetch('/api/order-settings', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ retention }),
                  })
                  if (!res.ok) {
                    const j = await res.json().catch(() => ({}))
                    throw new Error(j?.error || 'failed')
                  }
                  toast.success('تم حفظ إعدادات متابعة العملاء')
                } catch (e: any) {
                  toast.error(e?.message || 'تعذر حفظ إعدادات المتابعة')
                } finally {
                  setSavingRetention(false)
                }
              }}
              className="px-5 py-2 rounded-lg bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50 font-medium"
            >
              {savingRetention ? 'جاري الحفظ...' : '💾 حفظ إعدادات المتابعة'}
            </button>
          </div>
        </div>
      </section>

      {/* SLA Hours Section */}
      <section className="bg-white border-2 border-blue-300 rounded-xl p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">⏰ حد SLA للشكاوى</h2>
            <p className="text-xs text-gray-500">عدد الساعات المسموح بها قبل تفعيل التنبيه الأحمر 🚨</p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 text-right">الساعات (الحد الأدنى: 1)</label>
            <input
              type="number"
              min="1"
              max="72"
              value={slaHours}
              onChange={(e) => setSlaHours(Math.max(1, Number(e.target.value) || 4))}
              className="w-full md:w-48 px-3 py-2 border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <p className="text-xs text-gray-500 mt-1">الشكاوى التي تتجاوز هذا الحد ستظهر بعلامة 🚨 حمراء في القائمة</p>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            disabled={savingSla}
            onClick={async () => {
              setSavingSla(true)
              try {
                const res = await fetch('/api/order-settings', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ slaHours }),
                })
                if (!res.ok) throw new Error()
                const data = await res.json()
                // Confirm the value was saved by updating from response
                setSlaHours(data.slaHours || slaHours)
                toast.success(`✅ تم حفظ حد SLA: ${data.slaHours || slaHours} ساعات`)
              } catch {
                toast.error('تعذر حفظ حد SLA')
              } finally {
                setSavingSla(false)
              }
            }}
            className="px-5 py-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 font-medium"
          >
            {savingSla ? 'جاري الحفظ...' : '💾 حفظ حد SLA'}
          </button>
        </div>
      </section>

      {/* Agent Notice Section */}
      <section className="bg-white border-2 border-yellow-300 rounded-xl p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">� تنبيه</h2>
            <p className="text-xs text-gray-500">تظهر أعلى نموذج الطلب الجديد كرسالة ملونة للموظف (upsell، عرض، إجازة...)</p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
            <input
              type="checkbox"
              checked={agentNotice.isActive}
              onChange={(e) => setAgentNotice((prev) => ({ ...prev, isActive: e.target.checked }))}
              className="w-4 h-4"
            />
            تفعيل الرسالة
          </label>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 text-right">نوع الرسالة</label>
            <div className="flex flex-wrap gap-2">
              {([
                { value: 'info', label: '💬 معلومة', bg: 'bg-blue-100 text-blue-800 border-blue-300' },
                { value: 'promo', label: '🎉 عرض / Promo', bg: 'bg-purple-100 text-purple-800 border-purple-300' },
                { value: 'warning', label: '⚠️ تنبيه', bg: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
                { value: 'success', label: '✅ إيجابي', bg: 'bg-green-100 text-green-800 border-green-300' },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setAgentNotice((prev) => ({ ...prev, type: opt.value }))}
                  className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition ${
                    agentNotice.type === opt.value ? `${opt.bg} border-2` : 'bg-gray-100 text-gray-600 border-gray-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 text-right">نص الرسالة</label>
            <textarea
              value={agentNotice.message}
              onChange={(e) => setAgentNotice((prev) => ({ ...prev, message: e.target.value }))}
              rows={3}
              placeholder="مثال: 🎉 عرض خاص على الدجاج الكامل اليوم — اذكر للعميل! أو: سيكون المتجر مغلقاً يوم الجمعة"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 text-right"
              dir="rtl"
            />
          </div>

          {agentNotice.message && (
            <div>
              <p className="text-xs text-gray-500 mb-1 text-right">معاينة:</p>
              <NoticeCallout type={agentNotice.type} message={agentNotice.message} />
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            disabled={savingNotice}
            onClick={async () => {
              setSavingNotice(true)
              try {
                const res = await fetch('/api/order-settings', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(agentNotice),
                })
                if (!res.ok) throw new Error()
                toast.success('تم حفظ رسالة التنبيه')
              } catch {
                toast.error('تعذر حفظ الرسالة')
              } finally {
                setSavingNotice(false)
              }
            }}
            className="px-5 py-2 rounded-lg bg-yellow-500 text-white hover:bg-yellow-600 disabled:opacity-50 font-medium"
          >
            {savingNotice ? 'جاري الحفظ...' : '💾 حفظ الرسالة'}
          </button>
        </div>
      </section>
    </div>
  )
}
