'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import {
  DEFAULT_RETENTION_CONFIG,
  type RetentionConfig,
  type RetentionStageConfig,
} from '@/lib/omsData'

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
  // Only populated for `complaintReasons` — each parent reason carries a
  // nested list of sub-reasons the CS agent picks from. Other sections
  // leave this undefined and it never gets sent to the server.
  subReasons?: LookupItem[]
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
    .map((item, idx) => {
      const cleanSub = Array.isArray(item.subReasons)
        ? item.subReasons
            .map((s, sIdx) => ({
              ...s,
              label: String(s.label || '').trim(),
              sortOrder: sIdx + 1,
            }))
            .filter((s) => s.label.length > 0)
            .map((s, sIdx) => ({ ...s, sortOrder: sIdx + 1 }))
        : undefined
      const base: LookupItem = {
        ...item,
        label: String(item.label || '').trim(),
        sortOrder: idx + 1,
      }
      // Only carry `subReasons` on the wire if there's at least one.
      // Prevents empty arrays inflating the settings payload.
      if (cleanSub && cleanSub.length > 0) base.subReasons = cleanSub
      else delete base.subReasons
      return base
    })
    .filter((item) => item.label.length > 0)
}

export default function OrderSettingsView() {
  const [loading, setLoading] = useState(true)
  const [savingSection, setSavingSection] = useState<SectionKey | null>(null)
  const [savingNotice, setSavingNotice] = useState(false)
  const [savingBudget, setSavingBudget] = useState(false)
  const [savingSla, setSavingSla] = useState(false)
  const [savingTargetedGoal, setSavingTargetedGoal] = useState(false)
  const [monthlyCompensationBudget, setMonthlyCompensationBudget] = useState(0)
  const [monthlyTargetedUnitsGoal, setMonthlyTargetedUnitsGoal] = useState(0)
  const [slaHours, setSlaHours] = useState(4)
  const [autoActivateEnabled, setAutoActivateEnabled] = useState(true)
  const [autoActivateThreshold, setAutoActivateThreshold] = useState(3)
  const [savingAutoActivate, setSavingAutoActivate] = useState(false)
  const [retention, setRetention] = useState<RetentionConfig>(DEFAULT_RETENTION_CONFIG)
  const [savingRetention, setSavingRetention] = useState(false)
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
        setMonthlyTargetedUnitsGoal(Number(data.settings?.monthlyTargetedUnitsGoal) || 0)
        if (data.slaHours) {
          setSlaHours(data.slaHours)
        }
        if (data.settings?.autoActivateThreshold !== undefined) {
          setAutoActivateThreshold(Number(data.settings.autoActivateThreshold) || 3)
        }
        if (data.settings?.autoActivateEnabled !== undefined) {
          setAutoActivateEnabled(data.settings.autoActivateEnabled !== false)
        }
        if (data.settings?.retention) {
          const merged: RetentionConfig = {
            enabled: data.settings.retention.enabled !== false,
            stage1: { ...DEFAULT_RETENTION_CONFIG.stage1, ...(data.settings.retention.stage1 || {}) },
            stage2: { ...DEFAULT_RETENTION_CONFIG.stage2, ...(data.settings.retention.stage2 || {}) },
            stage3: { ...DEFAULT_RETENTION_CONFIG.stage3, ...(data.settings.retention.stage3 || {}) },
          }
          setRetention(merged)
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

  // ─── Sub-reason helpers (complaintReasons only) ────────────────────────
  // These edit the nested `subReasons` array on a parent reason. All four
  // funnel through `setSettings` so the existing "Save section" button
  // persists the whole tree in one PUT.
  const mutateSubReasons = (
    parentId: string,
    mutator: (subs: LookupItem[]) => LookupItem[],
  ) => {
    setSettings((prev) => ({
      ...prev,
      complaintReasons: prev.complaintReasons.map((parent) =>
        parent.id === parentId
          ? { ...parent, subReasons: mutator(parent.subReasons || []) }
          : parent,
      ),
    }))
  }

  const addSubReason = (parentId: string, label: string) => {
    const clean = label.trim()
    if (!clean) return
    mutateSubReasons(parentId, (subs) => {
      const exists = subs.some((s) => s.label.toLowerCase() === clean.toLowerCase())
      if (exists) {
        toast.error('هذا السبب الفرعي موجود بالفعل')
        return subs
      }
      return [
        ...subs,
        {
          id: `tmp_sub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          label: clean,
          isActive: true,
          sortOrder: subs.length + 1,
        },
      ]
    })
  }

  const updateSubReason = (parentId: string, subId: string, patch: Partial<LookupItem>) => {
    mutateSubReasons(parentId, (subs) =>
      subs.map((s) => (s.id === subId ? { ...s, ...patch } : s)),
    )
  }

  const removeSubReason = (parentId: string, subId: string) => {
    mutateSubReasons(parentId, (subs) =>
      subs
        .filter((s) => s.id !== subId)
        .map((s, idx) => ({ ...s, sortOrder: idx + 1 })),
    )
  }

  const moveSubReason = (parentId: string, index: number, direction: 'up' | 'down') => {
    mutateSubReasons(parentId, (subs) => {
      const next = [...subs]
      const target = direction === 'up' ? index - 1 : index + 1
      if (target < 0 || target >= next.length) return subs
      const cur = next[index]
      next[index] = next[target]
      next[target] = cur
      return next.map((s, idx) => ({ ...s, sortOrder: idx + 1 }))
    })
  }

  // Local per-parent input state for "add sub-reason" textboxes.
  const [newSubValues, setNewSubValues] = useState<Record<string, string>>({})
  const [expandedSubReasons, setExpandedSubReasons] = useState<Record<string, boolean>>({})

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

      <a
        href="/admin/settings/categories"
        className="block bg-gradient-to-l from-orange-50 to-amber-50 border-2 border-orange-200 rounded-xl p-4 hover:border-orange-400 transition"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-orange-900">🏷️ تصنيفات المنتجات</h2>
            <p className="text-xs text-orange-700 mt-1">
              إضافة، ترتيب، تفعيل أو حذف تصنيفات المنتجات — تظهر في كل صفحات المنتجات مباشرة.
            </p>
          </div>
          <span className="text-orange-600 font-bold">إدارة ←</span>
        </div>
      </a>

      <a
        href="/admin/settings/users"
        className="block bg-gradient-to-l from-purple-50 to-indigo-50 border-2 border-purple-200 rounded-xl p-4 hover:border-purple-400 transition"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-purple-900">👥 المستخدمون</h2>
            <p className="text-xs text-purple-700 mt-1">
              إضافة حسابات جديدة (إدارة، خدمة عملاء، فرع)، تعديل الأدوار، إعادة تعيين كلمات المرور، تعطيل أو حذف.
            </p>
          </div>
          <span className="text-purple-600 font-bold">إدارة ←</span>
        </div>
      </a>

      <a
        href="/admin/settings/products/import"
        className="block bg-gradient-to-l from-emerald-50 to-teal-50 border-2 border-emerald-200 rounded-xl p-4 hover:border-emerald-400 transition"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-emerald-900">🔄 مزامنة الأسعار من Google Sheets</h2>
            <p className="text-xs text-emerald-700 mt-1">
              استيراد الأسعار الجديدة من شيت منشور — يعرض الفروقات قبل التحديث، ويعدّل السعر الأساسي وسعر العرض فقط.
            </p>
          </div>
          <span className="text-emerald-600 font-bold">فتح ←</span>
        </div>
      </a>

      <a
        href="/admin/reports/preview"
        className="block bg-gradient-to-l from-red-50 to-orange-50 border-2 border-red-200 rounded-xl p-4 hover:border-red-400 transition"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-red-900">📊 تقارير العمليات (يومي + أسبوعي)</h2>
            <p className="text-xs text-red-700 mt-1">
              اليومي بيتبعت ٦ ص القاهرة، والأسبوعي كل يوم أحد ٨ ص — مبيعات، طلبات، عملاء، منتجات، شكاوى، مخزون، وتنبيهات.
            </p>
          </div>
          <span className="text-red-600 font-bold">فتح ←</span>
        </div>
      </a>

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
              <div key={item.id} className="border border-gray-200 rounded-lg p-2 space-y-2">
                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto_auto_auto] gap-2 items-center">
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
                {meta.key === 'complaintReasons' && (
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedSubReasons((prev) => ({ ...prev, [item.id]: !prev[item.id] }))
                    }
                    className="px-2 py-1 rounded bg-blue-100 text-blue-700 text-xs"
                    title="إدارة الأسباب الفرعية"
                  >
                    {expandedSubReasons[item.id] ? '▲' : '▼'} فرعية ({item.subReasons?.length || 0})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => removeItem(meta.key, item.id)}
                  className="px-2 py-1 rounded bg-red-100 text-red-700"
                >
                  حذف
                </button>
                </div>

                {meta.key === 'complaintReasons' && expandedSubReasons[item.id] && (
                  <div className="border-t border-gray-100 pt-2 mr-6 pl-2 space-y-1.5 bg-gray-50 rounded p-2">
                    <div className="text-xs font-semibold text-gray-600 mb-1">
                      الأسباب الفرعية لـ &quot;{item.label}&quot;
                    </div>
                    {(item.subReasons || []).map((sub, subIdx) => (
                      <div
                        key={sub.id}
                        className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto_auto] gap-1.5 items-center bg-white border border-gray-200 rounded px-2 py-1"
                      >
                        <input
                          value={sub.label}
                          onChange={(e) =>
                            updateSubReason(item.id, sub.id, { label: e.target.value })
                          }
                          className="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                          dir="rtl"
                        />
                        <label className="inline-flex items-center gap-1 text-xs text-gray-700">
                          <input
                            type="checkbox"
                            checked={sub.isActive}
                            onChange={(e) =>
                              updateSubReason(item.id, sub.id, { isActive: e.target.checked })
                            }
                          />
                          مفعل
                        </label>
                        <button
                          type="button"
                          onClick={() => moveSubReason(item.id, subIdx, 'up')}
                          className="px-1.5 py-0.5 text-xs rounded bg-gray-100 text-gray-700"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveSubReason(item.id, subIdx, 'down')}
                          className="px-1.5 py-0.5 text-xs rounded bg-gray-100 text-gray-700"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => removeSubReason(item.id, sub.id)}
                          className="px-1.5 py-0.5 text-xs rounded bg-red-100 text-red-700"
                        >
                          حذف
                        </button>
                      </div>
                    ))}
                    <div className="flex gap-1.5 pt-1">
                      <input
                        value={newSubValues[item.id] || ''}
                        onChange={(e) =>
                          setNewSubValues((prev) => ({ ...prev, [item.id]: e.target.value }))
                        }
                        placeholder="أضف سبب فرعي"
                        className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                        dir="rtl"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            addSubReason(item.id, newSubValues[item.id] || '')
                            setNewSubValues((prev) => ({ ...prev, [item.id]: '' }))
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          addSubReason(item.id, newSubValues[item.id] || '')
                          setNewSubValues((prev) => ({ ...prev, [item.id]: '' }))
                        }}
                        className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-800 hover:bg-gray-200"
                      >
                        + إضافة
                      </button>
                    </div>
                  </div>
                )}
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

      {/* Monthly targeted-units team goal */}
      <section className="bg-white border-2 border-amber-300 rounded-xl p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">🎯 هدف الفريق الشهري للمنتجات المستهدفة</h2>
            <p className="text-xs text-gray-500">
              عدد الوحدات المطلوب بيعها شهرياً من المنتجات المستهدفة لكل فريق خدمة العملاء.
              يتم احتساب نسبة الإنجاز تلقائياً على إجمالي الفريق فقط (وليس لكل وكيلة على حدة)،
              ويتم تصفير الإنجاز تلقائياً مع بداية كل شهر ميلادي.
            </p>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-2">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1 text-right">عدد الوحدات (شهرياً)</label>
            <input
              type="number"
              min={0}
              step={1}
              value={monthlyTargetedUnitsGoal}
              onChange={(e) => setMonthlyTargetedUnitsGoal(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
              className="w-full px-3 py-2 border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              dir="ltr"
              placeholder="0 = بدون هدف"
            />
            <p className="text-[11px] text-gray-500 mt-1 text-right">
              ضع 0 لإخفاء نسبة الإنجاز.
            </p>
          </div>

          <div className="md:self-end">
            <button
              type="button"
              disabled={savingTargetedGoal}
              onClick={async () => {
                setSavingTargetedGoal(true)
                try {
                  const res = await fetch('/api/order-settings', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ monthlyTargetedUnitsGoal }),
                  })

                  if (!res.ok) throw new Error()
                  toast.success('تم حفظ هدف الفريق الشهري')
                } catch {
                  toast.error('تعذر حفظ هدف الفريق الشهري')
                } finally {
                  setSavingTargetedGoal(false)
                }
              }}
              className="px-5 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 font-medium"
            >
              {savingTargetedGoal ? 'جاري الحفظ...' : '💾 حفظ الهدف'}
            </button>
          </div>
        </div>
      </section>

      {/* Auto-activate (warning → active) rule */}
      <section className="bg-white border-2 border-amber-300 rounded-xl p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">🔄 قاعدة إعادة تفعيل العميل تلقائياً</h2>
            <p className="text-xs text-gray-500">
              عندما يكون العميل في حالة <span className="font-semibold text-amber-700">تحذير</span>،
              يعود تلقائياً إلى <span className="font-semibold text-emerald-700">نشط</span> بعد عدد معين من الطلبات
              النظيفة (تم التوصيل بدون تعويض/مرتجع).
            </p>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-3 items-end">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoActivateEnabled}
              onChange={(e) => setAutoActivateEnabled(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm font-medium text-gray-800">تفعيل القاعدة</span>
          </label>

          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1 text-right">
              عدد الطلبات النظيفة المطلوبة
            </label>
            <input
              type="number"
              min={1}
              value={autoActivateThreshold}
              onChange={(e) => setAutoActivateThreshold(Math.max(1, Number(e.target.value) || 1))}
              disabled={!autoActivateEnabled}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-gray-100"
              dir="ltr"
            />
          </div>

          <button
            type="button"
            disabled={savingAutoActivate}
            onClick={async () => {
              setSavingAutoActivate(true)
              try {
                const res = await fetch('/api/order-settings', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    autoActivateEnabled,
                    autoActivateThreshold,
                  }),
                })
                if (!res.ok) throw new Error()
                toast.success('تم حفظ قاعدة التفعيل التلقائي')
              } catch {
                toast.error('تعذر حفظ القاعدة')
              } finally {
                setSavingAutoActivate(false)
              }
            }}
            className="px-5 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 font-medium"
          >
            {savingAutoActivate ? 'جاري الحفظ...' : '💾 حفظ القاعدة'}
          </button>
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

      {/* ── Retention (inactive customer follow-up) ─────────────────────── */}
      <section className="bg-white border-2 border-emerald-300 rounded-xl p-4 space-y-4" dir="rtl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-emerald-900 flex items-center gap-2">
              🔁 متابعة العملاء الخاملين (Retention)
            </h3>
            <p className="text-sm text-emerald-700 mt-1">
              تحكّم في عدد الأيام لكل مرحلة (30/60/90 افتراضي)، الإجراء المطلوب، ومن المُكلّف. تظهر التنبيهات والمهام لـ CS والإدارة فقط.
            </p>
          </div>
          <Link
            href="/admin/retention"
            className="shrink-0 px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-sm font-medium"
          >
            📊 لوحة المتابعة
          </Link>
        </div>

        {/* Master switch */}
        <label className="flex items-center gap-3 p-3 rounded-lg bg-emerald-50 border border-emerald-200 cursor-pointer">
          <input
            type="checkbox"
            checked={retention.enabled !== false}
            onChange={(e) => setRetention({ ...retention, enabled: e.target.checked })}
            className="w-5 h-5 accent-emerald-600"
          />
          <span className="font-medium text-emerald-900">
            تفعيل محرك متابعة العملاء الخاملين
          </span>
        </label>

        {/* Stage cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {([1, 2, 3] as const).map((n) => {
            const stageKey = (`stage${n}` as 'stage1' | 'stage2' | 'stage3')
            const stage: RetentionStageConfig = retention[stageKey]
            const accent =
              n === 1 ? 'border-yellow-300 bg-yellow-50' :
              n === 2 ? 'border-orange-300 bg-orange-50' :
                        'border-red-300 bg-red-50'
            const update = (patch: Partial<RetentionStageConfig>) =>
              setRetention({ ...retention, [stageKey]: { ...stage, ...patch } })
            return (
              <div key={n} className={`rounded-xl border-2 ${accent} p-3 space-y-3`}>
                <div className="font-bold text-gray-900">
                  {n === 1 ? '🟡 المرحلة 1' : n === 2 ? '🟠 المرحلة 2' : '🔴 المرحلة 3'}
                </div>

                <label className="block text-sm">
                  <span className="text-gray-700 font-medium">عدد الأيام بدون طلب</span>
                  <input
                    type="number"
                    min={1}
                    value={stage.days}
                    onChange={(e) => update({ days: Math.max(1, Number(e.target.value) || 1) })}
                    className="mt-1 w-full px-2 py-1.5 border-2 border-gray-300 rounded-lg text-center font-bold"
                  />
                </label>

                <label className="block text-sm">
                  <span className="text-gray-700 font-medium">الإجراء</span>
                  <select
                    value={stage.action}
                    onChange={(e) => update({ action: e.target.value as RetentionStageConfig['action'] })}
                    className="mt-1 w-full px-2 py-1.5 border-2 border-gray-300 rounded-lg"
                  >
                    <option value="off">إيقاف</option>
                    <option value="notify">إشعار فقط</option>
                    <option value="task">إنشاء مهمة + إشعار</option>
                  </select>
                </label>

                <label className="block text-sm">
                  <span className="text-gray-700 font-medium">المُكلّف</span>
                  <select
                    value={stage.assignedTo}
                    onChange={(e) => update({ assignedTo: e.target.value as RetentionStageConfig['assignedTo'] })}
                    className="mt-1 w-full px-2 py-1.5 border-2 border-gray-300 rounded-lg"
                  >
                    <option value="auto">توزيع تلقائي</option>
                    <option value="رنا">رنا</option>
                    <option value="مى">مى</option>
                    <option value="ميرنا">ميرنا</option>
                    <option value="أمل">أمل</option>
                  </select>
                </label>

                <label className="block text-sm">
                  <span className="text-gray-700 font-medium">فترة الانتظار بعد الإغلاق (يوم)</span>
                  <input
                    type="number"
                    min={0}
                    value={stage.cooldownDays ?? 0}
                    onChange={(e) => update({ cooldownDays: Math.max(0, Number(e.target.value) || 0) })}
                    className="mt-1 w-full px-2 py-1.5 border-2 border-gray-300 rounded-lg text-center"
                  />
                  <span className="block text-xs text-gray-500 mt-1">
                    لا تُنشئ مهمة جديدة قبل مرور هذه المدة على إغلاق آخر مهمة لنفس العميل.
                  </span>
                </label>
              </div>
            )
          })}
        </div>

        <div className="text-xs text-gray-600 bg-gray-50 rounded-lg p-2 border border-gray-200">
          ⓘ لإيقاف المتابعة لعميل معيّن أو تأجيلها، استخدم لوحة المتابعة أعلاه (زر «لوحة المتابعة») أو حقول
          <code className="mx-1 bg-white px-1 rounded">doNotFollowUp</code> /
          <code className="mx-1 bg-white px-1 rounded">followUpSnoozeUntil</code> على بيانات العميل.
        </div>

        <div className="flex justify-end">
          <button
            disabled={savingRetention}
            onClick={async () => {
              setSavingRetention(true)
              try {
                const res = await fetch('/api/order-settings', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ retention }),
                })
                if (!res.ok) throw new Error('failed')
                toast.success('تم حفظ إعدادات المتابعة')
              } catch {
                toast.error('تعذر حفظ إعدادات المتابعة')
              } finally {
                setSavingRetention(false)
              }
            }}
            className="px-5 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 font-medium"
          >
            {savingRetention ? 'جاري الحفظ...' : '💾 حفظ إعدادات المتابعة'}
          </button>
        </div>
      </section>
    </div>
  )
}
