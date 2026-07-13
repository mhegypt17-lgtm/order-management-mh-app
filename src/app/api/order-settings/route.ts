import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import {
  AgentNoticeRecord,
  LookupValueRecord,
  readOrderSettings,
  RetentionConfig,
} from '@/lib/omsData'

// Order settings change rarely (only when an admin edits a lookup list in the
// settings screen) but are read on nearly every page load and by several
// server-side aggregates. A 10-minute cache eliminates the vast majority of
// redundant reads. Admin edits go through PUT/PATCH which are always dynamic,
// so staleness is bounded to at most 10 minutes after a change.
export const revalidate = 600

// Tier 1 caching: emit an explicit Cache-Control header on every GET response
// so Vercel Edge (and any intermediate CDN) can share one cached response
// across every user/tab within the window. This is what makes the Supabase
// egress meter's "Cached Egress" pool actually get used.
const CACHE_HEADERS = {
  'Cache-Control':
    'public, max-age=0, s-maxage=600, stale-while-revalidate=3600',
}

// Patch: Add missing OrderSettingsRecord type with slaHours
type OrderSettingsRecord = {
  orderReceivers: LookupValueRecord[]
  orderMethods: LookupValueRecord[]
  customerSources: LookupValueRecord[]
  orderTypes: LookupValueRecord[]
  paymentMethods: LookupValueRecord[]
  orderStatuses: LookupValueRecord[]
  complaintChannels: LookupValueRecord[]
  complaintReasons: LookupValueRecord[]
  monthlyCompensationBudget: number
  monthlyTargetedUnitsGoal?: number
  slaHours: number
  agentNotice: AgentNoticeRecord
  autoActivateThreshold?: number
  autoActivateEnabled?: boolean
  retention?: RetentionConfig
}

type SectionKey = keyof OrderSettingsRecord

function normalizeRows(rows: unknown, section?: SectionKey): LookupValueRecord[] {
  if (!Array.isArray(rows)) return []

  const now = new Date().toISOString()
  // Complaint reasons carry an optional nested `subReasons` list per parent.
  // Every other section ignores the field so we drop it to keep payloads tight.
  const preserveSubReasons = section === 'complaintReasons'

  return rows
    .map((row, idx) => {
      const source = row as Partial<LookupValueRecord>
      const label = String(source.label || '').trim()
      if (!label) return null

      const base: LookupValueRecord = {
        id: String(source.id || `lookup_${Date.now()}_${idx}`),
        label,
        isActive: source.isActive !== false,
        sortOrder: Number(source.sortOrder) || idx + 1,
        createdAt: source.createdAt || now,
        updatedAt: now,
      }

      if (preserveSubReasons) {
        const rawSub = (source as any).subReasons
        if (Array.isArray(rawSub) && rawSub.length > 0) {
          const normalizedSub = normalizeRows(rawSub) // recurse without preserving further nesting
          if (normalizedSub.length > 0) {
            return { ...base, subReasons: normalizedSub }
          }
        }
      }
      return base
    })
    .filter((row): row is LookupValueRecord => Boolean(row))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((row, idx) => ({ ...row, sortOrder: idx + 1 }))
}

function activeLabels(rows: LookupValueRecord[]) {
  return rows.filter((row) => row.isActive).sort((a, b) => a.sortOrder - b.sortOrder).map((row) => row.label)
}

