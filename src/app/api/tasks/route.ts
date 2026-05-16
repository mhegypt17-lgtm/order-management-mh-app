import { NextRequest, NextResponse } from 'next/server'
import { readTasks, createTask } from '@/lib/omsData'

export async function GET(request: NextRequest) {
  try {
    const tasks = await readTasks()
    
    // Filter by assignedTo if provided
    const assignedTo = request.nextUrl.searchParams.get('assignedTo')
    const filteredTasks = assignedTo 
      ? tasks.filter(t => t.assignedTo === assignedTo)
      : tasks

    return NextResponse.json(filteredTasks)
  } catch (error) {
    console.error('Error reading tasks:', error)
    return NextResponse.json({ error: 'Failed to read tasks' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const task = await createTask({
      title: body.title,
      description: body.description,
      assignedTo: body.assignedTo,
      linkedOrderId: body.linkedOrderId || null,
      status: 'جديدة',
      priority: body.priority || 'متوسطة',
      dueDate: body.dueDate || null,
      createdBy: body.createdBy,
    })

    return NextResponse.json(task, { status: 201 })
  } catch (error) {
    console.error('Error creating task:', error)
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 })
  }
}
