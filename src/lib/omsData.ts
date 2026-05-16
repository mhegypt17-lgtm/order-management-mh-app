import fs from 'fs'
import path from 'path'

const DATA_DIR = path.join(process.cwd(), 'data')
const CUSTOMERS_FILE = path.join(DATA_DIR, 'customers.json')
const ADDRESSES_FILE = path.join(DATA_DIR, 'customer_addresses.json')
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json')
const ORDER_ITEMS_FILE = path.join(DATA_DIR, 'order_items.json')
const ORDER_DELIVERY_FILE = path.join(DATA_DIR, 'order_delivery.json')
const EDIT_HISTORY_FILE = path.join(DATA_DIR, 'edit_history.json')
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json')
const DELIVERY_ZONES_FILE = path.join(DATA_DIR, 'delivery_zones.json')
const ADAHI_ORDERS_FILE = path.join(DATA_DIR, 'adahi_orders.json')
const ORDER_SETTINGS_FILE = path.join(DATA_DIR, 'order_settings.json')
const DAILY_BRIEFINGS_FILE = path.join(DATA_DIR, 'daily_briefings.json')
const COMPLAINTS_FILE = path.join(DATA_DIR, 'complaints.json')

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

function ensureFile(filePath: string) {
  ensureDataDir()
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, '[]')
  }
}

