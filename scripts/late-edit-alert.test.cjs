const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const ts = require('typescript')

const ROOT = process.env.TEST_ROOT || path.join(__dirname, '..')
function load(file, mocks) {
  const filename = path.join(ROOT, ...file.split('/'))
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const module = { exports: {} }
  vm.runInNewContext(code, {
    module, exports: module.exports, URL, Promise, Object, Array, JSON, Math, Number, String, Map, Set, Date, Error, RegExp, isFinite,
    console: { ...console, error() {}, warn() {} },
    require(name) {
      if (!(name in mocks)) throw new Error(`Unexpected dependency: ${name}`)
      return mocks[name]
    },
  }, { filename })
  return module.exports
}
const plain = (v) => JSON.parse(JSON.stringify(v))
const catalogue = load('src/lib/catalogue.ts', {})
const b2bLineRate = load('src/lib/b2bLineRate.ts', {})
const paged = load('src/lib/pagedRead.ts', {})
const late = load('src/lib/lateEdit.ts', {})

// ───────────────────────── helpers ─────────────────────────
const snap = (quantity, weightGrams, unitPrice) => ({ quantity, weightGrams, unitPrice })
const pair = (name, prior, next, isWeightMode = false, itemId = 'i1') => ({ itemId, productName: name, isWeightMode, prior, next })

test('Which statuses count as "late": ready and out for delivery only', () => {
  assert.equal(late.isLateEditStatus('جاهز'), true)
  assert.equal(late.isLateEditStatus('في الطريق'), true)
  assert.equal(late.isLateEditStatus('لم يخرج بعد'), false)
  assert.equal(late.isLateEditStatus(null), false)
})

test('Incident 131126online1: a quantity raised from 1 to 2 is reported with its wording', () => {
  const changes = plain(late.diffOrderLines([pair('لحم مفروم أحمر بدون دسم', snap(1, 0.5, 295), snap(2, 0.5, 295))], []))
  assert.equal(changes.length, 1)
  assert.deepEqual(changes[0].qtyChange, { from: 1, to: 2 })
  assert.equal(late.describeLateEdit(changes), 'لحم مفروم أحمر بدون دسم: الكمية 1 → 2')
})

test('Weight, price, added and removed lines are reported; untouched lines are not', () => {
  const changes = plain(late.diffOrderLines([
    pair('Same', snap(1, 1000, 100), snap(1, 1000, 100), true, 'a'),
    pair('Weighed', snap(1, 1000, 300), snap(1, 1500, 450), true, 'b'),
    pair('Repriced', snap(1, 0.5, 100), snap(1, 0.5, 120), false, 'c'),
    pair('New line', null, snap(2, 0.5, 50), false, null),
  ], [{ itemId: 'd', productName: 'Gone', prior: snap(1, 0.5, 80) }]))
  assert.deepEqual(changes.map((c) => c.productName), ['Weighed', 'Repriced', 'New line', 'Gone'])
  assert.deepEqual(changes[0].weightChange, { fromGrams: 1000, toGrams: 1500, newUnitPrice: 450 })
  assert.deepEqual(changes[1].priceChange, { from: 100, to: 120 })
  assert.equal(changes[2].added, true)
  assert.equal(changes[3].removed, true)
})

test('A unit-priced line is not reported for its fixed standard weight changing, and rounding noise is ignored', () => {
  assert.deepEqual(plain(late.diffOrderLines([pair('U', snap(1, 0.5, 100), snap(1, 500, 100), false)], [])), [])
  assert.deepEqual(plain(late.diffOrderLines([pair('P', snap(1, 1000, 100.001), snap(1, 1000, 100), true)], [])), [])
})

test('describeLateEdit shortens long lists', () => {
  const many = Array.from({ length: 5 }, (_, i) => ({ itemId: `${i}`, productName: `P${i}`, qtyChange: { from: 1, to: 2 } }))
  assert.ok(late.describeLateEdit(many).endsWith('+2 أخرى'))
})

// ───────────────────────── CS save records the late edit ─────────────────────────
const PRODUCTS = [
  { id: 'p1', productName: 'Weighed meat', pricingMode: 'weight', basePrice: 300, offerPrice: null },
  { id: 'p2', productName: 'Mince', pricingMode: 'unit', basePrice: 295, offerPrice: null },
]

