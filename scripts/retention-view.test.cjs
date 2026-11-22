const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const ts = require('typescript')

const ROOT = process.env.TEST_ROOT || path.join(__dirname, '..')
function load(file, mocks, jsx = false) {
  const filename = path.join(ROOT, ...file.split('/'))
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
      ...(jsx ? { jsx: ts.JsxEmit.ReactJSX } : {}),
    },
  }).outputText
  const module = { exports: {} }
  vm.runInNewContext(code, {
    module, exports: module.exports, URL, Promise, Object, Array, JSON, Math, Number, String, Map, Set, Date, Error, RegExp,
    isFinite, console: { ...console, error() {}, warn() {} },
    require(name) {
      if (!(name in mocks)) throw new Error(`Unexpected dependency: ${name}`)
      return mocks[name]
    },
  }, { filename })
  return module.exports
}
const plain = (v) => JSON.parse(JSON.stringify(v))
const paged = load('src/lib/pagedRead.ts', {})
const view = load('src/lib/retentionView.ts', {})
const lateEditLib = load('src/lib/lateEdit.ts', {})

// ───────────────────────── readAllPages ─────────────────────────
const pageOf = (total, size, calls) => async (from, to) => {
  calls.push([from, to])
  const rows = []
  for (let i = from; i <= Math.min(to, total - 1); i++) rows.push(i)
  return { data: rows, error: null }
}

test('readAllPages reads every page, not just the first 1000', async () => {
  const calls = []
  const { rows, error } = await paged.readAllPages(pageOf(2500, 1000, calls))
  assert.equal(error, null)
  assert.equal(rows.length, 2500)
  assert.deepEqual(plain(calls), [[0, 999], [1000, 1999], [2000, 2999]])
})

test('readAllPages: exact multiple of the page size stops on the empty page; small sets use one request', async () => {
  const exact = []
  assert.equal((await paged.readAllPages(pageOf(2000, 1000, exact))).rows.length, 2000)
  assert.equal(exact.length, 3)
  const small = []
  assert.equal((await paged.readAllPages(pageOf(5, 1000, small))).rows.length, 5)
  assert.equal(small.length, 1)
  assert.equal((await paged.readAllPages(pageOf(0, 1000, []))).rows.length, 0)
})

test('readAllPages reports an error and does not pretend the read was complete', async () => {
  let n = 0
  const res = await paged.readAllPages(async () => (++n === 2 ? { data: null, error: { message: 'boom' } } : { data: new Array(1000).fill(1), error: null }))
  assert.equal(res.error, 'boom')
  assert.equal(res.rows.length, 1000)
})

// ───────────────────────── view helpers ─────────────────────────
const row = (id, days, intel, extra = {}) => ({ id, name: `Name ${id}`, phone: '0100000' + id, days, lastMs: 0, intel, openComplaints: 0, ...extra })
const intel = (totalRevenue, churnRisk = 'Low', typicalIntervalDays = null) => ({
  lifecycleStage: 'Active', churnRisk, healthScore: 50, totalOrders: 3, totalRevenue, typicalIntervalDays,
})

test('overdueRatio compares days inactive with the customer\'s own rhythm', () => {
  assert.equal(view.overdueRatio(127, 21), 6)
  assert.equal(view.overdueRatio(100, 30), 3.3)
  assert.equal(view.overdueRatio(100, null), null)
  assert.equal(view.overdueRatio(100, 0), null)
})

test('sortRows: by value, overdue ratio and risk; rows without scores go last; ties fall back to days', () => {
  const rows = [
    row('a', 100, intel(500, 'Low', 50)),
    row('b', 40, intel(20000, 'High', 10)),
    row('c', 90, null),
    row('d', 120, intel(500, 'Medium', 100)),
  ]
  const ids = (key) => view.sortRows(rows, key).map((r) => r.id)
  assert.deepEqual(ids('days'), ['d', 'a', 'c', 'b'])
  assert.deepEqual(ids('value'), ['b', 'd', 'a', 'c'])
  assert.deepEqual(ids('overdue'), ['b', 'a', 'd', 'c'])
  assert.deepEqual(ids('risk'), ['b', 'd', 'a', 'c'])
  assert.deepEqual(rows.map((r) => r.id), ['a', 'b', 'c', 'd'], 'input is not mutated')
})

