import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const NOTES_FILE = path.join(process.cwd(), 'data', 'customer_notes.json')

export interface CustomerNote {
  id: string
  customerId: string
  note: string
  author: string
  role: 'cs' | 'admin'
  createdAt: string
  updatedAt: string
}

function readNotes(): CustomerNote[] {
  try {
    if (!fs.existsSync(NOTES_FILE)) {
      fs.writeFileSync(NOTES_FILE, '[]')
      return []
    }
    const raw = fs.readFileSync(NOTES_FILE, 'utf-8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeNotes(notes: CustomerNote[]) {
  fs.writeFileSync(NOTES_FILE, JSON.stringify(notes, null, 2))
}

// GET: list notes for a customer
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const notes = readNotes()
    .filter((n) => n.customerId === params.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  return NextResponse.json(notes)
}

// POST: add a new note
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json()
    const noteText = (body.note || '').toString().trim()
    const author = (body.author || 'مستخدم').toString().trim()
    const role = body.role === 'admin' ? 'admin' : 'cs'

    if (!noteText) {
      return NextResponse.json({ error: 'Note text required' }, { status: 400 })
    }
    if (noteText.length > 500) {
      return NextResponse.json({ error: 'Note too long (max 500 chars)' }, { status: 400 })
    }

    const notes = readNotes()
    const now = new Date().toISOString()
    const newNote: CustomerNote = {
      id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      customerId: params.id,
      note: noteText,
      author,
      role,
      createdAt: now,
      updatedAt: now,
    }
    notes.push(newNote)
    writeNotes(notes)
    return NextResponse.json(newNote, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
