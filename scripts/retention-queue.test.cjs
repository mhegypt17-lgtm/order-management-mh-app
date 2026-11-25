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
    module, exports: module.exports, URL, Promise, Object, Array, JSON, Math, Number, String, Map, Set, Date, Error, RegExp,
    isFinite, Intl, console: { ...console, error() {}, warn() {} },
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
const queue = load('src/lib/retentionQueue.ts', { '@/lib/retentionView': view })
const feedbackDims = load('src/lib/feedbackDimensions.ts', {})
const detailsLib = load('src/lib/retentionDetails.ts', { '@/lib/feedbackDimensions': feedbackDims, '@/lib/retentionQueue': queue })
const cairo = load('src/lib/cairoTime.ts', {})

const DAY = 86_400_000
const NOW = Date.now()
const daysAgo = (d) => new Date(NOW - d * DAY).toISOString()
const daysAhead = (d) => new Date(NOW + d * DAY).toISOString()

// ───────────────────────── queue rules ─────────────────────────
const intel = (totalRevenue, extra = {}) => ({
  lifecycleStage: 'Active', churnRisk: 'Low', healthScore: 50, totalOrders: 3, totalRevenue, typicalIntervalDays: null, ...extra,
})
const cand = (id, days, i, extra = {}) => ({
  id, name: `Name ${id}`, phone: '0100', days, lastMs: 0, intel: i, openComplaints: 0,
  stage: days >= 90 ? 3 : days >= 60 ? 2 : 1, doNotFollowUp: false, snoozeUntilMs: null, nextCallMs: null, ...extra,
})
const cfg = (over = {}) => ({ minStage: 1, minSpend: 0, dailySize: 25, ...over })
const ids = (list) => list.map((c) => c.id)

test('Queue: high value first, then lateness against own rhythm, then churn risk', () => {
  const q = queue.buildQueue([
    cand('cheap-old', 200, intel(300)),
    cand('vip-late', 100, intel(20000, { typicalIntervalDays: 20, lifecycleStage: 'VIP' })),
    cand('mid-risky', 60, intel(4000, { churnRisk: 'High', typicalIntervalDays: 30 })),
    cand('mid-calm', 100, intel(4000, { churnRisk: 'Low', typicalIntervalDays: 90 })),
  ], cfg(), NOW)
  assert.deepEqual(ids(q.winback), ['vip-late', 'mid-risky', 'mid-calm', 'cheap-old'])
})

test('Queue: opted-out, snoozed and recently contacted customers never appear; expired snooze/next-call do', () => {
  const q = queue.buildQueue([
    cand('optout', 100, intel(500), { doNotFollowUp: true }),
    cand('snoozed', 100, intel(500), { snoozeUntilMs: NOW + DAY }),
    cand('called', 100, intel(500), { nextCallMs: NOW + 3 * DAY }),
    cand('snooze-over', 100, intel(500), { snoozeUntilMs: NOW - DAY }),
    cand('call-due', 100, intel(500), { nextCallMs: NOW - 1000 }),
  ], cfg(), NOW)
  assert.deepEqual(ids(q.winback).sort(), ['call-due', 'snooze-over'])
})

test('Queue: admin rules - minimum stage, minimum spend and daily size (with the remainder reported)', () => {
  const list = [cand('s1', 40, intel(9000)), cand('s2', 70, intel(9000)), cand('s3', 100, intel(100)), cand('s3b', 100, intel(9000)), cand('noscore', 100, null)]
  assert.deepEqual(ids(queue.buildQueue(list, cfg({ minStage: 2 }), NOW).winback).sort(), ['noscore', 's2', 's3', 's3b'])
  assert.deepEqual(ids(queue.buildQueue(list, cfg({ minSpend: 1000 }), NOW).winback).sort(), ['s1', 's2', 's3b'])
  const capped = queue.buildQueue(list, cfg({ dailySize: 2 }), NOW)
  assert.equal(capped.winback.length, 2)
  assert.equal(capped.moreWaiting, 3)
})

test('Queue: open complaints go to a separate service lane that is not capped and is not in win-back', () => {
  const q = queue.buildQueue([
    cand('c1', 100, intel(500), { openComplaints: 1 }),
    cand('c2', 70, intel(900), { openComplaints: 2 }),
    cand('w1', 100, intel(500)),
  ], cfg({ dailySize: 1 }), NOW)
  assert.deepEqual(ids(q.service), ['c1', 'c2'].sort((a, b) => (a === 'c1' ? 0 : 1)))
  assert.deepEqual(ids(q.winback), ['w1'])
  assert.equal(q.moreWaiting, 0)
})

test('sanitizeQueueConfig clamps bad input to safe values', () => {
  assert.deepEqual(plain(queue.sanitizeQueueConfig(undefined)), { minStage: 1, minSpend: 0, dailySize: 25 })
  assert.deepEqual(plain(queue.sanitizeQueueConfig({ minStage: 9, minSpend: -5, dailySize: 99999 })), { minStage: 1, minSpend: 0, dailySize: 200 })
  assert.deepEqual(plain(queue.sanitizeQueueConfig({ minStage: '3', minSpend: '2500', dailySize: '10' })), { minStage: 3, minSpend: 2500, dailySize: 10 })
})

