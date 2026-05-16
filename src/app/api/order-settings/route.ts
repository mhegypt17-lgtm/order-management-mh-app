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

    const settings = await readOrderSettings()
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
    const settings = await readOrderSettings()

    const nextSettings: OrderSettingsRecord = { ...settings }

    // Handle SLA hours update
    if (body.slaHours !== undefined) {
      const parsedSla = Math.max(1, Number(body.slaHours) || 4)
      nextSettings.slaHours = parsedSla
      await writeOrderSettings(nextSettings)
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

    await writeOrderSettings(nextSettings)

    return NextResponse.json(
      {
        slaHours: nextSettings.slaHours,
        agentNotice: nextSettings.agentNotice,
        monthlyCompensationBudget: nextSettings.monthlyCompensationBudget,
      },
      { status: 200 }
    )
  } catch {
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
  }
}
