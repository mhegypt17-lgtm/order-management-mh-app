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
const plain = (v) => JSON.parse(JSON.stringify(v))
const catalogue = load('src/lib/catalogue.ts', {})
const sync = load('src/lib/branchItemSync.ts', {})
const pricing = load('src/lib/b2bWeightPrice.ts', {})
const b2bLineRate = load('src/lib/b2bLineRate.ts', {})

// ───────────────────────── reconcileItems (branch screen) ─────────────────────────
const line = (id, name, quantity, weightGrams = 1000) => ({ id, productName: name, quantity, weightGrams })
const draft = (quantity, weightGrams) => ({ quantity, weightGrams, weightDraft: weightGrams ? String(weightGrams / 1000) : '' })

test('Incident: CS raises a quantity the branch screen had cached', () => {
  const prev = [line('a', 'دجاج بلدى', 1, 1100)]
  const fresh = [line('a', 'دجاج بلدى', 2, 1100)]
  const r = sync.reconcileItems(prev, fresh, { a: draft(1, 1100) })
  assert.equal(r.items[0].quantity, 2)
  assert.equal(r.drafts.a.quantity, 2)
  assert.deepEqual(plain(r.changes), [{
    kind: 'changed', productName: 'دجاج بلدى', fromQuantity: 1, toQuantity: 2,
    fromWeightGrams: 1100, toWeightGrams: 1100, discardedDraft: false,
  }])
})

test('Unchanged lines keep the branch worker\'s unsaved draft', () => {
  const prev = [line('a', 'A', 1), line('b', 'B', 1)]
  const fresh = [line('a', 'A', 1), line('b', 'B', 3)]
  const r = sync.reconcileItems(prev, fresh, { a: draft(1, 1500), b: draft(1, 1000) })
  assert.deepEqual(plain(r.drafts.a), plain(draft(1, 1500)))
  assert.equal(r.drafts.b.quantity, 3)
  assert.equal(r.changes.length, 1)
  assert.equal(r.changes[0].productName, 'B')
})

test('A line CS changed replaces the unsaved draft and says so', () => {
  const prev = [line('a', 'A', 1, 1000)]
  const fresh = [line('a', 'A', 1, 2000)]
  const r = sync.reconcileItems(prev, fresh, { a: draft(1, 1300) })
  assert.equal(r.drafts.a.weightGrams, 2000)
  assert.equal(r.changes[0].discardedDraft, true)
  assert.ok(sync.describeCsChange(r.changes[0]).includes('استُبدل تعديلك غير المحفوظ'))
})

test('Lines replaced (new ids) are reported as added and removed, drafts rebuilt', () => {
  const prev = [line('old1', 'A', 2), line('old2', 'B', 1)]
  const fresh = [line('new1', 'A', 2), line('new2', 'B', 1)]
  const r = sync.reconcileItems(prev, fresh, { old1: draft(5, 1000), old2: draft(1, 1000) })
  assert.deepEqual(Object.keys(r.drafts).sort(), ['new1', 'new2'])
  assert.equal(r.drafts.new1.quantity, 2)
  assert.deepEqual(plain(r.changes.map((c) => c.kind).sort()), ['added', 'added', 'removed', 'removed'])
})

test('A line CS added or removed is reported', () => {
  const r = sync.reconcileItems([line('a', 'A', 1), line('b', 'B', 1)], [line('a', 'A', 1), line('c', 'C', 4)], {})
  assert.deepEqual(plain(r.changes.map((c) => [c.kind, c.productName]).sort()), [['added', 'C'], ['removed', 'B']])
  assert.equal(r.drafts.c.quantity, 4)
})

test('Nothing changed: no notice, drafts untouched, and no false alarm from numeric strings', () => {
  const prev = [line('a', 'A', 1, 1100)]
  const r = sync.reconcileItems(prev, [{ ...line('a', 'A', '1', '1100') }], { a: draft(1, 1100) })
  assert.equal(r.changes.length, 0)
  assert.deepEqual(plain(r.drafts.a), plain(draft(1, 1100)))
})

