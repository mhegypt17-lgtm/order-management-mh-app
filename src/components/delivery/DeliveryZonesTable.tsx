'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'

type DeliveryZone = {
  id: string
  zone: number
  area: string
  subArea: string
  averageDistanceKm: number
  deliveryCost: number
  customerDeliveryFee: number
  freeDeliveryValue: number
}

type Props = {
  editable: boolean
  hideDeliveryCost?: boolean
}

const newRow = (zone: number): DeliveryZone => ({
  id: '',
  zone,
  area: '',
  subArea: '',
  averageDistanceKm: 0,
  deliveryCost: 0,
  customerDeliveryFee: 0,
  freeDeliveryValue: 0,
})

export default function DeliveryZonesTable({ editable, hideDeliveryCost = false }: Props) {
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [zones, setZones] = useState<DeliveryZone[]>([])
  const [filterZone, setFilterZone] = useState<string>('all')
  const [filterArea, setFilterArea] = useState<string>('all')
  const [search, setSearch] = useState<string>('')

  const fetchZones = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/delivery-zones', { cache: 'no-store' })
      const data = await res.json()
      const list: DeliveryZone[] = Array.isArray(data.zones)
        ? data.zones.map((z: any) => ({
            id: String(z.id || ''),
            zone: Number(z.zone) || 0,
            area: String(z.area || ''),
            subArea: String(z.subArea || ''),
            averageDistanceKm: Number(z.averageDistanceKm) || 0,
            deliveryCost: Number(z.deliveryCost) || 0,
            customerDeliveryFee: Number(z.customerDeliveryFee) || 0,
            freeDeliveryValue: Number(z.freeDeliveryValue) || 0,
          }))
        : []
      setZones(list)
    } catch {
      toast.error('تعذر تحميل بيانات التوصيل')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchZones()
  }, [])

  const allZoneNumbers = useMemo(
    () => Array.from(new Set(zones.map((z) => z.zone))).sort((a, b) => a - b),
    [zones]
  )
  const allAreas = useMemo(
    () =>
      Array.from(new Set(zones.map((z) => z.area).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, 'ar')
      ),
    [zones]
  )

  const filtered = useMemo(() => {
    return zones
      .map((z, idx) => ({ z, idx }))
      .filter(({ z }) => {
        if (filterZone !== 'all' && String(z.zone) !== filterZone) return false
        if (filterArea !== 'all' && z.area !== filterArea) return false
        if (search.trim()) {
          const q = search.trim().toLowerCase()
          if (
            !z.area.toLowerCase().includes(q) &&
            !z.subArea.toLowerCase().includes(q)
          ) {
            return false
          }
        }
        return true
      })
      .sort((a, b) => {
        if (a.z.zone !== b.z.zone) return a.z.zone - b.z.zone
        if (a.z.area !== b.z.area) return a.z.area.localeCompare(b.z.area, 'ar')
        return a.z.subArea.localeCompare(b.z.subArea, 'ar')
      })
  }, [zones, filterZone, filterArea, search])

  const updateRow = (idx: number, patch: Partial<DeliveryZone>) => {
    setZones((prev) => prev.map((z, i) => (i === idx ? { ...z, ...patch } : z)))
  }

  const deleteRow = (idx: number) => {
    setZones((prev) => prev.filter((_, i) => i !== idx))
  }

  const addRow = () => {
    const nextZone =
      filterZone !== 'all' ? Number(filterZone) : allZoneNumbers[allZoneNumbers.length - 1] || 1
    setZones((prev) => [...prev, newRow(nextZone)])
  }

  // Add a sub-area row pre-filled with the same (zone, area) as an existing row.
  const addSubAreaToGroup = (zone: number, area: string) => {
    setZones((prev) => [
      ...prev,
      { ...newRow(zone), area },
    ])
  }

  // Copy the three fee columns from a source row onto every other row sharing
  // the same (zone, area). Distance stays per-sub-area.
  const applyFeesToGroup = (sourceIdx: number) => {
    setZones((prev) => {
      const source = prev[sourceIdx]
      if (!source) return prev
      return prev.map((z, i) => {
        if (i === sourceIdx) return z
        if (z.zone !== source.zone || z.area !== source.area) return z
        return {
          ...z,
          deliveryCost: source.deliveryCost,
          customerDeliveryFee: source.customerDeliveryFee,
          freeDeliveryValue: source.freeDeliveryValue,
        }
      })
    })
    toast.success(`تم تطبيق الرسوم على كل مناطق "${zones[sourceIdx]?.area || ''}"`)
  }

  // Build grouped structure for rendering: [{ zone, area, items: [...] }]
  const groups = useMemo(() => {
    const out: { zone: number; area: string; items: { z: DeliveryZone; idx: number }[] }[] = []
    let current: typeof out[number] | null = null
    for (const item of filtered) {
      if (!current || current.zone !== item.z.zone || current.area !== item.z.area) {
        current = { zone: item.z.zone, area: item.z.area, items: [] }
        out.push(current)
      }
      current.items.push(item)
    }
    return out
  }, [filtered])

  const saveZones = async () => {
    if (!editable) return
    // Validate rows
    const invalid = zones.find((z) => !z.area.trim() || !Number.isFinite(z.zone) || z.zone < 1)
    if (invalid) {
      toast.error('كل صف يجب أن يحتوي على Zone و Area')
      return
    }
    setIsSaving(true)
    try {
      const res = await fetch('/api/delivery-zones', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zones }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const detail = Array.isArray(data?.details) ? data.details.join(' • ') : data?.details
        throw new Error(detail || data?.error || 'Save failed')
      }
      const list: DeliveryZone[] = Array.isArray(data.zones)
        ? data.zones.map((z: any) => ({
            id: String(z.id || ''),
            zone: Number(z.zone) || 0,
            area: String(z.area || ''),
            subArea: String(z.subArea || ''),
            averageDistanceKm: Number(z.averageDistanceKm) || 0,
            deliveryCost: Number(z.deliveryCost) || 0,
            customerDeliveryFee: Number(z.customerDeliveryFee) || 0,
            freeDeliveryValue: Number(z.freeDeliveryValue) || 0,
          }))
        : zones
      setZones(list)
      toast.success('تم حفظ إعدادات التوصيل')
    } catch (err: any) {
      toast.error(err?.message || 'فشل حفظ إعدادات التوصيل')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return <div className="p-8 text-center text-gray-500">⏳ جاري تحميل مناطق التوصيل...</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-3xl font-bold text-gray-900">🏍️ إعدادات التوصيل</h1>
        <div className="flex gap-2 flex-wrap">
          {editable && (
            <button
              onClick={addRow}
              className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-semibold"
            >
              ＋ إضافة منطقة
            </button>
          )}
          <button
            onClick={fetchZones}
            className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold"
          >
            تحديث
          </button>
          {editable && (
            <button
              onClick={saveZones}
              disabled={isSaving}
              className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold disabled:opacity-60"
            >
              {isSaving ? 'جاري الحفظ...' : 'حفظ التعديلات'}
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-2 flex-wrap items-center bg-gray-50 border border-gray-200 rounded-lg p-3">
        <label className="text-sm font-semibold text-gray-700">Zone:</label>
        <select
          value={filterZone}
          onChange={(e) => setFilterZone(e.target.value)}
          className="px-2 py-1 border border-gray-300 rounded text-sm"
          dir="ltr"
        >
          <option value="all">All</option>
          {allZoneNumbers.map((z) => (
            <option key={z} value={String(z)}>
              {z}
            </option>
          ))}
        </select>
        <label className="text-sm font-semibold text-gray-700 ml-2">Area:</label>
        <select
          value={filterArea}
          onChange={(e) => setFilterArea(e.target.value)}
          className="px-2 py-1 border border-gray-300 rounded text-sm"
          dir="rtl"
        >
          <option value="all">الكل</option>
          {allAreas.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="بحث في الـ Area أو Sub-Area..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-2 py-1 border border-gray-300 rounded text-sm flex-1 min-w-[200px]"
          dir="rtl"
        />
        <span className="text-xs text-gray-500">{filtered.length} / {zones.length} صف</span>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
        <table className="w-full min-w-[1200px] text-sm">
          <thead className="bg-gray-100 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-center">Zone</th>
              <th className="px-3 py-2 text-right">Area</th>
              <th className="px-3 py-2 text-right">Sub-Area</th>
              <th className="px-3 py-2 text-center">Average distance (km)</th>
              {!hideDeliveryCost && (
                <th className="px-3 py-2 text-center">Value of delivery cost</th>
              )}
              <th className="px-3 py-2 text-center">Customer delivery fees</th>
              <th className="px-3 py-2 text-center">Free delivery value</th>
              {editable && <th className="px-3 py-2 text-center">إجراء</th>}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <Fragment key={`${group.zone}::${group.area}`}>
                {group.items.map(({ z, idx }, rowIdxInGroup) => {
                  const isFirstOfGroup = rowIdxInGroup === 0
                  const isLastOfGroup = rowIdxInGroup === group.items.length - 1
                  return (
                    <tr
                      key={z.id || `new-${idx}`}
                      className={`border-b ${isLastOfGroup ? 'border-gray-300' : 'border-gray-100'} hover:bg-gray-50`}
                    >
                      <td className="px-3 py-2 text-center font-semibold align-top" dir="ltr">
                        {editable ? (
                          <input
                            type="number"
                            value={z.zone}
                            onChange={(e) => updateRow(idx, { zone: Number(e.target.value) })}
                            className="w-16 px-2 py-1 border border-gray-300 rounded text-center"
                          />
                        ) : (
                          z.zone
                        )}
                      </td>
                      <td className="px-3 py-2 align-top border-r-4 border-r-red-100">
                        {isFirstOfGroup ? (
                          editable ? (
                            <input
                              type="text"
                              value={z.area}
                              onChange={(e) => {
                                // Editing area on the header row renames the
                                // area for every row in this group.
                                const newArea = e.target.value
                                setZones((prev) =>
                                  prev.map((row) =>
                                    row.zone === group.zone && row.area === group.area
                                      ? { ...row, area: newArea }
                                      : row
                                  )
                                )
                              }}
                              className="w-full px-2 py-1 border border-gray-300 rounded font-semibold"
                              dir="rtl"
                              list="delivery-area-options"
                            />
                          ) : (
                            <span className="font-semibold">{z.area}</span>
                          )
                        ) : (
                          <span className="text-gray-300 text-xs" dir="rtl">↳</span>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {editable ? (
                          <input
                            type="text"
                            value={z.subArea}
                            onChange={(e) => updateRow(idx, { subArea: e.target.value })}
                            className="w-full px-2 py-1 border border-gray-300 rounded"
                            dir="rtl"
                          />
                        ) : (
                          <span>{z.subArea}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center align-top" dir="ltr">
                        {editable ? (
                          <input
                            type="number"
                            step="0.1"
                            value={z.averageDistanceKm}
                            onChange={(e) =>
                              updateRow(idx, { averageDistanceKm: Number(e.target.value) })
                            }
                            className="w-24 px-2 py-1 border border-gray-300 rounded text-center"
                          />
                        ) : (
                          z.averageDistanceKm
                        )}
                      </td>
                      {!hideDeliveryCost && (
                        <td className="px-3 py-2 text-center align-top" dir="ltr">
                          {editable ? (
                            <input
                              type="number"
                              value={z.deliveryCost}
                              onChange={(e) =>
                                updateRow(idx, { deliveryCost: Number(e.target.value) })
                              }
                              className="w-28 px-2 py-1 border border-gray-300 rounded text-center"
                            />
                          ) : (
                            Number(z.deliveryCost || 0).toLocaleString()
                          )}
                        </td>
                      )}
                      <td className="px-3 py-2 text-center align-top" dir="ltr">
                        {editable ? (
                          <input
                            type="number"
                            value={z.customerDeliveryFee}
                            onChange={(e) =>
                              updateRow(idx, { customerDeliveryFee: Number(e.target.value) })
                            }
                            className="w-28 px-2 py-1 border border-gray-300 rounded text-center"
                          />
                        ) : (
                          Number(z.customerDeliveryFee || 0).toLocaleString()
                        )}
                      </td>
                      <td className="px-3 py-2 text-center align-top" dir="ltr">
                        {editable ? (
                          <input
                            type="number"
                            value={z.freeDeliveryValue}
                            onChange={(e) =>
                              updateRow(idx, { freeDeliveryValue: Number(e.target.value) })
                            }
                            className="w-28 px-2 py-1 border border-gray-300 rounded text-center"
                          />
                        ) : (
                          Number(z.freeDeliveryValue || 0).toLocaleString()
                        )}
                      </td>
                      {editable && (
                        <td className="px-3 py-2 text-center align-top">
                          <div className="flex flex-col gap-1 items-stretch">
                            <button
                              onClick={() => deleteRow(idx)}
                              className="px-2 py-1 rounded bg-red-100 hover:bg-red-200 text-red-700 text-xs font-semibold"
                            >
                              حذف
                            </button>
                            {isFirstOfGroup && group.items.length > 1 && (
                              <button
                                onClick={() => applyFeesToGroup(idx)}
                                className="px-2 py-1 rounded bg-blue-100 hover:bg-blue-200 text-blue-700 text-xs font-semibold whitespace-nowrap"
                                title="نسخ الرسوم لكل المناطق الفرعية في نفس الـ Area"
                              >
                                تطبيق الرسوم
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
                {editable && (
                  <tr className="bg-gray-50 border-b border-gray-300">
                    <td colSpan={hideDeliveryCost ? 7 : 8} className="px-3 py-1 text-right">
                      <button
                        onClick={() => addSubAreaToGroup(group.zone, group.area)}
                        className="text-xs px-3 py-1 rounded bg-green-50 hover:bg-green-100 text-green-700 font-semibold border border-green-200"
                      >
                        ＋ إضافة منطقة فرعية تحت "{group.area}"
                      </button>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {groups.length === 0 && (
              <tr>
                <td colSpan={editable ? 8 : 7} className="px-3 py-8 text-center text-gray-400">
                  لا توجد بيانات
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <datalist id="delivery-area-options">
          {allAreas.map((a) => (
            <option key={a} value={a} />
          ))}
        </datalist>
      </div>
    </div>
  )
}
