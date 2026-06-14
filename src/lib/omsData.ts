import { supabase } from '@/lib/supabase'

export interface CustomerRecord {
  id: string
  phone: string
  customerName: string
  email?: string
  notes?: string
  wallet?: number
  createdAt: string
  updatedAt: string
  status?: 'active' | 'warning' | 'suspended'
  statusReason?: string | null
  statusUpdatedAt?: string | null
  statusUpdatedBy?: string | null
}

export interface CustomerAddressRecord {
  id: string
  customerId: string
  addressLabel: string
  area?: string
  subArea?: string
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
  /**
   * Voucher / discount-code applied at save time. `discountCode` is the
   * uppercase code, `discountAmount` is the validated EGP discount (≥ 0),
   * and `netTotal` is `orderTotal - discountAmount` — the amount the
   * branch collects from the customer.
   */
  discountCode?: string | null
  discountAmount?: number | null
  netTotal?: number | null
  /**
   * Optional CS-side attachments (proof of payment screenshots, ID copies,
   * bank-transfer receipts, etc.). Each entry is a base64 data URL with a
   * short caption, captured by the CS agent on the order form.
   * Persisted as a JSONB column on `orders` — falls back gracefully when
   * the column is absent so deployments without the migration still work.
   */
  csAttachments?: CSAttachment[] | null
}

export interface CSAttachment {
  id: string
  url: string          // data URL (base64) or hosted URL
  caption: string      // freeform short label, e.g. "إيصال تحويل بنكي"
  uploadedBy: string   // user.name at upload time
  uploadedAt: string   // ISO timestamp
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
  /**
   * Snapshot of the CS-entered quantity, captured the first time the branch
   * amends it. `null` means quantity has never been changed by the branch.
   */
  originalQuantity?: number | null
  /**
   * Snapshot of the CS-entered weight (grams), captured the first time the
   * branch amends the weighed value on a weight-mode line. `null` means
   * weight has never been changed by the branch.
   */
  originalWeightGrams?: number | null
}

