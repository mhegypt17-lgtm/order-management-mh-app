const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const ts = require('typescript')

function load(file, mocks, globals = {}) {
  const filename = path.join(__dirname, '..', ...file.split('/'))
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const module = { exports: {} }
  vm.runInNewContext(code, {
    module, exports: module.exports, URL, Promise, Intl,
    console: { ...console, error() {}, warn() {} },
    require(name) {
      if (!(name in mocks)) throw new Error(`Unexpected dependency: ${name}`)
      return mocks[name]
    },
    ...globals,
  }, { filename })
  return module.exports
}

// A Date whose "now" is fixed, so month boundaries are deterministic.
function fixedDate(nowIso) {
  const fixed = Date.parse(nowIso)
  return class FixedDate extends Date {
    constructor(...args) { args.length === 0 ? super(fixed) : super(...args) }
    static now() { return fixed }
  }
}

const DELIVERED = 'تم التوصيل'
const T = { id: 't1', productName: 'Targeted one' }
const T2 = { id: 't2', productName: 'Targeted two' }

// rows: [{ no, status, receiver, type, delivery: [status, deliveredAt|null], items: [[productId, qty]] }]
function run({ now, rows, targeted = [T, T2], monthlyGoal = 100 }) {
  const deliveries = []
  const orders = []
  const items = []
  rows.forEach((r, i) => {
    const id = `o${i}`
    orders.push({
      id, appOrderNo: r.no, orderStatus: r.status || 'تم', orderReceiver: r.receiver ?? 'Amal',
      createdBy: r.createdBy || 'x', orderType: r.type || 'App',
    })
    if (r.delivery) deliveries.push({ orderId: id, deliveryStatus: r.delivery[0], deliveredAt: r.delivery[1] })
    for (const [productId, quantity] of r.items || []) items.push({ orderId: id, productId, quantity })
  })
  const queries = []
  const supabase = {
    from(table) {
      const filters = []
      const q = {
        select() { return q },
        eq(col, val) { filters.push(['eq', col, val]); return q },
        gte(col, val) { filters.push(['gte', col, val]); return q },
        lte(col, val) { filters.push(['lte', col, val]); return q },
        then(resolve, reject) {
          queries.push({ table, filters })
          let data = []
          if (table === 'products') data = targeted
          if (table === 'order_delivery') {
            data = deliveries.filter((d) => filters.every(([op, col, val]) => {
              const v = d[col]
              if (op === 'eq') return v === val
              if (v == null) return false
              if (op === 'gte') return v >= val
              return v <= val
            }))
          }
          return Promise.resolve({ data, error: null }).then(resolve, reject)
        },
      }
      return q
    },
  }
  const reads = []
  const fetchRowsIn = async (table, column, values) => {
    reads.push({ table, column, count: values.length })
    const src = table === 'orders' ? orders : table === 'order_items' ? items : []
    return src.filter((r) => values.includes(r[column]))
  }
  const FixedDate = fixedDate(now)
  const cairo = load('src/lib/cairoTime.ts', {}, { Date: FixedDate })
  const route = load('src/app/api/products/targeted-stats/route.ts', {
    'next/server': { NextRequest: class {}, NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } },
    '@/lib/omsData': { readOrderSettings: async () => ({ monthlyTargetedUnitsGoal: monthlyGoal }), fetchRowsIn },
    '@/lib/supabase': { supabase },
    '@/lib/cairoTime': cairo,
  }, { Date: FixedDate })
  return route.GET({ url: 'https://example.test/api/products/targeted-stats?scope=admin' }).then((res) => ({
    // Round-trip so arrays created inside the vm sandbox compare equal.
    res: { status: res.status, body: JSON.parse(JSON.stringify(res.body)) },
    queries: JSON.parse(JSON.stringify(queries)),
    reads,
  }))
}

const NOV = '2026-11-05T10:00:00Z'

test('Placed 31 Oct, delivered 1 Nov: counts in November', async () => {
  const { res } = await run({
    now: NOV,
    rows: [{ no: 'placed-oct-delivered-nov', delivery: [DELIVERED, '2026-11-01T12:51:44.646+00:00'], items: [['t1', 3]] }],
  })
  assert.equal(res.body.monthLabel, '11/2026')
  assert.equal(res.body.totalUnits, 3)
  assert.deepEqual(res.body.perAgent, [{ agent: 'Amal', units: 3 }])
})

test('Same order is NOT counted in October when viewed in October', async () => {
  const { res } = await run({
    now: '2026-10-31T10:00:00Z',
    rows: [{ no: 'x', delivery: [DELIVERED, '2026-11-01T12:51:44.646+00:00'], items: [['t1', 3]] }],
  })
  assert.equal(res.body.monthLabel, '10/2026')
  assert.equal(res.body.totalUnits, 0)
})

test('Placed 3 Nov and delivered 3 Nov counts; order placed earlier delivered in month counts', async () => {
  const { res } = await run({
    now: NOV,
    rows: [
      { no: 'a', delivery: [DELIVERED, '2026-11-03T11:45:58.973+00:00'], items: [['t1', 2]] },
      { no: 'b', delivery: [DELIVERED, '2026-11-02T08:00:00+00:00'], items: [['t2', 4]] },
    ],
  })
  assert.equal(res.body.totalUnits, 6)
})