function csHarness(existingItems, deliveryStatus) {
  const history = []
  const deliveryReads = []
  const order = {
    id: 'order', appOrderNo: '131126online1', customerId: 'c1', orderType: 'Online', orderStatus: 'تم',
    paymentMethod: 'Cash', notes: '', discountCode: null, discountAmount: 0, walletUsed: 0,
    deliveryAddressId: 'a1', csAttachments: [], orderTotal: 4741.4, updatedAt: 'old',
  }
  const builder = (table) => {
    let op = 'select'
    let cols = ''
    const q = {
      select(c) { cols = c; return q }, eq() { return q }, in() { return q }, neq() { return q }, order() { return q },
      limit() { return q }, gte() { return q }, lte() { return q },
      update() { op = 'update'; return q }, insert() { op = 'insert'; return q }, delete() { op = 'delete'; return q }, upsert() { op = 'upsert'; return q },
      async maybeSingle() {
        if (op !== 'select') return { data: null, error: null }
        if (table === 'orders') return { data: structuredClone(order), error: null }
        if (table === 'order_delivery') { if (cols === 'deliveryStatus') deliveryReads.push(1); return { data: deliveryStatus ? { deliveryStatus } : null, error: null } }
        if (table === 'customers') return { data: { wallet: 0 }, error: null }
        return { data: null, error: null }
      },
      then(resolve, reject) {
        return Promise.resolve({ data: op === 'select' && table === 'products' ? PRODUCTS : [], error: null }).then(resolve, reject)
      },
    }
    return q
  }
  let seq = 0
  const omsData = {
    ORDER_COLUMNS: 'id', ORDER_COLUMNS_LIST: 'id', CUSTOMER_COLUMNS: 'id', ADDRESS_COLUMNS: 'id',
    ORDER_ITEM_COLUMNS: 'id', DELIVERY_COLUMNS_FULL: 'id', DELIVERY_COLUMNS_LIST: 'id', PRODUCT_COLUMNS: 'id',
    appendEditHistory: async (r) => { history.push(structuredClone(r)) }, evaluateDiscountCode: async () => ({ ok: false }),
    generateId: (p) => `${p}_new${++seq}`,
    readOrderSettings: async () => ({ catalogues: catalogue.DEFAULT_CATALOGUES }),
    readOrderItemsByOrderIds: async () => structuredClone(existingItems),
    readOrderDeliveryByOrderIds: async () => [], readProductsByIds: async () => PRODUCTS,
    isDueForPriceRefresh: () => false, refreshOrderItemPriceSnapshots: async (i) => i,
    computeOrderTotals: () => ({ subtotal: 0, orderTotal: 0, netTotal: 0 }),
    computeDeliveryFee: async () => 0, resolveManualDiscount: () => ({ type: null, value: 0, amount: 0, reason: null }),
  }
  const route = load('src/app/api/orders/[id]/route.ts', {
    'next/server': { NextResponse: { json: (body, o = {}) => ({ body, status: o.status || 200 }) } },
    'next/cache': { revalidateTag() {} },
    '@/lib/supabase': { supabase: { from: builder } },
    '@/lib/photosCache': { orderPhotosTag: (id) => id },
    '@/lib/attachmentStorage': { persistAttachment: async (u) => u },
    '@/lib/omsData': omsData,
    '@/lib/catalogue': catalogue,
    '@/lib/b2bLineRate': b2bLineRate,
    '@/lib/lateEdit': late,
    '@/lib/retentionView': load('src/lib/retentionView.ts', {}),
  })
  return {
    history, deliveryReads,
    put: (items, role = 'cs') => route.PUT(
      { url: 'https://example.test/api/orders/order', json: async () => ({
        role, createdBy: 'Mirna', orderStatus: 'تم', orderType: 'Online', paymentMethod: 'Cash',
        orderMethod: 'App', orderReceiver: 'Test', customerSource: 'Facebook', notes: '', items,
      }) },
      { params: { id: 'order' } },
    ),
  }
}
const saved = (id, productId, quantity, unitPrice, weightGrams) => ({
  id, orderId: 'order', productId, quantity, weightGrams, unitPrice, lineTotal: unitPrice * quantity,
  specialInstructions: '', originalQuantity: null, originalWeightGrams: null, basePriceSnapshot: 295, offerPriceSnapshot: null,
  isCustomItem: false, customItemName: null,
})
const send = (productId, quantity, unitPrice, weightGrams) => ({
  productId, productNameInput: PRODUCTS.find((p) => p.id === productId).productName, quantity, weightGrams, unitPrice, specialInstructions: '',
})
const base = () => [saved('item_A', 'p1', 1, 1918.9, 3100), saved('item_B', 'p2', 1, 295, 0.5)]

test('Incident: CS raises the mince from 1 to 2 on a ready (جاهز) order - the history row carries the late edit and the change', async () => {
  const h = csHarness(base(), 'جاهز')
  const res = await h.put([send('p1', 1, 1918.9, 3100), send('p2', 2, 295, 0.5)])
  assert.equal(res.status, 200)
  const d = h.history[0].details
  assert.equal(d.lateEdit, true)
  assert.equal(d.source, 'cs')
  assert.equal(d.deliveryStatus, 'جاهز')
  assert.deepEqual(plain(d.changes.map((c) => [c.productName, c.qtyChange])), [['Mince', { from: 1, to: 2 }]])
  assert.equal(d.previousOrderTotal, 4741.4)
})

test('Out for delivery (في الطريق) counts too, for an admin edit', async () => {
  const h = csHarness(base(), 'في الطريق')
  await h.put([send('p1', 1, 1918.9, 3100), send('p2', 3, 295, 0.5)], 'admin')
  assert.equal(h.history[0].details.lateEdit, true)
})

