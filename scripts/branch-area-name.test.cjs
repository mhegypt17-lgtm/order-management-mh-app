const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const ts = require('typescript')

function load(file, mocks, jsx = false) {
  const filename = path.join(__dirname, '..', ...file.split('/'))
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
      ...(jsx ? { jsx: ts.JsxEmit.ReactJSX } : {}),
    },
  }).outputText
  const module = { exports: {} }
  vm.runInNewContext(code, {
    module, exports: module.exports, encodeURIComponent, String,
    console: { ...console, error() {}, warn() {} },
    require(name) {
      if (!(name in mocks)) throw new Error(`Unexpected dependency: ${name}`)
      return mocks[name]
    },
  }, { filename })
  return module.exports
}

const { formatAreaName } = load('src/lib/addressArea.ts', {})

test('Area and sub-area are joined', () => {
  assert.equal(formatAreaName('التجمع الخامس', 'التجمع'), 'التجمع الخامس - التجمع')
})

test('Area alone, and an identical sub-area is not repeated', () => {
  assert.equal(formatAreaName('مدينه نصر', ''), 'مدينه نصر')
  assert.equal(formatAreaName('مدينه نصر', null), 'مدينه نصر')
  assert.equal(formatAreaName('مدينه نصر', 'مدينه نصر'), 'مدينه نصر')
})

test('Doubled spaces and padding are tidied (real data has "زهراء  المعادى")', () => {
  assert.equal(formatAreaName('  زهراء  المعادى ', ' اشجار   دارنا '), 'زهراء المعادى - اشجار دارنا')
})

test('A sub-area without an area still shows; nothing at all gives an empty string', () => {
  assert.equal(formatAreaName('', 'وان قطاميه'), 'وان قطاميه')
  assert.equal(formatAreaName(undefined, undefined), '')
  assert.equal(formatAreaName(null, null), '')
  assert.equal(formatAreaName('   ', '   '), '')
})

// The dispatch message: render the component with a minimal hooks stub.
function message(props) {
  let rendered
  const Share = load('src/components/orders/DeliveryDispatchShare.tsx', {
    react: { useMemo: (fn) => fn() },
    'react-hot-toast': { default: { success() {}, error() {} }, __esModule: true },
    'react/jsx-runtime': { jsx: (type, p) => ({ type, props: p }), jsxs: (type, p) => ({ type, props: p }) },
  }, true).default
  rendered = Share({
    appOrderNo: '041126app2', customerName: 'Test', customerPhone: '0100', streetAddress: 'Street 1',
    googleMapsLink: '', itemCount: 3, ...props,
  })
  const find = (n, pred) => (Array.isArray(n) ? n.flatMap((x) => find(x, pred)) : !n || typeof n !== 'object' ? [] : [...(pred(n) ? [n] : []), ...find(n.props && n.props.children, pred)])
  return find(rendered, (n) => n.type === 'textarea')[0].props.value
}

test('Dispatch message includes the area line between the phone and the address', () => {
  const lines = message({ areaName: 'التجمع الخامس - التجمع' }).split('\n')
  const i = lines.findIndex((l) => l.includes('المنطقة'))
  assert.equal(lines[i], '🏘️ المنطقة: التجمع الخامس - التجمع')
  assert.ok(lines[i - 1].includes('الموبايل'))
  assert.ok(lines[i + 1].includes('العنوان'))
})

test('Dispatch message is unchanged when the address has no area', () => {
  for (const areaName of [undefined, '']) {
    const m = message({ areaName })
    assert.ok(!m.includes('المنطقة'))
    assert.equal(m.split('\n').length, 7)
  }
})

test('Dispatch message keeps the map link and item count', () => {
  const m = message({ areaName: 'مدينه نصر', googleMapsLink: 'https://maps.example/x' })
  assert.ok(m.includes('🗺️ الموقع: https://maps.example/x'))
  assert.ok(m.includes('📦 عدد الأصناف: *3*'))
  assert.equal(m.split('\n').length, 9)
})

// The branch order page shows the same value (source check — the page is a large
// client component, so assert on its wiring rather than rendering it).
test('Branch order page shows the area row and passes it to the dispatch message', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'app', 'branch', '[id]', 'page.tsx'), 'utf8')
  assert.ok(src.includes('<span className="font-semibold">المنطقة:</span> {formatAreaName(order.address?.area, order.address?.subArea) || \'-\'}'))
  assert.ok(src.includes('areaName={formatAreaName(order.address?.area, order.address?.subArea)}'))
  assert.ok(src.includes("import { formatAreaName } from '@/lib/addressArea'"))
  const area = src.indexOf('المنطقة:'), address = src.indexOf('العنوان:</span>')
  assert.ok(area > 0 && address > area, 'area row sits just above the address row')
})
