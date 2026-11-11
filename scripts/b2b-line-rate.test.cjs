const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const ts = require('typescript')

function load(file, mocks) {
  const filename = path.join(process.env.TEST_ROOT || path.join(__dirname, '..'), ...file.split('/'))
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
const rate = load('src/lib/b2bLineRate.ts', {})

// ───────────────────────── helpers ─────────────────────────
test('lineRatePerKg derives the agreed rate from a saved line', () => {
  assert.equal(rate.lineRatePerKg(3869.1, 7165), 3869.1 / 7.165)
  assert.equal(rate.lineRatePerKg(540, 1000), 540)
  assert.equal(rate.lineRatePerKg(0, 1000), null)
  assert.equal(rate.lineRatePerKg(540, 0), null)
  assert.equal(rate.lineRatePerKg('540', '1000'), 540)
})

test('effectivePricePerKg: B2B keeps the line rate, everything else follows the catalogue', () => {
  assert.equal(rate.effectivePricePerKg({ isB2B: true, lineRate: 540, catalogueRate: 518 }), 540)
  assert.equal(rate.effectivePricePerKg({ isB2B: true, lineRate: null, catalogueRate: 518 }), 518)
  assert.equal(rate.effectivePricePerKg({ isB2B: false, lineRate: 540, catalogueRate: 518 }), 518)
})

const guardLine = (incoming, prior, extra = {}) => ({
  productName: 'عكاوى', isWeightMode: true, incoming, prior, ...extra,
})
const lowered = (lines, existing = 'B2B', incoming = 'B2B') => plain(rate.findLoweredB2BRates(existing, incoming, lines))

test('Incident 021126b2b2: 540/kg order re-saved at the catalogue 518/kg is flagged', () => {
  const found = lowered([guardLine({ unitPrice: 3711.47, weightGrams: 7165 }, { unitPrice: 3869.1, weightGrams: 7165 })])
  assert.equal(found.length, 1)
  assert.equal(found[0].priorPerKg, 540)
  assert.equal(found[0].incomingPerKg, 518)
})

test('Weight changed but the agreed rate kept is fine', () => {
  assert.deepEqual(lowered([guardLine({ unitPrice: 540 * 8.2, weightGrams: 8200 }, { unitPrice: 3869.1, weightGrams: 7165 })]), [])
})

test('Rounding of the stored prices is tolerated', () => {
  assert.deepEqual(lowered([guardLine({ unitPrice: 3869.47, weightGrams: 7165 }, { unitPrice: 3869.1, weightGrams: 7165 })]), [])
  assert.deepEqual(lowered([guardLine({ unitPrice: 3869.09, weightGrams: 7165 }, { unitPrice: 3869.1, weightGrams: 7165 })]), [])
})

test('A deliberate reduction (priceEdited) is allowed; a raise never needs a flag', () => {
  assert.deepEqual(lowered([guardLine({ unitPrice: 500, weightGrams: 1000, priceEdited: true }, { unitPrice: 540, weightGrams: 1000 })]), [])
  assert.deepEqual(lowered([guardLine({ unitPrice: 560, weightGrams: 1000 }, { unitPrice: 540, weightGrams: 1000 })]), [])
})

test('Only existing B2B weight lines are checked', () => {
  const drop = { unitPrice: 518, weightGrams: 1000 }
  const prior = { unitPrice: 540, weightGrams: 1000 }
  assert.deepEqual(lowered([guardLine(drop, prior)], 'App', 'App'), [])
  assert.deepEqual(lowered([guardLine(drop, prior)], 'B2B', 'App'), [])
  assert.deepEqual(lowered([guardLine(drop, prior, { isWeightMode: false })]), [])
  assert.deepEqual(lowered([guardLine(drop, null)]), [])
  assert.deepEqual(lowered([guardLine({ unitPrice: 0, weightGrams: 0 }, prior)]), [])
})

test('Error text names the product and both rates', () => {
  const text = rate.describeLoweredRates(rate.findLoweredB2BRates('B2B', 'B2B', [guardLine({ unitPrice: 518, weightGrams: 1000 }, { unitPrice: 540, weightGrams: 1000 })]))
  assert.ok(text.includes('عكاوى') && text.includes('540') && text.includes('518'))
})

// ───────────────────────── CS save guard ─────────────────────────
const PRODUCTS = [
  { id: 'w1', productName: 'عكاوى', pricingMode: 'weight', basePrice: 518, offerPrice: null },
  { id: 'u1', productName: 'Unit product', pricingMode: 'unit', basePrice: 100, offerPrice: null },
]

function csHarness(orderType, existingItems) {
  const ops = []
  const order = {
    id: 'order', appOrderNo: 'T1', customerId: 'c1', orderType, orderStatus: 'تم',
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
    '@/lib/b2bLineRate': rate,
  })
  const writes = () => ops.filter((o) => ['order_items', 'orders', 'order_delivery'].includes(o.table))
  return {
    writes,
    insertedItems: () => (ops.find((o) => o.table === 'order_items' && o.op === 'insert') || { payload: [] }).payload,
    put: (items, type = orderType) => route.PUT(
      { url: 'https://example.test/api/orders/order', json: async () => ({
        role: 'cs', createdBy: 'Test', orderStatus: 'تم', orderType: type, paymentMethod: 'Cash',
        orderMethod: 'App', orderReceiver: 'Test', customerSource: 'Facebook', notes: '', items,
      }) },
      { params: { id: 'order' } },
    ),
  }
}
const savedLine = (id, productId, unitPrice, weightGrams, extra = {}) => ({
  id, orderId: 'order', productId, quantity: 1, weightGrams, unitPrice, lineTotal: unitPrice,
  specialInstructions: '', originalQuantity: null, originalWeightGrams: null,
  basePriceSnapshot: 518, offerPriceSnapshot: null, isCustomItem: false, customItemName: null, ...extra,
})
const send = (productId, unitPrice, weightGrams, extra = {}) => ({
  productId, productNameInput: PRODUCTS.find((p) => p.id === productId).productName,
  quantity: 1, weightGrams, unitPrice, specialInstructions: '', ...extra,
})

