import { NextRequest, NextResponse } from 'next/server'
import { readTasks, updateTask, deleteTask } from '@/lib/omsData'

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const { id } = params

    const updated = await updateTask(id, body)
    if (!updated) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating task:', error)
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const tasks = await readTasks()
    const taskExists = tasks.some(t => t.id === id)

    if (!taskExists) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    await deleteTask(id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting task:', error)
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 })
  }
}
