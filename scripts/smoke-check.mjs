import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const dataDir = path.join(root, 'data')

const files = {
  customers: path.join(dataDir, 'customers.json'),
  addresses: path.join(dataDir, 'customer_addresses.json'),
  orders: path.join(dataDir, 'orders.json'),
  orderItems: path.join(dataDir, 'order_items.json'),
  orderDelivery: path.join(dataDir, 'order_delivery.json'),
  editHistory: path.join(dataDir, 'edit_history.json'),
}

function readArray(filePath, fallback = []) {
  if (!fs.existsSync(filePath)) {
    return fallback
  }

  const raw = fs.readFileSync(filePath, 'utf8')
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed)) {
    throw new Error(`${path.basename(filePath)} must contain a JSON array`)
  }
  return parsed
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function run() {
  const customers = readArray(files.customers)
  const addresses = readArray(files.addresses)
  const orders = readArray(files.orders)
  const orderItems = readArray(files.orderItems)
  const orderDelivery = readArray(files.orderDelivery)
  const editHistory = readArray(files.editHistory)

  const customerIds = new Set(customers.map((c) => c.id))
  const addressIds = new Set(addresses.map((a) => a.id))
  const orderIds = new Set(orders.map((o) => o.id))

  for (const order of orders) {
    assert(customerIds.has(order.customerId), `Order ${order.id} has unknown customerId ${order.customerId}`)
    assert(addressIds.has(order.deliveryAddressId), `Order ${order.id} has unknown deliveryAddressId ${order.deliveryAddressId}`)
    assert(typeof order.orderTotal === 'number', `Order ${order.id} orderTotal must be a number`)
  }

  for (const item of orderItems) {
    assert(orderIds.has(item.orderId), `Order item ${item.id} has unknown orderId ${item.orderId}`)
    assert(typeof item.quantity === 'number' && item.quantity > 0, `Order item ${item.id} has invalid quantity`)
  }

  for (const row of orderDelivery) {
    assert(orderIds.has(row.orderId), `Delivery row ${row.id} has unknown orderId ${row.orderId}`)
  }

  for (const row of editHistory) {
    if (row.orderId) {
      assert(orderIds.has(row.orderId), `History row ${row.id} has unknown orderId ${row.orderId}`)
    }
    assert(typeof row.summary === 'string' && row.summary.trim().length > 0, `History row ${row.id} summary is required`)
  }

  const result = {
    customers: customers.length,
    addresses: addresses.length,
    orders: orders.length,
    orderItems: orderItems.length,
    orderDelivery: orderDelivery.length,
    editHistory: editHistory.length,
  }

  console.log('Smoke check passed')
  console.log(JSON.stringify(result, null, 2))
}

try {
  run()
} catch (error) {
  console.error('Smoke check failed')
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