test('Incident: B2B CS save that drops 540/kg to 518/kg is refused before anything is written', async () => {
  const h = csHarness('B2B', [savedLine('item_A', 'w1', 3869.1, 7165)])
  const res = await h.put([send('w1', 3711.47, 7165)])
  assert.equal(res.status, 409)
  assert.equal(res.body.code, 'B2B_PRICE_LOWERED')
  assert.equal(res.body.lines[0].priorPerKg, 540)
  assert.equal(res.body.lines[0].incomingPerKg, 518)
  assert.deepEqual(h.writes(), [])
})

test('Same save keeping the agreed rate goes through and keeps the price', async () => {
  const h = csHarness('B2B', [savedLine('item_A', 'w1', 3869.1, 7165)])
  const res = await h.put([send('w1', 3869.1, 7165)])
  assert.equal(res.status, 200)
  assert.equal(h.insertedItems()[0].unitPrice, 3869.1)
})

test('Agent-edited lower price is accepted when flagged', async () => {
  const h = csHarness('B2B', [savedLine('item_A', 'w1', 3869.1, 7165)])
  const res = await h.put([send('w1', 3711.47, 7165, { priceEdited: true })])
  assert.equal(res.status, 200)
  assert.equal(h.insertedItems()[0].unitPrice, 3711.47)
  assert.equal('priceEdited' in h.insertedItems()[0], false)
})

test('Non-B2B orders and unit-priced lines are not affected', async () => {
  const app = csHarness('App', [savedLine('item_A', 'w1', 3869.1, 7165)])
  assert.equal((await app.put([send('w1', 3711.47, 7165)])).status, 200)
  const unit = csHarness('B2B', [savedLine('item_B', 'u1', 200, 1000)])
  assert.equal((await unit.put([send('u1', 100, 1000)])).status, 200)
})

test('A new weight line added to a B2B order is not checked', async () => {
  const h = csHarness('B2B', [savedLine('item_B', 'u1', 100, 1000)])
  assert.equal((await h.put([send('u1', 100, 1000), send('w1', 518, 1000)])).status, 200)
})

test('One lowered line refuses the whole save', async () => {
  const h = csHarness('B2B', [savedLine('item_A', 'w1', 540, 1000), savedLine('item_B', 'u1', 100, 1000)])
  const res = await h.put([send('w1', 518, 1000), send('u1', 150, 1000, { priceEdited: true })])
  assert.equal(res.status, 409)
  assert.deepEqual(h.writes(), [])
})

// ───────────────────────── CS order form (tiny hooks runtime) ─────────────────────────
function loadForm(mocks) {
  const filename = path.join(process.env.TEST_ROOT || path.join(__dirname, '..'), 'src', 'components', 'orders', 'OrderForm.tsx')
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const module = { exports: {} }
  vm.runInNewContext(code, {
    module, exports: module.exports, URLSearchParams, encodeURIComponent, Promise, Object, Array, JSON, Math, Number, String,
    Map, Set, Date, Boolean, Error, isNaN: Number.isNaN, window: mocks.window, document: mocks.document,
    fetch: (...args) => mocks.fetch(...args),
    console: { ...console, error() {}, warn() {}, info() {} },
    require(name) {
      if (!(name in mocks.modules)) throw new Error(`Unexpected dependency: ${name}`)
      return mocks.modules[name]
    },
  }, { filename })
  return module.exports.default
}