export async function GET() {
  try {
    const settings = await readOrderSettings()

    return NextResponse.json(
      {
        settings,
        slaHours: settings.slaHours,
        options: {
          orderReceivers: activeLabels(settings.orderReceivers),
          orderMethods: activeLabels(settings.orderMethods),
          customerSources: activeLabels(settings.customerSources),
          orderTypes: activeLabels(settings.orderTypes),
          paymentMethods: activeLabels(settings.paymentMethods),
          orderStatuses: activeLabels(settings.orderStatuses),
          complaintChannels: activeLabels(settings.complaintChannels),
          complaintReasons: activeLabels((settings as any).complaintReasons || []),
          agentNotice: settings.agentNotice,
        },
      },
      { status: 200, headers: CACHE_HEADERS }
    )
  } catch {
    return NextResponse.json({ error: 'Failed to fetch order settings' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const section = body.section as SectionKey
    const items = body.items as unknown

    if (
      !section ||
      ![
        'orderReceivers',
        'orderMethods',
        'customerSources',
        'orderTypes',
        'paymentMethods',
        'orderStatuses',
        'complaintChannels',
        'complaintReasons',
      ].includes(section as string)
    ) {
      return NextResponse.json({ error: 'Invalid section' }, { status: 400 })
    }

    const normalizedItems = normalizeRows(items, section)
    if (normalizedItems.length === 0) {
      return NextResponse.json({ error: 'At least one value is required' }, { status: 400 })
    }

    const settings = await readOrderSettings()
    const nextSettings: OrderSettingsRecord = {
      ...settings,
      [section]: normalizedItems,
    }

    await supabase
      .from('order_settings')
      .upsert({ id: 'singleton', ...nextSettings })

    return NextResponse.json({ settings: nextSettings }, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Failed to update order settings' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const settings = await readOrderSettings()

    const nextSettings: OrderSettingsRecord = { ...settings }

    // Handle SLA hours update
    if (body.slaHours !== undefined) {
      const parsedSla = Math.max(1, Number(body.slaHours) || 4)
      nextSettings.slaHours = parsedSla
      await supabase
        .from('order_settings')
        .upsert({ id: 'singleton', ...nextSettings })
      return NextResponse.json({ slaHours: parsedSla }, { status: 200 })
    }

    // Handle monthly compensation budget update
    if (body.monthlyCompensationBudget !== undefined) {
      const parsedBudget = Number(body.monthlyCompensationBudget)
      if (!Number.isFinite(parsedBudget) || parsedBudget < 0) {
        return NextResponse.json({ error: 'Invalid monthly compensation budget' }, { status: 400 })
      }
      nextSettings.monthlyCompensationBudget = parsedBudget
    }

    // Handle monthly targeted-units team goal update.
    // Persisted in the dedicated `monthlyTargetedUnitsGoal` column on
    // `order_settings`. Requires the migration in
    // data/monthly-targeted-goal-migration.sql to have been applied.
    if (body.monthlyTargetedUnitsGoal !== undefined) {
      const parsedGoal = Number(body.monthlyTargetedUnitsGoal)
      if (!Number.isFinite(parsedGoal) || parsedGoal < 0) {
        return NextResponse.json({ error: 'Invalid monthly targeted units goal' }, { status: 400 })
      }
      nextSettings.monthlyTargetedUnitsGoal = Math.floor(parsedGoal)
    }

    // Handle auto-activate (warning → active) rule.
    if (body.autoActivateThreshold !== undefined) {
      const t = Math.max(1, Math.floor(Number(body.autoActivateThreshold) || 0))
      nextSettings.autoActivateThreshold = t
    }
    if (body.autoActivateEnabled !== undefined) {
      nextSettings.autoActivateEnabled = Boolean(body.autoActivateEnabled)
    }

    // Handle retention (inactive customer follow-up) configuration.
    // Persisted as JSON in the `retention` column of `order_settings`.
    if (body.retention && typeof body.retention === 'object') {
      const ASSIGNEES = new Set(['auto', 'رنا', 'مى', 'ميرنا', 'أمل'])
      const ACTIONS   = new Set(['off', 'notify', 'task'])
      const sanitizeStage = (s: any, fallbackDays: number, fallbackCooldown: number) => ({
        days: Math.max(1, Math.floor(Number(s?.days) || fallbackDays)),
        action: ACTIONS.has(s?.action) ? s.action : 'notify',
        assignedTo: ASSIGNEES.has(s?.assignedTo) ? s.assignedTo : 'auto',
        cooldownDays: Math.max(0, Math.floor(Number(s?.cooldownDays) || fallbackCooldown)),
      })
      ;(nextSettings as any).retention = {
        enabled: body.retention.enabled !== false,
        stage1: sanitizeStage(body.retention.stage1, 30, 14),
        stage2: sanitizeStage(body.retention.stage2, 60, 21),
        stage3: sanitizeStage(body.retention.stage3, 90, 30),
      } as RetentionConfig
    }

    // Handle agent notice update
    if (body.message !== undefined || body.type !== undefined || body.isActive !== undefined) {
      const notice: AgentNoticeRecord = {
        message: String(body.message || '').trim(),
        type: (['info', 'promo', 'warning', 'success'].includes(body.type) ? body.type : 'info') as AgentNoticeRecord['type'],
        isActive: Boolean(body.isActive),
        updatedAt: new Date().toISOString(),
      }
      nextSettings.agentNotice = notice
    }

    // Strict upsert: all referenced columns must exist in the DB schema.
    // If a column is missing, the error surfaces immediately so the schema
    // drift can be fixed with a migration rather than silently swallowed.
    const { error: upsertError } = await supabase
      .from('order_settings')
      .upsert({ id: 'singleton', ...nextSettings })

    if (upsertError) {
      console.error('order-settings PATCH upsert failed:', upsertError)
      return NextResponse.json(
        { error: 'Failed to persist settings', detail: upsertError.message },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        slaHours: nextSettings.slaHours,
        agentNotice: nextSettings.agentNotice,
        monthlyCompensationBudget: nextSettings.monthlyCompensationBudget,
        monthlyTargetedUnitsGoal: nextSettings.monthlyTargetedUnitsGoal,
        autoActivateThreshold: nextSettings.autoActivateThreshold,
        autoActivateEnabled: nextSettings.autoActivateEnabled,
        retention: nextSettings.retention,
      },
      { status: 200 }
    )
  } catch {
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
  }
}
