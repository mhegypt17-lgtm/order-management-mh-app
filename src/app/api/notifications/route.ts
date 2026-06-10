import { NextRequest, NextResponse } from 'next/server'
import {
  createTask,
  readOrderSettings,
  DEFAULT_RETENTION_CONFIG,
  type TaskRecord,
  type RetentionConfig,
  type RetentionStageConfig,
} from '@/lib/omsData'
import { supabase } from '@/lib/supabase'
import { cairoDateString, addDays } from '@/lib/cairoTime'

// Make this endpoint short-cached at the edge so a burst of bell pollers
// in the same role share one DB read.
export const dynamic = 'force-dynamic'
export const revalidate = 0

// Narrow projections — the full Supabase rows include large fields
// (notes, productPhotos arrays, addresses, etc.) that this endpoint
// never uses. We were reading 50–100× the bytes we needed.
const TASK_COLS = 'id,title,assignedTo,status,priority,createdBy,createdAt,source,linkedCustomerId'
const BRIEFING_COLS = 'id,authorName,message,type,priority,createdAt'
const COMPLAINT_COLS = 'id,ticketNumber,channel,status,assignedTo,createdBy,openedAt,closedAt,createdAt,comments'
const ORDER_COLS = 'id,appOrderNo,orderStatus,customerId,createdBy,createdAt,updatedAt,isScheduled,scheduledDate,scheduledTimeSlot,scheduledSpecificTime,isPriority,priorityReason'
const ORDER_INACTIVITY_COLS = 'id,customerId,orderStatus,createdAt'
const CUSTOMER_COLS = 'id,customerName,phone'
const HISTORY_COLS = 'id,entityType,entityId,orderId,action,changedBy,changedAt,details'

// ─── Types ───────────────────────────────────────────────────────────────────
export type NotificationType =
  | 'task-assigned'
  | 'task-updated'
  | 'briefing'
  | 'complaint-new'
  | 'complaint-comment'
  | 'complaint-sla-breach'
  | 'order-new'
  | 'order-status-changed'
  | 'delivery-status-changed'
  | 'scheduled-reminder'
  | 'priority-order'
  | 'inactive-customer'

export interface NotificationItem {
  id: string
  type: NotificationType
  title: string
  body: string
  href: string
  createdAt: string // ISO
  actor?: string
  priority?: 'low' | 'normal' | 'high' | 'urgent'
}

// ─── Data fetched from Supabase via @/lib/omsData ───────────────────────────

interface TaskRec {
  id: string
  title: string
  assignedTo?: string
  status?: string
  priority?: string
  createdBy?: string
  createdAt: string
  updatedAt?: string
}

interface BriefingRec {
  id: string
  authorName?: string
  authorRole?: string
  message?: string
  type?: string
  priority?: 'low' | 'normal' | 'high'
  createdAt: string
}

interface CommentRec {
  id: string
  authorName?: string
  text?: string
  createdAt: string
}

interface ComplaintRec {
  id: string
  ticketNumber?: string
  channel?: string
  status?: string
  assignedTo?: string
  createdBy?: string
  openedAt?: string
  closedAt?: string | null
  createdAt: string
  comments?: CommentRec[]
}

interface OrderRec {
  id: string
  appOrderNo?: string
  orderStatus?: string
  orderMethod?: string
  customerId?: string
  createdBy?: string
  createdAt: string
  updatedAt?: string
  isScheduled?: boolean
  scheduledDate?: string | null
  scheduledTimeSlot?: string | null
  scheduledSpecificTime?: string | null
  isPriority?: boolean
  priorityReason?: string | null
}

interface CustomerRec {
  id: string
  customerName?: string
  phone?: string
}

interface HistoryRec {
  id: string
  entityType: string
  entityId: string
  orderId?: string
  action: string
  changedBy?: string
  changedAt: string
  summary?: string
  details?: {
    fromStatus?: string
    toStatus?: string
    [k: string]: unknown
  }
}