const FORM_PRODUCTS = [
  {
    id: 'w1', productName: 'عكاوى', pricingMode: 'weight', isActive: true, basePrice: 600, offerPrice: null, weightGrams: 1000,
    prices: { b2b: { basePrice: 518, offerPrice: null } },
  },
]
const savedB2BOrder = (orderType = 'B2B') => ({
  id: 'order', appOrderNo: 'T1', orderType, orderStatus: 'تم', paymentMethod: 'Cash', orderMethod: 'App',
  orderReceiver: 'Test', customerSource: 'Facebook', customerType: 'قديم', orderDate: '2026-11-02',
  customer: { phone: '0100', customerName: 'Client' },
  address: { id: 'a1', area: 'Maadi', subArea: '', streetAddress: 'Street 1', addressLabel: 'Home' },
  items: [{ id: 'item_A', productId: 'w1', productName: 'عكاوى', quantity: 1, weightGrams: 7165, unitPrice: 3869.1, isCustomItem: false }],
})

function mountForm({ orderType = 'B2B', putStatus = 200, putBody = { order: {} } } = {}) {
  const hooks = []
  let cursor = 0
  let dirty = false
  let effects = []
  let pending = 0
  const sent = []
  const toasts = []
  const sameDeps = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]))
  const react = {
    Fragment: 'fragment',
    useState(init) {
      const i = cursor++
      if (!(i in hooks)) hooks[i] = typeof init === 'function' ? init() : init
      return [hooks[i], (v) => {
        const next = typeof v === 'function' ? v(hooks[i]) : v
        if (!Object.is(next, hooks[i])) { hooks[i] = next; dirty = true }
      }]
    },
    useMemo(fn, deps) {
      const i = cursor++
      if (hooks[i] && sameDeps(hooks[i].deps, deps)) return hooks[i].value
      hooks[i] = { deps, value: fn() }
      return hooks[i].value
    },
    useEffect(fn, deps) {
      const i = cursor++
      if (hooks[i] && sameDeps(hooks[i].deps, deps)) return
      hooks[i] = { deps }
      effects.push(fn)
    },
  }
  const jsx = (type, props) => ({ type, props })
  const respond = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => structuredClone(body), text: async () => '' })
  const fetchMock = async (url, init = {}) => {
    pending++
    await new Promise((r) => setImmediate(r))
    pending--
    const method = init.method || 'GET'
    if (url.startsWith('/api/products?columns=lite')) return respond(200, { products: FORM_PRODUCTS })
    if (url.startsWith('/api/products?id=')) return respond(200, { product: FORM_PRODUCTS[0] })
    if (url === '/api/delivery-zones') return respond(200, { zones: [{ area: 'Maadi' }] })
    if (url === '/api/order-settings') return respond(200, { options: {} })
    if (url === '/api/catalogues') return respond(200, { catalogues: catalogue.DEFAULT_CATALOGUES })
    if (url.startsWith('/api/customers')) return respond(200, { addresses: [] })
    if (url === '/api/orders/order' && method === 'PUT') {
      sent.push(JSON.parse(init.body))
      return respond(putStatus, putBody)
    }
    if (url === '/api/orders/order') return respond(200, { order: savedB2BOrder(orderType) })
    return respond(404, {})
  }
  const Form = loadForm({
    fetch: fetchMock,
    window: { sessionStorage: { setItem() {} }, setInterval: () => 1, clearInterval() {}, addEventListener() {}, removeEventListener() {} },
    document: { visibilityState: 'hidden', addEventListener() {}, removeEventListener() {} },
    modules: {
      react,
      'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
      'next/navigation': { useRouter: () => ({ push() {}, replace() {} }), useSearchParams: () => ({ get: () => null }) },
      'react-hot-toast': Object.assign((m) => toasts.push(m), { error: (m) => toasts.push(m), success: (m) => toasts.push(m) }),
      '@/lib/auth': { useAuthStore: () => ({ user: { id: 'u1', name: 'CS', role: 'cs' } }) },
      '@/lib/cairoTime': { cairoDateString: () => '2026-11-10', cairoTimeString: () => '10:00', formatCairoFriendly: () => 'date' },
      '@/lib/imageCompression': { compressImage: async (x) => x },
      '@/lib/discountCodeInfo': { useDiscountCodeInfo: () => ({}) },
      '@/lib/b2bLineRate': rate,
      '@/lib/catalogue': catalogue,
      './WhatsAppShare': { default: () => null },
      './ImageLightbox': { default: () => null },
    },
  })
  let tree
  const render = () => { cursor = 0; effects = []; tree = Form({ mode: 'edit', orderId: 'order' }); for (const e of effects) e() }
  const settle = async () => {
    for (let n = 0; n < 60; n++) {
      dirty = false
      render()
      await new Promise((r) => setImmediate(r))
      if (!dirty && pending === 0) return
    }
    throw new Error('did not settle')
  }
  const all = (n, pred) => (Array.isArray(n) ? n.flatMap((x) => all(x, pred)) : !n || typeof n !== 'object' ? [] : [...(pred(n) ? [n] : []), ...all(n.props && n.props.children, pred)])
  const weightInput = () => all(tree, (n) => typeof n.type === 'function' && n.props && 'pricePerKg' in n.props)[0]
  const priceInput = () => all(tree, (n) => n.type === 'input' && n.props.type === 'number' && n.props.min !== 1 && 'readOnly' in n.props)[0]
  const nameInput = () => all(tree, (n) => n.type === 'input' && String(n.props.list || '').startsWith('products-'))[0]
  const formEl = () => all(tree, (n) => n.type === 'form')[0]
  // What WeightKgInput does on typing: grams from kg, price from its pricePerKg prop.
  const typeWeightKg = async (kg) => {
    const w = weightInput().props
    w.onChange({ weightGrams: Math.round(kg * 1000), unitPrice: Math.round(w.pricePerKg * kg * 100) / 100 })
    await settle()
  }
  const submit = async () => { await formEl().props.onSubmit({ preventDefault() {} }); await settle() }
  return { settle, weightInput, priceInput, nameInput, typeWeightKg, submit, sent, toasts, get tree() { return tree }, edit: async (fn) => { fn(); await settle() } }
}