test('nextCallAt: explicit date wins, defaults per result, none for a wrong number, past dates ignored', () => {
  const days = (iso) => Math.round((new Date(iso).getTime() - NOW) / DAY)
  assert.equal(days(queue.nextCallAt('no_answer', NOW)), 1)
  assert.equal(days(queue.nextCallAt('promised', NOW)), 5)
  assert.equal(days(queue.nextCallAt('not_interested', NOW)), 90)
  assert.equal(queue.nextCallAt('wrong_number', NOW), null)
  assert.equal(days(queue.nextCallAt('answered', NOW, daysAhead(40))), 40)
  assert.equal(days(queue.nextCallAt('answered', NOW, daysAgo(40))), 14)
})

test('reasonTag and suggestOpening speak to the situation', () => {
  assert.ok(queue.reasonTag(cand('a', 100, intel(500), { openComplaints: 1 })).includes('شكوى'))
  assert.ok(queue.reasonTag(cand('a', 100, intel(20000, { lifecycleStage: 'VIP', typicalIntervalDays: 20 }))).includes('VIP متأخر ×5'))
  assert.equal(queue.reasonTag(cand('a', 45, intel(100))), '45 يوم بدون طلب')
  const base = { name: 'Eman Yasser', openComplaints: 0, days: 100 }
  assert.ok(queue.suggestOpening({ ...base, openComplaints: 1, lastComplaintReason: 'تأخير' }).includes('الشكوى'))
  assert.ok(queue.suggestOpening({ ...base, weakDimension: { label: 'خدمة التوصيل', score: 1 } }).includes('خدمة التوصيل'))
  assert.ok(queue.suggestOpening({ ...base, favouriteProduct: 'ريب اى' }).includes('ريب اى'))
  assert.ok(queue.suggestOpening(base).includes('100'))
})

// ───────────────────────── outcome tracking ─────────────────────────
const contact = (id, customerId, at, extra = {}) => ({
  id, customerId, agent: 'A', contactedAt: at, result: 'answered', reason: null, offer: null, stage: 2, segment: 'Active', spendAtContact: 1000, ...extra,
})
const order = (customerId, at, total) => ({ customerId, createdAt: at, orderTotal: total })
const byId = (list) => Object.fromEntries(list.map((c) => [c.id, c]))

test('Outcome: an order within 30 days after the call is a win with its revenue; an order before it is not', () => {
  const r = byId(queue.evaluateContacts([
    contact('won', 'c1', daysAgo(20)), contact('before', 'c2', daysAgo(20)), contact('late', 'c3', daysAgo(50)),
  ], [
    order('c1', daysAgo(10), 500), order('c1', daysAgo(5), 250), order('c2', daysAgo(25), 900), order('c3', daysAgo(5), 700),
  ], NOW))
  assert.equal(r.won.outcome, 'won')
  assert.equal(r.won.revenue, 750)
  assert.equal(r.before.outcome, 'pending', 'order before the call is ignored; the call is still within its window')
  assert.equal(r.late.outcome, 'lost', 'order after the 30-day window does not count')
})

test('Outcome: pending until the window has passed, then lost', () => {
  const r = byId(queue.evaluateContacts([contact('young', 'c1', daysAgo(5)), contact('old', 'c2', daysAgo(40))], [], NOW))
  assert.equal(r.young.outcome, 'pending')
  assert.equal(r.old.outcome, 'lost')
})

test('Outcome: one order is credited to one call only (the one it followed), not to every call before it', () => {
  const r = byId(queue.evaluateContacts([
    contact('first', 'c1', daysAgo(20)), contact('second', 'c1', daysAgo(10)),
  ], [order('c1', daysAgo(5), 800)], NOW))
  assert.equal(r.second.outcome, 'won')
  assert.equal(r.second.revenue, 800)
  assert.equal(r.first.outcome, 'lost', 'superseded by the second call, with no order in between')
  assert.equal(r.first.revenue, 0)
})

test('Outcome: reached comes from the result type', () => {
  const r = byId(queue.evaluateContacts([contact('a', 'c1', daysAgo(1), { result: 'no_answer' }), contact('b', 'c2', daysAgo(1), { result: 'promised' })], [], NOW))
  assert.equal(r.a.reached, false)
  assert.equal(r.b.reached, true)
})

test('summarize: counts, win rate over matured calls only, revenue; unknown keys become a dash', () => {
  const ev = queue.evaluateContacts([
    contact('1', 'c1', daysAgo(40), { agent: 'Rana' }), contact('2', 'c2', daysAgo(40), { agent: 'Rana' }),
    contact('3', 'c3', daysAgo(2), { agent: 'Rana' }), contact('4', 'c4', daysAgo(40), { agent: 'Mai', stage: null }),
  ], [order('c1', daysAgo(30), 400)], NOW)
  const rana = queue.summarize(ev, (c) => c.agent).find((g) => g.key === 'Rana')
  assert.deepEqual(plain({ ...rana }), { key: 'Rana', contacts: 3, reached: 3, won: 1, lost: 1, pending: 1, winRate: 50, revenue: 400 })
  assert.equal(queue.summarize(ev, (c) => (c.stage == null ? '' : String(c.stage))).some((g) => g.key === '—'), true)
})