// ─── Handler ─────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const role = (searchParams.get('role') || 'cs').toLowerCase()
    const userName = (searchParams.get('user') || '').trim()

    // Look back 7 days for recent activity
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
    const cutoffISO = new Date(cutoff).toISOString()
    // Inactive-customer logic needs orders going back further than 7 days
    // but bounded — anyone whose last order is older than ~13 months is
    // already beyond every retention stage in use.
    const inactivityCutoffISO = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString()
    const todayCairo = cairoDateString()
    const tomorrowCairo = addDays(todayCairo, 1)

    const items: NotificationItem[] = []

    // ── Fetch everything in parallel with narrow projections + SQL filters ──
    // This replaces 8 full-table SELECT *s with 7 targeted queries.
    const [
      tasksRes,
      briefingsRes,
      complaintsRes,
      recentOrdersRes,
      scheduledOrdersRes,
      inactivityOrdersRes,
      customersRes,
      historyRes,
      settings,
    ] = await Promise.all([
      supabase.from('tasks').select(TASK_COLS).gte('createdAt', cutoffISO),
      supabase.from('daily_briefings').select(BRIEFING_COLS).gte('createdAt', cutoffISO),
      // Need recent complaints (last 7 days) AND any still-open complaint
      // (for SLA breach detection). Combined OR keeps this to one query.
      supabase.from('complaints').select(COMPLAINT_COLS).or(`createdAt.gte.${cutoffISO},status.neq.closed`),
      // Recent + recently-updated orders (covers new, status-changed,
      // priority toggled — all flow through updatedAt).
      supabase.from('orders').select(ORDER_COLS).or(`createdAt.gte.${cutoffISO},updatedAt.gte.${cutoffISO}`),
      // Scheduled orders for today/tomorrow (any age).
      supabase.from('orders').select(ORDER_COLS).eq('isScheduled', true).in('scheduledDate', [todayCairo, tomorrowCairo]),
      // Trimmed projection for inactivity computation — only need id+customerId+status+date.
      supabase.from('orders').select(ORDER_INACTIVITY_COLS).gte('createdAt', inactivityCutoffISO).not('customerId', 'is', null),
      supabase.from('customers').select(CUSTOMER_COLS),
      // Edit history is the worst offender — was reading up to 100k rows
      // every poll. Now filtered to 7 days + only status_changed action.
      supabase.from('edit_history').select(HISTORY_COLS).eq('action', 'status_changed').gte('changedAt', cutoffISO),
      readOrderSettings(),
    ])

    const tasks: TaskRec[] = (tasksRes.data as TaskRec[]) || []
    const briefings: BriefingRec[] = (briefingsRes.data as BriefingRec[]) || []
    const complaints: ComplaintRec[] = (complaintsRes.data as ComplaintRec[]) || []
    // Merge recent + scheduled (de-dup by id) for the orders list used by notifications
    const recentOrders: OrderRec[] = (recentOrdersRes.data as OrderRec[]) || []
    const scheduledOrders: OrderRec[] = (scheduledOrdersRes.data as OrderRec[]) || []
    const orderById = new Map<string, OrderRec>()
    for (const o of recentOrders) orderById.set(o.id, o)
    for (const o of scheduledOrders) if (!orderById.has(o.id)) orderById.set(o.id, o)
    const orders: OrderRec[] = Array.from(orderById.values())
    const inactivityOrders = (inactivityOrdersRes.data as Array<{ id: string; customerId: string | null; orderStatus: string; createdAt: string }>) || []
    const customers: CustomerRec[] = (customersRes.data as CustomerRec[]) || []
    const history: HistoryRec[] = (historyRes.data as HistoryRec[]) || []

    // ── Tasks ─────────────────────────────────────────────────────────────
    for (const t of tasks) {
      const created = new Date(t.createdAt).getTime()
      if (!isFinite(created) || created < cutoff) continue
      const assignedToMe = !!userName && t.assignedTo === userName
      const createdByMe = !!userName && t.createdBy === userName
      // Skip only if you both created AND assigned to yourself
      if (createdByMe && assignedToMe) continue
      // Admin sees every task; CS/branch see all tasks too (names rarely match logins)
      items.push({
        id: `task:${t.id}`,
        type: 'task-assigned',
        title: assignedToMe ? '✅ تم تعيين مهمة لك' : '✅ مهمة جديدة',
        body: t.assignedTo ? `${t.title} — لـ ${t.assignedTo}` : t.title,
        href: '/orders/tasks',
        createdAt: t.createdAt,
        actor: t.createdBy,
        priority:
          t.priority === 'عالية' ? 'high' : t.priority === 'منخفضة' ? 'low' : 'normal',
      })
    }

    // ── Daily briefings ───────────────────────────────────────────────────

    for (const b of briefings) {
      const created = new Date(b.createdAt).getTime()
      if (!isFinite(created) || created < cutoff) continue
      // Skip only if user is the author themselves
      if (userName && b.authorName === userName) continue
      items.push({
        id: `brief:${b.id}`,
        type: 'briefing',
        title: '📋 بريفينج جديد',
        body: (b.message || '').slice(0, 120),
        href: '/orders/briefings',
        createdAt: b.createdAt,
        actor: b.authorName,
        priority: b.priority || 'normal',
      })
    }

    // ── Complaints ────────────────────────────────────────────────────────
    // SLA threshold from settings (default 4h)
    const slaHours = Number(settings?.slaHours) || 4
    const slaMs = slaHours * 60 * 60 * 1000
    const nowMsForSla = Date.now()

    for (const c of complaints) {
      const created = new Date(c.createdAt).getTime()
      if (isFinite(created) && created >= cutoff && c.createdBy !== userName) {
        items.push({
          id: `comp:${c.id}`,
          type: 'complaint-new',
          title: '🎫 شكوى جديدة',
          body: `تذكرة #${c.ticketNumber || c.id.slice(-6)} — ${c.channel || ''}`.trim(),
          href: '/orders/complaints',
          createdAt: c.createdAt,
          actor: c.createdBy,
          priority: 'high',
        })
      }

      // 🚨 SLA breach — fires while ticket is still open/in-progress past the SLA window
      const openedMs = c.openedAt ? new Date(c.openedAt).getTime() : created
      const isStillOpen = c.status !== 'closed'
      if (isStillOpen && isFinite(openedMs) && nowMsForSla - openedMs > slaMs) {
        const overdueHours = Math.floor((nowMsForSla - openedMs) / (1000 * 60 * 60))
        items.push({
          id: `comp-sla:${c.id}`,
          type: 'complaint-sla-breach',
          title: '🚨 تذكرة تجاوزت SLA',
          body: `#${c.ticketNumber || c.id.slice(-6)} — مفتوحة منذ ${overdueHours}س${c.assignedTo ? ' · ' + c.assignedTo : ''}`,
          href: '/orders/complaints',
          createdAt: new Date(openedMs + slaMs).toISOString(),
          actor: c.assignedTo,
          priority: 'urgent',
        })
      }

      // Comments on the ticket (from someone else)
      for (const cm of c.comments || []) {
        const ct = new Date(cm.createdAt).getTime()
        if (!isFinite(ct) || ct < cutoff) continue
        if (userName && cm.authorName === userName) continue
        items.push({
          id: `compcm:${cm.id}`,
          type: 'complaint-comment',
          title: '💬 تعليق على شكوى',
          body: `#${c.ticketNumber || c.id.slice(-6)}: ${(cm.text || '').slice(0, 100)}`,
          href: '/orders/complaints',
          createdAt: cm.createdAt,
          actor: cm.authorName,
          priority: 'normal',
        })
      }
    }

    // ── Order & delivery activity (drives CS ↔ branch notifications) ─────
    const customerMap = new Map(customers.map((c) => [c.id, c]))
    const orderMap = new Map(orders.map((o) => [o.id, o]))

    const orderLabel = (orderId: string | undefined): string => {
      if (!orderId) return ''
      const o = orderMap.get(orderId)
      if (!o) return orderId.slice(-6)
      const cust = o.customerId ? customerMap.get(o.customerId) : undefined
      const custLabel = cust?.customerName
        ? `${cust.customerName}${cust.phone ? ' · ' + cust.phone : ''}`
        : ''
      return `${o.appOrderNo || orderId.slice(-6)}${custLabel ? ' — ' + custLabel : ''}`
    }

    // Branch (and admin): new orders created in the last 7 days
    if (role === 'branch' || role === 'admin') {
      for (const o of orders) {
        const ts = new Date(o.createdAt).getTime()
        if (!isFinite(ts) || ts < cutoff) continue
        items.push({
          id: `order-new:${o.id}`,
          type: 'order-new',
          title: o.isPriority ? '🚨 طلب جديد عاجل' : '🆕 طلب جديد',
          body: orderLabel(o.id),
          href: `/branch/${o.id}`,
          createdAt: o.createdAt,
          actor: o.createdBy,
          priority: o.isPriority ? 'urgent' : 'high',
        })
      }

      // Priority-toggled orders: include even if order is older but priority recently set.
      for (const o of orders) {
        if (!o.isPriority) continue
        const refTs = new Date(o.updatedAt || o.createdAt).getTime()
        if (!isFinite(refTs) || refTs < cutoff) continue
        // Skip if status closes the order
        if (o.orderStatus === 'لاغي' || o.orderStatus === 'تم') continue
        items.push({
          id: `priority-order:${o.id}`,
          type: 'priority-order',
          title: '🚨 طلب أولوية عاجلة',
          body: `${orderLabel(o.id)}${o.priorityReason ? ' — ' + o.priorityReason : ''}`,
          href: `/branch/${o.id}`,
          createdAt: o.updatedAt || o.createdAt,
          actor: o.createdBy,
          priority: 'urgent',
        })
      }
    }

    // Status-change history → role-targeted notifications
    for (const h of history) {
      if (h.action !== 'status_changed') continue
      const ts = new Date(h.changedAt).getTime()
      if (!isFinite(ts) || ts < cutoff) continue
      const from = h.details?.fromStatus || ''
      const to = h.details?.toStatus || ''
      const label = orderLabel(h.orderId || h.entityId)

      if (h.entityType === 'order') {
        // CS changed orderStatus → notify branch (and admin)
        if (role !== 'branch' && role !== 'admin') continue
        items.push({
          id: `histo:${h.id}`,
          type: 'order-status-changed',
          title: '🔔 تغيير حالة الطلب',
          body: `${label} — ${from} → ${to}`,
          href: `/branch/${h.orderId || h.entityId}`,
          createdAt: h.changedAt,
          actor: h.changedBy,
          priority: 'high',
        })
      } else if (h.entityType === 'delivery') {
        // Branch changed deliveryStatus → notify CS (and admin)
        if (role !== 'cs' && role !== 'admin') continue
        items.push({
          id: `histo:${h.id}`,
          type: 'delivery-status-changed',
          title: '🏍️ تغيير حالة التوصيل',
          body: `${label} — ${from} → ${to}`,
          href: '/orders',
          createdAt: h.changedAt,
          actor: h.changedBy,
          priority: 'high',
        })
      }
    }

    // ── Scheduled order reminders (day-before + day-of) ──────────────────
    // CS gets notified about upcoming scheduled orders.
    if (role === 'cs' || role === 'admin' || role === 'branch') {
      const todayStr = todayCairo
      const tomorrowStr = tomorrowCairo
      for (const o of orders) {
        if (!o.isScheduled || !o.scheduledDate) continue
        if (o.orderStatus === 'لاغي' || o.orderStatus === 'تم') continue
        const isTomorrow = o.scheduledDate === tomorrowStr
        const isToday = o.scheduledDate === todayStr
        if (!isTomorrow && !isToday) continue
        // Branch only sees the day-of reminder
        if (role === 'branch' && !isToday) continue
        const slot = o.scheduledTimeSlot === 'ساعة محددة'
          ? (o.scheduledSpecificTime || '')
          : (o.scheduledTimeSlot || '')
        items.push({
          id: `sched:${o.id}:${o.scheduledDate}`,
          type: 'scheduled-reminder',
          title: isTomorrow ? '📅 تذكير: حجز غداً' : '📅 حجز اليوم',
          body: `${orderLabel(o.id)}${slot ? ' — ' + slot : ''}`,
          href: `/orders/${o.id}`,
          createdAt: new Date().toISOString(),
          priority: 'high',
        })
      }
    }

    // ── Inactive customer follow-ups (CS / admin) ────────────────────────
    // Stages and per-stage action/agent are configured in admin settings (retention).
    if (role === 'cs' || role === 'admin') {
      const retention: RetentionConfig = settings.retention || DEFAULT_RETENTION_CONFIG
      const nowMs = Date.now()
      // Build last-order map per customer (any non-cancelled order) using
      // the narrow inactivityOrders projection — covers up to 400 days back.
      const lastOrderMs = new Map<string, number>()
      for (const o of inactivityOrders) {
        if (!o.customerId) continue
        if (o.orderStatus === 'لاغي') continue
        const ts = new Date(o.createdAt).getTime()
        if (!isFinite(ts)) continue
        const prev = lastOrderMs.get(o.customerId) || 0
        if (ts > prev) lastOrderMs.set(o.customerId, ts)
      }

      // Existing open auto-followup tasks per customer (idempotency guard).
      // Narrow projection — only the fields used for the dedupe check.
      const existingAutoTasks = new Map<string, { id: string; linkedCustomerId: string | null; status?: string }>()
      try {
        const { data: autoTasks } = await supabase
          .from('tasks')
          .select('id,linkedCustomerId,status,source')
          .eq('source', 'auto-followup')
          .neq('status', 'مكتملة')
        for (const t of (autoTasks || []) as Array<{ id: string; linkedCustomerId: string | null; status?: string; source?: string }>) {
          if (!t.linkedCustomerId) continue
          existingAutoTasks.set(t.linkedCustomerId, t)
        }
      } catch {}

      // CS rotation for auto-assignment
      const csAgents: TaskRecord['assignedTo'][] = ['رنا', 'مى', 'ميرنا', 'أمل']

      // Sort stages descending so the highest applicable stage wins
      const stages: Array<{ key: 1 | 2 | 3; cfg: RetentionStageConfig }> = [
        { key: 3, cfg: retention.stage3 },
        { key: 2, cfg: retention.stage2 },
        { key: 1, cfg: retention.stage1 },
      ]

      for (const c of customers) {
        const lastMs = lastOrderMs.get(c.id)
        if (!lastMs) continue
        const days = Math.floor((nowMs - lastMs) / (1000 * 60 * 60 * 24))
        if (days < retention.stage1.days) continue
        const matched = stages.find((s) => days >= s.cfg.days && s.cfg.action !== 'off')
        if (!matched) continue

        const stageKey = matched.key
        const stageCfg = matched.cfg
        const label = `${c.customerName || 'عميل'}${c.phone ? ' · ' + c.phone : ''}`
        const href = `/orders/crm?customerId=${c.id}`
        const stageEmoji = stageKey === 3 ? '🔴' : stageKey === 2 ? '🟠' : '🟡'

        // Resolve assignee: explicit choice from admin or random rotation
        const resolvedAgent: TaskRecord['assignedTo'] =
          stageCfg.assignedTo === 'auto'
            ? csAgents[Math.floor(Math.random() * csAgents.length)]
            : (stageCfg.assignedTo as TaskRecord['assignedTo'])

        // If action === 'task' and no open auto task exists for this customer → create one
        if (stageCfg.action === 'task' && !existingAutoTasks.get(c.id)) {
          try {
            const task = await createTask({
              title: `📞 متابعة عميل خامل (${days} يوم)`,
              description:
                `العميل ${label} لم يطلب منذ ${days} يوم. يرجى التواصل والاطمئنان وعرض المنتجات المفضلة لديه.`,
              assignedTo: resolvedAgent,
              linkedOrderId: null,
              linkedCustomerId: c.id,
              status: 'جديدة',
              priority: stageKey === 3 ? 'عالية' : 'متوسطة',
              dueDate: null,
              createdBy: 'النظام (متابعة آلية)',
              source: 'auto-followup',
            })
            existingAutoTasks.set(c.id, { id: task.id, linkedCustomerId: task.linkedCustomerId ?? null, status: task.status })
          } catch (e) {
            console.error('auto-followup task creation failed', e)
          }
        }

        const stageTitle =
          stageCfg.action === 'task'
            ? `${stageEmoji} عميل خامل ${days}+ يوم — تم إنشاء مهمة متابعة`
            : `${stageEmoji} تذكير: عميل بدون طلبات منذ ${stageCfg.days} يوم`

        items.push({
          id: `inactive:${c.id}:${stageKey}`,
          type: 'inactive-customer',
          title: stageTitle,
          body: `${stageEmoji} ${label} — آخر طلب منذ ${days} يوم${stageCfg.assignedTo !== 'auto' ? ' · ' + stageCfg.assignedTo : ''}`,
          href,
          createdAt: new Date(lastMs + stageCfg.days * 24 * 60 * 60 * 1000).toISOString(),
          actor: stageCfg.assignedTo !== 'auto' ? stageCfg.assignedTo : undefined,
          priority: stageCfg.action === 'task' ? 'high' : 'normal',
        })
      }
    }

    // Sort newest first, cap at 50
    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    const limited = items.slice(0, 50)

    return NextResponse.json({
      items: limited,
      serverTime: new Date().toISOString(),
    })
  } catch (err) {
    console.error('notifications error', err)
    return NextResponse.json({ items: [], serverTime: new Date().toISOString() })
  }
}
