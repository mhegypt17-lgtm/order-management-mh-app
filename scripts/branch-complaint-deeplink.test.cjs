const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const ts = require('typescript')

function load(file, mocks, jsx = false) {
  const filename = path.join(process.env.TEST_ROOT || path.join(__dirname, '..'), ...file.split('/'))
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
      ...(jsx ? { jsx: ts.JsxEmit.ReactJSX } : {}),
    },
  }).outputText
  const module = { exports: {} }
  vm.runInNewContext(code, {
    module, exports: module.exports, URLSearchParams, encodeURIComponent, Promise, Object, Array, JSON,
    fetch: (...args) => globalThis.fetch(...args),
    console: { ...console, error() {}, warn() {} },
    require(name) {
      if (!(name in mocks)) throw new Error(`Unexpected dependency: ${name}`)
      return mocks[name]
    },
  }, { filename })
  return module.exports
}

// ── link builder ───────────────────────────────────────────────────────────
const { complaintNotificationHref } = load('src/lib/complaintLinks.ts', {})

test('Branch notifications link to the specific ticket', () => {
  assert.equal(complaintNotificationHref('branch', 'comp_123'), '/branch/complaints?complaintId=comp_123')
  assert.equal(complaintNotificationHref('branch', 'a b&c'), '/branch/complaints?complaintId=a%20b%26c')
})

test('CS and admin links are unchanged', () => {
  for (const role of ['cs', 'admin', '']) assert.equal(complaintNotificationHref(role, 'comp_123'), '/orders/complaints')
})

// ── page behaviour (tiny hooks runtime, mocked requests) ───────────────────
function mount({ initialQuery = '', serverList }) {
  const hooks = []
  let cursor = 0
  let dirty = false
  let effects = []
  let query = new URLSearchParams(initialQuery)
  const fetches = []
  const replaces = []
  let pending = 0

  const sameDeps = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]))
  const react = {
    useState(init) {
      const i = cursor++
      if (!(i in hooks)) hooks[i] = typeof init === 'function' ? init() : init
      return [hooks[i], (v) => {
        const next = typeof v === 'function' ? v(hooks[i]) : v
        if (!Object.is(next, hooks[i])) { hooks[i] = next; dirty = true }
      }]
    },
    useRef(init) {
      const i = cursor++
      if (!(i in hooks)) hooks[i] = { current: init }
      return hooks[i]
    },
    useCallback(fn, deps) {
      const i = cursor++
      if (hooks[i] && sameDeps(hooks[i].deps, deps)) return hooks[i].fn
      hooks[i] = { fn, deps }
      return fn
    },
    useEffect(fn, deps) {
      const i = cursor++
      if (hooks[i] && sameDeps(hooks[i].deps, deps)) return
      hooks[i] = { deps }
      effects.push(fn)
    },
  }
  const jsx = (type, props) => ({ type, props })
  const View = load('src/components/branch/BranchComplaintsView.tsx', {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    'next/navigation': {
      useSearchParams: () => ({ get: (k) => query.get(k) }),
      useRouter: () => ({
        replace(url) { replaces.push(url); query = new URLSearchParams(url.split('?')[1] || ''); dirty = true },
        push(url) { query = new URLSearchParams(url.split('?')[1] || ''); dirty = true },
      }),
    },
    '@/lib/cairoTime': { formatCairoDateTime: () => 'date' },
  }, true).default

  let tree
  const render = () => { cursor = 0; effects = []; tree = View(); for (const e of effects) e() }
  const settle = async () => {
    for (let n = 0; n < 40; n++) {
      dirty = false
      render()
      await new Promise((r) => setImmediate(r))
      if (!dirty && pending === 0) return
    }
    throw new Error('did not settle — possible render/fetch loop')
  }
  globalThis.fetch = async (url) => {
    fetches.push(url)
    pending++
    await new Promise((r) => setImmediate(r))
    pending--
    return { json: async () => JSON.parse(JSON.stringify(serverList.current)) }
  }
  return {
    settle, fetches, replaces,
    setQuery(q) { query = new URLSearchParams(q); dirty = true },
    get tree() { return tree },
    get query() { return query.toString() },
  }
}