test('describeCsChange wording', () => {
  assert.equal(sync.describeCsChange({ kind: 'removed', productName: 'X', discardedDraft: false }), 'X: تم حذف البند')
  assert.ok(sync.describeCsChange({ kind: 'added', productName: 'X', toQuantity: 2, discardedDraft: false }).includes('بند جديد'))
  assert.ok(sync.describeCsChange({ kind: 'changed', productName: 'X', fromQuantity: 1, toQuantity: 2, fromWeightGrams: 1, toWeightGrams: 1, discardedDraft: false }).includes('1 ← 2'))
})

// ───────────────────────── CS full save keeps line ids ─────────────────────────
const PRODUCTS = [
  { id: 'p1', productName: 'Product one', pricingMode: 'weight', basePrice: 289, offerPrice: null },
  { id: 'p2', productName: 'Product two', pricingMode: 'unit', basePrice: 100, offerPrice: null },
  { id: 'p3', productName: 'Product three', pricingMode: 'unit', basePrice: 50, offerPrice: null },
]

function csHarness(existingItems) {
  const ops = []
  const order = {
    id: 'order', appOrderNo: 'T1', customerId: 'c1', orderType: 'App', orderStatus: 'تم',
    paymentMethod: 'Cash', notes: '', discountCode: null, discountAmount: 0, walletUsed: 0,
    deliveryAddressId: 'a1', csAttachments: [], orderTotal: 0, updatedAt: 'old',
  }
  const builder = (table) => {
    let op = 'select'
    let payload
    const q = {
      select() { return q }, eq() { return q }, in() { return q }, neq() { return q }, order() { return q },
      limit() { return q }, gte() { return q }, lte() { return q },
      update(v) { op = 'update'; payload = v; return q },
      insert(v) { op = 'insert'; payload = v; return q },
      delete() { op = 'delete'; return q },
      upsert(v) { op = 'upsert'; payload = v; return q },
      async maybeSingle() {
        if (op !== 'select') return q.then((r) => r)
        if (table === 'orders') return { data: structuredClone(order), error: null }
        if (table === 'order_delivery') return { data: { deliveryStatus: 'لم يخرج بعد' }, error: null }
        if (table === 'customers') return { data: { wallet: 0 }, error: null }
        return { data: null, error: null }
      },
      then(resolve, reject) {
        if (op !== 'select') ops.push({ table, op, payload: payload && structuredClone(payload) })
        return Promise.resolve({ data: op === 'select' && table === 'products' ? PRODUCTS : [], error: null }).then(resolve, reject)
      },
    }
    return q
  }
  let seq = 0
  const omsData = {
    ORDER_COLUMNS: 'id', ORDER_COLUMNS_LIST: 'id', CUSTOMER_COLUMNS: 'id', ADDRESS_COLUMNS: 'id',
    ORDER_ITEM_COLUMNS: 'id', DELIVERY_COLUMNS_FULL: 'id', DELIVERY_COLUMNS_LIST: 'id', PRODUCT_COLUMNS: 'id',
    appendEditHistory: async () => {}, evaluateDiscountCode: async () => ({ ok: false }),
    generateId: (prefix) => `${prefix}_new${++seq}`,
    readOrderSettings: async () => ({ catalogues: catalogue.DEFAULT_CATALOGUES }),
    readOrderItemsByOrderIds: async () => structuredClone(existingItems),
    readOrderDeliveryByOrderIds: async () => [], readProductsByIds: async () => PRODUCTS,
    isDueForPriceRefresh: () => false, refreshOrderItemPriceSnapshots: async (i) => i,
    computeOrderTotals: () => ({ subtotal: 0, orderTotal: 0, netTotal: 0 }),
    computeDeliveryFee: async () => 0, resolveManualDiscount: () => ({ type: null, value: 0, amount: 0, reason: null }),
  }
  const route = load('src/app/api/orders/[id]/route.ts', {
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } },
    'next/cache': { revalidateTag() {} },
    '@/lib/supabase': { supabase: { from: builder } },
    '@/lib/photosCache': { orderPhotosTag: (id) => id },
    '@/lib/attachmentStorage': { persistAttachment: async (url) => url },
    '@/lib/omsData': omsData,
    '@/lib/catalogue': catalogue,
    '@/lib/b2bLineRate': b2bLineRate,
  })
  return {
    ops,
    insertedItems: () => (ops.find((o) => o.table === 'order_items' && o.op === 'insert') || { payload: [] }).payload,
    put: (items) => route.PUT(
      { url: 'https://example.test/api/orders/order', json: async () => ({
        role: 'cs', createdBy: 'Test', orderStatus: 'تم', orderType: 'App', paymentMethod: 'Cash',
        orderMethod: 'App', orderReceiver: 'Test', customerSource: 'Facebook', notes: '', items,
      }) },
      { params: { id: 'order' } },
    ),
  }
}
const saved = (id, productId, quantity, extra = {}) => ({
  id, orderId: 'order', productId, quantity, weightGrams: 1000, unitPrice: 100, lineTotal: 100 * quantity,
  specialInstructions: '', originalQuantity: null, originalWeightGrams: null,
  basePriceSnapshot: 100, offerPriceSnapshot: null, isCustomItem: false, customItemName: null, ...extra,
})
const submit = (productId, quantity, extra = {}) => ({
  productId, productNameInput: PRODUCTS.find((p) => p.id === productId)?.productName || '',
  quantity, weightGrams: 1000, unitPrice: 100, specialInstructions: '', ...extra,
})

