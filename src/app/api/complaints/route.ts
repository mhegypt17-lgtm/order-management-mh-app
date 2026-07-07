import { NextRequest, NextResponse } from 'next/server'
import {
  readComplaints,
  createComplaint,
  updateComplaint,
  deleteComplaint,
  addComplaintComment,
  readOrders,
  readCustomers,
  COMPLAINT_COLUMNS,
  type ComplaintRecord,
} from '@/lib/omsData'
import { supabase } from '@/lib/supabase'

// Short server-side cache — a burst of dashboard loaders in the same minute
// share one DB read. Mutations (POST/PUT/DELETE) don't need this to be
// fresh instantly; the client refetches after edits.
export const revalidate = 60

// Default rolling window for the complaints list. Complaints older than
// ~3 months are archival and callers must opt in with ?all=1 or ?from=<date>.
const DEFAULT_COMPLAINTS_WINDOW_DAYS = 90

export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl
    // Optional filters — pushed down to Supabase (was JS-side .filter()).
    const status = url.searchParams.get('status')
    const channel = url.searchParams.get('channel')
    const assignedTo = url.searchParams.get('assignedTo')
    // Windowing — ?all=1 bypasses; ?from=<ISO> overrides the 90-day default.
    const all = url.searchParams.get('all') === '1'
    const from = url.searchParams.get('from') // ISO string or YYYY-MM-DD

    let cutoffISO: string | undefined
    if (!all) {
      if (from) {
        // Accept plain YYYY-MM-DD or a full ISO — Postgres treats both correctly.
        cutoffISO = from
      } else {
        cutoffISO = new Date(
          Date.now() - DEFAULT_COMPLAINTS_WINDOW_DAYS * 24 * 60 * 60 * 1000,
        ).toISOString()
      }
    }

    let q = supabase.from('complaints').select(COMPLAINT_COLUMNS)
    if (cutoffISO) q = q.gte('openedAt', cutoffISO)
    if (status) q = q.eq('status', status)
    if (channel) q = q.eq('channel', channel)
    if (assignedTo) q = q.eq('assignedTo', assignedTo)

    const { data, error } = await q

    if (error) {
      // Preserve legacy fallback behaviour — if the scoped query fails for
      // any reason (missing column, RLS mismatch, etc.), fall back to the
      // old full-table read + JS filter so the endpoint never hard-fails.
      console.warn('[complaints GET] scoped query failed, falling back:', error.message)
      const legacy = await readComplaints()
      const filtered = legacy.filter(
        (c) =>
          (!status || c.status === status) &&
          (!channel || c.channel === channel) &&
          (!assignedTo || c.assignedTo === assignedTo),
      )
      return NextResponse.json(sortComplaints(filtered))
    }

    // Sort: open first, then by priority (high > medium > low), then newest.
    // Custom ordering can't be pushed to Postgres cleanly, but the row count
    // is now bounded (window + filters) so the JS sort is cheap.
    return NextResponse.json(sortComplaints((data || []) as unknown as ComplaintRecord[]))
  } catch (error) {
    console.error('Error reading complaints:', error)
    return NextResponse.json({ error: 'Failed to read complaints' }, { status: 500 })
  }
}

function sortComplaints(rows: ComplaintRecord[]): ComplaintRecord[] {
  const statusOrder: Record<string, number> = { open: 0, 'in-progress': 1, closed: 2 }
  const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 }
  return [...rows].sort((a, b) => {
    if (a.status !== b.status) {
      return (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99)
    }
    const ap = priorityOrder[a.priority] ?? 99
    const bp = priorityOrder[b.priority] ?? 99
    if (ap !== bp) return ap - bp
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const complaint = await createComplaint({
      channel: body.channel,
      subject: body.subject,
      description: body.description,
      reason: body.reason,
      status: 'open',
      priority: body.priority || 'medium',
      customerId: body.customerId || null,
      customerName: body.customerName || null,
      customerPhone: body.customerPhone || null,
      linkedOrderId: body.linkedOrderId || null,
      assignedTo: body.assignedTo,
      createdBy: body.createdBy,
      compensationAmount: 0,
      productIds: Array.isArray(body.productIds) ? body.productIds.filter((id: any) => typeof id === 'string' && id) : [],
      openedAt: new Date().toISOString(),
      closedAt: null,
    })

    return NextResponse.json(complaint, { status: 201 })
  } catch (error) {
    console.error('Error creating complaint:', error)
    return NextResponse.json({ error: 'Failed to create complaint' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, action } = body

    if (!id) {
      return NextResponse.json({ error: 'Missing complaint id' }, { status: 400 })
    }

    // Handle comment addition
    if (action === 'add-comment') {
      const updated = await addComplaintComment(id, body.authorName, body.text)
      if (!updated) {
        return NextResponse.json({ error: 'Complaint not found' }, { status: 404 })
      }
      return NextResponse.json(updated)
    }

    // Handle regular update
    const updates: any = {
      subject: body.subject,
      description: body.description,
      reason: body.reason,
      status: body.status,
      priority: body.priority,
      assignedTo: body.assignedTo,
      compensationAmount: Number(body.compensationAmount) || 0,
      closedAt: body.status === 'closed' && !body.closedAt ? new Date().toISOString() : body.closedAt,
    }
    if (Array.isArray(body.productIds)) {
      updates.productIds = body.productIds.filter((id: any) => typeof id === 'string' && id)
    }
    const updated = await updateComplaint(id, updates)

    if (!updated) {
      return NextResponse.json({ error: 'Complaint not found' }, { status: 404 })
    }

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating complaint:', error)
    return NextResponse.json({ error: 'Failed to update complaint' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const { id } = body

    if (!id) {
      return NextResponse.json({ error: 'Missing complaint id' }, { status: 400 })
    }

    await deleteComplaint(id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting complaint:', error)
    return NextResponse.json({ error: 'Failed to delete complaint' }, { status: 500 })
  }
}
