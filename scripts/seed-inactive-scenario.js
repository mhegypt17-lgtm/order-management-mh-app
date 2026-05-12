// Seeds 3 test scenarios for inactive-customer follow-ups.
// Each chosen customer gets one delivered ('تم') order with createdAt set
// to 30 / 60 / 90 days ago — plus an item line. Removes any prior seeded rows first.
const fs = require('fs')
const path = require('path')

const DATA = path.join(__dirname, '..', 'data')
const ORDERS = path.join(DATA, 'orders.json')
const ITEMS = path.join(DATA, 'order_items.json')
const TASKS = path.join(DATA, 'tasks.json')

const SEED_TAG = 'SEED_INACTIVE_SCENARIO'

const scenarios = [
  {
    customerId: 'cust_1777901117220_ovtl6e1u', // sherif
    addressId: 'addr_1777901117220_bd5ibsvj',
    daysAgo: 30,
    name: 'sherif',
  },
  {
    customerId: 'cust_1777969079217_vyr4j219', // omnia
    addressId: 'addr_1777969079219_dl03hjx2',
    daysAgo: 60,
    name: 'omnia',
  },
  {
    customerId: 'cust_1778070256556_24zuwu4q', // fee test
    addressId: 'addr_1778070256556_5u5etcic',
    daysAgo: 90,
    name: 'fee test',
  },
]

const orders = JSON.parse(fs.readFileSync(ORDERS, 'utf8'))
const items = JSON.parse(fs.readFileSync(ITEMS, 'utf8'))
const tasks = JSON.parse(fs.readFileSync(TASKS, 'utf8'))

// Remove any prior seeded orders/items so the script is idempotent
const cleanedOrders = orders.filter((o) => o.notes !== SEED_TAG)
const removedOrderIds = new Set(orders.filter((o) => o.notes === SEED_TAG).map((o) => o.id))
const cleanedItems = items.filter((i) => !removedOrderIds.has(i.orderId))
// Clear previously auto-created follow-up tasks for the seeded customers (so 90-day flow re-fires)
const seededCustomerIds = new Set(scenarios.map((s) => s.customerId))
const cleanedTasks = tasks.filter(
  (t) => !(t.source === 'auto-followup' && seededCustomerIds.has(t.linkedCustomerId))
)

let counter = 1
for (const s of scenarios) {
  const ts = new Date(Date.now() - s.daysAgo * 24 * 60 * 60 * 1000)
  const iso = ts.toISOString()
  const orderId = `ord_seed_${s.daysAgo}d_${Date.now()}_${counter++}`
  const ymd = `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, '0')}-${String(ts.getDate()).padStart(2, '0')}`

  cleanedOrders.push({
    id: orderId,
    appOrderNo: `MH-SEED-${s.daysAgo}D`,
    orderDate: ymd,
    orderTime: '12:00',
    orderType: 'Online',
    orderReceiver: 'رنا',
    orderMethod: 'App',
    customerType: 'قديم',
    customerSource: 'Facebook',
    orderStatus: 'تم',
    cancellationReason: null,
    paymentMethod: 'Cash',
    customerId: s.customerId,
    deliveryAddressId: s.addressId,
    notes: SEED_TAG,
    followUp: false,
    followUpNotes: '',
    subtotal: 200,
    deliveryFee: 50,
    orderTotal: 250,
    createdBy: 'seed-script',
    createdAt: iso,
    updatedAt: iso,
  })

  cleanedItems.push({
    id: `item_seed_${s.daysAgo}d_${Date.now()}_${counter}`,
    orderId,
    productId: 'prod_1',
    quantity: 2,
    weightGrams: 1000,
    unitPrice: 100,
    lineTotal: 200,
    specialInstructions: '',
    createdAt: iso,
  })

  console.log(`✔ ${s.name} (${s.customerId}) — last order set to ${s.daysAgo}d ago (${ymd})`)
}

fs.writeFileSync(ORDERS, JSON.stringify(cleanedOrders, null, 2), 'utf8')
fs.writeFileSync(ITEMS, JSON.stringify(cleanedItems, null, 2), 'utf8')
fs.writeFileSync(TASKS, JSON.stringify(cleanedTasks, null, 2), 'utf8')

console.log('\nDone. Open the app and the bell will:')
console.log('  • show 🟡 30-day reminder for sherif')
console.log('  • show 🟠 60-day reminder for omnia')
console.log('  • show 🔴 90-day reminder for fee test AND auto-create a CS follow-up task')
