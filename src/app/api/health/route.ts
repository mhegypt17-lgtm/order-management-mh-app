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
      customers: readCustomers().length,
      addresses: readAddresses().length,
      orders: readOrders().length,
      orderItems: readOrderItems().length,
      orderDelivery: readOrderDelivery().length,
      editHistory: readEditHistory().length,
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