test('Insights: asks for more data first, then reports stage, segment, agent and refusal reasons', () => {
  const few = queue.buildInsights(queue.evaluateContacts([contact('1', 'c1', daysAgo(40))], [], NOW), (s) => `stage ${s}`)
  assert.equal(few.length, 1)
  assert.ok(few[0].includes('غير كافية'))

  const contacts = []
  const orders = []
  for (let i = 0; i < 20; i++) { // stage 1: 80% win
    contacts.push(contact(`a${i}`, `ca${i}`, daysAgo(40), { stage: 1, agent: 'Rana', segment: 'Active' }))
    if (i < 16) orders.push(order(`ca${i}`, daysAgo(30), 100))
  }
  for (let i = 0; i < 20; i++) { // stage 3: 0% win, weak agent, refusals for price
    contacts.push(contact(`b${i}`, `cb${i}`, daysAgo(40), { stage: 3, agent: 'Mai', segment: 'Dormant', result: i < 8 ? 'not_interested' : 'answered', reason: i < 8 ? 'price' : null }))
  }
  const text = queue.buildInsights(queue.evaluateContacts(contacts, orders, NOW), (s) => `stage ${s}`).join(' | ')
  assert.ok(text.includes('stage 1') && text.includes('80%'), text)
  assert.ok(text.includes('Dormant'), text)
  assert.ok(text.includes('Mai'), text)
  assert.ok(text.includes('السعر'), text)
})

// ───────────────────────── customer details ─────────────────────────
test('Details: favourites, last order, survey weak spot, complaints, prior calls and an opening line', () => {
  const d = detailsLib.buildCustomerDetails({
    name: 'Eman Yasser', days: 120,
    customer: { wallet: 80, status: 'active', isB2B: false },
    orders: [{ id: 'o1', createdAt: daysAgo(200), orderTotal: 500, orderType: 'App' }, { id: 'o2', createdAt: daysAgo(120), orderTotal: 900, orderType: 'App' }],
    items: [
      { orderId: 'o1', productId: 'p1', quantity: 10 }, { orderId: 'o2', productId: 'p1', quantity: 12 },
      { orderId: 'o2', productId: 'p2', quantity: 3 }, { orderId: 'o2', productId: null, quantity: 1, isCustomItem: true, customItemName: 'Custom cut' },
    ],
    productNames: new Map([['p1', 'Ribeye'], ['p2', 'Liver']]),
    feedback: [{ rating: 2, comment: 'late again', collectedAt: daysAgo(100), deliveryTimeliness: '', productQuality: 'جودة عالية', packaging: 'غير مقبول' }],
    complaints: [{ reason: 'delay', status: 'closed', compensationAmount: 50, openedAt: daysAgo(90) }],
    intel: { lifecycleStage: 'At Risk', r: 2, f: 3, m: 4, healthScore: 44, isSpendingUp: true },
    contacts: [{ contactedAt: daysAgo(3), agent: 'Rana', result: 'no_answer', reason: null, note: 'phone off' }],
  })
  assert.deepEqual(plain(d.favourites.map((f) => [f.name, f.quantity])), [['Ribeye', 22], ['Liver', 3], ['Custom cut', 1]])
  assert.equal(d.lastOrder.total, 900)
  assert.deepEqual(plain(d.lastOrder.items.map((i) => i.name)), ['Ribeye', 'Liver', 'Custom cut'])
  assert.equal(d.survey.weakDimension.label, 'التغليف')
  assert.equal(d.complaints.totalCompensation, 50)
  assert.equal(d.complaints.open, 0)
  assert.equal(d.wallet, 80)
  assert.equal(d.contacts[0].result, 'لم يرد')
  assert.ok(d.opening.includes('التغليف'), d.opening)
})

test('Details: a customer with no history still gets a usable result', () => {
  const d = detailsLib.buildCustomerDetails({ name: '', days: 40, customer: null, orders: [], items: [], productNames: new Map(), feedback: [], complaints: [], intel: null, contacts: [] })
  assert.deepEqual(plain(d.favourites), [])
  assert.equal(d.lastOrder, null)
  assert.equal(d.survey, null)
  assert.equal(d.complaints, null)
  assert.ok(d.opening.includes('40'))
})