export interface OrderDeliveryRecord {
  id: string
  orderId: string
  deliveryStatus: 'لم يخرج بعد' | 'جاهز' | 'في الطريق' | 'تم التوصيل'
  branchComments: string
  productPhotos: string[]
  invoicePhoto: string
  deliveredAt: string | null
  /**
   * Stage-transition timestamps (UTC ISO). All optional so deployments
   * that haven't run `data/delivery-timing-migration.sql` still work.
   * Each is set the FIRST time the order reaches that stage and is never
   * overwritten, so we can compute average time-in-stage cleanly.
   */
  acceptedAt?: string | null      // first move off "لم يخرج بعد"
  readyAt?: string | null         // first time at "جاهز"
  outForDeliveryAt?: string | null // first time at "في الطريق"
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
  subArea: string
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
  subArea?: string
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
  productIds: string[]
  comments: ComplaintCommentRecord[]
  openedAt: string
  closedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ProductRecord {
  id: string
  productName: string
  category?: string
  productCategory?: string
  unit?: string
  unitPrice: number
  offerPrice?: number
  basePrice?: number
  buyingPrice?: number
  imageUrl?: string
  barcode?: string
  packagingType?: string
  isActive: boolean
  isTargeted?: boolean
  /**
   * 'unit' (default) = sold per piece at fixed price (`basePrice`).
   * 'weight' = sold per kilogram; `basePrice` is interpreted as price per kg
   * and the line total is computed from the actual weighed amount.
   */
  pricingMode?: 'unit' | 'weight'
  createdAt: string
  updatedAt: string
}

// Preferred display order for product categories.
// This is the SINGLE SOURCE OF TRUTH — the admin products dropdown
// imports from here, sorting uses categoryRank() below, and any future
// "manage categories" settings UI should read/write this list.
// To add a new category in the future, append (or insert) an entry here.
export const PRODUCT_CATEGORY_ORDER: string[] = [
  'لحم فريش',
  'لحوم لذيذة',
  'لحم فريش متبل على التسوية',
  'لحم ضاني',
  'قطعيات بلاد مختلفة',
  'دواجن فريش',
  'دواجن لذيذة',
  'دواجن فريش متبلة على التسوية',
  'مقبلات وأصناف جانبية',
  'وجبات للحيوانات الأليفة',
  'عسل',
  'بيض',
  'اخشاب شوي',
  'البقالة',
  'خضروات مجمدة',
]

const normalizeCategory = (c: string) => (c || '').replace(/\s+/g, ' ').trim()

export const categoryRank = (category?: string): number => {
  const c = normalizeCategory(category || '')
  if (!c) return Number.MAX_SAFE_INTEGER
  const idx = PRODUCT_CATEGORY_ORDER.findIndex((x) => normalizeCategory(x) === c)
  return idx === -1 ? Number.MAX_SAFE_INTEGER - 1 : idx
}

export const compareCategories = (a?: string, b?: string): number => {
  const ra = categoryRank(a)
  const rb = categoryRank(b)
  if (ra !== rb) return ra - rb
  // Same rank (both unknown or both empty) → fall back to alphabetical (Arabic locale)
  return normalizeCategory(a || '').localeCompare(normalizeCategory(b || ''), 'ar')
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

export interface LoyaltyTierConfig {
  name: string
  threshold: number
  icon?: string
  color?: string
}

export interface LoyaltyConfig {
  mode: 'orders' | 'revenue'
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
  monthlyTargetedUnitsGoal: number
  slaHours: number
  agentNotice: AgentNoticeRecord
  retention?: RetentionConfig
  loyalty?: LoyaltyConfig
  autoActivateThreshold?: number
  autoActivateEnabled?: boolean
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
    monthlyTargetedUnitsGoal: 0,
    slaHours: 4,
    agentNotice: {
      message: '',
      type: 'info',
      isActive: false,
      updatedAt: new Date().toISOString(),
    },
    retention: DEFAULT_RETENTION_CONFIG,
    autoActivateThreshold: 3,
    autoActivateEnabled: true,
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
  // Empty by default — admin seeds the table via CSV import or the admin UI.
  return []
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

// Paginate through a Supabase table to bypass the per-request row cap
// (commonly 1000) so growing tables don't silently drop rows from
// enrichment lookups and joins.
async function fetchAllRows<T = any>(
  table: string,
  orderBy?: { column: string; ascending: boolean },
): Promise<T[]> {
  const pageSize = 1000
  const all: T[] = []
  let from = 0
  while (true) {
    let q = supabase.from(table).select('*').range(from, from + pageSize - 1)
    if (orderBy) q = q.order(orderBy.column, { ascending: orderBy.ascending })
    const { data, error } = await q
    if (error) {
      console.error(`Error reading ${table}:`, error)
      return all
    }
    if (!data || data.length === 0) break
    all.push(...(data as T[]))
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

export async function readCustomers(): Promise<CustomerRecord[]> {
  return fetchAllRows<CustomerRecord>('customers')
}

export async function writeCustomers(_data: CustomerRecord[]): Promise<void> {
  // No-op: writes handled directly in API routes
}

// ─── Addresses ────────────────────────────────────────────────────────────────

export async function readAddresses(): Promise<CustomerAddressRecord[]> {
  return fetchAllRows<CustomerAddressRecord>('customer_addresses')
}

export async function writeAddresses(_data: CustomerAddressRecord[]): Promise<void> {
  // No-op: writes handled directly in API routes
}

// ─── Orders ───────────────────────────────────────────────────────────────────

export async function readOrders(): Promise<OrderRecord[]> {
  return fetchAllRows<OrderRecord>('orders', { column: 'createdAt', ascending: false })
}

export async function writeOrders(_data: OrderRecord[]): Promise<void> {
  // No-op: writes handled directly in API routes
}

// ─── Order Items ──────────────────────────────────────────────────────────────

export async function readOrderItems(): Promise<OrderItemRecord[]> {
  return fetchAllRows<OrderItemRecord>('order_items')
}

export async function writeOrderItems(_data: OrderItemRecord[]): Promise<void> {
  // No-op: writes handled directly in API routes
}

// ─── Order Delivery ───────────────────────────────────────────────────────────

export async function readOrderDelivery(): Promise<OrderDeliveryRecord[]> {
  return fetchAllRows<OrderDeliveryRecord>('order_delivery')
}

export async function writeOrderDelivery(_data: OrderDeliveryRecord[]): Promise<void> {
  // No-op: writes handled directly in API routes
}

// ─── Order Feedback ──────────────────────────────────────────────────────────
// One row per order (enforced by unique constraint on orderId). Captures
// the customer's post-delivery satisfaction rating + free-text comment as
// collected by a CS agent. Editable for 30 days; auto-creates a complaint
// when rating <= 2 OR when any of the detailed dimensions hits its
// negative bucket (see FEEDBACK_DIMENSIONS in lib/feedbackDimensions.ts).
export interface OrderFeedbackRecord {
  id: string
  orderId: string
  customerId: string | null
  rating: number // 1..5 (overall, required)
  comment: string
  collectedBy: string
  collectedAt: string
  contactChannel: 'phone' | 'whatsapp' | 'in-person' | 'other' | null
  followUpRequired: boolean
  escalatedComplaintId: string | null
  // ─── Detailed dimensions (all optional) ──────────────────────────────────
  productQuality: string | null         // جودة عالية جداً | جودة عالية | جودة منخفضة | جودة منخفضة جداً
  packaging: string | null              // ممتاز | جيد جداً | جيد | غير مقبول | أخرى
  packagingOther: string | null         // free text when packaging === 'أخرى'
  deliveryTimeliness: string | null     // مبكراً | في الوقت المحدد | متأخر | متأخر جداً
  customerService: string | null        // ممتاز | جيد جداً | جيد | ضعيف | أخرى
  customerServiceOther: string | null   // free text when customerService === 'أخرى'
  pricingValue: string | null           // ممتاز | جيد جداً | جيد | ضعيف
  appUsability: string | null           // سهل الاستخدام | ليس سهلاً ولا صعباً | صعب الاستخدام
  recommendToFriends: string | null     // نعم | لا
  createdAt: string
  updatedAt: string
}

export async function readOrderFeedback(): Promise<OrderFeedbackRecord[]> {
  return fetchAllRows<OrderFeedbackRecord>('order_feedback', {
    column: 'collectedAt',
    ascending: false,
  })
}

// ─── Edit History ─────────────────────────────────────────────────────────────

export async function readEditHistory(): Promise<EditHistoryRecord[]> {
  const { data, error } = await supabase
    .from('edit_history')
    .select('*')
    .range(0, 99999)
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
  // Returns every row (zone, area, subArea). No longer forces 8 fixed zones.
  const { data, error } = await supabase
    .from('delivery_zones')
    .select('*')
    .order('zone', { ascending: true })
    .order('averageDistanceKm', { ascending: true })
    .range(0, 99999)
  if (error) {
    console.error('Error reading delivery zones:', error)
    return defaultDeliveryZones()
  }

  if (!data || data.length === 0) {
    return defaultDeliveryZones()
  }

  return (data as DeliveryZoneRecord[]).map((r) => ({
    ...r,
    zone: Number(r.zone) || 0,
    area: String(r.area || '').trim(),
    subArea: String((r as any).subArea || '').trim(),
    averageDistanceKm: Number(r.averageDistanceKm) || 0,
    deliveryCost: Number(r.deliveryCost) || 0,
    customerDeliveryFee: Number(r.customerDeliveryFee) || 0,
    freeDeliveryValue: Number(r.freeDeliveryValue) || 0,
  }))
}

export async function writeDeliveryZones(_data: DeliveryZoneRecord[]): Promise<void> {
  // No-op: writes handled directly in API routes
}

// Match a delivery zone by area + (optional) subArea. Used by every API route
// that computes delivery fee — single source of truth so the fee always lines
// up with what the admin sees in the Delivery Zones table.
//   - Exact (area + subArea) match wins.
//   - If no subArea given (or no exact row), fall back to the first row for the
//     area (so old orders without subArea still resolve to a fee).
//   - If area itself isn't found, fall back to the legacy default
//     (subtotal > 1800 ? 0 : 95) for backwards compatibility.
export async function computeDeliveryFee(
  subtotal: number,
  area?: string,
  subArea?: string
): Promise<number> {
  const a = String(area || '').trim()
  const sa = String(subArea || '').trim()

  const zones = await readDeliveryZones()
  const areaMatches = zones.filter((z) => String(z.area || '').trim() === a)
  if (areaMatches.length === 0) {
    return subtotal > 1800 ? 0 : 95
  }

  const matchedZone =
    (sa && areaMatches.find((z) => String(z.subArea || '').trim() === sa)) ||
    areaMatches[0]

  const freeThreshold = Number(matchedZone.freeDeliveryValue) || 0
  const customerFee = Number(matchedZone.customerDeliveryFee) || 0
  if (freeThreshold > 0 && subtotal >= freeThreshold) return 0
  return customerFee
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
      monthlyTargetedUnitsGoal: Math.max(
        0,
        Number(
          (parsed as any).monthlyTargetedUnitsGoal ??
            (parsed as any).retention?.monthlyTargetedUnitsGoal ??
            (parsed as any).agentNotice?.monthlyTargetedUnitsGoal,
        ) || 0,
      ),
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
      autoActivateThreshold: Math.max(1, Number((parsed as any).autoActivateThreshold) || 3),
      autoActivateEnabled: (parsed as any).autoActivateEnabled !== false,
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

export const DEFAULT_LOYALTY_CONFIG: LoyaltyConfig = {
  mode: 'orders',
  tiers: [
    { name: 'Bronze', threshold: 0, icon: '🥉', color: '#cd7f32' },
    { name: 'Silver', threshold: 5, icon: '🥈', color: '#a8a9ad' },
    { name: 'Gold', threshold: 10, icon: '🥇', color: '#ffd700' },
    { name: 'Platinum', threshold: 20, icon: '💎', color: '#e5e4e2' },
  ],
}

export function resolveCustomerTier(
  loyalty: LoyaltyConfig,
  stats: { completedOrderCount: number; totalRevenue: number }
): LoyaltyTierConfig {
  const value = loyalty.mode === 'revenue' ? stats.totalRevenue : stats.completedOrderCount
  const sorted = [...loyalty.tiers].sort((a, b) => b.threshold - a.threshold)
  const match = sorted.find((t) => value >= t.threshold)
  return match || sorted[sorted.length - 1] || { name: 'Bronze', threshold: 0, icon: '🥉', color: '#cd7f32' }
}

// ─── Discount Codes ───────────────────────────────────────────────────────────

export interface DiscountCodeRecord {
  id: string
  code: string
  type: 'percent' | 'value'
  amount: number
  maxDiscount: number | null
  minOrderTotal: number | null
  isActive: boolean
  expiresAt: string | null
  usageLimit: number | null
  usedCount: number
  createdAt: string
  updatedAt: string
}

export async function readDiscountCodes(): Promise<DiscountCodeRecord[]> {
  const { data, error } = await supabase.from('discount_codes').select('*')
  if (error) {
    console.error('Error reading discount codes:', error)
    return []
  }
  return data || []
}

export async function writeDiscountCodes(_data: DiscountCodeRecord[]): Promise<void> {
  // No-op: writes handled directly in API routes
}

export async function evaluateDiscountCode(
  code: string,
  grossTotal: number
): Promise<{ ok: boolean; reason?: string; discount: number; code?: DiscountCodeRecord }> {
  if (!code) return { ok: false, reason: 'الكود مطلوب', discount: 0 }

  const { data } = await supabase
    .from('discount_codes')
    .select('*')
    .ilike('code', code)
    .limit(1)

  const match = (data || [])[0] as DiscountCodeRecord | undefined
  if (!match) return { ok: false, reason: 'الكود غير موجود', discount: 0 }
  if (!match.isActive) return { ok: false, reason: 'الكود غير نشط', discount: 0 }
  if (match.expiresAt && new Date(match.expiresAt) < new Date())
    return { ok: false, reason: 'الكود منتهي الصلاحية', discount: 0 }
  if (match.usageLimit != null && match.usedCount >= match.usageLimit)
    return { ok: false, reason: 'تم الوصول للحد الأقصى من الاستخدام', discount: 0 }
  if (match.minOrderTotal != null && grossTotal < match.minOrderTotal)
    return { ok: false, reason: `الحد الأدنى للطلب ${match.minOrderTotal} جنيه`, discount: 0 }

  let discount =
    match.type === 'percent' ? (grossTotal * match.amount) / 100 : match.amount
  if (match.maxDiscount != null) discount = Math.min(discount, match.maxDiscount)
  discount = Math.min(discount, grossTotal)

  return { ok: true, discount: parseFloat(discount.toFixed(2)), code: match }
}
