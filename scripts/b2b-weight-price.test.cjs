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
    module, exports: module.exports, URL,
    console: { ...console, error() {} },
    require(name) {
      if (!(name in mocks)) throw new Error(`Unexpected dependency: ${name}`)
      return mocks[name]
    },
  }, { filename })
  return module.exports
}
const pricing = load('src/lib/b2bWeightPrice.ts', {})
const catalogue = load('src/lib/catalogue.ts', {})

function harness(orderType = 'B2B', unitPrice = 296, weightGrams = 1000, pricingMode = 'weight') {
  const order = {
    id: 'order', orderType, orderStatus: 'تم', updatedAt: 'old',
    subtotal: unitPrice, orderTotal: unitPrice + 100, deliveryFee: 100,
    discountAmount: 0, walletUsed: 0,
  }
  const delivery = {
    id: 'delivery', orderId: order.id, deliveryStatus: 'لم يخرج بعد',
    productPhotos: [], invoicePhoto: '', updatedAt: 'old',
  }
  const item = {
    id: 'item', orderId: order.id, productId: 'product', quantity: 1,
    weightGrams, unitPrice, lineTotal: unitPrice,
    basePriceSnapshot: 296, offerPriceSnapshot: 293,
  }
  const product = { id: 'product', productName: 'Test', pricingMode, basePrice: 999, offerPrice: 888 }
  const writes = []
  const reads = []
  const history = []
  const db = {
    from(table) {
      let patch
      const query = {
        select() { return query }, eq() { return query }, returns() { return query },
        update(value) { patch = value; return query },
        async maybeSingle() {
          reads.push(table)
          return { data: structuredClone(table === 'orders' ? order : delivery), error: null }
        },
        then(resolve, reject) {
          if (patch) {
            writes.push({ table, patch: structuredClone(patch) })
            Object.assign(table === 'orders' ? order : table === 'order_items' ? item : delivery, patch)
          }
          return Promise.resolve({ error: null }).then(resolve, reject)
        },
      }
      return query
    },
  }
  const oms = {
    ORDER_COLUMNS: 'id', ORDER_COLUMNS_LIST: 'id', ORDER_ITEM_COLUMNS: 'id',
    DELIVERY_COLUMNS_FULL: 'id', DELIVERY_COLUMNS_LIST: 'id', PRODUCT_COLUMNS: 'id',
    readOrderItemsByOrderIds: async () => [structuredClone(item)],
    readOrderDeliveryByOrderIds: async () => [structuredClone(delivery)],
    readProductsByIds: async () => [product],
    isDueForPriceRefresh: () => false,
    computeDeliveryFee: async () => 100,
    appendEditHistory: async (entry) => { history.push(entry) },
  }
  const route = load('src/app/api/branch/orders/[id]/route.ts', {
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } },
    'next/cache': { revalidateTag() {} },
    '@/lib/supabase': { supabase: db },
    '@/lib/photosCache': { orderPhotosTag: (id) => id },
    '@/lib/attachmentStorage': { persistAttachment: async (url) => url },
    '@/lib/omsData': oms,
    '@/lib/catalogue': catalogue,
    '@/lib/b2bWeightPrice': pricing,
  })
  const params = { params: { id: order.id } }
  return {
    item, order, delivery, writes, history, reads,
    get: () => route.GET({ url: 'https://example.test/api/branch/orders/order' }, params),
    put: (weight, quantity = 1) => route.PUT({
      url: 'https://example.test/api/branch/orders/order',
      json: async () => ({ items: [{ id: item.id, quantity, weightGrams: weight }], updatedBy: 'test' }),
    }, params),
  }
}

test('B2B branch GET exposes the CS rate, not promo or current catalogue price', async () => {
  const h = harness()
  const response = await h.get()
  assert.equal(response.status, 200)
  assert.equal(response.body.order.items[0].pricePerKg, 296)
  assert.equal(h.reads.filter((table) => table === 'orders').length, 2)
  assert.equal(response.body.order.items[0].offerPrice, 293)
  assert.equal(response.body.order.items[0].unitPrice, 296)
  assert.equal(h.writes.length, 0)
})