// ───────────────────────── in-memory Supabase ─────────────────────────
function makeDb(tables, { missing = [], failUpdate = [] } = {}) {
  const writes = []
  return {
    writes,
    from(table) {
      let op = 'select'
      let payload
      let head = false
      let limit = null
      let range = null
      const filters = []
      const orders = []
      const run = async () => {
        if (missing.includes(table)) return { data: null, count: null, error: { message: `Could not find the table 'public.${table}' in the schema cache` } }
        if (op === 'insert') {
          writes.push({ table, op, payload: structuredClone(payload) });
          (tables[table] ||= []).push(...[].concat(structuredClone(payload)))
          return { data: null, error: null }
        }
        const rows = (tables[table] || []).filter((r) => filters.every((f) => f(r)))
        if (op === 'update') {
          if (failUpdate.includes(table)) return { data: null, error: { message: 'update failed' } }
          writes.push({ table, op, payload: structuredClone(payload) })
          rows.forEach((r) => Object.assign(r, payload))
          return { data: null, error: null }
        }
        let out = rows
        for (const [c, dir] of orders.slice().reverse()) out = out.slice().sort((x, y) => (x[c] < y[c] ? -dir : x[c] > y[c] ? dir : 0))
        if (head) return { data: null, count: out.length, error: null }
        if (limit != null) out = out.slice(0, limit)
        if (range) out = out.slice(range[0], range[1] + 1)
        return { data: out, error: null }
      }
      const q = {
        select(_c, o) { if (o && o.head) head = true; return q },
        insert(v) { op = 'insert'; payload = v; return q },
        update(v) { op = 'update'; payload = v; return q },
        eq(c, v) { filters.push((r) => r[c] === v); return q },
        neq(c, v) { filters.push((r) => r[c] !== v); return q },
        gte(c, v) { filters.push((r) => r[c] >= v); return q },
        gt(c, v) { filters.push((r) => r[c] > v); return q },
        not(c) { filters.push((r) => r[c] !== null && r[c] !== undefined); return q },
        in(c, vals) { filters.push((r) => vals.includes(r[c])); return q },
        order(c, o) { orders.push([c, o && o.ascending === false ? -1 : 1]); return q },
        range(a, b) { range = [a, b]; return q },
        limit(n) { limit = n; return q },
        async maybeSingle() { const r = await run(); return { data: (r.data && r.data[0]) || null, error: r.error } },
        then(resolve, reject) { return run().then(resolve, reject) },
      }
      return q
    },
  }
}

const retentionCfg = {
  enabled: true,
  stage1: { days: 30 }, stage2: { days: 60 }, stage3: { days: 90 },
  queue: { minStage: 1, minSpend: 0, dailySize: 25 },
}
const omsData = (extra = {}) => ({
  DEFAULT_RETENTION_CONFIG: retentionCfg,
  readOrderSettings: async () => ({ retention: retentionCfg }),
  generateId: (p) => `${p}_1`,
  ...extra,
})

function baseTables() {
  return {
    customers: [
      { id: 'c1', customerName: 'One Late', phone: '01011', doNotFollowUp: false, followUpSnoozeUntil: null, wallet: 0, status: 'active' },
      { id: 'c2', customerName: 'Two Called', phone: '01022', doNotFollowUp: false, followUpSnoozeUntil: null },
      { id: 'c3', customerName: 'Three Complaint', phone: '01033', doNotFollowUp: false, followUpSnoozeUntil: null },
      { id: 'c4', customerName: 'Four Active', phone: '01044', doNotFollowUp: false, followUpSnoozeUntil: null },
    ],
    orders: [
      { id: 'o1', customerId: 'c1', orderStatus: 'تم', createdAt: daysAgo(100), orderTotal: 900 },
      { id: 'o2', customerId: 'c2', orderStatus: 'تم', createdAt: daysAgo(70), orderTotal: 900 },
      { id: 'o3', customerId: 'c3', orderStatus: 'تم', createdAt: daysAgo(45), orderTotal: 900 },
      { id: 'o4', customerId: 'c4', orderStatus: 'تم', createdAt: daysAgo(3), orderTotal: 900 },
    ],
    customer_intelligence_scores: [
      { customerId: 'c1', lifecycleStage: 'VIP', churnRisk: 'High', healthScore: 40, totalOrders: 6, totalRevenue: 15000, typicalIntervalDays: 20, computedAt: daysAgo(0) },
      { customerId: 'c2', lifecycleStage: 'Active', churnRisk: 'Low', healthScore: 60, totalOrders: 2, totalRevenue: 800, typicalIntervalDays: null, computedAt: daysAgo(0) },
      { customerId: 'c3', lifecycleStage: 'Active', churnRisk: 'Medium', healthScore: 55, totalOrders: 3, totalRevenue: 2000, typicalIntervalDays: 30, computedAt: daysAgo(0) },
    ],
    complaints: [{ id: 'k1', customerId: 'c3', status: 'open' }],
    retention_contacts: [],
    tasks: [],
  }
}

function modules(db, extra = {}) {
  const retentionData = load('src/lib/retentionData.ts', { '@/lib/supabase': { supabase: db }, '@/lib/pagedRead': paged, '@/lib/retentionView': view })
  return { retentionData, base: { '@/lib/supabase': { supabase: db }, '@/lib/omsData': omsData(), '@/lib/retentionData': retentionData, '@/lib/retentionQueue': queue, '@/lib/retentionView': view, '@/lib/cairoTime': cairo, 'next/server': { NextResponse: { json: (body, o = {}) => ({ body, status: o.status || 200 }) } }, 'next/cache': { revalidateTag() {} }, ...extra } }
}

