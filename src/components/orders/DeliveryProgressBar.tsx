'use client'

/**
 * Catchy 4-stage delivery progress visual for the OMS.
 * Stages: قبول → جاهز → في الطريق → تم التوصيل
 */

type DeliveryStage = 'قبول' | 'جاهز' | 'في الطريق' | 'تم التوصيل'

const STAGES: { key: DeliveryStage; label: string; icon: string }[] = [
  { key: 'قبول', label: 'قبول', icon: '✋' },
  { key: 'جاهز', label: 'جاهز', icon: '📦' },
  { key: 'في الطريق', label: 'في الطريق', icon: '🏍️' },
  { key: 'تم التوصيل', label: 'تم التوصيل', icon: '✅' },
]

const STAGE_INDEX: Record<string, number> = {
  'قبول': 0,
  'جاهز': 1,
  'في الطريق': 2,
  'تم التوصيل': 3,
  // legacy mapping
  'لم يخرج بعد': 0,
}

interface Props {
  status: string | undefined | null
  compact?: boolean
}

export function DeliveryProgressBar({ status, compact = false }: Props) {
  const currentIdx = STAGE_INDEX[status || ''] ?? 0
  const pct = ((currentIdx + 1) / STAGES.length) * 100

  return (
    <div className={`w-full ${compact ? 'text-[10px]' : 'text-xs'}`} dir="rtl">
      <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden mb-2">
        <div
          className="absolute inset-y-0 right-0 bg-gradient-to-l from-emerald-400 via-teal-500 to-blue-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between items-start gap-1">
        {STAGES.map((s, idx) => {
          const done = idx < currentIdx
          const current = idx === currentIdx
          const dotColor = done
            ? 'bg-emerald-500 text-white'
            : current
            ? 'bg-blue-500 text-white animate-pulse ring-2 ring-blue-300'
            : 'bg-gray-200 text-gray-500'
          const labelColor = done
            ? 'text-emerald-700 font-semibold'
            : current
            ? 'text-blue-700 font-bold'
            : 'text-gray-400'
          return (
            <div key={s.key} className="flex flex-col items-center flex-1 min-w-0">
              <div
                className={`flex items-center justify-center rounded-full ${
                  compact ? 'w-5 h-5 text-[10px]' : 'w-7 h-7 text-sm'
                } ${dotColor} transition-all`}
                title={s.label}
              >
                {done ? '✓' : s.icon}
              </div>
              <span className={`mt-1 truncate w-full text-center ${labelColor}`}>
                {s.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default DeliveryProgressBar