test('Not delivered yet is never counted, even with order status تم', async () => {
  const { res } = await run({
    now: NOV,
    rows: [
      { no: 'ready', status: 'تم', delivery: ['جاهز', null], items: [['t1', 5]] },
      { no: 'on-the-way', status: 'ساري', delivery: ['في الطريق', null], items: [['t1', 5]] },
      { no: 'no-delivery-row', status: 'تم', items: [['t1', 5]] },
    ],
  })
  assert.equal(res.body.totalUnits, 0)
  assert.deepEqual(res.body.perAgent, [])
})

test('Delivered then cancelled does not count', async () => {
  const { res } = await run({
    now: NOV,
    rows: [{ no: 'c', status: 'لاغي', delivery: [DELIVERED, '2026-11-03T11:00:00+00:00'], items: [['t1', 7]] }],
  })
  assert.equal(res.body.totalUnits, 0)
})

test('Cairo midnight boundary: 00:30 Cairo on 1 Nov is November, 23:30 Cairo on 31 Oct is October', async () => {
  const { res } = await run({
    now: NOV,
    rows: [
      { no: 'after-midnight', delivery: [DELIVERED, '2026-10-31T22:30:00+00:00'], items: [['t1', 2]] },
      { no: 'before-midnight', delivery: [DELIVERED, '2026-10-31T21:30:00+00:00'], items: [['t1', 9]] },
    ],
  })
  assert.equal(res.body.totalUnits, 2)
})

test('End of month: 1 Dec Cairo is December, 30 Nov late evening is still November', async () => {
  const { res } = await run({
    now: NOV,
    rows: [
      { no: 'dec', delivery: [DELIVERED, '2026-11-30T22:30:00+00:00'], items: [['t1', 8]] },
      { no: 'nov', delivery: [DELIVERED, '2026-11-30T21:30:00+00:00'], items: [['t1', 1]] },
    ],
  })
  assert.equal(res.body.totalUnits, 1)
})

test('Only targeted products count and quantities add up per agent; branch is kept separate', async () => {
  const { res } = await run({
    now: NOV,
    rows: [
      { no: '1', receiver: 'Amal', delivery: [DELIVERED, '2026-11-02T10:00:00+00:00'], items: [['t1', 2], ['other', 50]] },
      { no: '2', receiver: 'Mirna', delivery: [DELIVERED, '2026-11-02T11:00:00+00:00'], items: [['t2', 3]] },
      { no: '3', receiver: 'الفرع', type: 'Instashop', delivery: [DELIVERED, '2026-11-02T12:00:00+00:00'], items: [['t1', 4]] },
    ],
  })
  assert.equal(res.body.totalUnits, 5)
  assert.equal(res.body.branchUnits, 4)
  assert.deepEqual(res.body.perAgent.map((a) => a.agent).sort(), ['Amal', 'Mirna'])
  assert.equal(res.body.achievementPct, 5)
  assert.deepEqual(Object.fromEntries(res.body.bySource.map((s) => [s.orderType, s.units])), { App: 5, Instashop: 4 })
})

test('Falls back to createdBy when the receiver is missing', async () => {
  const { res } = await run({
    now: NOV,
    rows: [{ no: '1', receiver: '', createdBy: 'Legacy agent', delivery: [DELIVERED, '2026-11-02T10:00:00+00:00'], items: [['t1', 2]] }],
  })
  assert.deepEqual(res.body.perAgent, [{ agent: 'Legacy agent', units: 2 }])
})

test('No targeted products or no deliveries: empty response and no order reads', async () => {
  const none = await run({ now: NOV, targeted: [], rows: [{ no: 'x', delivery: [DELIVERED, '2026-11-02T10:00:00+00:00'], items: [['t1', 1]] }] })
  assert.equal(none.res.body.productCount, 0)
  assert.equal(none.reads.length, 0)
  const empty = await run({ now: NOV, rows: [{ no: 'x', delivery: ['جاهز', null], items: [['t1', 1]] }] })
  assert.equal(empty.res.body.totalUnits, 0)
  assert.equal(empty.res.body.productCount, 2)
  assert.equal(empty.reads.length, 0)
})

test('Reads stay scoped: delivered-in-month filter, and only those orders are fetched', async () => {
  const { queries, reads } = await run({
    now: NOV,
    rows: [
      { no: 'in', delivery: [DELIVERED, '2026-11-02T10:00:00+00:00'], items: [['t1', 1]] },
      { no: 'old', delivery: [DELIVERED, '2026-09-02T10:00:00+00:00'], items: [['t1', 1]] },
    ],
  })
  const del = queries.find((q) => q.table === 'order_delivery')
  assert.deepEqual(del.filters, [
    ['eq', 'deliveryStatus', DELIVERED],
    ['gte', 'deliveredAt', '2026-10-31T00:00:00.000Z'],
    ['lte', 'deliveredAt', '2026-12-01T23:59:59.999Z'],
  ])
  const orderRead = reads.find((r) => r.table === 'orders')
  assert.equal(orderRead.count, 1)
  assert.equal(queries.some((q) => q.table === 'orders'), false)
})
