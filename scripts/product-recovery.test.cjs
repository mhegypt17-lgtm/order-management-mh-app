const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')

function load(file, mocks, globals = {}) {
  const filename = path.join(root, ...file.split('/'))
  const source = fs.readFileSync(filename, 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const module = { exports: {} }
  vm.runInNewContext(output, {
    module, exports: module.exports, console, ...globals,
    require(name) {
      if (Object.hasOwn(mocks, name)) return mocks[name]
      throw new Error(`Unexpected import: ${name}`)
    },
  }, { filename })
  return module.exports
}

const catalogue = load('src/lib/catalogue.ts', {})
const product = {
  id: 'test-product', productName: 'Test product', productCategory: 'Test category',
  basePrice: 162, offerPrice: 158, isActive: true, isTargeted: false,
  onlineEnabled: true, stockStatus: 'available', updatedAt: 'old timestamp',
  prices: { instashop: { basePrice: 210, offerPrice: null } },
}
const event = { stopPropagation() {}, preventDefault() {} }

function pageHarness(rows = [product], catalogueKey = 'online', confirmResult = true, failWrites = false) {
  const cells = []
  let cursor = 0
  const requests = []
  const reads = []
  const confirmations = []
  const messages = []
  const toast = Object.assign((message) => messages.push(message), {
    error: (message) => messages.push(message), success: (message) => messages.push(message),
  })
  const Page = load('src/app/admin/products/page.tsx', {
    react: {
      useState(initial) {
        const i = cursor++
        if (!(i in cells)) cells[i] = initial
        return [cells[i], (next) => { cells[i] = typeof next === 'function' ? next(cells[i]) : next }]
      },
      useRef(initial) {
        const i = cursor++
        if (!(i in cells)) cells[i] = { current: initial }
        return cells[i]
      },
      useMemo: (fn) => fn(), useEffect() {},
    },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'next/link': { default: 'a', __esModule: true },
    'react-hot-toast': { default: toast, __esModule: true },
    '@/lib/useProductCategories': { useProductCategories: () => ({ activeCategories: [], compareCategories: (a, b) => a.localeCompare(b) }) },
    '@/lib/useCatalogues': { useCatalogues: () => ({ activeCatalogues: catalogue.DEFAULT_CATALOGUES }) },
    '@/lib/auth': { useAuthStore: () => ({ user: { role: 'admin', name: 'Test admin' } }) },
    '@/lib/catalogue': catalogue,
  }, {
    confirm(message) { confirmations.push(message); return confirmResult },
    async fetch(url, options) {
      if (options) requests.push({ url, method: options.method, body: JSON.parse(options.body) })
      else reads.push(url)
      return { ok: !(options && failWrites), json: async () => ({ products: rows }) }
    },
  }).default
  function render() { cursor = 0; return Page() }
  render()
  cells[0] = catalogueKey
  cells[1] = structuredClone(rows)
  cells[2] = false
  return { render, requests, reads, confirmations, messages }
}

function nodes(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap((node) => nodes(node, predicate))
  if (!tree || typeof tree !== 'object') return []
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)]
}
function text(node) {
  if (Array.isArray(node)) return node.map(text).join('')
  if (!node || typeof node === 'boolean') return ''
  return typeof node === 'object' ? text(node.props?.children) : String(node)
}
function button(tree, label) {
  const found = nodes(tree, (node) => node.type === 'button' && text(node).includes(label))[0]
  assert.ok(found, `Missing button: ${label}`)
  return found
}
function showExcluded(h) {
  const label = nodes(h.render(), (node) => node.type === 'label' && text(node).includes('عرض المنتجات خارج الكتالوج'))[0]
  nodes(label, (node) => node.type === 'input')[0].props.onChange({ target: { checked: true } })
}
async function submitModal(h, field, value, type = 'text') {
  button(h.render(), 'تعديل').props.onClick(event)
  const input = nodes(h.render(), (node) => node.type === 'input' && node.props.name === field)[0]
  assert.ok(input, `Missing field: ${field}`)
  input.props.onChange({ target: { name: field, value, type } })
  await nodes(h.render(), (node) => node.type === 'form')[0].props.onSubmit(event)
}

