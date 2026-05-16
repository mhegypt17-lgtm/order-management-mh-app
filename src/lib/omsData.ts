import { supabase } from '@/lib/supabase'

export interface CustomerRecord {
  id: string
  phone: string
  customerName: string
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
  orderStatus: 'تم' | 'مؤجل' | 'لاغي' | 'حجز'
  cancellationReason: 'نفاد المنتج' | 'عدم توفر' | 'تأخير التوصيل' | 'سعر مرتفع' | 'موعد غير مناسب' | 'Other' | null
  paymentMethod: 'Instapay' | 'Cash' | 'Visa' | 'Credit'
  customerId: string
  deliveryAddressId: string
  notes: string
  followUp: boolean
  followUpNotes: string
  subtotal: number
  deliveryFee: number
  orderTotal: number
  createdBy: string
  createdAt: string
  updatedAt: string
  isScheduled?: boolean
  scheduledDate?: string | null
  scheduledTimeSlot?: string | null
  scheduledSpecificTime?: string | null
  isPriority?: boolean
  priorityReason?: string | null
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
  deliveryStatus: 'لم يخرج بعد' | 'جاهز' | 'في الطريق' | 'تم التوصيل'
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
  source?: string
  status: 'جديدة' | 'قيد الإنجاز' | 'مكتملة' | 'معلقة'
  priority: 'منخفضة' | 'متوسطة' | 'عالية'
  dueDate: string | null
  createdBy: string
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

export interface ProductRecord {
  id: string
  productName: string
  category: string
  unit: string
  unitPrice: number
  buyingPrice?: number
  imageUrl?: string
  barcode?: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface RetentionStageConfig {
  days: number
  action: 'off' | 'notify' | 'task'
  assignedTo: 'auto' | 'رنا' | 'مى' | 'ميرنا' | 'أمل'
}

export interface RetentionConfig {
  stage1: RetentionStageConfig
  stage2: RetentionStageConfig
  stage3: RetentionStageConfig
}

export const DEFAULT_RETENTION_CONFIG: RetentionConfig = {
  stage1: { days: 30, action: 'notify', assignedTo: 'auto' },
  stage2: { days: 60, action: 'task', assignedTo: 'auto' },
  stage3: { days: 90, action: 'task', assignedTo: 'auto' },
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
  slaHours: number
  agentNotice: AgentNoticeRecord
  retention?: RetentionConfig
}

const DEFAULT_ORDER_RECEIVERS = ['رنا', 'مى', 'ميرنا', 'أمل']
const DEFAULT_ORDER_METHODS = ['FB', 'Call', 'App', 'WhatsApp', 'B2B', 'W.S']
const DEFAULT_ORDER_TYPES = ['B2B', 'Online', 'Instashop', 'App']
const DEFAULT_PAYMENT_METHODS = ['Instapay', 'Cash', 'Visa', 'Credit']
const DEFAULT_ORDER_STATUSES = ['تم', 'مؤجل', 'لاغي', 'حجز']
const DEFAULT_COMPLAINT_CHANNELS = ['Instashop', 'App', 'Branch', 'Breadfast']
const DEFAULT_COMPLAINT_REASONS = ['تأخير التوصيل', 'جودة المنتج', 'اختلاف الطلب', 'سوء الخدمة', 'أخرى']
const DEFAULT_CUSTOMER_SOURCES = [
  'Facebook',
  'Instashop',
  'Google',
  'Breadfast',
  'Friend',
  'Branch',
  'Family',
  'Instagram',
  'Play Store',
  'Ad',
  'GoodsMart',
  'Other',
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
    agentNotice: {
      message: '',
      type: 'info',
      isActive: false,
      updatedAt: new Date().toISOString(),
    },
    retention: DEFAULT_RETENTION_CONFIG,
  }
}

export function normalizeLookupRows(rows: unknown): LookupValueRecord[] {
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

function defaultDeliveryZones(): DeliveryZoneRecord[] {
  const now = new Date().toISOString()
  return Array.from({ length: 8 }, (_, idx) => ({
    id: generateId('zone'),
    zone: idx + 1,
    area: `منطقة ${idx + 1}`,
    averageDistanceKm: 0,
    deliveryCost: 0,
    customerDeliveryFee: 0,
    freeDeliveryValue: 0,
    createdAt: now,
    updatedAt: now,
  }))
}

export function generateId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
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

export function toOrderTypeSlug(orderType: string) {
  return orderType.toLowerCase()
}

export async function generateAppOrderNo(orderDate: string, orderType: string, orders: OrderRecord[]) {
  const dateKey = formatDateDDMMYY(orderDate)
  const typeSlug = toOrderTypeSlug(orderType)
  const countForDayType = orders.filter(
    (o) => formatDateDDMMYY(o.orderDate) === dateKey && o.orderType.toLowerCase() === typeSlug
  ).length
  return `${dateKey}${typeSlug}${countForDayType + 1}`
}

// ─── Customers ────────────────────────────────────────────────────────────────

export async function readCustomers(): Promise<CustomerRecord[]> {
  const { data, error } = await supabase.from('customers').select('*')
  if (error) {
    console.error('Error reading customers:', error)
    return []
  }
  return data || []
}

export async function writeCustomers(_data: CustomerRecord[]): Promise<void> {
  // No-op: writes handled directly in API routes
}

// ─── Addresses ────────────────────────────────────────────────────────────────

export async function readAddresses(): Promise<CustomerAddressRecord[]> {
  const { data, error } = await supabase.from('customer_addresses').select('*')
  if (error) {
    console.error('Error reading addresses:', error)
    return []
  }
  return data || []
}

export async function writeAddresses(_data: CustomerAddressRecord[]): Promise<void> {
  // No-op: writes handled directly in API routes
}

// ─── Orders ───────────────────────────────────────────────────────────────────

export async function readOrders(): Promise<OrderRecord[]> {
  const { data, error } = await supabase.from('orders').select('*')
  if (error) {
    console.error('Error reading orders:', error)
    return []
  }
  return data || []
}

export async function writeOrders(_data: OrderRecord[]): Promise<void> {
  // No-op: writes handled directly in API routes
}

// ─── Order Items ──────────────────────────────────────────────────────────────

export async function readOrderItems(): Promise<OrderItemRecord[]> {
  const { data, error } = await supabase.from('order_items').select('*')
  if (error) {
    console.error('Error reading order items:', error)
    return []
  }
  return data || []
}

export async function writeOrderItems(_data: OrderItemRecord[]): Promise<void> {
  // No-op: writes handled directly in API routes
}

// ─── Order Delivery ───────────────────────────────────────────────────────────

export async function readOrderDelivery(): Promise<OrderDeliveryRecord[]> {
  const { data, error } = await supabase.from('order_delivery').select('*')
  if (error) {
    console.error('Error reading order delivery:', error)
    return []
  }
  return data || []
}

export async function writeOrderDelivery(_data: OrderDeliveryRecord[]): Promise<void> {
  // No-op: writes handled directly in API routes
}

// ─── Edit History ─────────────────────────────────────────────────────────────

export async function readEditHistory(): Promise<EditHistoryRecord[]> {
  const { data, error } = await supabase.from('edit_history').select('*')
  if (error) {
    console.error('Error reading edit history:', error)
    return []
  }
  return data || []
}

export async function writeEditHistory(_data: EditHistoryRecord[]): Promise<void> {
  // No-op: writes handled directly in API routes
}

export async function appendEditHistory(record: Omit<EditHistoryRecord, 'id' | 'changedAt'>): Promise<void> {
  const newRecord = {
    id: generateId('hist'),
    changedAt: new Date().toISOString(),
    ...record,
  }
  const { error } = await supabase.from('edit_history').insert([newRecord])
  if (error) {
    console.error('Error appending edit history:', error)
  }
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

export async function readTasks(): Promise<TaskRecord[]> {
  const { data, error } = await supabase.from('tasks').select('*')
  if (error) {
    console.error('Error reading tasks:', error)
    return []
  }
  return data || []
}

export async function writeTasks(_data: TaskRecord[]): Promise<void> {
  // No-op: writes handled directly in API routes
}

export async function createTask(task: Omit<TaskRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<TaskRecord> {
  const newTask: TaskRecord = {
    ...task,
    id: generateId('task'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  const { error } = await supabase.from('tasks').insert([newTask])
  if (error) {
    console.error('Error creating task:', error)
  }
  return newTask
}

export async function updateTask(id: string, updates: Partial<Omit<TaskRecord, 'id' | 'createdAt'>>): Promise<TaskRecord | null> {
  const updated = {
    ...updates,
    updatedAt: new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('tasks')
    .update(updated)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error updating task:', error)
    return null
  }
  return data || null
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) {
    console.error('Error deleting task:', error)
  }
}

// ─── Delivery Zones ───────────────────────────────────────────────────────────

export async function readDeliveryZones(): Promise<DeliveryZoneRecord[]> {
  const { data, error } = await supabase.from('delivery_zones').select('*').order('zone', { ascending: true })
  if (error) {
    console.error('Error reading delivery zones:', error)
    return defaultDeliveryZones()
  }

  if (!data || data.length === 0) {
    return defaultDeliveryZones()
  }

  const now = new Date().toISOString()
  const existingByZone = new Map((data as DeliveryZoneRecord[]).map((r) => [Number(r.zone), r]))
  return Array.from({ length: 8 }, (_, idx) => {
    const zone = idx + 1
    const existing = existingByZone.get(zone)
    if (existing) {
      return {
        ...existing,
        zone,
        averageDistanceKm: Number(existing.averageDistanceKm) || 0,
        deliveryCost: Number(existing.deliveryCost) || 0,
        customerDeliveryFee: Number(existing.customerDeliveryFee) || 0,
        freeDeliveryValue: Number(existing.freeDeliveryValue) || 0,
      }
    }
    return {
      id: generateId('zone'),
      zone,
      area: `منطقة ${zone}`,
      averageDistanceKm: 0,
      deliveryCost: 0,
      customerDeliveryFee: 0,
      freeDeliveryValue: 0,
      createdAt: now,
      updatedAt: now,
    }
  })
}

export async function writeDeliveryZones(_data: DeliveryZoneRecord[]): Promise<void> {
  // No-op: writes handled directly in API routes
}

// ─── Adahi Orders ─────────────────────────────────────────────────────────────

export async function readAdahiOrders(): Promise<AdahiOrderRecord[]> {
  const { data, error } = await supabase.from('adahi_orders').select('*')
  if (error) {
    console.error('Error reading adahi orders:', error)
    return []
  }
  return data || []
}

export async function writeAdahiOrders(_data: AdahiOrderRecord[]): Promise<void> {
  // No-op: writes handled directly in API routes
}

// ─── Products ─────────────────────────────────────────────────────────────────

export async function readProducts(): Promise<ProductRecord[]> {
  const { data, error } = await supabase.from('products').select('*')
  if (error) {
    console.error('Error reading products:', error)
    return []
  }
  return data || []
}

export async function writeProducts(_data: ProductRecord[]): Promise<void> {
  // No-op: writes handled directly in API routes
}

// ─── Order Settings ───────────────────────────────────────────────────────────

export async function readOrderSettings(): Promise<OrderSettingsRecord> {
  const { data, error } = await supabase
    .from('order_settings')
    .select('*')
    .eq('id', 'singleton')
    .single()

  if (error || !data) {
    console.warn('Error reading order settings, using defaults:', error)
    return defaultOrderSettings()
  }

  try {
    const parsed = data as Partial<OrderSettingsRecord>
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
      agentNotice: {
        message: String((parsed.agentNotice as any)?.message || '').trim(),
        type: (['info', 'promo', 'warning', 'success'].includes((parsed.agentNotice as any)?.type)
          ? (parsed.agentNotice as any).type
          : 'info') as AgentNoticeRecord['type'],
        isActive: Boolean((parsed.agentNotice as any)?.isActive),
        updatedAt: (parsed.agentNotice as any)?.updatedAt || new Date().toISOString(),
      },
      retention: (parsed as any).retention || DEFAULT_RETENTION_CONFIG,
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
  } catch (err) {
    console.error('Error normalizing order settings:', err)
    return defaultOrderSettings()
  }
}

export async function writeOrderSettings(_data: OrderSettingsRecord): Promise<void> {
  // No-op: writes handled directly in API routes
}

// ─── Daily Briefings ──────────────────────────────────────────────────────────

export async function readDailyBriefings(): Promise<DailyBriefingRecord[]> {
  const { data, error } = await supabase.from('daily_briefings').select('*')
  if (error) {
    console.error('Error reading daily briefings:', error)
    return []
  }

  return (data || []).map((briefing) => ({
    ...briefing,
    priority: (['low', 'medium', 'high'].includes(briefing.priority)
      ? briefing.priority
      : 'medium') as DailyBriefingRecord['priority'],
    isCompleted: Boolean(briefing.isCompleted),
  }))
}

export async function writeDailyBriefings(_data: DailyBriefingRecord[]): Promise<void> {
  // No-op: writes handled directly in API routes
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
  const { error } = await supabase.from('daily_briefings').insert([newBriefing])
  if (error) {
    console.error('Error creating daily briefing:', error)
  }
  return newBriefing
}

export async function updateDailyBriefing(
  id: string,
  updates: Partial<Omit<DailyBriefingRecord, 'id' | 'createdAt'>>
): Promise<DailyBriefingRecord | null> {
  const updated = { ...updates, updatedAt: new Date().toISOString() }
  const { data, error } = await supabase
    .from('daily_briefings')
    .update(updated)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error updating daily briefing:', error)
    return null
  }
  return data || null
}

export async function deleteDailyBriefing(id: string): Promise<void> {
  const { error } = await supabase.from('daily_briefings').delete().eq('id', id)
  if (error) {
    console.error('Error deleting daily briefing:', error)
  }
}

// ─── Complaints ───────────────────────────────────────────────────────────────

async function generateTicketNumber(): Promise<string> {
  const now = new Date()
  const dateKey = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
  const { data: complaints } = await supabase
    .from('complaints')
    .select('ticketNumber')
    .like('ticketNumber', `${dateKey}%`)
  const countForMonth = (complaints || []).length
  return `${dateKey}-${String(countForMonth + 1).padStart(4, '0')}`
}

export async function readComplaints(): Promise<ComplaintRecord[]> {
  const { data, error } = await supabase.from('complaints').select('*')
  if (error) {
    console.error('Error reading complaints:', error)
    return []
  }
  return data || []
}

export async function writeComplaints(_data: ComplaintRecord[]): Promise<void> {
  // No-op: writes handled directly in API routes
}

export async function createComplaint(
  complaint: Omit<ComplaintRecord, 'id' | 'ticketNumber' | 'createdAt' | 'updatedAt' | 'comments'>
): Promise<ComplaintRecord> {
  const ticketNumber = await generateTicketNumber()
  const newComplaint: ComplaintRecord = {
    ...complaint,
    id: generateId('comp'),
    ticketNumber,
    comments: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  const { error } = await supabase.from('complaints').insert([newComplaint])
  if (error) {
    console.error('Error creating complaint:', error)
  }
  return newComplaint
}

export async function updateComplaint(
  id: string,
  updates: Partial<Omit<ComplaintRecord, 'id' | 'ticketNumber' | 'createdAt'>>
): Promise<ComplaintRecord | null> {
  const updated = { ...updates, updatedAt: new Date().toISOString() }
  const { data, error } = await supabase
    .from('complaints')
    .update(updated)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error updating complaint:', error)
    return null
  }
  return data || null
}

export async function addComplaintComment(
  complaintId: string,
  authorName: string,
  text: string
): Promise<ComplaintRecord | null> {
  const comment: ComplaintCommentRecord = {
    id: generateId('comment'),
    authorName,
    text,
    createdAt: new Date().toISOString(),
  }

  const { data: existing, error: fetchError } = await supabase
    .from('complaints')
    .select('comments')
    .eq('id', complaintId)
    .single()

  if (fetchError) {
    console.error('Error fetching complaint for comment:', fetchError)
    return null
  }

  const updatedComments = [...((existing?.comments as ComplaintCommentRecord[]) || []), comment]
  const { data, error } = await supabase
    .from('complaints')
    .update({ comments: updatedComments, updatedAt: new Date().toISOString() })
    .eq('id', complaintId)
    .select()
    .single()

  if (error) {
    console.error('Error adding complaint comment:', error)
    return null
  }
  return data || null
}

export async function deleteComplaint(id: string): Promise<void> {
  const { error } = await supabase.from('complaints').delete().eq('id', id)
  if (error) {
    console.error('Error deleting complaint:', error)
  }
}

// ─── Loyalty helpers ──────────────────────────────────────────────────────────

export const DEFAULT_LOYALTY_CONFIG = {
  tiers: [
    { name: 'Bronze', minOrders: 0, discount: 0 },
    { name: 'Silver', minOrders: 5, discount: 0.05 },
    { name: 'Gold', minOrders: 10, discount: 0.1 },
    { name: 'Platinum', minOrders: 20, discount: 0.15 },
  ],
}

export function resolveCustomerTier(orderCount: number): string {
  for (let i = DEFAULT_LOYALTY_CONFIG.tiers.length - 1; i >= 0; i--) {
    if (orderCount >= DEFAULT_LOYALTY_CONFIG.tiers[i].minOrders) {
      return DEFAULT_LOYALTY_CONFIG.tiers[i].name
    }
  }
  return 'Bronze'
}