// ───────────────────────── queue API ─────────────────────────
test('Queue API: lists inactive customers with limited fields; service lane first; active customers excluded', async () => {
  const tables = baseTables()
  const db = makeDb(tables)
  const route = load('src/app/api/retention/queue/route.ts', modules(db).base)
  const res = (await route.GET()).body
  assert.equal(res.tableReady, true)
  assert.deepEqual(plain(res.service.map((c) => c.id)), ['c3'])
  assert.deepEqual(plain(res.winback.map((c) => c.id)), ['c1', 'c2'])
  const c1 = res.winback[0]
  assert.deepEqual(plain(Object.keys(c1).sort()), ['bucket', 'complaints', 'days', 'id', 'lateBy', 'name', 'openComplaints', 'orders', 'phone', 'segment', 'spend', 'stage', 'tag', 'usualGapDays'])
  assert.equal(c1.lateBy, 5)
  assert.ok(!('healthScore' in c1) && !('churnRisk' in c1))
})

test('Queue API: a customer already called (next call in the future) leaves the list; a due one stays', async () => {
  const tables = baseTables()
  tables.retention_contacts = [
    { id: 'x1', customerId: 'c1', agent: 'Rana', contactedAt: daysAgo(1), result: 'promised', nextCallAt: daysAhead(4) },
    { id: 'x2', customerId: 'c2', agent: 'Mai', contactedAt: daysAgo(2), result: 'no_answer', nextCallAt: daysAgo(1) },
  ]
  const route = load('src/app/api/retention/queue/route.ts', modules(makeDb(tables)).base)
  const res = (await route.GET()).body
  assert.deepEqual(plain(res.winback.map((c) => c.id)), ['c2'])
  assert.equal(res.doneToday >= 0, true)
})

test('Queue API: without the contacts table the list still works and says it is not ready', async () => {
  const route = load('src/app/api/retention/queue/route.ts', modules(makeDb(baseTables(), { missing: ['retention_contacts'] })).base)
  const res = (await route.GET()).body
  assert.equal(res.tableReady, false)
  assert.equal(res.winback.length, 2)
})

// ───────────────────────── contacts API ─────────────────────────
const post = (route, body) => route.POST({ json: async () => body })
function contactsRoute(db, extra = {}) {
  const m = modules(db, extra)
  return load('src/app/api/retention/contacts/route.ts', m.base)
}

test('Contact log: validates agent, result, and a reason for "not interested" - nothing is written', async () => {
  const tables = baseTables()
  const route = contactsRoute(makeDb(tables))
  assert.equal((await post(route, { customerId: 'c1', result: 'answered' })).body.code, 'AGENT_REQUIRED')
  assert.equal((await post(route, { customerId: 'c1', agent: 'Rana', result: 'bogus' })).body.code, 'BAD_RESULT')
  assert.equal((await post(route, { customerId: 'c1', agent: 'Rana', result: 'not_interested' })).body.code, 'REASON_REQUIRED')
  assert.equal((await post(route, { customerId: 'nope', agent: 'Rana', result: 'answered' })).status, 404)
  assert.equal(tables.retention_contacts.length, 0)
})

test('Contact log: stores the call with a snapshot of stage, days, segment and spend', async () => {
  const tables = baseTables()
  const route = contactsRoute(makeDb(tables))
  const res = await post(route, { customerId: 'c1', agent: 'Rana', result: 'promised', note: 'will order Friday', offer: '10% off' })
  assert.equal(res.status, 201)
  const row = tables.retention_contacts[0]
  assert.equal(row.agent, 'Rana')
  assert.equal(row.result, 'promised')
  assert.equal(row.stage, 3)
  assert.equal(row.daysInactive, 100)
  assert.equal(row.segment, 'VIP')
  assert.equal(row.spendAtContact, 15000)
  assert.equal(row.offer, '10% off')
  assert.ok(new Date(row.nextCallAt).getTime() > NOW + 4 * DAY)
})

test('Contact log: promise snoozes the auto follow-up engine; no answer does not; wrong number opts the customer out', async () => {
  const tables = baseTables()
  const route = contactsRoute(makeDb(tables))
  await post(route, { customerId: 'c1', agent: 'Rana', result: 'promised' })
  assert.ok(tables.customers[0].followUpSnoozeUntil, 'snoozed until the next call')
  await post(route, { customerId: 'c2', agent: 'Rana', result: 'no_answer' })
  assert.equal(tables.customers[1].followUpSnoozeUntil, null)
  await post(route, { customerId: 'c3', agent: 'Rana', result: 'wrong_number' })
  assert.equal(tables.customers[2].doNotFollowUp, true)
  assert.equal(tables.retention_contacts.find((c) => c.customerId === 'c3').nextCallAt, null)
})

