const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const ts = require('typescript')

function load(file, mocks) {
  const filename = path.join(__dirname, '..', ...file.split('/'))
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const module = { exports: {} }
  vm.runInNewContext(code, {
    module, exports: module.exports, URL, Promise,
    console: { ...console, error() {}, warn() {} },
    require(name) {
      if (!(name in mocks)) throw new Error(`Unexpected dependency: ${name}`)
      return mocks[name]
    },
  }, { filename })
  return module.exports
}

const catalogue = load('src/lib/catalogue.ts', {})
const b2bLineRate = load('src/lib/b2bLineRate.ts', {})
const PRODUCTS = [
  { id: 'p1', productName: 'Product one', pricingMode: 'weight', basePrice: 289, offerPrice: null },
  { id: 'p2', productName: 'Product two', pricingMode: 'unit', basePrice: 100, offerPrice: null },
]

// deliveryLookup: what the order_delivery lookup returns for the lock check.
function harness({ deliveryLookup = { data: null, error: null } } = {}) {
  const ops = []
  const existingItems = ['i1', 'i2', 'i3'].map((id, n) => ({
    id, orderId: 'order', productId: n % 2 ? 'p2' : 'p1', quantity: 1, weightGrams: 1000,
    unitPrice: 289, lineTotal: 289, specialInstructions: '',
  }))
  const order = {
    id: 'order', appOrderNo: 'T1', customerId: 'c1', orderType: 'App', orderStatus: 'تم',
    paymentMethod: 'Cash', notes: 'old notes', discountCode: null, discountAmount: 0,
    walletUsed: 0, deliveryAddressId: 'a1', csAttachments: [], orderTotal: 867, updatedAt: 'old',
  }
  const builder = (table) => {
    let op = 'select'
    let payload
    const q = {
      select() { return q }, eq() { return q }, in() { return q }, neq() { return q },
      order() { return q }, limit() { return q }, gte() { return q }, lte() { return q },
      update(v) { op = 'update'; payload = v; return q },
      insert(v) { op = 'insert'; payload = v; return q },
      delete() { op = 'delete'; return q },
      upsert(v) { op = 'upsert'; payload = v; return q },
      async maybeSingle() {
        if (op !== 'select') return q.then((r) => r)
        if (table === 'orders') return { data: structuredClone(order), error: null }
        if (table === 'order_delivery') return structuredClone(deliveryLookup)
        if (table === 'customers') return { data: { wallet: 0 }, error: null }
        return { data: null, error: null }
      },
      then(resolve, reject) {
        if (op !== 'select') ops.push({ table, op, payload: payload && structuredClone(payload) })
        const data = op === 'select' && table === 'products' ? PRODUCTS : []
        return Promise.resolve({ data, error: null }).then(resolve, reject)
      },
    }
    return q
  }
  let seq = 0
  const history = []
  const omsData = {
    ORDER_COLUMNS: 'id', ORDER_COLUMNS_LIST: 'id', CUSTOMER_COLUMNS: 'id', ADDRESS_COLUMNS: 'id',
    ORDER_ITEM_COLUMNS: 'id', DELIVERY_COLUMNS_FULL: 'id', DELIVERY_COLUMNS_LIST: 'id', PRODUCT_COLUMNS: 'id',
    appendEditHistory: async (entry) => { history.push(entry) },
    evaluateDiscountCode: async () => ({ ok: false }),
    generateId: (prefix) => `${prefix}_${++seq}`,
    readAddresses: async () => [], readCustomers: async () => [], readOrderItems: async () => [],
    readOrderDelivery: async () => [], readOrders: async () => [],
    readOrderSettings: async () => ({ catalogues: catalogue.DEFAULT_CATALOGUES }),
    readDeliveryZones: async () => [],
    readOrderItemsByOrderIds: async () => structuredClone(existingItems),
    readOrderDeliveryByOrderIds: async () => [],
    readProductsByIds: async () => PRODUCTS,
    isDueForPriceRefresh: () => false,
    refreshOrderItemPriceSnapshots: async (items) => items,
    computeOrderTotals: () => ({ subtotal: 0, orderTotal: 0, netTotal: 0 }),
    computeDeliveryFee: async () => 0,
    resolveManualDiscount: () => ({ type: null, value: 0, amount: 0, reason: null }),
  }
  // ROUTE_FILE lets the suite be pointed at an older copy of the route to
  // confirm these tests really fail against the buggy version.
  const route = load(process.env.ROUTE_FILE || 'src/app/api/orders/[id]/route.ts', {
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } },
    'next/cache': { revalidateTag() {} },
    '@/lib/supabase': { supabase: { from: builder } },
    '@/lib/photosCache': { orderPhotosTag: (id) => id },
    '@/lib/attachmentStorage': { persistAttachment: async (url) => url },
    '@/lib/omsData': omsData,
    '@/lib/catalogue': catalogue,
    '@/lib/b2bLineRate': b2bLineRate,
  })
  const put = (body) => route.PUT(
    { url: 'https://example.test/api/orders/order', json: async () => body },
    { params: { id: 'order' } },
  )
  const itemWrites = () => ops.filter((o) => o.table === 'order_items')
  const orderWrites = () => ops.filter((o) => o.table === 'orders')
  return { put, ops, itemWrites, orderWrites, history }
}