test('Excluded Online product is discoverable and restored without prices or extra reads', async () => {
  const h = pageHarness([{ ...product, onlineEnabled: false }])
  assert.equal(text(h.render()).includes('Test product'), false)
  showExcluded(h)
  assert.ok(text(h.render()).includes('Test product'))
  await button(h.render(), 'إعادة لأونلاين').props.onClick(event)
  assert.deepEqual(h.requests, [{ url: '/api/products', method: 'PUT', body: { id: product.id, onlineEnabled: true } }])
  assert.equal(h.confirmations.length, 0)
  assert.equal(h.reads.length, 0)
})

test('Cancelled Online and Instashop removals do not write', async () => {
  for (const key of ['online', 'instashop']) {
    const h = pageHarness([product], key, false)
    await button(h.render(), 'ضمن الكتالوج').props.onClick(event)
    assert.equal(h.confirmations.length, 1)
    assert.equal(h.requests.length, 0)
    assert.ok(text(h.render()).includes('ضمن الكتالوج'))
  }
})

test('Confirmed Online removal writes only membership', async () => {
  const h = pageHarness()
  await button(h.render(), 'ضمن الكتالوج').props.onClick(event)
  assert.deepEqual(h.requests[0].body, { id: product.id, onlineEnabled: false })
  assert.equal(text(h.render()).includes('Test product'), false)
})

test('Failed membership restoration rolls back and reports the failure', async () => {
  const h = pageHarness([{ ...product, onlineEnabled: false }], 'online', true, true)
  showExcluded(h)
  await button(h.render(), 'إعادة لأونلاين').props.onClick(event)
  assert.ok(button(h.render(), 'إعادة لأونلاين'))
  assert.ok(h.messages.some((message) => message.includes('تعذر تنفيذ العملية')))
})

test('Excluded non-Online products require explicit addition before editing prices', async () => {
  const h = pageHarness([{ ...product, prices: {} }], 'instashop')
  showExcluded(h)
  const tree = h.render()
  assert.equal(nodes(tree, (node) => typeof node.type === 'function' && node.type.name === 'InlinePriceCell').length, 0)
  assert.equal(button(tree, 'تعديل').props.disabled, true)
  await button(tree, 'إضافة للكتالوج').props.onClick(event)
  assert.equal(h.requests[0].url, '/api/products/prices')
  assert.equal(h.requests[0].body.basePrice, 162)
})

test('Target toggle from Instashop sends no catalogue prices or unrelated flags', async () => {
  const h = pageHarness([product], 'instashop')
  await button(h.render(), 'غير مستهدف').props.onClick(event)
  assert.deepEqual(h.requests[0].body, { id: product.id, isTargeted: true })
})

test('Active toggle sends only active flag', async () => {
  const h = pageHarness()
  const input = nodes(h.render(), (node) => node.type === 'input' && node.props.checked === true && node.props.type === 'checkbox')[0]
  await input.props.onChange(event)
  assert.deepEqual(h.requests[0].body, { id: product.id, isActive: false })
})

test('Inline Online price edit does not resubmit visibility, stock, or timestamps', async () => {
  const h = pageHarness()
  const cell = nodes(h.render(), (node) => typeof node.type === 'function' && node.type.name === 'InlinePriceCell')[0]
  await cell.props.onSave(170)
  assert.deepEqual(h.requests[0].body, { id: product.id, basePrice: 170 })
})

test('Modal saves only edited fields in Online and Instashop', async () => {
  for (const key of ['online', 'instashop']) {
    const h = pageHarness([product], key)
    await submitModal(h, 'productName', 'Updated name')
    assert.equal(h.requests.length, 1)
    assert.deepEqual(h.requests[0], { url: '/api/products', method: 'PUT', body: { id: product.id, productName: 'Updated name' } })
  }
})