test('B2B save at 1.1 kg uses 296 and matches reopened preview and totals', async () => {
  const h = harness()
  const response = await h.put(1100)
  assert.equal(response.status, 200)
  assert.equal(h.item.unitPrice, 325.6)
  assert.equal(h.item.lineTotal, 325.6)
  assert.equal(h.item.originalWeightGrams, 1000)
  assert.equal(h.order.subtotal, 325.6)
  assert.equal(h.order.orderTotal, 425.6)
  assert.equal(h.reads.filter((table) => table === 'orders').length, 3)
  assert.equal(response.body.order.items[0].pricePerKg, 296)
  assert.equal(h.history[0].details.changes[0].weightChange.newUnitPrice, 325.6)
  assert.equal((await h.get()).body.order.items[0].pricePerKg, 296)
})

test('Repeated B2B weigh-ins use current weight, not original CS weight', async () => {
  const h = harness()
  await h.put(1100)
  await h.put(1500, 2)
  assert.equal(h.item.unitPrice, 444)
  assert.equal(h.item.lineTotal, 888)
  assert.equal(h.item.originalWeightGrams, 1000)
  assert.equal(h.order.orderTotal, 988)
  await h.put(1000)
  assert.equal(h.item.unitPrice, 296)
})

test('Negotiated and promo B2B rates are retained, not forced to maximum', async () => {
  for (const rate of [294.5, 293, 0]) {
    const h = harness('B2B', rate)
    const preview = await h.get()
    assert.equal(preview.body.order.items[0].pricePerKg, rate)
    assert.equal((await h.put(1100)).status, 200)
    assert.equal(h.item.unitPrice, Math.round(rate * 1.1 * 100) / 100)
  }
})

test('Already weighed B2B line derives rate from current weight', async () => {
  const h = harness('B2B', 325.6, 1100)
  h.item.originalWeightGrams = 1000
  assert.equal((await h.get()).body.order.items[0].pricePerKg, 296)
  await h.put(1500)
  assert.equal(h.item.unitPrice, 444)
})

test('B2B without catalogue snapshots still retains the saved agreement', async () => {
  const h = harness()
  h.item.basePriceSnapshot = null
  h.item.offerPriceSnapshot = null
  assert.equal((await h.get()).body.order.items[0].pricePerKg, 296)
  await h.put(1100)
  assert.equal(h.item.unitPrice, 325.6)
})

test('Online, App and Instashop keep existing promo snapshot rules', async () => {
  for (const type of ['Online', 'App', 'Instashop']) {
    const h = harness(type, 293)
    assert.equal((await h.get()).body.order.items[0].pricePerKg, 293)
    await h.put(1100)
    assert.equal(h.item.unitPrice, 322.3)
  }
})

test('Invalid B2B weights are rejected before writes', async () => {
  for (const weight of [0, -1, NaN]) {
    const h = harness()
    assert.equal((await h.put(weight)).status, 400)
    assert.equal(h.writes.length, 0)
  }
  const h = harness('B2B', 0, 0)
  assert.equal((await h.put(1100)).status, 409)
  assert.equal(h.writes.length, 0)
})

test('Delivered line edit lock remains enforced', async () => {
  const h = harness()
  h.delivery.deliveryStatus = 'تم التوصيل'
  assert.equal((await h.put(1100)).status, 409)
  assert.equal(h.writes.length, 0)
})

test('B2B quantity-only and per-piece edits do not change the agreed unit price', async () => {
  for (const mode of ['weight', 'unit']) {
    const h = harness('B2B', 296, 1000, mode)
    assert.equal((await h.put(1000, 3)).status, 200)
    assert.equal(h.item.unitPrice, 296)
    assert.equal(h.item.lineTotal, 888)
    assert.equal(h.item.originalWeightGrams, null)
  }
})