test('Before the branch is ready, or with no line change, nothing is flagged', async () => {
  const notReady = csHarness(base(), 'لم يخرج بعد')
  await notReady.put([send('p1', 1, 1918.9, 3100), send('p2', 2, 295, 0.5)])
  assert.equal('lateEdit' in notReady.history[0].details, false)
  const noChange = csHarness(base(), 'جاهز')
  await noChange.put([send('p1', 1, 1918.9, 3100), send('p2', 1, 295, 0.5)])
  assert.equal('lateEdit' in noChange.history[0].details, false)
})

test('Admin saves read the delivery status only when a line actually changed (no extra read otherwise)', async () => {
  const unchanged = csHarness(base(), 'جاهز')
  await unchanged.put([send('p1', 1, 1918.9, 3100), send('p2', 1, 295, 0.5)], 'admin')
  assert.equal(unchanged.deliveryReads.length, 0)
  const changed = csHarness(base(), 'جاهز')
  await changed.put([send('p1', 1, 1918.9, 3100), send('p2', 2, 295, 0.5)], 'admin')
  assert.equal(changed.deliveryReads.length, 1)
})

test('A line added or removed after ready is reported as such', async () => {
  const h = csHarness(base(), 'جاهز')
  await h.put([send('p1', 1, 1918.9, 3100)])
  assert.equal(h.history[0].details.changes[0].removed, true)
})

// ───────────────────────── branch bell ─────────────────────────
function bellDb(tables, log) {
  return {
    from(table) {
      const q = {}
      for (const m of ['select', 'eq', 'neq', 'gte', 'gt', 'lte', 'in', 'not', 'order', 'range', 'limit']) q[m] = () => q
      q.or = (expr) => { log.push({ table, or: expr }); return q }
      q.then = (resolve, reject) => Promise.resolve({ data: tables[table] || [], error: null }).then(resolve, reject)
      return q
    },
  }
}
async function bell(role, history) {
  const log = []
  const tables = {
    edit_history: history,
    orders: [{ id: 'o1', appOrderNo: '131126online1', orderStatus: 'تم', customerId: 'c1', createdAt: '2026-01-01T00:00:00Z', updatedAt: new Date().toISOString() }],
    customers: [{ id: 'c1', customerName: 'Client', phone: '0100' }],
  }
  const route = load('src/app/api/notifications/route.ts', {
    'next/server': { NextResponse: { json: (b) => b } },
    'next/cache': { unstable_cache: (fn) => fn },
    '@/lib/supabase': { supabase: bellDb(tables, log) },
    '@/lib/cairoTime': { cairoDateString: () => '2026-11-22', addDays: () => '2026-11-23' },
    '@/lib/complaintLinks': { complaintNotificationHref: () => '/x' },
    '@/lib/pagedRead': paged,
    '@/lib/lateEdit': late,
    '@/lib/retentionView': load('src/lib/retentionView.ts', {}),
    '@/lib/omsData': {
      DEFAULT_RETENTION_CONFIG: { enabled: false }, readOrderSettings: async () => ({ retention: { enabled: false } }), createTask: async () => ({}),
    },
  })
  const res = await route.GET({ url: `https://example.test/api/notifications?role=${role}&user=x` })
  return { items: res.items, log }
}
const lateRow = () => ({
  id: 'h1', entityType: 'order', entityId: 'o1', orderId: 'o1', action: 'updated', changedBy: 'Mirna Gamal', changedAt: new Date().toISOString(),
  details: { lateEdit: true, source: 'cs', deliveryStatus: 'جاهز', changes: [{ productName: 'Mince', qtyChange: { from: 1, to: 2 } }] },
})

test('Bell: the branch gets an urgent alert naming the order and the change, linking to the branch screen', async () => {
  const { items } = await bell('branch', [lateRow()])
  const alert = items.find((i) => i.type === 'order-edited-after-ready')
  assert.ok(alert, 'alert present')
  assert.equal(alert.priority, 'urgent')
  assert.equal(alert.href, '/branch/o1')
  assert.ok(alert.body.includes('131126online1') && alert.body.includes('Mince: الكمية 1 → 2'), alert.body)
  assert.equal(alert.actor, 'Mirna Gamal')
})

test('Bell: admin sees it too; CS does not (they made the change)', async () => {
  assert.ok((await bell('admin', [lateRow()])).items.some((i) => i.type === 'order-edited-after-ready'))
  assert.equal((await bell('cs', [lateRow()])).items.some((i) => i.type === 'order-edited-after-ready'), false)
})

test('Bell: ordinary saves do not alert, and the history query is still one query with a narrow filter', async () => {
  const plainRow = { ...lateRow(), id: 'h2', details: { changedFields: [], itemCount: 3, orderTotal: 5036.4 } }
  const { items, log } = await bell('branch', [plainRow])
  assert.equal(items.some((i) => i.type === 'order-edited-after-ready'), false)
  const historyQueries = log.filter((l) => l.table === 'edit_history')
  assert.equal(historyQueries.length, 1)
  assert.ok(historyQueries[0].or.includes('status_changed') && historyQueries[0].or.includes('lateEdit'))
})