function readJsonFile<T>(filePath: string): T[] {
  ensureFile(filePath)
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeJsonFile<T>(filePath: string, data: T[]) {
  ensureFile(filePath)
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
}

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
  agentNotice: AgentNoticeRecord
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

export function toOrderTypeSlug(orderType: string) {
  return orderType.toLowerCase()
}

export function generateAppOrderNo(orderDate: string, orderType: string, orders: OrderRecord[]) {
  const dateKey = formatDateDDMMYY(orderDate)
  const typeSlug = toOrderTypeSlug(orderType)
  const countForDayType = orders.filter(
    (o) => formatDateDDMMYY(o.orderDate) === dateKey && o.orderType.toLowerCase() === typeSlug
  ).length

  return `${dateKey}${typeSlug}${countForDayType + 1}`
}

export function readCustomers() {
  return readJsonFile<CustomerRecord>(CUSTOMERS_FILE)
}

export function writeCustomers(data: CustomerRecord[]) {
  writeJsonFile<CustomerRecord>(CUSTOMERS_FILE, data)
}

export function readAddresses() {
  return readJsonFile<CustomerAddressRecord>(ADDRESSES_FILE)
}

export function writeAddresses(data: CustomerAddressRecord[]) {
  writeJsonFile<CustomerAddressRecord>(ADDRESSES_FILE, data)
}

export function readOrders() {
  return readJsonFile<OrderRecord>(ORDERS_FILE)
}

export function writeOrders(data: OrderRecord[]) {
  writeJsonFile<OrderRecord>(ORDERS_FILE, data)
}

export function readOrderItems() {
  return readJsonFile<OrderItemRecord>(ORDER_ITEMS_FILE)
}

export function writeOrderItems(data: OrderItemRecord[]) {
  writeJsonFile<OrderItemRecord>(ORDER_ITEMS_FILE, data)
}

export function readOrderDelivery() {
  return readJsonFile<OrderDeliveryRecord>(ORDER_DELIVERY_FILE)
}

export function writeOrderDelivery(data: OrderDeliveryRecord[]) {
  writeJsonFile<OrderDeliveryRecord>(ORDER_DELIVERY_FILE, data)
}

export function readEditHistory() {
  return readJsonFile<EditHistoryRecord>(EDIT_HISTORY_FILE)
}

export function writeEditHistory(data: EditHistoryRecord[]) {
  writeJsonFile<EditHistoryRecord>(EDIT_HISTORY_FILE, data)
}

export function appendEditHistory(record: Omit<EditHistoryRecord, 'id' | 'changedAt'>) {
  const rows = readEditHistory()
  rows.push({
    id: generateId('hist'),
    changedAt: new Date().toISOString(),
    ...record,
  })
  writeEditHistory(rows)
}

export function readTasks() {
  return readJsonFile<TaskRecord>(TASKS_FILE)
}

export function writeTasks(data: TaskRecord[]) {
  writeJsonFile<TaskRecord>(TASKS_FILE, data)
}

export function createTask(task: Omit<TaskRecord, 'id' | 'createdAt' | 'updatedAt'>) {
  const tasks = readTasks()
  const newTask: TaskRecord = {
    ...task,
    id: generateId('task'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  tasks.push(newTask)
  writeTasks(tasks)
  return newTask
}

export function updateTask(id: string, updates: Partial<Omit<TaskRecord, 'id' | 'createdAt'>>) {
  const tasks = readTasks()
  const index = tasks.findIndex(t => t.id === id)
  if (index !== -1) {
    tasks[index] = {
      ...tasks[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    }
    writeTasks(tasks)
    return tasks[index]
  }
  return null
}

export function deleteTask(id: string) {
  const tasks = readTasks()
  const filtered = tasks.filter(t => t.id !== id)
  writeTasks(filtered)
}

export function readDeliveryZones() {
  const rows = readJsonFile<DeliveryZoneRecord>(DELIVERY_ZONES_FILE)
  if (rows.length === 0) {
    const defaults = defaultDeliveryZones()
    writeJsonFile<DeliveryZoneRecord>(DELIVERY_ZONES_FILE, defaults)
    return defaults
  }

  const now = new Date().toISOString()
  const existingByZone = new Map(rows.map((r) => [Number(r.zone), r]))
  const normalized = Array.from({ length: 8 }, (_, idx) => {
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
        updatedAt: existing.updatedAt || now,
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

  writeJsonFile<DeliveryZoneRecord>(DELIVERY_ZONES_FILE, normalized)
  return normalized
}

export function writeDeliveryZones(data: DeliveryZoneRecord[]) {
  writeJsonFile<DeliveryZoneRecord>(DELIVERY_ZONES_FILE, data)
}

export function readAdahiOrders() {
  return readJsonFile<AdahiOrderRecord>(ADAHI_ORDERS_FILE)
}

export function writeAdahiOrders(data: AdahiOrderRecord[]) {
  writeJsonFile<AdahiOrderRecord>(ADAHI_ORDERS_FILE, data)
}

export function readOrderSettings(): OrderSettingsRecord {
  ensureDataDir()

  if (!fs.existsSync(ORDER_SETTINGS_FILE)) {
    const defaults = defaultOrderSettings()
    fs.writeFileSync(ORDER_SETTINGS_FILE, JSON.stringify(defaults, null, 2))
    return defaults
  }

  try {
    const raw = fs.readFileSync(ORDER_SETTINGS_FILE, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<OrderSettingsRecord>

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
    }

    if (normalized.orderReceivers.length === 0) normalized.orderReceivers = defaults.orderReceivers
    if (normalized.orderMethods.length === 0) normalized.orderMethods = defaults.orderMethods
    if (normalized.customerSources.length === 0) normalized.customerSources = defaults.customerSources
    if (normalized.orderTypes.length === 0) normalized.orderTypes = defaults.orderTypes
    if (normalized.paymentMethods.length === 0) normalized.paymentMethods = defaults.paymentMethods
    if (normalized.orderStatuses.length === 0) normalized.orderStatuses = defaults.orderStatuses
    if (normalized.complaintChannels.length === 0) normalized.complaintChannels = defaults.complaintChannels
    if (normalized.complaintReasons.length === 0) normalized.complaintReasons = defaults.complaintReasons

    fs.writeFileSync(ORDER_SETTINGS_FILE, JSON.stringify(normalized, null, 2))
    return normalized
  } catch {
    const defaults = defaultOrderSettings()
    fs.writeFileSync(ORDER_SETTINGS_FILE, JSON.stringify(defaults, null, 2))
    return defaults
  }
}

export function writeOrderSettings(data: OrderSettingsRecord) {
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
    agentNotice: {
      message: String(data.agentNotice?.message || '').trim(),
      type: (['info', 'promo', 'warning', 'success'].includes(data.agentNotice?.type)
        ? data.agentNotice.type
        : 'info') as AgentNoticeRecord['type'],
      isActive: Boolean(data.agentNotice?.isActive),
      updatedAt: new Date().toISOString(),
    },
  }

  ensureDataDir()
  fs.writeFileSync(ORDER_SETTINGS_FILE, JSON.stringify(normalized, null, 2))
}

export function readDailyBriefings() {
  const raw = readJsonFile<DailyBriefingRecord>(DAILY_BRIEFINGS_FILE)
  
  // Normalize to ensure all fields exist
  return raw.map((briefing) => ({
    ...briefing,
    priority: (['low', 'medium', 'high'].includes(briefing.priority)
      ? briefing.priority
      : 'medium') as DailyBriefingRecord['priority'],
    isCompleted: Boolean(briefing.isCompleted),
  }))
}

export function writeDailyBriefings(data: DailyBriefingRecord[]) {
  writeJsonFile<DailyBriefingRecord>(DAILY_BRIEFINGS_FILE, data)
}

export function createDailyBriefing(
  briefing: Omit<DailyBriefingRecord, 'id' | 'createdAt' | 'updatedAt'>
): DailyBriefingRecord {
  const briefings = readDailyBriefings()
  const newBriefing: DailyBriefingRecord = {
    ...briefing,
    id: generateId('brief'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  briefings.push(newBriefing)
  writeDailyBriefings(briefings)
  return newBriefing
}

export function updateDailyBriefing(
  id: string,
  updates: Partial<Omit<DailyBriefingRecord, 'id' | 'createdAt'>>
): DailyBriefingRecord | null {
  const briefings = readDailyBriefings()
  const index = briefings.findIndex((b) => b.id === id)
  if (index !== -1) {
    briefings[index] = {
      ...briefings[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    }
    writeDailyBriefings(briefings)
    return briefings[index]
  }
  return null
}

export function deleteDailyBriefing(id: string) {
  const briefings = readDailyBriefings()
  const filtered = briefings.filter((b) => b.id !== id)
  writeDailyBriefings(filtered)
}

function generateTicketNumber(): string {
  const now = new Date()
  const dateKey = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
  const complaints = readJsonFile<ComplaintRecord>(COMPLAINTS_FILE)
  const countForMonth = complaints.filter((c) => c.ticketNumber.startsWith(dateKey)).length
  return `${dateKey}-${String(countForMonth + 1).padStart(4, '0')}`
}

export function readComplaints() {
  return readJsonFile<ComplaintRecord>(COMPLAINTS_FILE)
}

export function writeComplaints(data: ComplaintRecord[]) {
  writeJsonFile<ComplaintRecord>(COMPLAINTS_FILE, data)
}

export function createComplaint(
  complaint: Omit<ComplaintRecord, 'id' | 'ticketNumber' | 'createdAt' | 'updatedAt' | 'comments'>
): ComplaintRecord {
  const complaints = readComplaints()
  const newComplaint: ComplaintRecord = {
    ...complaint,
    id: generateId('comp'),
    ticketNumber: generateTicketNumber(),
    comments: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  complaints.push(newComplaint)
  writeComplaints(complaints)
  return newComplaint
}

export function updateComplaint(
  id: string,
  updates: Partial<Omit<ComplaintRecord, 'id' | 'ticketNumber' | 'createdAt'>>
): ComplaintRecord | null {
  const complaints = readComplaints()
  const index = complaints.findIndex((c) => c.id === id)
  if (index !== -1) {
    complaints[index] = {
      ...complaints[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    }
    writeComplaints(complaints)
    return complaints[index]
  }
  return null
}

export function addComplaintComment(
  complaintId: string,
  authorName: string,
  text: string
): ComplaintRecord | null {
  const complaints = readComplaints()
  const index = complaints.findIndex((c) => c.id === complaintId)
  if (index !== -1) {
    const comment: ComplaintCommentRecord = {
      id: generateId('comment'),
      authorName,
      text,
      createdAt: new Date().toISOString(),
    }
    complaints[index].comments.push(comment)
    complaints[index].updatedAt = new Date().toISOString()
    writeComplaints(complaints)
    return complaints[index]
  }
  return null
}

export function deleteComplaint(id: string) {
  const complaints = readComplaints()
  const filtered = complaints.filter((c) => c.id !== id)
  writeComplaints(filtered)
}