test('Instashop modal price edit updates only the chosen catalogue price', async () => {
  const h = pageHarness([product], 'instashop')
  await submitModal(h, 'basePrice', '220', 'number')
  assert.equal(h.requests.length, 1)
  assert.deepEqual(h.requests[0], {
    url: '/api/products/prices', method: 'PATCH',
    body: { productId: product.id, catalogueKey: 'instashop', basePrice: 220, role: 'admin', actor: 'Test admin' },
  })
})

test('Modal supports clearing an offer and changing pricing mode', async () => {
  const h = pageHarness()
  await submitModal(h, 'offerPrice', '', 'number')
  assert.deepEqual(h.requests[0].body, { id: product.id, offerPrice: null })
  const next = pageHarness()
  button(next.render(), 'تعديل').props.onClick(event)
  const radio = nodes(next.render(), (node) => node.type === 'input' && node.props.name === 'pricingMode' && node.props.value === 'weight')[0]
  radio.props.onChange()
  await nodes(next.render(), (node) => node.type === 'form')[0].props.onSubmit(event)
  assert.deepEqual(next.requests[0].body, { id: product.id, pricingMode: 'weight' })
})

test('Creating a product still sends form values and the selected catalogue', async () => {
  const h = pageHarness([], 'instashop')
  button(h.render(), 'إضافة منتج جديد').props.onClick()
  for (const [field, value, type] of [
    ['productName', 'New product', 'text'],
    ['productCategory', 'Test category', 'text'],
    ['basePrice', '220', 'number'],
  ]) {
    const input = nodes(h.render(), (node) => node.props?.name === field)[0]
    input.props.onChange({ target: { name: field, value, type } })
  }
  await nodes(h.render(), (node) => node.type === 'form')[0].props.onSubmit(event)
  assert.equal(h.requests[0].method, 'POST')
  assert.equal(h.requests[0].body.catalogueKey, 'instashop')
  assert.equal(h.requests[0].body.basePrice, 220)
  assert.equal(h.requests[0].body.isActive, true)
  assert.equal(Object.hasOwn(h.requests[0].body, 'onlineEnabled'), false)
})

function routeHarness() {
  const writes = []
  const mirrors = []
  const current = structuredClone(product)
  const route = load('src/app/api/products/route.ts', {
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } },
    '@/lib/catalogue': catalogue,
    '@/lib/supabase': {
      supabase: {
        from(table) {
          return {
            select() { return this }, eq() { return this },
            single: async () => ({ data: { ...current }, error: null }),
            update(patch) { writes.push(structuredClone(patch)); Object.assign(current, patch); return this },
            upsert: async (row) => { mirrors.push(row); return { error: null } },
          }
        },
      },
    },
  })
  return { put: (body) => route.PUT({ json: async () => body }), writes, mirrors, current }
}

test('API price patch preserves latest flags and replaces stale browser timestamp', async () => {
  const h = routeHarness()
  const response = await h.put({ id: product.id, basePrice: 170, updatedAt: 'stale', createdAt: 'forged', prices: {} })
  assert.equal(response.status, 200)
  assert.deepEqual(Object.keys(h.writes[0]).sort(), ['basePrice', 'updatedAt'])
  assert.ok(Number.isFinite(Date.parse(h.writes[0].updatedAt)))
  assert.equal(h.current.onlineEnabled, true)
  assert.equal(h.current.isActive, true)
  assert.equal(h.current.offerPrice, 158)
  assert.equal(h.mirrors.length, 1)
})

test('API membership restore keeps prices and avoids price mirror writes', async () => {
  const h = routeHarness()
  h.current.onlineEnabled = false
  const response = await h.put({ id: product.id, onlineEnabled: true })
  assert.equal(response.status, 200)
  assert.equal(h.current.onlineEnabled, true)
  assert.equal(h.current.basePrice, 162)
  assert.equal(h.mirrors.length, 0)
  assert.deepEqual(Object.keys(h.writes[0]).sort(), ['onlineEnabled', 'updatedAt'])
})

test('API rejects invalid flags and empty changes without writing', async () => {
  for (const body of [{ id: product.id, onlineEnabled: 'false' }, { id: product.id, prices: {} }]) {
    const h = routeHarness()
    assert.equal((await h.put(body)).status, 400)
    assert.equal(h.writes.length, 0)
  }
})