const fullSave = (overrides = {}) => ({
  role: 'cs', createdBy: 'Test agent', orderStatus: 'تم', orderType: 'App', paymentMethod: 'Cash',
  orderMethod: 'App', orderReceiver: 'Test', customerSource: 'Facebook', notes: '',
  items: [{ productId: 'p1', productNameInput: 'Product one', quantity: 4, weightGrams: 1000, unitPrice: 289, specialInstructions: '' }],
  ...overrides,
})
// What the "save attachments / notes / payment" button on a locked order sends.
const narrowSave = (overrides = {}) => ({
  role: 'cs', createdBy: 'Test agent', attachmentsOnly: true, notes: 'new note', paymentMethod: 'Visa', ...overrides,
})
const LOCKED = { data: { deliveryStatus: 'في الطريق' }, error: null }

test('Incident: narrow save while the lock lookup returns nothing never touches items', async () => {
  const h = harness({ deliveryLookup: { data: null, error: null } })
  const res = await h.put(narrowSave())
  assert.equal(res.status, 200)
  assert.equal(h.itemWrites().length, 0)
  assert.deepEqual(Object.keys(h.orderWrites()[0].payload).sort(), ['notes', 'paymentMethod', 'updatedAt'])
})

test('Incident: narrow save while the lock lookup errors never touches items', async () => {
  const h = harness({ deliveryLookup: { data: null, error: { message: 'connection reset' } } })
  const res = await h.put(narrowSave())
  assert.equal(res.status, 200)
  assert.equal(h.itemWrites().length, 0)
  assert.equal(h.orderWrites().length, 1)
  assert.equal(Object.hasOwn(h.orderWrites()[0].payload, 'orderStatus'), false)
})

test('Narrow save on a locked order still works as before', async () => {
  const h = harness({ deliveryLookup: LOCKED })
  const res = await h.put(narrowSave())
  assert.equal(res.status, 200)
  assert.equal(h.itemWrites().length, 0)
  assert.ok(h.history[0].summary.includes('مقفل'))
})

test('Narrow save by an admin is also narrow', async () => {
  const h = harness({ deliveryLookup: { data: null, error: null } })
  const res = await h.put(narrowSave({ role: 'admin' }))
  assert.equal(res.status, 200)
  assert.equal(h.itemWrites().length, 0)
})

test('Full save without an item list is refused and writes nothing', async () => {
  for (const items of [undefined, null, [], 'x']) {
    const h = harness({ deliveryLookup: { data: null, error: null } })
    const body = fullSave({ items })
    if (items === undefined) delete body.items
    const res = await h.put(body)
    assert.equal(res.status, 400)
    assert.equal(res.body.code, 'EMPTY_ITEMS')
    assert.equal(h.ops.length, 0)
  }
})

test('Admin full save without items is refused too', async () => {
  const h = harness()
  const res = await h.put(fullSave({ role: 'admin', items: [] }))
  assert.equal(res.status, 400)
  assert.equal(h.ops.length, 0)
})

test('Full save whose lines match no product is refused before any item write', async () => {
  const h = harness()
  const res = await h.put(fullSave({ items: [{ productId: '', productNameInput: 'No such product', quantity: 2, unitPrice: 10 }] }))
  assert.equal(res.status, 400)
  assert.equal(res.body.code, 'EMPTY_ITEMS')
  assert.equal(h.itemWrites().length, 0)
  assert.equal(h.orderWrites().length, 0)
})

test('Full save where every line has zero quantity is refused', async () => {
  const h = harness()
  const res = await h.put(fullSave({ items: [{ productId: 'p1', productNameInput: 'Product one', quantity: 0, unitPrice: 10 }] }))
  assert.equal(res.status, 400)
  assert.equal(h.itemWrites().length, 0)
})

test('Failed delivery lookup on a full save is an error, not "unlocked"', async () => {
  const h = harness({ deliveryLookup: { data: null, error: { message: 'connection reset' } } })
  const res = await h.put(fullSave())
  assert.equal(res.status, 503)
  assert.equal(h.ops.length, 0)
})

test('Full save on a locked order is still refused for non-admins', async () => {
  const h = harness({ deliveryLookup: LOCKED })
  const res = await h.put(fullSave())
  assert.equal(res.status, 423)
  assert.equal(h.ops.length, 0)
})

test('Control: a normal full save still replaces the items', async () => {
  const h = harness({ deliveryLookup: { data: { deliveryStatus: 'لم يخرج بعد' }, error: null } })
  const res = await h.put(fullSave())
  assert.equal(res.status, 200)
  const del = h.itemWrites().filter((o) => o.op === 'delete')
  const ins = h.itemWrites().filter((o) => o.op === 'insert')
  assert.equal(del.length, 1)
  assert.equal(ins.length, 1)
  assert.equal(ins[0].payload.length, 1)
  assert.equal(ins[0].payload[0].productId, 'p1')
  assert.equal(ins[0].payload[0].quantity, 4)
  assert.equal(h.history.at(-1).details.itemCount, 1)
})

test('Control: an admin can still do a full save on a locked order', async () => {
  const h = harness({ deliveryLookup: LOCKED })
  const res = await h.put(fullSave({ role: 'admin' }))
  assert.equal(res.status, 200)
  assert.equal(h.itemWrites().filter((o) => o.op === 'insert').length, 1)
})
