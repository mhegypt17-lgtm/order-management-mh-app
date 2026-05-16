import { NextResponse } from 'next/server'
import {
  readAddresses,
  readCustomers,
  readEditHistory,
  readOrderDelivery,
  readOrderItems,
  readOrders,
} from '@/lib/omsData'

export async function GET() {
  try {
    const [customers, addresses, orders, orderItems, orderDelivery, editHistory] = await Promise.all([
      readCustomers(),
      readAddresses(),
      readOrders(),
      readOrderItems(),
      readOrderDelivery(),
      readEditHistory(),
    ])
    const counts = {
      customers: customers.length,
      addresses: addresses.length,
      orders: orders.length,
      orderItems: orderItems.length,
      orderDelivery: orderDelivery.length,
      editHistory: editHistory.length,
    }

    return NextResponse.json(
      {
        status: 'ok',
        timestamp: new Date().toISOString(),
        counts,
      },
      { status: 200 }
    )
  } catch {
    return NextResponse.json(
      {
        status: 'error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}