test('Form: a saved B2B line keeps its own 540/kg when the weight is retyped (incident)', async () => {
  const h = mountForm()
  await h.settle()
  assert.ok(Math.abs(h.weightInput().props.pricePerKg - 540) < 0.001)
  await h.typeWeightKg(8)
  assert.equal(h.priceInput().props.value, 4320)
  assert.ok(Math.abs(h.weightInput().props.pricePerKg - 540) < 0.001)
})

test('Form: a non-B2B order still follows the catalogue price per kg', async () => {
  const h = mountForm({ orderType: 'App' })
  await h.settle()
  assert.equal(h.weightInput().props.pricePerKg, 600)
})

test('Form: typing a new price on a B2B line makes that the line rate and flags it', async () => {
  const h = mountForm()
  await h.settle()
  await h.edit(() => h.priceInput().props.onChange({ target: { value: '8200' } }))
  assert.ok(Math.abs(h.weightInput().props.pricePerKg - 8200 / 7.165) < 0.001)
  await h.submit()
  assert.equal(h.sent.length, 1)
  const line = h.sent[0].items[0]
  assert.equal(line.priceEdited, true)
  assert.equal(line.unitPrice, 8200)
  assert.equal('ratePerKg' in line, false)
})

test('Form: an untouched save sends the saved price, no flag and no client-only field', async () => {
  const h = mountForm()
  await h.settle()
  await h.typeWeightKg(8)
  await h.submit()
  const line = h.sent[0].items[0]
  assert.equal(line.unitPrice, 4320)
  assert.equal(line.priceEdited, false)
  assert.equal('ratePerKg' in line, false)
})

test('Form: choosing a product again starts from the catalogue price', async () => {
  const h = mountForm()
  await h.settle()
  await h.edit(() => h.nameInput().props.onChange({ target: { value: 'عكاوى' } }))
  await h.settle()
  assert.equal(h.weightInput().props.pricePerKg, 518)
})

test('Form: the server\'s price-lowered refusal is shown to the agent', async () => {
  const h = mountForm({ putStatus: 409, putBody: { error: 'سعر الكيلو انخفض', code: 'B2B_PRICE_LOWERED' } })
  await h.settle()
  await h.submit()
  assert.ok(h.toasts.includes('سعر الكيلو انخفض'))
})

test('Form: a successful save clears the edited flags', async () => {
  const h = mountForm()
  await h.settle()
  await h.edit(() => h.priceInput().props.onChange({ target: { value: '8200' } }))
  await h.submit()
  await h.submit()
  assert.equal(h.sent[0].items[0].priceEdited, true)
  assert.equal(h.sent[1].items[0].priceEdited, false)
})
