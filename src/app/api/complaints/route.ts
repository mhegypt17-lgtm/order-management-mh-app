import { NextRequest, NextResponse } from 'next/server'
import {
  readComplaints,
  createComplaint,
  updateComplaint,
  deleteComplaint,
  addComplaintComment,
  readOrders,
  readCustomers,
} from '@/lib/omsData'

export async function GET(request: NextRequest) {
  try {
    const complaints = readComplaints()
    
    // Optional filters
    const status = request.nextUrl.searchParams.get('status')
    const channel = request.nextUrl.searchParams.get('channel')
    const assignedTo = request.nextUrl.searchParams.get('assignedTo')
    
    let filtered = complaints
    
    if (status) {
      filtered = filtered.filter((c) => c.status === status)
    }
    if (channel) {
      filtered = filtered.filter((c) => c.channel === channel)
    }
    if (assignedTo) {
      filtered = filtered.filter((c) => c.assignedTo === assignedTo)
    }

    // Sort: open first, then by priority (high > medium > low), then newest
    const sorted = filtered.sort((a, b) => {
      if (a.status !== b.status) {
        const statusOrder = { open: 0, 'in-progress': 1, closed: 2 }
        return statusOrder[a.status as keyof typeof statusOrder] - statusOrder[b.status as keyof typeof statusOrder]
      }
      const priorityOrder = { high: 0, medium: 1, low: 2 }
      if (priorityOrder[a.priority as keyof typeof priorityOrder] !== priorityOrder[b.priority as keyof typeof priorityOrder]) {
        return priorityOrder[a.priority as keyof typeof priorityOrder] - priorityOrder[b.priority as keyof typeof priorityOrder]
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })

    return NextResponse.json(sorted)
  } catch (error) {
    console.error('Error reading complaints:', error)
    return NextResponse.json({ error: 'Failed to read complaints' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const complaint = createComplaint({
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
      const updated = addComplaintComment(id, body.authorName, body.text)
      if (!updated) {
        return NextResponse.json({ error: 'Complaint not found' }, { status: 404 })
      }
      return NextResponse.json(updated)
    }

    // Handle regular update
    const updated = updateComplaint(id, {
      subject: body.subject,
      description: body.description,
      reason: body.reason,
      status: body.status,
      priority: body.priority,
      assignedTo: body.assignedTo,
      compensationAmount: Number(body.compensationAmount) || 0,
      closedAt: body.status === 'closed' && !body.closedAt ? new Date().toISOString() : body.closedAt,
    })

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

    deleteComplaint(id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting complaint:', error)
    return NextResponse.json({ error: 'Failed to delete complaint' }, { status: 500 })
  }
}