test('CS save keeps the ids of lines that already existed, whatever order they come back in', async () => {
  const h = csHarness([saved('item_A', 'p1', 1), saved('item_B', 'p2', 1)])
  const res = await h.put([submit('p2', 3), submit('p1', 2)])
  assert.equal(res.status, 200)
  const byProduct = Object.fromEntries(h.insertedItems().map((i) => [i.productId, i]))
  assert.equal(byProduct.p1.id, 'item_A')
  assert.equal(byProduct.p2.id, 'item_B')
  assert.equal(byProduct.p1.quantity, 2)
  assert.equal(byProduct.p2.quantity, 3)
})

test('A brand-new line gets a fresh id; a removed line\'s id is not reused', async () => {
  const h = csHarness([saved('item_A', 'p1', 1), saved('item_B', 'p2', 1)])
  await h.put([submit('p1', 1), submit('p3', 2)])
  const ids = h.insertedItems().map((i) => i.id)
  assert.equal(ids[0], 'item_A')
  assert.ok(ids[1].startsWith('item_new'))
  assert.ok(!ids.includes('item_B'))
})

test('Two lines for the same product never end up with the same id', async () => {
  const h = csHarness([saved('item_A', 'p2', 1), saved('item_B', 'p2', 1)])
  await h.put([submit('p2', 2), submit('p2', 5), submit('p2', 1)])
  const ids = h.insertedItems().map((i) => i.id)
  assert.equal(new Set(ids).size, 3)
  assert.deepEqual(ids.slice(0, 2), ['item_A', 'item_B'])
  assert.ok(ids[2].startsWith('item_new'))
})

test('Custom lines keep their id by name, and a custom line never takes a catalogue line\'s id', async () => {
  const h = csHarness([
    saved('item_cat', 'p1', 1),
    saved('item_cus', null, 1, { isCustomItem: true, customItemName: 'Special cut' }),
  ])
  await h.put([
    submit('', 2, { isCustomItem: true, productNameInput: 'Special cut' }),
    submit('p1', 1),
  ])
  const items = h.insertedItems()
  assert.equal(items.find((i) => i.isCustomItem).id, 'item_cus')
  assert.equal(items.find((i) => !i.isCustomItem).id, 'item_cat')
})

