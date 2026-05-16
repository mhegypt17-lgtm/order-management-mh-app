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
    const counts = {
      customers: (await readCustomers()).length,
      addresses: (await readAddresses()).length,
      orders: (await readOrders()).length,
      orderItems: (await readOrderItems()).length,
      orderDelivery: (await readOrderDelivery()).length,
      editHistory: (await readEditHistory()).length,
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