test('parseSort falls back to days for anything unknown', () => {
  assert.equal(view.parseSort('value'), 'value')
  assert.equal(view.parseSort('nonsense'), 'days')
  assert.equal(view.parseSort(undefined), 'days')
})

test('matchesQuery: name, phone digits and Arabic digits', () => {
  const r = { name: 'Eman Yasser', phone: '01115107058' }
  assert.equal(view.matchesQuery(r, ''), true)
  assert.equal(view.matchesQuery(r, 'yass'), true)
  assert.equal(view.matchesQuery(r, '1510'), true)
  assert.equal(view.matchesQuery(r, '٠١١١٥١٠'), true)
  assert.equal(view.matchesQuery(r, 'zzz'), false)
  assert.equal(view.matchesQuery({ name: 'إيمان', phone: '' }, 'إيمان'), true)
})

test('stageTotals sums past spend and counts customers without a score', () => {
  const t = view.stageTotals([row('a', 1, intel(500)), row('b', 1, intel(1500.5)), row('c', 1, null)])
  assert.deepEqual(plain(t), { count: 3, revenue: 2000.5, withoutScore: 1 })
})

// ───────────────────────── in-memory Supabase (caps un-ranged reads at 1000, like PostgREST) ─────────────────────────
function makeDb(tables) {
  const requests = []
  return {
    requests,
    from(table) {
      const filters = []
      const orders = []
      let range = null
      let head = false
      const q = {
        select(_cols, opts) { if (opts && opts.head) head = true; return q },
        eq(c, v) { filters.push((r) => r[c] === v); return q },
        neq(c, v) { filters.push((r) => r[c] !== v); return q },
        gte(c, v) { filters.push((r) => r[c] >= v); return q },
        gt(c, v) { filters.push((r) => r[c] > v); return q },
        not(c) { filters.push((r) => r[c] !== null && r[c] !== undefined); return q },
        in(c, vals) { filters.push((r) => vals.includes(r[c])); return q },
        or() { return q },
        order(c, o) { orders.push([c, o && o.ascending === false ? -1 : 1]); return q },
        range(a, b) { range = [a, b]; return q },
        then(resolve, reject) {
          let out = (tables[table] || []).filter((r) => filters.every((f) => f(r)))
          for (const [c, dir] of orders.slice().reverse()) out = out.slice().sort((x, y) => (x[c] < y[c] ? -dir : x[c] > y[c] ? dir : 0))
          const [a, b] = range || [0, 999]
          const page = out.slice(a, Math.min(b, a + 999) + 1)
          requests.push({ table, range, head, returned: head ? 0 : page.length })
          if (head) return Promise.resolve({ count: out.length, data: null, error: null }).then(resolve, reject)
          return Promise.resolve({ data: page, error: null }).then(resolve, reject)
        },
      }
      return q
    },
  }
}

const DAY = 86_400_000
const daysAgo = (d) => new Date(Date.now() - d * DAY).toISOString()
const pad = (n) => String(n).padStart(5, '0')

// 1300 customers, 1200 live orders. The last 100 customers' only orders sit beyond the first 1000 rows.
function fixtures() {
  const customers = []
  for (let i = 0; i < 1300; i++) customers.push({ id: `c${pad(i)}`, customerName: `Customer ${i}`, phone: `0100${pad(i)}`, doNotFollowUp: false, followUpSnoozeUntil: null })
  const orders = []
  for (let i = 0; i < 1100; i++) orders.push({ id: `o${pad(i)}`, customerId: `c${pad(i)}`, orderStatus: 'تم', createdAt: daysAgo(5) })
  for (let i = 1100; i < 1200; i++) {
    const days = i < 1140 ? 45 : i < 1180 ? 70 : 100
    orders.push({ id: `o${pad(i)}`, customerId: `c${pad(i)}`, orderStatus: 'تم', createdAt: daysAgo(days) })
  }
  orders.push({ id: 'o99999', customerId: 'c01250', orderStatus: 'لاغي', createdAt: daysAgo(100) })
  const scores = []
  for (let i = 1180; i < 1200; i++) {
    scores.push({
      customerId: `c${pad(i)}`, lifecycleStage: i === 1199 ? 'VIP' : 'At Risk', churnRisk: i % 2 ? 'High' : 'Medium',
      healthScore: 40, totalOrders: 4, totalRevenue: i === 1199 ? 25000 : 1000 + i, typicalIntervalDays: 20, computedAt: '2026-11-21T00:49:00.000Z',
    })
  }
  return { customers, orders, customer_intelligence_scores: scores, tasks: [], complaints: [{ customerId: 'c01181', status: 'open' }, { customerId: 'c01182', status: 'closed' }] }
}

