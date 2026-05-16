import { NextRequest, NextResponse } from 'next/server'
import { readDailyBriefings, createDailyBriefing, updateDailyBriefing, deleteDailyBriefing } from '@/lib/omsData'

export async function GET(request: NextRequest) {
  try {
    const briefings = await readDailyBriefings()
    
    // Optionally filter by type
    const type = request.nextUrl.searchParams.get('type')
    const filteredBriefings = type 
      ? briefings.filter(b => b.type === type)
      : briefings

    // Sort: incomplete first, then by priority (high > medium > low), then by newest
    const sorted = filteredBriefings.sort((a, b) => {
      if (a.isCompleted !== b.isCompleted) {
        return a.isCompleted ? 1 : -1
      }
      const priorityOrder = { high: 0, medium: 1, low: 2 }
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority]
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })

    return NextResponse.json(sorted)
  } catch (error) {
    console.error('Error reading daily briefings:', error)
    return NextResponse.json({ error: 'Failed to read briefings' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const briefing = await createDailyBriefing({
      authorName: body.authorName,
      authorRole: body.authorRole || 'cs',
      message: body.message,
      type: body.type || 'general',
      priority: body.priority || 'medium',
      isCompleted: false,
    })

    return NextResponse.json(briefing, { status: 201 })
  } catch (error) {
    console.error('Error creating briefing:', error)
    return NextResponse.json({ error: 'Failed to create briefing' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id } = body

    if (!id) {
      return NextResponse.json({ error: 'Missing briefing id' }, { status: 400 })
    }

    const updated = await updateDailyBriefing(id, {
      message: body.message,
      type: body.type,
      priority: body.priority,
      isCompleted: body.isCompleted,
    })

    if (!updated) {
      return NextResponse.json({ error: 'Briefing not found' }, { status: 404 })
    }

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating briefing:', error)
    return NextResponse.json({ error: 'Failed to update briefing' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const { id } = body

    if (!id) {
      return NextResponse.json({ error: 'Missing briefing id' }, { status: 400 })
    }

    await deleteDailyBriefing(id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting briefing:', error)
    return NextResponse.json({ error: 'Failed to delete briefing' }, { status: 500 })
  }
}
