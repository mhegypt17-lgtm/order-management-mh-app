import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { readRowsIn, readContactsForCustomers } from '@/lib/retentionData'
import { buildCustomerDetails } from '@/lib/retentionDetails'
import { readOrderSettings } from '@/lib/omsData'
import { sanitizeActions } from '@/lib/retentionQueue'

// On-demand only: called when someone opens a customer's drawer, so the
// retention pages never pay for these reads up front.
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = params.id
    const { searchParams } = new URL(req.url)
    const days = Math.max(0, Math.floor(Number(searchParams.get('days')) || 0))

    const [customerRes, ordersRead, feedbackRead, complaintsRead, intelRes, contactsRead] = await Promise.all([
      supabase.from('customers').select('id,customerName,wallet,status,statusReason,isB2B').eq('id', id).maybeSingle(),
      readRowsIn<{ id: string; createdAt: string; orderTotal: number; orderType: string | null }>(
        'orders', 'customerId', [id], 'id,createdAt,orderTotal,orderType', 'id', (q) => q.neq('orderStatus', 'لاغي'),
      ),
      readRowsIn<Record<string, any>>(
        'order_feedback', 'customerId', [id],
        'id,rating,comment,collectedAt,createdAt,followUpRequired,productQuality,packaging,deliveryTimeliness,customerService,pricingValue,appUsability,recommendToFriends',
        'id',
      ),
      readRowsIn<{ reason: string | null; subject: string | null; status: string; compensationAmount: number | null; openedAt: string | null }>(
        'complaints', 'customerId', [id], 'id,reason,subject,status,compensationAmount,openedAt', 'id',
      ),
      supabase.from('customer_intelligence_scores').select('*').eq('customerId', id).maybeSingle(),
      readContactsForCustomers([id]),
    ])
    if (!customerRes.data) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

    const orderIds = ordersRead.rows.map((o) => o.id)
    const itemsRead = await readRowsIn<{ orderId: string; productId: string | null; quantity: number; isCustomItem: boolean | null; customItemName: string | null }>(
      'order_items', 'orderId', orderIds, 'id,orderId,productId,quantity,isCustomItem,customItemName', 'id',
    )
    const productIds = Array.from(new Set(itemsRead.rows.map((i) => i.productId).filter(Boolean) as string[]))
    const productsRead = await readRowsIn<{ id: string; productName: string }>('products', 'id', productIds, 'id,productName', 'id')

    const details = buildCustomerDetails({
      name: customerRes.data.customerName || '',
      days,
      customer: customerRes.data,
      orders: ordersRead.rows,
      items: itemsRead.rows,
      productNames: new Map(productsRead.rows.map((p) => [p.id, p.productName])),
      feedback: feedbackRead.rows,
      complaints: complaintsRead.rows,
      intel: intelRes.data || null,
      contacts: contactsRead.rows,
      actions: sanitizeActions(((await readOrderSettings()).retention as any)?.actions),
    })
    return NextResponse.json(details)
  } catch (err) {
    console.error('[retention] details failed:', err)
    return NextResponse.json({ error: 'Failed to load customer details' }, { status: 500 })
  }
}