test('Snapshots and branch "original" values still carry over with the kept id', async () => {
  const h = csHarness([saved('item_A', 'p1', 1, { originalWeightGrams: 1000, basePriceSnapshot: 275, offerPriceSnapshot: 272 })])
  await h.put([submit('p1', 2)])
  const i = h.insertedItems()[0]
  assert.equal(i.id, 'item_A')
  assert.equal(i.originalWeightGrams, 1000)
  assert.equal(i.basePriceSnapshot, 275)
  assert.equal(i.offerPriceSnapshot, 272)
})

// ───────────────────────── branch save: conflict handling ─────────────────────────
function branchHarness(startItems) {
  const order = {
    id: 'order', orderType: 'App', orderStatus: 'تم', updatedAt: 'old',
    subtotal: 0, orderTotal: 0, deliveryFee: 0, discountAmount: 0, walletUsed: 0,
  }
  const delivery = { id: 'delivery', orderId: 'order', deliveryStatus: 'لم يخرج بعد', productPhotos: [], invoicePhoto: '', updatedAt: 'old' }
  const items = startItems.map((i) => ({ ...i }))
  const writes = []
  const db = {
    from(table) {
      let patch
      let eqId
      const q = {
        select() { return q }, returns() { return q }, in() { return q }, neq() { return q },
        eq(col, val) { if (col === 'id') eqId = val; return q },
        update(v) { patch = v; return q },
        insert() { return q },
        async maybeSingle() { return { data: structuredClone(table === 'orders' ? order : delivery), error: null } },
        then(resolve, reject) {
          if (patch) {
            writes.push({ table, patch: structuredClone(patch), id: eqId })
            if (table === 'order_items') Object.assign(items.find((i) => i.id === eqId) || {}, patch)
            else if (table === 'orders') Object.assign(order, patch)
          }
          return Promise.resolve({ error: null }).then(resolve, reject)
        },
      }
      return q
    },
  }
  const oms = {
    ORDER_COLUMNS: 'id', ORDER_COLUMNS_LIST: 'id', ORDER_ITEM_COLUMNS: 'id',
    DELIVERY_COLUMNS_FULL: 'id', DELIVERY_COLUMNS_LIST: 'id', PRODUCT_COLUMNS: 'id',
    readOrderItemsByOrderIds: async () => structuredClone(items),
    readOrderDeliveryByOrderIds: async () => [structuredClone(delivery)],
    readProductsByIds: async () => PRODUCTS,
    isDueForPriceRefresh: () => false, computeDeliveryFee: async () => 0,
    appendEditHistory: async () => {},
  }
  const route = load('src/app/api/branch/orders/[id]/route.ts', {
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } },
    'next/cache': { revalidateTag() {} },
    '@/lib/supabase': { supabase: db },
    '@/lib/photosCache': { orderPhotosTag: (id) => id },
    '@/lib/attachmentStorage': { persistAttachment: async (url) => url },
    '@/lib/omsData': oms, '@/lib/catalogue': catalogue, '@/lib/b2bWeightPrice': pricing,
  })
  return {
    items, writes,
    itemWrites: () => writes.filter((w) => w.table === 'order_items'),
    put: (edits) => route.PUT(
      { url: 'https://example.test/api/branch/orders/order', json: async () => ({ items: edits, updatedBy: 'branch-user' }) },
      { params: { id: 'order' } },
    ),
  }
}
const bItem = (id, productId, quantity, weightGrams = 1000, unitPrice = 289) => ({
  id, orderId: 'order', productId, quantity, weightGrams, unitPrice, lineTotal: quantity * unitPrice,
  basePriceSnapshot: 289, offerPriceSnapshot: null, originalQuantity: null, originalWeightGrams: null,
})
// What the branch screen sends for a line: its draft, plus what it believes is saved.
const edit = (id, draftQty, draftWeight, savedQty, savedWeight) => ({
  id, quantity: draftQty, weightGrams: draftWeight, expectedQuantity: savedQty, expectedWeightGrams: savedWeight,
})

