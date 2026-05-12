'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'

type DeliveryZone = {
  id: string
  zone: number
  area: string
  averageDistanceKm: number
  deliveryCost: number
  customerDeliveryFee: number
  freeDeliveryValue: number
}

type Props = {
  editable: boolean
  hideDeliveryCost?: boolean
}

const AREA_OPTIONS = [
  'التجمع',
  'مدينة نصر',
  'المعادي',
  'الزمالك',
  'المهندسين',
  '6 أكتوبر',
  'الشيخ زايد',
  'حدائق الأهرام',
]

export default function DeliveryZonesTable({ editable, hideDeliveryCost = false }: Props) {
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [zones, setZones] = useState<DeliveryZone[]>([])

  const fetchZones = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/delivery-zones')
      const data = await res.json()
      setZones(Array.isArray(data.zones) ? data.zones : [])
    } catch {
      toast.error('تعذر تحميل بيانات التوصيل')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchZones()
  }, [])

  const updateZone = (zoneNumber: number, patch: Partial<DeliveryZone>) => {
    setZones((prev) =>
      prev.map((zone) => (zone.zone === zoneNumber ? { ...zone, ...patch } : zone))
    )
  }

  const saveZones = async () => {
    if (!editable) return
    setIsSaving(true)
    try {
      const res = await fetch('/api/delivery-zones', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zones }),
      })

      if (!res.ok) throw new Error('Save failed')
      const data = await res.json()
      setZones(Array.isArray(data.zones) ? data.zones : zones)
      toast.success('تم حفظ إعدادات التوصيل')
    } catch {
      toast.error('فشل حفظ إعدادات التوصيل')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return <div className="p-8 text-center text-gray-500">⏳ جاري تحميل مناطق التوصيل...</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">🏍️ إعدادات التوصيل</h1>
        <div className="flex gap-2">
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

      <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="bg-gray-100 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-center">Zone</th>
              <th className="px-3 py-2 text-right">Area</th>
              <th className="px-3 py-2 text-center">Average distance (km)</th>
              {!hideDeliveryCost && (
                <th className="px-3 py-2 text-center">Value of delivery cost</th>
              )}
              <th className="px-3 py-2 text-center">Customer delivery fees</th>
              <th className="px-3 py-2 text-center">Free delivery value</th>
            </tr>
          </thead>
          <tbody>
            {zones
              .slice()
              .sort((a, b) => a.zone - b.zone)
              .map((zone) => (
                <tr key={zone.id} className="border-b border-gray-100">
                  <td className="px-3 py-2 text-center font-semibold" dir="ltr">
                    {zone.zone}
                  </td>
                  <td className="px-3 py-2">
                    {editable ? (
                      <select
                        value={zone.area}
                        onChange={(e) => updateZone(zone.zone, { area: e.target.value })}
                        className="w-full px-2 py-1 border border-gray-300 rounded"
                        dir="rtl"
                      >
                        {!AREA_OPTIONS.includes(zone.area) && (
                          <option value={zone.area}>{zone.area}</option>
                        )}
                        {AREA_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span>{zone.area}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center" dir="ltr">
                    {editable ? (
                      <input
                        type="number"
                        value={zone.averageDistanceKm}
                        onChange={(e) => updateZone(zone.zone, { averageDistanceKm: Number(e.target.value) })}
                        className="w-24 px-2 py-1 border border-gray-300 rounded text-center"
                      />
                    ) : (
                      zone.averageDistanceKm
                    )}
                  </td>
                  {!hideDeliveryCost && (
                    <td className="px-3 py-2 text-center" dir="ltr">
                      {editable ? (
                        <input
                          type="number"
                          value={zone.deliveryCost}
                          onChange={(e) => updateZone(zone.zone, { deliveryCost: Number(e.target.value) })}
                          className="w-28 px-2 py-1 border border-gray-300 rounded text-center"
                        />
                      ) : (
                        Number(zone.deliveryCost || 0).toLocaleString()
                      )}
                    </td>
                  )}
                  <td className="px-3 py-2 text-center" dir="ltr">
                    {editable ? (
                      <input
                        type="number"
                        value={zone.customerDeliveryFee}
                        onChange={(e) => updateZone(zone.zone, { customerDeliveryFee: Number(e.target.value) })}
                        className="w-28 px-2 py-1 border border-gray-300 rounded text-center"
                      />
                    ) : (
                      Number(zone.customerDeliveryFee || 0).toLocaleString()
                    )}
                  </td>
                  <td className="px-3 py-2 text-center" dir="ltr">
                    {editable ? (
                      <input
                        type="number"
                        value={zone.freeDeliveryValue}
                        onChange={(e) => updateZone(zone.zone, { freeDeliveryValue: Number(e.target.value) })}
                        className="w-28 px-2 py-1 border border-gray-300 rounded text-center"
                      />
                    ) : (
                      Number(zone.freeDeliveryValue || 0).toLocaleString()
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
