'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'

interface PreviewRow {
  productId: string
  productName: string
  currentBasePrice: number | null
  currentOfferPrice: number | null
  newBasePrice: number
  newOfferPrice: number | null
  lineNumber: number
}

interface PreviewResponse {
  csvUrl: string
  totalCsvRows: number
  totalDbProducts: number
  willUpdate: PreviewRow[]
  noChange: PreviewRow[]
  notFoundInDb: Array<{
    lineNumber: number
    productName: string
    basePrice: number
    offerPrice: number | null
  }>
  duplicatesInDb: Array<{
    productName: string
    lineNumber: number
    matchingIds: string[]
  }>
  invalid: Array<{ lineNumber: number; raw: string; reason: string }>
  unmatchedDbProducts: Array<{
    id: string
    productName: string
    basePrice: number | null
    offerPrice: number | null
    isActive: boolean
  }>
}

async function authedFetch(input: string, init?: RequestInit) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('انتهت الجلسة، سجّل الدخول من جديد')
  return fetch(input, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  })
}

async function readJsonSafely(res: Response) {
  const text = await res.text()
  if (!text)
    return {
      ok: res.ok,
      data: {} as Record<string, unknown>,
      errorMessage: res.ok ? undefined : `HTTP ${res.status}`,
    }
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>
    return {
      ok: res.ok,
      data: parsed,
      errorMessage: res.ok
        ? undefined
        : typeof parsed.error === 'string'
          ? parsed.error
          : `HTTP ${res.status}`,
    }
  } catch {
    return {
      ok: res.ok,
      data: {} as Record<string, unknown>,
      errorMessage: res.ok ? undefined : `HTTP ${res.status}: ${text.slice(0, 200)}`,
    }
  }
}

function formatPrice(v: number | null): string {
  if (v === null || v === undefined) return '—'
  return v.toString()
}

const DEFAULT_URL = process.env.NEXT_PUBLIC_PRICE_SHEET_CSV_URL || ''