test('Contact log: a failed follow-up update does not lose the call and warns instead', async () => {
  const tables = baseTables()
  const route = contactsRoute(makeDb(tables, { failUpdate: ['customers'] }))
  const res = await post(route, { customerId: 'c1', agent: 'Rana', result: 'promised' })
  assert.equal(res.status, 201)
  assert.ok(res.body.warning)
  assert.equal(tables.retention_contacts.length, 1)
})

test('Contact log: without the table the agent gets a clear 503, not a silent failure', async () => {
  const route = contactsRoute(makeDb(baseTables(), { missing: ['retention_contacts'] }))
  const res = await post(route, { customerId: 'c1', agent: 'Rana', result: 'answered' })
  assert.equal(res.status, 503)
  assert.equal(res.body.code, 'TABLE_MISSING')
})

test('Logging a call removes the customer from the next queue read (end to end)', async () => {
  const tables = baseTables()
  const db = makeDb(tables)
  const mods = modules(db)
  const contacts = load('src/app/api/retention/contacts/route.ts', mods.base)
  const queueRoute = load('src/app/api/retention/queue/route.ts', mods.base)
  assert.deepEqual(plain((await queueRoute.GET()).body.winback.map((c) => c.id)), ['c1', 'c2'])
  await post(contacts, { customerId: 'c1', agent: 'Rana', result: 'answered' })
  const after = (await queueRoute.GET()).body
  assert.deepEqual(plain(after.winback.map((c) => c.id)), ['c2'])
  assert.equal(after.doneToday, 1)
  assert.equal(after.doneTodayByAgent.Rana, 1)
})

// ───────────────────────── Instashop exclusion ─────────────────────────
test('Instashop-only customers are identified; a customer with any direct order stays', () => {
  const ids = view.instashopOnlyCustomerIds([
    { customerId: 'a', orderType: 'Instashop' }, { customerId: 'a', orderType: 'Instashop' },
    { customerId: 'b', orderType: 'Instashop' }, { customerId: 'b', orderType: 'Online' },
    { customerId: 'c', orderType: 'App' }, { customerId: null, orderType: 'Instashop' },
    { customerId: 'd', orderType: ' instashop ' },
  ])
  assert.deepEqual(Array.from(ids).sort(), ['a', 'd'])
})

test('Queue API and admin staging leave Instashop-only customers out, and report how many', async () => {
  const tables = baseTables()
  tables.orders.find((o) => o.customerId === 'c1').orderType = 'Instashop' // c1: only Instashop
  tables.orders.find((o) => o.customerId === 'c2').orderType = 'Instashop' // c2: Instashop + direct below
  tables.orders.push({ id: 'o5', customerId: 'c2', orderStatus: 'تم', createdAt: daysAgo(80), orderTotal: 500, orderType: 'Online' })
  const route = load('src/app/api/retention/queue/route.ts', modules(makeDb(tables)).base)
  const res = (await route.GET()).body
  const all = [...res.service, ...res.winback].map((c) => c.id)
  assert.equal(all.includes('c1'), false)
  assert.equal(all.includes('c2'), true)
  assert.equal(res.instashopExcluded, 1)
})

// ───────────────────────── complaints on the card ─────────────────────────
test('Queue API: every card carries its complaints with date and title, newest first', async () => {
  const tables = baseTables()
  tables.complaints = [
    { id: 'k1', customerId: 'c3', status: 'open', subject: 'تاخير توصيل', reason: 'توصيل', openedAt: daysAgo(3) },
    { id: 'k2', customerId: 'c3', status: 'closed', subject: '', reason: 'جودة', openedAt: daysAgo(60) },
    { id: 'k3', customerId: 'c1', status: 'closed', subject: 'دهون زيادة', reason: 'x', openedAt: daysAgo(30) },
  ]
  const route = load('src/app/api/retention/queue/route.ts', modules(makeDb(tables)).base)
  const res = (await route.GET()).body
  const c3 = res.service[0]
  assert.deepEqual(plain(c3.complaints.map((c) => [c.title, c.status])), [['تاخير توصيل', 'open'], ['جودة', 'closed']])
  assert.ok(c3.complaints[0].date)
  const c1 = res.winback.find((c) => c.id === 'c1')
  assert.deepEqual(plain(c1.complaints.map((c) => c.title)), ['دهون زيادة'])
  assert.equal(c1.openComplaints, 0, 'a closed complaint does not move the customer to the service lane')
})

