import { supabase } from './supabase'

// ─── Types (unchanged) ────────────────────────────────────────────────────────

export interface CustomerRecord {
  id: string
  phone: string
  customerName: string
  wallet?: number
  createdAt: string
  updatedAt: string
}

export interface CustomerAddressRecord {
  id: string
  customerId: string
  addressLabel: string
  area?: string
  streetAddress: string
  googleMapsLink: string
  createdAt: string
}

export interface OrderRecord {
  id: string
  appOrderNo: string
  orderDate: string
  orderTime: string
  orderType: 'B2B' | 'Online' | 'Instashop' | 'App'
  orderReceiver: string
  orderMethod: string
  customerType: 'جديد' | 'قديم' | 'عائد' | 'استكمال' | 'استرجاع' | 'استبدال' | 'تسويق' | 'تعويض' | 'فحص' | 'تحصيل'
  customerSource: string
  orderStatus: 'ساري' | 'مقبول' | 'مؤجل' | 'حجز' | 'تم' | 'لاغي' | 'بانتظار القبول'
  cancellationReason: 'نفاد المنتج' | 'عدم توفر' | 'تأخير التوصيل' | 'سعر مرتفع' | 'موعد غير مناسب' | 'Other' | null
  paymentMethod: 'Instapay' | 'Cash' | 'Visa' | 'Credit'
  customerId: string
  deliveryAddressId: string
  notes: string
  followUp: boolean
  followUpNotes: string
  isScheduled?: boolean
  scheduledDate?: string | null
  scheduledTimeSlot?: 'صباحي' | 'ظهري' | 'مسائي' | 'ساعة محددة' | null
  scheduledSpecificTime?: string | null
  isPriority?: boolean
  priorityReason?: string | null
  subtotal: number
  deliveryFee: number
  walletApplied?: number
  discountCode?: string | null
  discountApplied?: number
  orderTotal: number
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface OrderItemRecord {
  id: string
  orderId: string
  productId: string
  quantity: number
  weightGrams: number
  unitPrice: number
  lineTotal: number
  specialInstructions: string
  createdAt: string
}

export interface OrderDeliveryRecord {
  id: string
  orderId: string
  deliveryStatus: 'قبول' | 'جاهز' | 'في الطريق' | 'تم التوصيل' | 'لم يخرج بعد'
  branchComments: string
  productPhotos: string[]
  invoicePhoto: string
  deliveredAt: string | null
  updatedBy: string
  updatedAt: string
}

export interface EditHistoryRecord {
  id: string
  entityType: 'order' | 'delivery' | 'product'
  entityId: string
  orderId: string | null
  action: 'created' | 'updated' | 'deleted' | 'status_changed'
  changedBy: string
  changedAt: string
  summary: string
  details: Record<string, unknown>
}

export interface TaskRecord {
  id: string
  title: string
  description: string
  assignedTo: 'رنا' | 'مى' | 'ميرنا' | 'أمل'
  linkedOrderId: string | null
  linkedCustomerId?: string | null
  status: 'جديدة' | 'قيد الإنجاز' | 'مكتملة' | 'معلقة'
  priority: 'منخفضة' | 'متوسطة' | 'عالية'
  dueDate: string | null
  createdBy: string
  source?: 'manual' | 'auto-followup'
  createdAt: string
  updatedAt: string
}

export interface DeliveryZoneRecord {
  id: string
  zone: number
  area: string
  averageDistanceKm: number
  deliveryCost: number
  customerDeliveryFee: number
  freeDeliveryValue: number
  createdAt: string
  updatedAt: string
}

export interface AdahiOrderItemRecord {
  id: string
  productName: string
  quantity: number
  unitPrice: number
  lineTotal: number
}

export interface AdahiOrderRecord {
  id: string
  seasonLabel: string
  orderDate: string
  orderTime: string
  orderReceiver: string
  orderMethod: string
  customerId: string
  customerName: string
  phone: string
  deliveryAddressId: string
  addressLabel: string
  deliveryArea: string
  streetAddress: string
  googleMapsLink: string
  items: AdahiOrderItemRecord[]
  subtotal: number
  paidAmount: number
  remainingAmount: number
  collectionPercent: number
  slaughterDay: 'اليوم الأول' | 'اليوم الثاني'
  cuttingDetails: string
  cleanOffal: boolean
  hasDelivery: boolean
  willWitnessSacrifice: boolean
  notes: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface LookupValueRecord {
  id: string
  label: string
  isActive: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface AgentNoticeRecord {
  message: string
  type: 'info' | 'promo' | 'warning' | 'success'
  isActive: boolean
  updatedAt: string
}

export interface DailyBriefingRecord {
  id: string
  authorName: string
  authorRole: 'admin' | 'cs'
  message: string
  type: 'announcement' | 'alert' | 'workingHours' | 'general'
  priority: 'low' | 'medium' | 'high'
  isCompleted: boolean
  createdAt: string
  updatedAt: string
}

export interface ComplaintCommentRecord {
  id: string
  authorName: string
  text: string
  createdAt: string
}

export interface ComplaintRecord {
  id: string
  ticketNumber: string
  channel: string
  subject: string
  description: string
  reason: string
  status: 'open' | 'in-progress' | 'closed'
  priority: 'low' | 'medium' | 'high'
  customerId: string | null
  customerName: string | null
  customerPhone: string | null
  linkedOrderId: string | null
  assignedTo: string
  createdBy: string
  compensationAmount: number
  comments: ComplaintCommentRecord[]
  openedAt: string
  closedAt: string | null
  createdAt: string
  updatedAt: string
}

export type LoyaltyMode = 'frequency' | 'revenue'

export interface LoyaltyTierConfig {
  name: string
  threshold: number
  color: string
  icon: string
}

export interface LoyaltyConfig {
  mode: LoyaltyMode
  tiers: LoyaltyTierConfig[]
}

export interface OrderSettingsRecord {
  orderReceivers: LookupValueRecord[]
  orderMethods: LookupValueRecord[]
  customerSources: LookupValueRecord[]
  orderTypes: LookupValueRecord[]
  paymentMethods: LookupValueRecord[]
  orderStatuses: LookupValueRecord[]
  complaintChannels: LookupValueRecord[]
  complaintReasons: LookupValueRecord[]
  monthlyCompensationBudget: number
  slaHours?: number
  loyalty?: LoyaltyConfig
  retention?: RetentionConfig
  agentNotice: AgentNoticeRecord
}

export type RetentionAction = 'reminder' | 'task' | 'off'
export type RetentionAgent = 'رنا' | 'مى' | 'ميرنا' | 'أمل' | 'auto'

export interface RetentionStageConfig {
  days: number
  action: RetentionAction
  assignedTo: RetentionAgent
}

export interface RetentionConfig {
  stage1: RetentionStageConfig
  stage2: RetentionStageConfig
  stage3: RetentionStageConfig
}

export const DEFAULT_RETENTION_CONFIG: RetentionConfig = {
  stage1: { days: 30, action: 'reminder', assignedTo: 'auto' },
  stage2: { days: 60, action: 'reminder', assignedTo: 'auto' },
  stage3: { days: 90, action: 'task',     assignedTo: 'auto' },
}

export const DEFAULT_LOYALTY_CONFIG: LoyaltyConfig = {
  mode: 'frequency',
  tiers: [
    { name: 'برونزي',  threshold: 0,  color: 'bg-amber-100 text-amber-800',   icon: '🥉' },
    { name: 'فضي',     threshold: 5,  color: 'bg-gray-100 text-gray-700',     icon: '🥈' },
    { name: 'ذهبي',    threshold: 10, color: 'bg-yellow-100 text-yellow-800', icon: '🥇' },
    { name: 'بلاتيني',  threshold: 20, color: 'bg-purple-100 text-purple-800', icon: '💎' },
  ],
}

// ─── Pure helpers (unchanged) ─────────────────────────────────────────────────

export function generateId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

export function normalizePhone(phone: string) {
  return (phone || '').replace(/\s+/g, '').trim()
}

export function formatDateDDMMYY(dateISO: string) {
  const date = new Date(dateISO)
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yy = String(date.getFullYear()).slice(-2)
  return `${dd}${mm}${yy}`
}

export function formatDateYYMMDD(dateISO: string) {
  const date = new Date(dateISO)
  const yy = String(date.getFullYear()).slice(-2)
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yy}${mm}${dd}`
}

export function toOrderTypeSlug(orderType: string) {
  return orderType.toLowerCase()
}

export function generateAppOrderNo(orderDate: string, _orderType: string, orders: OrderRecord[]) {
  const dateKey = formatDateYYMMDD(orderDate)
  const prefix = `MH-${dateKey}-`
  const sameDay = orders.filter((o) => {
    if (typeof o.appOrderNo === 'string' && o.appOrderNo.startsWith(prefix)) return true
    return formatDateYYMMDD(o.orderDate) === dateKey
  })
  let maxSeq = 0
  for (const o of sameDay) {
    const tail = (o.appOrderNo || '').slice(prefix.length)
    const n = parseInt(tail, 10)
    if (Number.isFinite(n) && n > maxSeq) maxSeq = n
  }
  const next = String(maxSeq + 1).padStart(3, '0')
  return `${prefix}${next}`
}

export function resolveCustomerTier(
  loyalty: LoyaltyConfig,
  metrics: { completedOrderCount: number; totalRevenue: number }
): LoyaltyTierConfig {
  const value = loyalty.mode === 'revenue' ? metrics.totalRevenue : metrics.completedOrderCount
  let resolved = loyalty.tiers[0]
  for (const t of loyalty.tiers) {
    if (value >= t.threshold) resolved = t
  }
  return resolved
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────

async function selectAll<T>(table: string): Promise<T[]> {
  const { data, error } = await supabase.from(table).select('*')
  if (error) {
    console.error(`[omsData] select ${table} error:`, error.message)
    return []
  }
  return (data || []) as T[]
}

/** Insert-or-update an entire array. Rows present in DB but absent from `rows` are left intact. */
async function upsertAll<T extends { id: string }>(table: string, rows: T[]) {
  if (!rows.length) return
  const { error } = await supabase.from(table).upsert(rows as any)
  if (error) console.error(`[omsData] upsert ${table} error:`, error.message)
}

async function deleteById(table: string, id: string) {
  const { error } = await supabase.from(table).delete().eq('id', id)
  if (error) console.error(`[omsData] delete ${table} ${id} error:`, error.message)
}

// ─── products (read-only convenience used by order routes) ────────────────────

export interface ProductRecord {
  id: string
  productName: string
  productCategory?: string
  basePrice?: number
  offerPrice?: number
  isActive?: boolean
  [k: string]: unknown
}

export async function readProducts(): Promise<ProductRecord[]> {
  return selectAll<ProductRecord>('products')
}

// ─── customers ────────────────────────────────────────────────────────────────

export async function readCustomers(): Promise<CustomerRecord[]> {
  return selectAll<CustomerRecord>('customers')
}

export async function writeCustomers(data: CustomerRecord[]) {
  await upsertAll('customers', data)
}

// ─── customer_addresses ───────────────────────────────────────────────────────

export async function readAddresses(): Promise<CustomerAddressRecord[]> {
  return selectAll<CustomerAddressRecord>('customer_addresses')
}

export async function writeAddresses(data: CustomerAddressRecord[]) {
  await upsertAll('customer_addresses', data)
}

// ─── orders ───────────────────────────────────────────────────────────────────

export async function readOrders(): Promise<OrderRecord[]> {
  return selectAll<OrderRecord>('orders')
}

export async function writeOrders(data: OrderRecord[]) {
  await upsertAll('orders', data)
}

// ─── order_items ──────────────────────────────────────────────────────────────

export async function readOrderItems(): Promise<OrderItemRecord[]> {
  return selectAll<OrderItemRecord>('order_items')
}

export async function writeOrderItems(data: OrderItemRecord[]) {
  await upsertAll('order_items', data)
}

// ─── order_delivery ───────────────────────────────────────────────────────────

export async function readOrderDelivery(): Promise<OrderDeliveryRecord[]> {
  return selectAll<OrderDeliveryRecord>('order_delivery')
}

export async function writeOrderDelivery(data: OrderDeliveryRecord[]) {
  await upsertAll('order_delivery', data)
}

// ─── edit_history ─────────────────────────────────────────────────────────────

export async function readEditHistory(): Promise<EditHistoryRecord[]> {
  return selectAll<EditHistoryRecord>('edit_history')
}

export async function writeEditHistory(data: EditHistoryRecord[]) {
  await upsertAll('edit_history', data)
}

export async function appendEditHistory(record: Omit<EditHistoryRecord, 'id' | 'changedAt'>) {
  const row: EditHistoryRecord = {
    id: generateId('hist'),
    changedAt: new Date().toISOString(),
    ...record,
  }
  const { error } = await supabase.from('edit_history').insert(row as any)
  if (error) console.error('[omsData] appendEditHistory error:', error.message)
}

// ─── tasks ────────────────────────────────────────────────────────────────────

export async function readTasks(): Promise<TaskRecord[]> {
  return selectAll<TaskRecord>('tasks')
}

export async function writeTasks(data: TaskRecord[]) {
  await upsertAll('tasks', data)
}

export async function createTask(
  task: Omit<TaskRecord, 'id' | 'createdAt' | 'updatedAt'>
): Promise<TaskRecord> {
  const newTask: TaskRecord = {
    ...task,
    id: generateId('task'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  const { error } = await supabase.from('tasks').insert(newTask as any)
  if (error) console.error('[omsData] createTask error:', error.message)
  return newTask
}

export async function updateTask(
  id: string,
  updates: Partial<Omit<TaskRecord, 'id' | 'createdAt'>>
): Promise<TaskRecord | null> {
  const patch = { ...updates, updatedAt: new Date().toISOString() }
  const { data, error } = await supabase.from('tasks').update(patch as any).eq('id', id).select().single()
  if (error) {
    console.error('[omsData] updateTask error:', error.message)
    return null
  }
  return (data as TaskRecord) || null
}

export async function deleteTask(id: string) {
  await deleteById('tasks', id)
}

// ─── delivery_zones ───────────────────────────────────────────────────────────

const DEFAULT_ZONES_COUNT = 8

function blankZone(idx: number): DeliveryZoneRecord {
  const now = new Date().toISOString()
  return {
    id: generateId('zone'),
    zone: idx + 1,
    area: `منطقة ${idx + 1}`,
    averageDistanceKm: 0,
    deliveryCost: 0,
    customerDeliveryFee: 0,
    freeDeliveryValue: 0,
    createdAt: now,
    updatedAt: now,
  }
}

export async function readDeliveryZones(): Promise<DeliveryZoneRecord[]> {
  const rows = await selectAll<DeliveryZoneRecord>('delivery_zones')
  if (rows.length === 0) {
    const defaults = Array.from({ length: DEFAULT_ZONES_COUNT }, (_, i) => blankZone(i))
    await upsertAll('delivery_zones', defaults)
    return defaults
  }
  return rows.slice().sort((a, b) => Number(a.zone) - Number(b.zone))
}

export async function writeDeliveryZones(data: DeliveryZoneRecord[]) {
  await upsertAll('delivery_zones', data)
}

// ─── adahi_orders + adahi_order_items ─────────────────────────────────────────
// The `items` field is embedded in the JSON shape but stored in a separate table.

export async function readAdahiOrders(): Promise<AdahiOrderRecord[]> {
  const [{ data: orders, error: oErr }, { data: items, error: iErr }] = await Promise.all([
    supabase.from('adahi_orders').select('*'),
    supabase.from('adahi_order_items').select('*'),
  ])
  if (oErr) console.error('[omsData] readAdahiOrders error:', oErr.message)
  if (iErr) console.error('[omsData] readAdahiOrderItems error:', iErr.message)
  const byOrder = new Map<string, AdahiOrderItemRecord[]>()
  for (const it of (items || []) as any[]) {
    const arr = byOrder.get(it.orderId) || []
    arr.push({
      id: it.id,
      productName: it.productName,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      lineTotal: it.lineTotal,
    })
    byOrder.set(it.orderId, arr)
  }
  return ((orders || []) as any[]).map((o) => ({ ...o, items: byOrder.get(o.id) || [] })) as AdahiOrderRecord[]
}

export async function writeAdahiOrders(data: AdahiOrderRecord[]) {
  const headers = data.map(({ items: _items, ...rest }) => rest as any)
  await upsertAll('adahi_orders', headers)

  for (const o of data) {
    await supabase.from('adahi_order_items').delete().eq('orderId', o.id)
    if (o.items && o.items.length) {
      const rows = o.items.map((it) => ({ ...it, orderId: o.id }))
      const { error } = await supabase.from('adahi_order_items').insert(rows as any)
      if (error) console.error('[omsData] writeAdahiOrderItems error:', error.message)
    }
  }
}

// ─── order_settings (singleton) ───────────────────────────────────────────────

const DEFAULT_ORDER_RECEIVERS = ['رنا', 'مى', 'ميرنا', 'أمل']
const DEFAULT_ORDER_METHODS = ['FB', 'Call', 'App', 'WhatsApp', 'B2B', 'W.S']
const DEFAULT_ORDER_TYPES = ['B2B', 'Online', 'Instashop', 'App']
const DEFAULT_PAYMENT_METHODS = ['Instapay', 'Cash', 'Visa', 'Credit']
const DEFAULT_ORDER_STATUSES = ['ساري', 'مؤجل', 'حجز', 'لاغي']
const DEFAULT_COMPLAINT_CHANNELS = ['Instashop', 'App', 'Branch', 'Breadfast']
const DEFAULT_COMPLAINT_REASONS = ['تأخير التوصيل', 'جودة المنتج', 'اختلاف الطلب', 'سوء الخدمة', 'أخرى']
const DEFAULT_CUSTOMER_SOURCES = [
  'Facebook', 'Instashop', 'Google', 'Breadfast', 'Friend',
  'Branch', 'Family', 'Instagram', 'Play Store', 'Ad', 'GoodsMart', 'Other',
]

function defaultsToLookupRows(values: string[]): LookupValueRecord[] {
  const now = new Date().toISOString()
  return values.map((label, idx) => ({
    id: generateId('lookup'),
    label,
    isActive: true,
    sortOrder: idx + 1,
    createdAt: now,
    updatedAt: now,
  }))
}

function defaultOrderSettings(): OrderSettingsRecord {
  return {
    orderReceivers: defaultsToLookupRows(DEFAULT_ORDER_RECEIVERS),
    orderMethods: defaultsToLookupRows(DEFAULT_ORDER_METHODS),
    customerSources: defaultsToLookupRows(DEFAULT_CUSTOMER_SOURCES),
    orderTypes: defaultsToLookupRows(DEFAULT_ORDER_TYPES),
    paymentMethods: defaultsToLookupRows(DEFAULT_PAYMENT_METHODS),
    orderStatuses: defaultsToLookupRows(DEFAULT_ORDER_STATUSES),
    complaintChannels: defaultsToLookupRows(DEFAULT_COMPLAINT_CHANNELS),
    complaintReasons: defaultsToLookupRows(DEFAULT_COMPLAINT_REASONS),
    monthlyCompensationBudget: 5000,
    slaHours: 4,
    loyalty: DEFAULT_LOYALTY_CONFIG,
    retention: DEFAULT_RETENTION_CONFIG,
    agentNotice: {
      message: '',
      type: 'info',
      isActive: false,
      updatedAt: new Date().toISOString(),
    },
  }
}

function normalizeLookupRows(rows: unknown): LookupValueRecord[] {
  if (!Array.isArray(rows)) return []
  const now = new Date().toISOString()
  return rows
    .map((row, idx) => {
      const source = row as Partial<LookupValueRecord>
      const label = String(source.label || '').trim()
      if (!label) return null
      return {
        id: source.id || generateId('lookup'),
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

function normalizeLoyaltyConfig(raw: unknown): LoyaltyConfig {
  const r = (raw || {}) as Partial<LoyaltyConfig>
  const mode: LoyaltyMode = r.mode === 'revenue' ? 'revenue' : 'frequency'
  const incomingTiers = Array.isArray(r.tiers) ? r.tiers : []
  const tiers: LoyaltyTierConfig[] = DEFAULT_LOYALTY_CONFIG.tiers.map((def, idx) => {
    const t = (incomingTiers[idx] || {}) as Partial<LoyaltyTierConfig>
    const threshold = Number(t.threshold)
    return {
      name: String(t.name || def.name).trim() || def.name,
      threshold: Number.isFinite(threshold) && threshold >= 0 ? threshold : def.threshold,
      color: String(t.color || def.color),
      icon: String(t.icon || def.icon),
    }
  })
  tiers.sort((a, b) => a.threshold - b.threshold)
  return { mode, tiers }
}

function normalizeRetentionStage(raw: unknown, def: RetentionStageConfig): RetentionStageConfig {
  const r = (raw || {}) as Partial<RetentionStageConfig>
  const days = Number(r.days)
  const action: RetentionAction =
    r.action === 'task' || r.action === 'off' || r.action === 'reminder' ? r.action : def.action
  const validAgents: RetentionAgent[] = ['رنا', 'مى', 'ميرنا', 'أمل', 'auto']
  const assignedTo: RetentionAgent = validAgents.includes(r.assignedTo as RetentionAgent)
    ? (r.assignedTo as RetentionAgent)
    : def.assignedTo
  return {
    days: Number.isFinite(days) && days > 0 ? Math.floor(days) : def.days,
    action,
    assignedTo,
  }
}

function normalizeRetentionConfig(raw: unknown): RetentionConfig {
  const r = (raw || {}) as Partial<RetentionConfig>
  const stage1 = normalizeRetentionStage(r.stage1, DEFAULT_RETENTION_CONFIG.stage1)
  const stage2 = normalizeRetentionStage(r.stage2, DEFAULT_RETENTION_CONFIG.stage2)
  const stage3 = normalizeRetentionStage(r.stage3, DEFAULT_RETENTION_CONFIG.stage3)
  if (stage2.days <= stage1.days) stage2.days = stage1.days + 1
  if (stage3.days <= stage2.days) stage3.days = stage2.days + 1
  return { stage1, stage2, stage3 }
}

export async function readOrderSettings(): Promise<OrderSettingsRecord> {
  const { data, error } = await supabase
    .from('order_settings')
    .select('*')
    .eq('id', 'singleton')
    .maybeSingle()
  if (error) console.error('[omsData] readOrderSettings error:', error.message)

  if (!data) {
    const defaults = defaultOrderSettings()
    await writeOrderSettings(defaults)
    return defaults
  }

  const parsed = data as Partial<OrderSettingsRecord> & { id?: string }
  const defaults = defaultOrderSettings()
  const normalized: OrderSettingsRecord = {
    orderReceivers: normalizeLookupRows(parsed.orderReceivers),
    orderMethods: normalizeLookupRows(parsed.orderMethods),
    customerSources: normalizeLookupRows(parsed.customerSources),
    orderTypes: normalizeLookupRows(parsed.orderTypes),
    paymentMethods: normalizeLookupRows(parsed.paymentMethods),
    orderStatuses: normalizeLookupRows(parsed.orderStatuses),
    complaintChannels: normalizeLookupRows(parsed.complaintChannels),
    complaintReasons: normalizeLookupRows((parsed as any).complaintReasons),
    monthlyCompensationBudget: Number(parsed.monthlyCompensationBudget) || 5000,
    slaHours: Math.max(1, Number(parsed.slaHours) || 4),
    loyalty: normalizeLoyaltyConfig((parsed as any).loyalty),
    retention: normalizeRetentionConfig((parsed as any).retention),
    agentNotice: {
      message: String((parsed.agentNotice as any)?.message || '').trim(),
      type: (['info', 'promo', 'warning', 'success'].includes((parsed.agentNotice as any)?.type)
        ? (parsed.agentNotice as any).type
        : 'info') as AgentNoticeRecord['type'],
      isActive: Boolean((parsed.agentNotice as any)?.isActive),
      updatedAt: (parsed.agentNotice as any)?.updatedAt || new Date().toISOString(),
    },
  }
  if (normalized.orderReceivers.length === 0) normalized.orderReceivers = defaults.orderReceivers
  if (normalized.orderMethods.length === 0) normalized.orderMethods = defaults.orderMethods
  if (normalized.customerSources.length === 0) normalized.customerSources = defaults.customerSources
  if (normalized.orderTypes.length === 0) normalized.orderTypes = defaults.orderTypes
  if (normalized.paymentMethods.length === 0) normalized.paymentMethods = defaults.paymentMethods
  if (normalized.orderStatuses.length === 0) normalized.orderStatuses = defaults.orderStatuses
  if (normalized.complaintChannels.length === 0) normalized.complaintChannels = defaults.complaintChannels
  if (normalized.complaintReasons.length === 0) normalized.complaintReasons = defaults.complaintReasons
  return normalized
}

export async function writeOrderSettings(data: OrderSettingsRecord) {
  const normalized: OrderSettingsRecord = {
    orderReceivers: normalizeLookupRows(data.orderReceivers),
    orderMethods: normalizeLookupRows(data.orderMethods),
    customerSources: normalizeLookupRows(data.customerSources),
    orderTypes: normalizeLookupRows(data.orderTypes),
    paymentMethods: normalizeLookupRows(data.paymentMethods),
    orderStatuses: normalizeLookupRows(data.orderStatuses),
    complaintChannels: normalizeLookupRows(data.complaintChannels),
    complaintReasons: normalizeLookupRows((data as any).complaintReasons),
    monthlyCompensationBudget: Number(data.monthlyCompensationBudget) || 5000,
    slaHours: Math.max(1, Number(data.slaHours) || 4),
    loyalty: normalizeLoyaltyConfig(data.loyalty),
    retention: normalizeRetentionConfig((data as any).retention),
    agentNotice: {
      message: String(data.agentNotice?.message || '').trim(),
      type: (['info', 'promo', 'warning', 'success'].includes(data.agentNotice?.type)
        ? data.agentNotice.type
        : 'info') as AgentNoticeRecord['type'],
      isActive: Boolean(data.agentNotice?.isActive),
      updatedAt: new Date().toISOString(),
    },
  }
  const { error } = await supabase
    .from('order_settings')
    .upsert({ id: 'singleton', ...normalized, updatedAt: new Date().toISOString() } as any)
  if (error) console.error('[omsData] writeOrderSettings error:', error.message)
}

// ─── daily_briefings ──────────────────────────────────────────────────────────

export async function readDailyBriefings(): Promise<DailyBriefingRecord[]> {
  const raw = await selectAll<DailyBriefingRecord>('daily_briefings')
  return raw.map((b) => ({
    ...b,
    priority: (['low', 'medium', 'high'].includes(b.priority) ? b.priority : 'medium') as DailyBriefingRecord['priority'],
    isCompleted: Boolean(b.isCompleted),
  }))
}

export async function writeDailyBriefings(data: DailyBriefingRecord[]) {
  await upsertAll('daily_briefings', data)
}

export async function createDailyBriefing(
  briefing: Omit<DailyBriefingRecord, 'id' | 'createdAt' | 'updatedAt'>
): Promise<DailyBriefingRecord> {
  const newBriefing: DailyBriefingRecord = {
    ...briefing,
    id: generateId('brief'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  const { error } = await supabase.from('daily_briefings').insert(newBriefing as any)
  if (error) console.error('[omsData] createDailyBriefing error:', error.message)
  return newBriefing
}

export async function updateDailyBriefing(
  id: string,
  updates: Partial<Omit<DailyBriefingRecord, 'id' | 'createdAt'>>
): Promise<DailyBriefingRecord | null> {
  const patch = { ...updates, updatedAt: new Date().toISOString() }
  const { data, error } = await supabase
    .from('daily_briefings')
    .update(patch as any)
    .eq('id', id)
    .select()
    .single()
  if (error) {
    console.error('[omsData] updateDailyBriefing error:', error.message)
    return null
  }
  return (data as DailyBriefingRecord) || null
}

export async function deleteDailyBriefing(id: string) {
  await deleteById('daily_briefings', id)
}

// ─── complaints ───────────────────────────────────────────────────────────────

async function generateTicketNumber(): Promise<string> {
  const now = new Date()
  const dateKey = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
  const { data, error } = await supabase
    .from('complaints')
    .select('ticketNumber')
    .like('ticketNumber', `${dateKey}-%`)
  if (error) console.error('[omsData] generateTicketNumber error:', error.message)
  const count = (data || []).length
  return `${dateKey}-${String(count + 1).padStart(4, '0')}`
}

export async function readComplaints(): Promise<ComplaintRecord[]> {
  return selectAll<ComplaintRecord>('complaints')
}

export async function writeComplaints(data: ComplaintRecord[]) {
  await upsertAll('complaints', data)
}

export async function createComplaint(
  complaint: Omit<ComplaintRecord, 'id' | 'ticketNumber' | 'createdAt' | 'updatedAt' | 'comments'>
): Promise<ComplaintRecord> {
  const newComplaint: ComplaintRecord = {
    ...complaint,
    id: generateId('comp'),
    ticketNumber: await generateTicketNumber(),
    comments: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  const { error } = await supabase.from('complaints').insert(newComplaint as any)
  if (error) console.error('[omsData] createComplaint error:', error.message)
  return newComplaint
}

export async function updateComplaint(
  id: string,
  updates: Partial<Omit<ComplaintRecord, 'id' | 'ticketNumber' | 'createdAt'>>
): Promise<ComplaintRecord | null> {
  const patch = { ...updates, updatedAt: new Date().toISOString() }
  const { data, error } = await supabase
    .from('complaints')
    .update(patch as any)
    .eq('id', id)
    .select()
    .single()
  if (error) {
    console.error('[omsData] updateComplaint error:', error.message)
    return null
  }
  return (data as ComplaintRecord) || null
}

export async function addComplaintComment(
  complaintId: string,
  authorName: string,
  text: string
): Promise<ComplaintRecord | null> {
  const { data: existing, error: readErr } = await supabase
    .from('complaints')
    .select('*')
    .eq('id', complaintId)
    .single()
  if (readErr || !existing) {
    console.error('[omsData] addComplaintComment read error:', readErr?.message)
    return null
  }
  const comment: ComplaintCommentRecord = {
    id: generateId('comment'),
    authorName,
    text,
    createdAt: new Date().toISOString(),
  }
  const nextComments = [...(((existing as any).comments as ComplaintCommentRecord[]) || []), comment]
  const { data: updated, error: updErr } = await supabase
    .from('complaints')
    .update({ comments: nextComments, updatedAt: new Date().toISOString() } as any)
    .eq('id', complaintId)
    .select()
    .single()
  if (updErr) {
    console.error('[omsData] addComplaintComment update error:', updErr.message)
    return null
  }
  return (updated as ComplaintRecord) || null
}

export async function deleteComplaint(id: string) {
  await deleteById('complaints', id)
}

// ─── discount_codes ───────────────────────────────────────────────────────────

export interface DiscountCodeRecord {
  id: string
  code: string
  type: 'percent' | 'value'
  amount: number
  maxDiscount?: number | null
  minOrderTotal?: number | null
  isActive: boolean
  expiresAt?: string | null
  usageLimit?: number | null
  usedCount: number
  createdAt: string
  updatedAt: string
}

export async function readDiscountCodes(): Promise<DiscountCodeRecord[]> {
  return selectAll<DiscountCodeRecord>('discount_codes')
}

export async function writeDiscountCodes(data: DiscountCodeRecord[]) {
  // Reconcile: delete rows that disappeared from the array, then upsert the rest.
  const { data: existing } = await supabase.from('discount_codes').select('id')
  const incoming = new Set(data.map((d) => d.id))
  const toDelete = ((existing || []) as any[]).map((r) => r.id).filter((id) => !incoming.has(id))
  if (toDelete.length) await supabase.from('discount_codes').delete().in('id', toDelete)
  await upsertAll('discount_codes', data)
}

export async function evaluateDiscountCode(
  code: string,
  grossTotal: number
): Promise<{ ok: boolean; reason?: string; discount: number; code: DiscountCodeRecord | null }> {
  const trimmed = String(code || '').trim().toUpperCase()
  if (!trimmed) return { ok: false, reason: 'كود فارغ', discount: 0, code: null }

  const { data: found, error } = await supabase
    .from('discount_codes')
    .select('*')
    .eq('code', trimmed)
    .maybeSingle()
  if (error) console.error('[omsData] evaluateDiscountCode error:', error.message)
  if (!found) return { ok: false, reason: 'الكود غير موجود', discount: 0, code: null }
  const c = found as DiscountCodeRecord

  if (!c.isActive) return { ok: false, reason: 'الكود متوقف', discount: 0, code: c }

  if (c.expiresAt) {
    const expiry = new Date(c.expiresAt).getTime()
    if (Number.isFinite(expiry) && Date.now() > expiry) {
      return { ok: false, reason: 'الكود منتهي الصلاحية', discount: 0, code: c }
    }
  }

  if (c.usageLimit && c.usageLimit > 0 && c.usedCount >= c.usageLimit) {
    return { ok: false, reason: 'تم استنفاد الكود', discount: 0, code: c }
  }

  if (c.minOrderTotal && grossTotal < c.minOrderTotal) {
    return { ok: false, reason: `الحد الأدنى للطلب ${c.minOrderTotal.toLocaleString()} ج.م`, discount: 0, code: c }
  }

  let discount = 0
  if (c.type === 'percent') {
    discount = (grossTotal * Math.max(0, Math.min(100, c.amount))) / 100
    if (c.maxDiscount && c.maxDiscount > 0) discount = Math.min(discount, c.maxDiscount)
  } else {
    discount = Math.max(0, c.amount)
  }
  discount = Math.min(discount, grossTotal)

  return { ok: true, discount: Math.round(discount * 100) / 100, code: c }
}