const text = (n) => (Array.isArray(n) ? n.map(text).join('') : !n || typeof n === 'boolean' ? '' : typeof n === 'object' ? text(n.props && n.props.children) : String(n))
const all = (n, pred) => (Array.isArray(n) ? n.flatMap((x) => all(x, pred)) : !n || typeof n !== 'object' ? [] : [...(pred(n) ? [n] : []), ...all(n.props && n.props.children, pred)])
const modal = (t) => all(t, (n) => n.type === 'div' && String(n.props.className || '').includes('fixed inset-0'))[0]
const complaint = (id, no) => ({
  id, ticketNumber: no, channel: 'App', subject: `Subject ${no}`, description: '', reason: 'r', status: 'open',
  priority: 'low', assignedTo: '', createdBy: 'cs', compensationAmount: 0, comments: [], openedAt: '2026-11-10T08:00:00Z', closedAt: null,
})
const listRef = (items) => ({ current: items })

test('Opening from a notification shows that ticket directly, using only the normal list load', async () => {
  const h = mount({ initialQuery: 'complaintId=c2', serverList: listRef([complaint('c1', 'T1'), complaint('c2', 'T2')]) })
  await h.settle()
  assert.ok(modal(h.tree), 'ticket modal is open')
  assert.ok(text(modal(h.tree)).includes('#T2'))
  assert.deepEqual(h.fetches, ['/api/complaints'])
})

test('Opening the page normally still shows just the list', async () => {
  const h = mount({ serverList: listRef([complaint('c1', 'T1'), complaint('c2', 'T2')]) })
  await h.settle()
  assert.equal(modal(h.tree), undefined)
  assert.ok(text(h.tree).includes('#T1') && text(h.tree).includes('#T2'))
  assert.deepEqual(h.fetches, ['/api/complaints'])
})

test('Closing clears the link, and tapping the same notification again reopens it without a reload', async () => {
  const h = mount({ initialQuery: 'complaintId=c2', serverList: listRef([complaint('c1', 'T1'), complaint('c2', 'T2')]) })
  await h.settle()
  const close = all(h.tree, (n) => n.type === 'button' && text(n) === '✕')[0]
  close.props.onClick()
  await h.settle()
  assert.equal(modal(h.tree), undefined)
  assert.deepEqual(h.replaces, ['/branch/complaints'])
  assert.equal(h.query, '')
  h.setQuery('complaintId=c2')
  await h.settle()
  assert.ok(modal(h.tree))
  assert.equal(h.fetches.length, 1)
})

test('Backdrop click also closes and clears the link', async () => {
  const h = mount({ initialQuery: 'complaintId=c1', serverList: listRef([complaint('c1', 'T1')]) })
  await h.settle()
  modal(h.tree).props.onClick()
  await h.settle()
  assert.equal(modal(h.tree), undefined)
  assert.equal(h.query, '')
})

test('A ticket opened after the page loaded triggers exactly one reload, then opens', async () => {
  const server = listRef([complaint('c1', 'T1')])
  const h = mount({ serverList: server })
  await h.settle()
  assert.equal(h.fetches.length, 1)
  server.current = [complaint('c9', 'T9'), complaint('c1', 'T1')]
  h.setQuery('complaintId=c9')
  await h.settle()
  assert.ok(text(modal(h.tree)).includes('#T9'))
  assert.equal(h.fetches.length, 2)
})

test('An unknown ticket retries once, shows a notice, never loops', async () => {
  const h = mount({ initialQuery: 'complaintId=gone', serverList: listRef([complaint('c1', 'T1')]) })
  await h.settle()
  assert.equal(modal(h.tree), undefined)
  assert.ok(text(h.tree).includes('تعذر العثور على التذكرة'))
  assert.equal(h.fetches.length, 2)
  await h.settle()
  assert.equal(h.fetches.length, 2)
})

test('Linking to a different ticket while one is open switches to it', async () => {
  const h = mount({ initialQuery: 'complaintId=c1', serverList: listRef([complaint('c1', 'T1'), complaint('c2', 'T2')]) })
  await h.settle()
  h.setQuery('complaintId=c2')
  await h.settle()
  assert.ok(text(modal(h.tree)).includes('#T2'))
  assert.equal(h.fetches.length, 1)
})

test('The notice disappears once the link is gone', async () => {
  const h = mount({ initialQuery: 'complaintId=gone', serverList: listRef([complaint('c1', 'T1')]) })
  await h.settle()
  assert.ok(text(h.tree).includes('تعذر العثور'))
  h.setQuery('')
  await h.settle()
  assert.ok(!text(h.tree).includes('تعذر العثور'))
})
