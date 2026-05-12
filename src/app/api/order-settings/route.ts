import { NextRequest, NextResponse } from 'next/server'
import {
  AgentNoticeRecord,
  LookupValueRecord,
  OrderSettingsRecord,
  readOrderSettings,
  writeOrderSettings,
} from '@/lib/omsData'

type SectionKey = keyof OrderSettingsRecord

function normalizeRows(rows: unknown): LookupValueRecord[] {
  if (!Array.isArray(rows)) return []

  const now = new Date().toISOString()
  return rows
    .map((row, idx) => {
      const source = row as Partial<LookupValueRecord>
      const label = String(source.label || '').trim()
      if (!label) return null

      return {
        id: String(source.id || `lookup_${Date.now()}_${idx}`),
        label,
        isActive: source.isActive !== false,
        sortOrder: Number(source.sortOrder) || idx + 1,
        createdAt: source.createdAt || now,
        updatedAt: now,
      }
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
    const settings = readOrderSettings()

    return NextResponse.json(
      {
        settings,
        slaHours: settings.slaHours,
        loyalty: settings.loyalty,
        retention: settings.retention,
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
      { status: 200 }
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

    const normalizedItems = normalizeRows(items)
    if (normalizedItems.length === 0) {
      return NextResponse.json({ error: 'At least one value is required' }, { status: 400 })
    }

    const settings = readOrderSettings()
    const nextSettings: OrderSettingsRecord = {
      ...settings,
      [section]: normalizedItems,
    }

    writeOrderSettings(nextSettings)

    return NextResponse.json({ settings: nextSettings }, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Failed to update order settings' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const settings = readOrderSettings()

    const nextSettings: OrderSettingsRecord = { ...settings }

    // Handle SLA hours update
    if (body.slaHours !== undefined) {
      const parsedSla = Math.max(1, Number(body.slaHours) || 4)
      nextSettings.slaHours = parsedSla
      writeOrderSettings(nextSettings)
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

    // Handle loyalty config update
    if (body.loyalty !== undefined) {
      const incoming = body.loyalty || {}
      const mode = incoming.mode === 'revenue' ? 'revenue' : 'frequency'
      const incomingTiers = Array.isArray(incoming.tiers) ? incoming.tiers : []
      // Reuse existing tier metadata (color/icon) and only override name/threshold from input
      const existing = nextSettings.loyalty?.tiers || []
      const tiers = existing.map((def, idx) => {
        const t = incomingTiers[idx] || {}
        const threshold = Number(t.threshold)
        return {
          name: String(t.name || def.name).trim() || def.name,
          threshold: Number.isFinite(threshold) && threshold >= 0 ? threshold : def.threshold,
          color: String(t.color || def.color),
          icon: String(t.icon || def.icon),
        }
      })
      tiers.sort((a, b) => a.threshold - b.threshold)
      nextSettings.loyalty = { mode, tiers }
    }

    // Handle retention config update
    if (body.retention !== undefined) {
      const r = body.retention || {}
      const validAgents = ['رنا', 'مى', 'ميرنا', 'أمل', 'auto']
      const validActions = ['reminder', 'task', 'off']
      const normStage = (s: any, def: any) => {
        const days = Number(s?.days)
        return {
          days: Number.isFinite(days) && days > 0 ? Math.floor(days) : def.days,
          action: validActions.includes(s?.action) ? s.action : def.action,
          assignedTo: validAgents.includes(s?.assignedTo) ? s.assignedTo : def.assignedTo,
        }
      }
      const cur = nextSettings.retention || { stage1: { days: 30, action: 'reminder', assignedTo: 'auto' }, stage2: { days: 60, action: 'reminder', assignedTo: 'auto' }, stage3: { days: 90, action: 'task', assignedTo: 'auto' } }
      const stage1 = normStage(r.stage1, cur.stage1)
      const stage2 = normStage(r.stage2, cur.stage2)
      const stage3 = normStage(r.stage3, cur.stage3)
      if (stage2.days <= stage1.days) {
        return NextResponse.json({ error: 'أيام المرحلة الثانية يجب أن تكون أكبر من الأولى' }, { status: 400 })
      }
      if (stage3.days <= stage2.days) {
        return NextResponse.json({ error: 'أيام المرحلة الثالثة يجب أن تكون أكبر من الثانية' }, { status: 400 })
      }
      nextSettings.retention = { stage1, stage2, stage3 } as any
    }

    writeOrderSettings(nextSettings)

    return NextResponse.json(
      {
        slaHours: nextSettings.slaHours,
        agentNotice: nextSettings.agentNotice,
        monthlyCompensationBudget: nextSettings.monthlyCompensationBudget,
        loyalty: nextSettings.loyalty,
        retention: nextSettings.retention,
      },
      { status: 200 }
    )
  } catch {
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
  }
}