const retentionCfg = {
  enabled: true,
  stage1: { days: 30, action: 'notify', assignedTo: 'auto', cooldownDays: 14 },
  stage2: { days: 60, action: 'notify', assignedTo: 'auto', cooldownDays: 21 },
  stage3: { days: 90, action: 'task', assignedTo: 'auto', cooldownDays: 30 },
}

// ───────────────────────── Retention page ─────────────────────────
const all = (n, pred) => (Array.isArray(n) ? n.flatMap((x) => all(x, pred)) : !n || typeof n !== 'object' ? [] : [...(pred(n) ? [n] : []), ...all(n.props && n.props.children, pred)])
const text = (n) => (Array.isArray(n) ? n.map(text).join('') : !n || typeof n === 'boolean' ? '' : typeof n === 'object' ? text(n.props && n.props.children) : String(n))

async function renderPage(searchParams = {}) {
  const db = makeDb(fixtures())
  const Controls = function Controls() { return null }
  const jsx = (type, props) => ({ type, props })
  const retentionData = load('src/lib/retentionData.ts', {
    '@/lib/supabase': { supabase: db },
    '@/lib/pagedRead': paged,
    '@/lib/retentionView': view,
  })
  const page = load('src/app/admin/retention/page.tsx', {
    'next/headers': { headers: () => ({}) },
    'next/link': { __esModule: true, default: function Link() { return null } },
    '@/lib/supabase': { supabase: db },
    '@/lib/omsData': {
      DEFAULT_RETENTION_CONFIG: retentionCfg,
      readOrderSettings: async () => ({ retention: retentionCfg }),
    },
    '@/lib/pagedRead': paged,
    '@/lib/retentionData': retentionData,
    '@/lib/retentionView': view,
    '@/components/retention/CustomerDetails': { __esModule: true, default: function CustomerDetails() { return null } },
    './CustomerControls': { __esModule: true, default: Controls },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
  }, true).default
  const tree = await page({ searchParams })
  const sections = all(tree, (n) => n.type === 'section')
  const sectionRows = (i) => all(sections[i], (n) => n.type === Controls).map((n) => n.props.customerId)
  const kpi = (needle) => all(tree, (n) => typeof n.type === 'function' && String((n.props || {}).title || '').includes(needle))[0]
  return { tree, db, sectionRows, kpi }
}
let cache
const fixturesCache = () => (cache ||= fixtures())

test('Retention page: customers whose orders are beyond the first 1000 rows are still staged (cap fix)', async () => {
  const { sectionRows, kpi } = await renderPage()
  assert.equal(kpi('مرحلة 1').props.value, 40)
  assert.equal(kpi('مرحلة 2').props.value, 40)
  assert.equal(kpi('مرحلة 3').props.value, 20)
  assert.equal(sectionRows(0).length, 20, 'stage 3 shows all 20 rows')
})

test('Retention page: total customers is the real count, not 1000', async () => {
  const { tree } = await renderPage()
  assert.ok(text(tree).includes('1300'))
})

test('Retention page: the live customer list is never downloaded, only the staged customers', async () => {
  const { db } = await renderPage()
  const customerReads = db.requests.filter((r) => r.table === 'customers' && !r.head)
  const downloaded = customerReads.reduce((s, r) => s + r.returned, 0)
  assert.equal(downloaded, 100, 'only the 100 customers in a stage are read, never the 1300')
  assert.ok(db.requests.filter((r) => r.table === 'orders').length >= 2, 'orders are paged')
})

