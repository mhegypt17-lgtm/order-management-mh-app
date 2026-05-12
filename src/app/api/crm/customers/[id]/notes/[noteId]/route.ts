import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const NOTES_FILE = path.join(process.cwd(), 'data', 'customer_notes.json')

interface CustomerNote {
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
    if (!fs.existsSync(NOTES_FILE)) return []
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

// PATCH: edit a note
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; noteId: string } }
) {
  try {
    const body = await req.json()
    const noteText = (body.note || '').toString().trim()
    const author = (body.author || '').toString().trim()
    const role = body.role === 'admin' ? 'admin' : 'cs'

    if (!noteText) {
      return NextResponse.json({ error: 'Note text required' }, { status: 400 })
    }
    if (noteText.length > 500) {
      return NextResponse.json({ error: 'Note too long (max 500 chars)' }, { status: 400 })
    }

    const notes = readNotes()
    const idx = notes.findIndex(
      (n) => n.id === params.noteId && n.customerId === params.id
    )
    if (idx === -1) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 })
    }
    notes[idx] = {
      ...notes[idx],
      note: noteText,
      author: author || notes[idx].author,
      role,
      updatedAt: new Date().toISOString(),
    }
    writeNotes(notes)
    return NextResponse.json(notes[idx])
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// DELETE: remove a note
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; noteId: string } }
) {
  try {
    const notes = readNotes()
    const filtered = notes.filter(
      (n) => !(n.id === params.noteId && n.customerId === params.id)
    )
    if (filtered.length === notes.length) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 })
    }
    writeNotes(filtered)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