// ───────────────────────── days-inactive chart ─────────────────────────
test('Buckets: edges follow the stages, counts cover both lanes, and the queue returns them', async () => {
  const edges = queue.bucketEdges({ stage1: { days: 30 }, stage2: { days: 60 }, stage3: { days: 90 } })
  assert.deepEqual(plain(edges), [30, 60, 90, 120, 180, 270])
  assert.equal(queue.bucketIndex(10, edges), -1)
  assert.equal(queue.bucketIndex(30, edges), 0)
  assert.equal(queue.bucketIndex(119, edges), 2)
  assert.equal(queue.bucketIndex(400, edges), 5)
  assert.equal(queue.bucketLabel(0, edges), '30–59 يوم')
  assert.equal(queue.bucketLabel(5, edges), '270+ يوم')
  assert.deepEqual(plain(queue.countBuckets([{ days: 31 }, { days: 45 }, { days: 100 }, { days: 5 }], edges)), [2, 0, 1, 0, 0, 0])

  const res = (await load('src/app/api/retention/queue/route.ts', modules(makeDb(baseTables())).base).GET()).body
  assert.deepEqual(plain(res.edges), [30, 60, 90, 120, 180, 270])
  // c1 = 100 days (bucket 2), c2 = 70 days (bucket 1), c3 = 45 days in the service lane (bucket 0)
  assert.deepEqual(plain(res.bucketCounts), [1, 1, 1, 0, 0, 0])
  assert.deepEqual(plain(res.winback.map((c) => c.bucket)), [2, 1])
})

test('Queue API: the response carries every eligible customer plus the daily size, so the page can filter without more requests', async () => {
  const tables = baseTables()
  const settings = { retention: { ...retentionCfg, queue: { minStage: 1, minSpend: 0, dailySize: 1 } } }
  const mods = modules(makeDb(tables), { '@/lib/omsData': omsData({ readOrderSettings: async () => settings }) })
  const res = (await load('src/app/api/retention/queue/route.ts', mods.base).GET()).body
  assert.equal(res.dailySize, 1)
  assert.equal(res.winback.length, 2)
  assert.equal(res.moreWaiting, 1)
})

// ───────────────────────── admin-configurable actions ─────────────────────────
test('Actions: defaults, sanitising, unique keys and labels still resolved for removed actions', () => {
  assert.equal(queue.sanitizeActions(undefined).length, queue.DEFAULT_ACTIONS.length)
  assert.equal(queue.sanitizeActions([]).length, queue.DEFAULT_ACTIONS.length)
  const cleaned = plain(queue.sanitizeActions([
    { key: 'answered', label: '  تم الاتصال  ', reached: true, nextCallDays: 9999, askReason: false },
    { key: 'answered', label: 'مكرر', reached: false },
    { key: 'BAD KEY!', label: 'جديد', nextCallDays: -3, stopFollowUp: true },
    { key: 'x', label: '   ' },
  ]))
  assert.equal(cleaned.length, 3)
  assert.equal(cleaned[0].label, 'تم الاتصال')
  assert.equal(cleaned[0].nextCallDays, 365)
  assert.equal(new Set(cleaned.map((a) => a.key)).size, 3)
  assert.equal(cleaned[2].nextCallDays, 0)
  assert.equal(cleaned[2].stopFollowUp, true)
  assert.equal(queue.resultLabel('not_interested', [{ key: 'x', label: 'X' }]), 'غير مهتم', 'old calls keep a readable label')
})

const customActions = [
  { key: 'answered', label: 'تم الاتصال', reached: true, nextCallDays: 7, askReason: false, stopFollowUp: false },
  { key: 'busy', label: 'مشغول', reached: false, nextCallDays: 2, askReason: false, stopFollowUp: false },
  { key: 'refused', label: 'رفض', reached: true, nextCallDays: 60, askReason: true, stopFollowUp: false },
  { key: 'blocked', label: 'حظر', reached: false, nextCallDays: 0, askReason: false, stopFollowUp: true },
]
const customContactsRoute = (tables) => {
  const settings = { retention: { ...retentionCfg, actions: customActions } }
  const mods = modules(makeDb(tables), { '@/lib/omsData': omsData({ readOrderSettings: async () => settings }) })
  return load('src/app/api/retention/contacts/route.ts', mods.base)
}

test('Contact log with a custom action list: only configured actions, the reason rule and the opt-out rule follow the settings', async () => {
  const tables = baseTables()
  const route = customContactsRoute(tables)
  assert.equal((await post(route, { customerId: 'c1', agent: 'Rana', result: 'promised' })).body.code, 'BAD_RESULT', 'removed from the list')
  assert.equal((await post(route, { customerId: 'c1', agent: 'Rana', result: 'refused' })).body.code, 'REASON_REQUIRED')
  assert.equal((await post(route, { customerId: 'c1', agent: 'Rana', result: 'refused', reason: 'price' })).status, 201)
  assert.ok(tables.customers[0].followUpSnoozeUntil, 'a reached action snoozes the auto engine')
  assert.equal((await post(route, { customerId: 'c2', agent: 'Rana', result: 'busy' })).status, 201)
  assert.equal(tables.customers[1].followUpSnoozeUntil, null, 'not reached: no snooze')
  assert.equal((await post(route, { customerId: 'c3', agent: 'Rana', result: 'blocked' })).status, 201)
  assert.equal(tables.customers[2].doNotFollowUp, true, 'stopFollowUp opts the customer out')
})

test('Outcomes use the configured "reached" flag, not the built-in one', () => {
  const ev = queue.evaluateContacts([contact('a', 'c1', daysAgo(40), { result: 'busy' }), contact('b', 'c2', daysAgo(40), { result: 'refused' })], [], NOW, 30, customActions)
  const r = byId(ev)
  assert.equal(r.a.reached, false)
  assert.equal(r.b.reached, true)
})