test('Retention page: sorted by days by default, by spend when asked, and shows the extra columns', async () => {
  const byDays = await renderPage()
  assert.equal(byDays.sectionRows(0)[0], 'c01180', 'oldest...tie broken by order, all 100 days')
  const byValue = await renderPage({ sort: 'value' })
  assert.equal(byValue.sectionRows(0)[0], 'c01199')
  const t = text(byValue.tree)
  assert.ok(t.includes('25,000'), 'spend shown')
  assert.ok(t.includes('VIP'), 'segment shown')
  assert.ok(t.includes('شكوى مفتوحة'), 'open complaint flagged')
  assert.ok(t.includes('متأخر ×5'), 'overdue ratio shown (100 days / every 20)')
})

test('Retention page: the search box filters rows but not the stage totals', async () => {
  const { sectionRows, kpi } = await renderPage({ q: '01199' })
  assert.deepEqual(sectionRows(0), ['c01199'])
  assert.equal(sectionRows(1).length, 0)
  assert.equal(kpi('مرحلة 3').props.value, 20)
})

// ───────────────────────── Notification engine (creates the follow-up tasks) ─────────────────────────
test('Notifications: follow-up tasks are created for customers beyond the first 1000 rows', async () => {
  cache = fixtures()
  const db = makeDb(cache)
  const created = []
  const route = load('src/app/api/notifications/route.ts', {
    'next/server': { NextResponse: { json: (body) => body } },
    'next/cache': { unstable_cache: (fn) => fn },
    '@/lib/supabase': { supabase: db },
    '@/lib/cairoTime': { cairoDateString: () => '2026-11-21', addDays: () => '2026-11-22' },
    '@/lib/complaintLinks': { complaintNotificationHref: () => '/x' },
    '@/lib/lateEdit': lateEditLib,
    '@/lib/pagedRead': paged,
    '@/lib/omsData': {
      DEFAULT_RETENTION_CONFIG: retentionCfg,
      readOrderSettings: async () => ({ retention: retentionCfg }),
      createTask: async (t) => { created.push(t.linkedCustomerId); return { id: `t${created.length}`, linkedCustomerId: t.linkedCustomerId, status: 'جديدة' } },
    },
  })
  const res = await route.GET({ url: 'https://example.test/api/notifications?role=cs&user=x' })
  const stage3 = Array.from({ length: 20 }, (_, i) => `c${pad(1180 + i)}`)
  assert.deepEqual(created.slice().sort(), stage3)
  const inactive = res.items.filter((i) => i.type === 'inactive-customer')
  assert.ok(inactive.length > 0, 'reminders are listed (the bell itself shows at most 50 items)')
})

test('Notifications: a failed order read creates no tasks instead of marking everyone inactive', async () => {
  cache = fixtures()
  const db = makeDb(cache)
  const realFrom = db.from
  let orderReads = 0
  db.from = (table) => {
    const q = realFrom(table)
    if (table !== 'orders') return q
    const realThen = q.then
    const realRange = q.range
    let ranged = false
    q.range = (a, b) => { ranged = true; return realRange(a, b) }
    // Only the paged inactivity read uses .range(); fail its second page.
    q.then = (resolve, reject) => (ranged && ++orderReads === 2
      ? Promise.resolve({ data: null, error: { message: 'timeout' } }).then(resolve, reject)
      : realThen(resolve, reject))
    return q
  }
  const created = []
  const route = load('src/app/api/notifications/route.ts', {
    'next/server': { NextResponse: { json: (body) => body } },
    'next/cache': { unstable_cache: (fn) => fn },
    '@/lib/supabase': { supabase: db },
    '@/lib/cairoTime': { cairoDateString: () => '2026-11-21', addDays: () => '2026-11-22' },
    '@/lib/complaintLinks': { complaintNotificationHref: () => '/x' },
    '@/lib/lateEdit': lateEditLib,
    '@/lib/pagedRead': paged,
    '@/lib/omsData': {
      DEFAULT_RETENTION_CONFIG: retentionCfg,
      readOrderSettings: async () => ({ retention: retentionCfg }),
      createTask: async (t) => { created.push(t.linkedCustomerId); return { id: 't', linkedCustomerId: t.linkedCustomerId, status: 'جديدة' } },
    },
  })
  const res = await route.GET({ url: 'https://example.test/api/notifications?role=cs&user=x' })
  assert.deepEqual(created, [])
  assert.equal(res.items.filter((i) => i.type === 'inactive-customer').length, 0)
})