test('Incident: CS changed a quantity, the branch screen is stale — nothing saved, ORDER_CHANGED returned', async () => {
  const h = branchHarness([bItem('i1', 'p1', 2, 1100), bItem('i2', 'p2', 1)])
  // Screen still believes i1 is quantity 1 and the branch re-weighed it to 1.2 kg.
  const res = await h.put([edit('i1', 1, 1200, 1, 1100), edit('i2', 1, 1000, 1, 1000)])
  assert.equal(res.status, 409)
  assert.equal(res.body.code, 'ORDER_CHANGED')
  assert.equal(h.writes.length, 0)
  assert.equal(h.items.find((i) => i.id === 'i1').quantity, 2)
})

test('Incident: ids replaced by a CS save (old client behaviour) is refused, not reported as success', async () => {
  const h = branchHarness([bItem('new1', 'p1', 2)])
  const res = await h.put([edit('old1', 1, 1500, 1, 1000)])
  assert.equal(res.status, 409)
  assert.equal(res.body.code, 'ORDER_CHANGED')
  assert.equal(h.writes.length, 0)
})

test('A stale screen that edited nothing cannot write its old numbers over a CS change', async () => {
  const h = branchHarness([bItem('i1', 'p1', 2, 1100)])
  const res = await h.put([edit('i1', 1, 1100, 1, 1100)])
  assert.equal(res.status, 200)
  assert.equal(h.itemWrites().length, 0)
  assert.equal(h.items[0].quantity, 2)
})

test('Branch edit on an up-to-date screen saves normally and recomputes the line', async () => {
  const h = branchHarness([bItem('i1', 'p1', 1, 1000), bItem('i2', 'p2', 1)])
  const res = await h.put([edit('i1', 1, 1500, 1, 1000), edit('i2', 1, 1000, 1, 1000)])
  assert.equal(res.status, 200)
  const w = h.itemWrites()
  assert.equal(w.length, 1)
  assert.equal(w[0].id, 'i1')
  assert.equal(w[0].patch.weightGrams, 1500)
  assert.equal(w[0].patch.unitPrice, 433.5)
  assert.equal(w[0].patch.originalWeightGrams, 1000)
})

test('Quantity edit on an up-to-date screen saves; the untouched line is not written', async () => {
  const h = branchHarness([bItem('i1', 'p1', 4, 1000), bItem('i2', 'p2', 1)])
  const res = await h.put([edit('i1', 1, 4000, 4, 1000), edit('i2', 1, 1000, 1, 1000)])
  assert.equal(res.status, 200)
  assert.deepEqual(h.itemWrites().map((w) => w.id), ['i1'])
  assert.equal(h.items[0].quantity, 1)
})

test('A conflict on any edited line refuses the whole save before writing anything', async () => {
  const h = branchHarness([bItem('i1', 'p1', 1, 1000), bItem('i2', 'p2', 5)])
  const res = await h.put([edit('i1', 1, 1500, 1, 1000), edit('i2', 2, 1000, 1, 1000)])
  assert.equal(res.status, 409)
  assert.equal(h.writes.length, 0)
  assert.equal(h.items[0].weightGrams, 1000)
})

test('Older clients without expectations keep the legacy behaviour for known lines', async () => {
  const h = branchHarness([bItem('i1', 'p1', 1, 1000)])
  const res = await h.put([{ id: 'i1', quantity: 1, weightGrams: 1500 }])
  assert.equal(res.status, 200)
  assert.equal(h.itemWrites().length, 1)
  assert.equal(h.items[0].weightGrams, 1500)
})

test('Numeric strings from the database do not cause false conflicts', async () => {
  const h = branchHarness([{ ...bItem('i1', 'p1', 1, 1000), quantity: '1', weightGrams: '1000' }])
  const res = await h.put([edit('i1', 1, 1500, 1, 1000)])
  assert.equal(res.status, 200)
  assert.equal(h.itemWrites().length, 1)
})