// ───────────────────────── WhatsApp messages ─────────────────────────
test('Messages: placeholders are filled; a line missing its value is dropped; unknown placeholders stay visible', () => {
  const text = queue.renderMessage(queue.DEFAULT_MESSAGES.winback, { name: 'إيمان', agent: 'مى', days: 95, product: '' })
  assert.ok(text.includes('أهلاً إيمان') && text.includes('معاك مى') && text.includes('95 يوم'))
  assert.ok(!text.includes('{') && !text.includes('زي كل مرة'), 'the product line is dropped, nothing half-filled')
  assert.ok(queue.renderMessage(queue.DEFAULT_MESSAGES.winback, { name: 'إيمان', agent: 'مى', days: 95, product: 'ريب اى' }).includes('ريب اى'))
  assert.ok(queue.renderMessage('hello {nmae}', { name: 'x' }).includes('{nmae}'))
  assert.equal(queue.renderMessage('a\n\n\n\nb', {}), 'a\n\nb')
})

test('Messages: settings are sanitised, with defaults for empty text', () => {
  assert.deepEqual(plain(queue.sanitizeMessages(undefined)), plain(queue.DEFAULT_MESSAGES))
  const m = queue.sanitizeMessages({ winback: '  رسالتي {name}  ', complaint: '' })
  assert.equal(m.winback, 'رسالتي {name}')
  assert.equal(m.complaint, queue.DEFAULT_MESSAGES.complaint)
  assert.equal(queue.sanitizeMessages({ winback: 'x'.repeat(2000) }).winback.length, 800)
})

test('WhatsApp link: Egyptian numbers get the 20 prefix, the text is URL-encoded, no phone gives no link', () => {
  assert.equal(queue.whatsappUrl('01011112222', 'مرحبا'), `https://wa.me/201011112222?text=${encodeURIComponent('مرحبا')}`)
  assert.equal(queue.whatsappUrl('+20 101 111 2222', ''), 'https://wa.me/201011112222')
  assert.equal(queue.whatsappUrl('', 'x'), null)
  assert.equal(queue.firstName('  Eman Yasser '), 'Eman')
})

// ───────────────────────── admin filters ─────────────────────────
test('Admin filters: segment, churn risk and open complaints combine; nothing selected keeps everyone', () => {
  const rows = [
    { id: 'a', name: '', phone: '', days: 1, lastMs: 0, openComplaints: 0, intel: { lifecycleStage: 'VIP', churnRisk: 'High' } },
    { id: 'b', name: '', phone: '', days: 1, lastMs: 0, openComplaints: 2, intel: { lifecycleStage: 'VIP', churnRisk: 'Low' } },
    { id: 'c', name: '', phone: '', days: 1, lastMs: 0, openComplaints: 0, intel: null },
  ]
  const ids = (f) => view.filterRows(rows, f).map((r) => r.id)
  assert.deepEqual(ids({}), ['a', 'b', 'c'])
  assert.deepEqual(ids({ segment: 'VIP' }), ['a', 'b'])
  assert.deepEqual(ids({ segment: 'VIP', risk: 'High' }), ['a'])
  assert.deepEqual(ids({ complaintsOnly: true }), ['b'])
})

// ───────────────────────── "الاحتفاظ" is only shown when there is a rhythm ─────────────────────────
test('Details: retention % is hidden for a one-order customer (it is always a default 100 there) and shown with a rhythm', () => {
  const base = { name: 'x', days: 50, customer: null, orders: [], items: [], productNames: new Map(), feedback: [], complaints: [], contacts: [] }
  const one = detailsLib.buildCustomerDetails({ ...base, intel: { lifecycleStage: 'New', totalOrders: 1, typicalIntervalDays: null, retentionPct: 100, healthBreakdown: { recency: 40, retention: 100 } } })
  assert.equal(one.intel.retentionPct, null)
  assert.equal(one.intel.healthBreakdown.retention, null)
  assert.equal(one.intel.typicalIntervalDays, null)
  const many = detailsLib.buildCustomerDetails({ ...base, intel: { lifecycleStage: 'Active', totalOrders: 5, typicalIntervalDays: 20, retentionPct: 35, healthBreakdown: { recency: 40, retention: 35 } } })
  assert.equal(many.intel.retentionPct, 35)
  assert.equal(many.intel.typicalIntervalDays, 20)
})

test('Details: every complaint is listed with date and title', () => {
  const d = detailsLib.buildCustomerDetails({
    name: 'x', days: 5, customer: null, orders: [], items: [], productNames: new Map(), feedback: [], intel: null, contacts: [],
    complaints: [
      { subject: 'old', status: 'closed', openedAt: daysAgo(90) },
      { subject: '', reason: 'delivery', status: 'open', openedAt: daysAgo(2) },
    ],
  })
  assert.deepEqual(plain(d.complaints.list.map((c) => [c.title, c.status])), [['delivery', 'open'], ['old', 'closed']])
})