export default function PriceImportPage() {
  const [url, setUrl] = useState(DEFAULT_URL)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const handleLoad = useCallback(async () => {
    if (!url.trim()) {
      toast.error('الصق رابط النشر (Publish to web CSV) الأول')
      return
    }
    setLoading(true)
    setPreview(null)
    setSelected(new Set())
    try {
      const res = await authedFetch('/api/admin/products/import-preview', {
        method: 'POST',
        body: JSON.stringify({ url: url.trim() }),
      })
      const { ok, data, errorMessage } = await readJsonSafely(res)
      if (!ok) throw new Error(errorMessage || 'تعذر تحميل المعاينة')
      const parsed = data as unknown as PreviewResponse
      setPreview(parsed)
      // Preselect every row that will change
      setSelected(new Set(parsed.willUpdate.map((r) => r.productId)))
      toast.success('✅ تم تحميل المعاينة')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'خطأ')
    } finally {
      setLoading(false)
    }
  }, [url])

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (!preview) return
    if (selected.size === preview.willUpdate.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(preview.willUpdate.map((r) => r.productId)))
    }
  }

  const changesToApply = useMemo(() => {
    if (!preview) return []
    return preview.willUpdate
      .filter((r) => selected.has(r.productId))
      .map((r) => ({
        productId: r.productId,
        newBasePrice: r.newBasePrice,
        newOfferPrice: r.newOfferPrice,
      }))
  }, [preview, selected])

  const handleApply = async () => {
    if (changesToApply.length === 0) {
      toast.error('لا توجد صفوف مختارة')
      return
    }
    if (
      !confirm(
        `تأكيد تحديث ${changesToApply.length} منتج؟ سيتم تعديل السعر الأساسي وسعر العرض فقط.`,
      )
    )
      return

    setApplying(true)
    try {
      const res = await authedFetch('/api/admin/products/import-apply', {
        method: 'POST',
        body: JSON.stringify({ changes: changesToApply }),
      })
      const { ok, data, errorMessage } = await readJsonSafely(res)
      if (!ok) throw new Error(errorMessage || 'فشل التطبيق')
      const updated = Number(data.updated ?? 0)
      const errors = (data.errors as Array<{ productId: string; message: string }>) ?? []
      if (errors.length > 0) {
        toast.error(
          `تم تحديث ${updated}/${changesToApply.length}. أخطاء: ${errors.length}`,
        )
        console.error('Import errors:', errors)
      } else {
        toast.success(`✅ تم تحديث ${updated} منتج`)
      }
      // Reload the preview to reflect the new state
      await handleLoad()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'خطأ')
    } finally {
      setApplying(false)
    }
  }

  useEffect(() => {
    // Auto-load if we have a default URL configured
    if (DEFAULT_URL) {
      handleLoad()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4" dir="rtl">
      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              🔄 مزامنة الأسعار من Google Sheets
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              يقرأ الرابط، يقارن الأسماء بالمنتجات، يعرض الفروقات، ثم تختار ما يتم تحديثه.
              يعدّل فقط السعر الأساسي وسعر العرض.
            </p>
          </div>
          <Link
            href="/admin/settings"
            className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900"
          >
            ← رجوع للإعدادات
          </Link>
        </div>
      </div>

      {/* URL + load */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <label className="block text-sm font-medium text-gray-700">
          رابط CSV المنشور (Publish to web → CSV)
        </label>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://docs.google.com/spreadsheets/d/e/…/pub?gid=0&single=true&output=csv"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-sm"
          dir="ltr"
        />
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>ℹ️</span>
          <span>
            الرابط يبدأ بـ <code className="bg-gray-100 px-1 rounded">/d/e/…/pub</code> — مش <code className="bg-gray-100 px-1 rounded">/edit</code>.
            لو عندك رابط تعديل، افتح Google Sheets → File → Share → Publish to web → اختر CSV.
          </span>
        </div>
        <button
          onClick={handleLoad}
          disabled={loading}
          className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
        >
          {loading ? '⏳ جارٍ التحميل...' : '📥 تحميل ومقارنة'}
        </button>
      </div>

      {/* Preview */}
      {preview && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <SummaryCard color="emerald" label="سيتم تحديث" value={preview.willUpdate.length} />
            <SummaryCard color="gray" label="بدون تغيير" value={preview.noChange.length} />
            <SummaryCard color="amber" label="غير موجود بالنظام" value={preview.notFoundInDb.length} />
            <SummaryCard color="red" label="تكرارات" value={preview.duplicatesInDb.length} />
            <SummaryCard color="red" label="أسطر غير صالحة" value={preview.invalid.length} />
          </div>

          {/* Duplicates warning */}
          {preview.duplicatesInDb.length > 0 && (
            <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4">
              <h3 className="font-bold text-red-900 mb-2">
                ⚠️ منتجات مكررة في قاعدة البيانات
              </h3>
              <p className="text-sm text-red-800 mb-2">
                الأسماء دي موجودة أكتر من مرة. لازم تحذف المكرر من صفحة المنتجات قبل التحديث.
              </p>
              <ul className="text-sm space-y-1">
                {preview.duplicatesInDb.map((d, i) => (
                  <li key={i} className="text-red-900">
                    <b>{d.productName}</b> — {d.matchingIds.length} صفوف: {d.matchingIds.join(', ')}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Invalid rows */}
          {preview.invalid.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <h3 className="font-bold text-red-900 mb-2">
                ⚠️ أسطر غير صالحة في الشيت
              </h3>
              <ul className="text-sm space-y-1">
                {preview.invalid.map((r, i) => (
                  <li key={i} className="text-red-800">
                    السطر {r.lineNumber}: {r.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Not found in DB */}
          {preview.notFoundInDb.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <h3 className="font-bold text-amber-900 mb-2">
                ⚠️ أسماء في الشيت مش موجودة في النظام
              </h3>
              <p className="text-sm text-amber-800 mb-2">
                الأسماء دي مش لها منتج في قاعدة البيانات. تأكد من الإملاء (المسافات، فرش/فريش، إلخ).
              </p>
              <ul className="text-sm max-h-48 overflow-y-auto space-y-1">
                {preview.notFoundInDb.map((r, i) => (
                  <li key={i} className="text-amber-900">
                    السطر {r.lineNumber}: <b>{r.productName}</b> ({r.basePrice}
                    {r.offerPrice !== null ? ` / ${r.offerPrice}` : ''})
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Will update table */}
          {preview.willUpdate.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h3 className="font-bold text-gray-900">
                  ✅ سيتم تحديث ({selected.size}/{preview.willUpdate.length})
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleAll}
                    className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    {selected.size === preview.willUpdate.length
                      ? 'إلغاء التحديد'
                      : 'تحديد الكل'}
                  </button>
                  <button
                    onClick={handleApply}
                    disabled={applying || selected.size === 0}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
                  >
                    {applying ? '⏳ جارٍ التطبيق...' : `تطبيق (${selected.size})`}
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="p-2 text-right">اختيار</th>
                      <th className="p-2 text-right">المنتج</th>
                      <th className="p-2 text-right">السعر الأساسي</th>
                      <th className="p-2 text-right">سعر العرض</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.willUpdate.map((r) => {
                      const baseChanged = r.currentBasePrice !== r.newBasePrice
                      const offerChanged = r.currentOfferPrice !== r.newOfferPrice
                      return (
                        <tr key={r.productId} className="border-b hover:bg-gray-50">
                          <td className="p-2">
                            <input
                              type="checkbox"
                              checked={selected.has(r.productId)}
                              onChange={() => toggle(r.productId)}
                              className="w-4 h-4"
                            />
                          </td>
                          <td className="p-2 font-medium">{r.productName}</td>
                          <td className="p-2">
                            {baseChanged ? (
                              <span>
                                <span className="text-gray-400 line-through">
                                  {formatPrice(r.currentBasePrice)}
                                </span>{' '}
                                <span className="text-emerald-700 font-bold">
                                  → {formatPrice(r.newBasePrice)}
                                </span>
                              </span>
                            ) : (
                              <span className="text-gray-500">{formatPrice(r.newBasePrice)}</span>
                            )}
                          </td>
                          <td className="p-2">
                            {offerChanged ? (
                              <span>
                                <span className="text-gray-400 line-through">
                                  {formatPrice(r.currentOfferPrice)}
                                </span>{' '}
                                <span className="text-emerald-700 font-bold">
                                  → {formatPrice(r.newOfferPrice)}
                                </span>
                              </span>
                            ) : (
                              <span className="text-gray-500">{formatPrice(r.newOfferPrice)}</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* DB products not in CSV (info only) */}
          {preview.unmatchedDbProducts.length > 0 && (
            <details className="bg-white border border-gray-200 rounded-xl p-4">
              <summary className="font-bold text-gray-900 cursor-pointer">
                ℹ️ منتجات في النظام مش موجودة في الشيت ({preview.unmatchedDbProducts.length})
              </summary>
              <p className="text-sm text-gray-600 mt-2 mb-2">
                للمعلومية فقط — مش هيتم لمسها.
              </p>
              <ul className="text-sm max-h-48 overflow-y-auto space-y-1">
                {preview.unmatchedDbProducts.map((p) => (
                  <li key={p.id} className={p.isActive ? 'text-gray-700' : 'text-gray-400'}>
                    <b>{p.productName}</b> — {formatPrice(p.basePrice)}
                    {p.offerPrice !== null ? ` / ${formatPrice(p.offerPrice)}` : ''}
                    {!p.isActive && ' (غير مفعل)'}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  )
}

function SummaryCard({
  color,
  label,
  value,
}: {
  color: 'emerald' | 'gray' | 'amber' | 'red'
  label: string
  value: number
}) {
  const styles: Record<typeof color, string> = {
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    gray: 'bg-gray-50 border-gray-200 text-gray-900',
    amber: 'bg-amber-50 border-amber-200 text-amber-900',
    red: 'bg-red-50 border-red-200 text-red-900',
  }
  return (
    <div className={`border-2 rounded-xl p-3 text-center ${styles[color]}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs mt-1">{label}</div>
    </div>
  )
}
