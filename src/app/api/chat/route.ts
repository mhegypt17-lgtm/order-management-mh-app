import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const DATA_DIR = path.join(process.cwd(), 'data')
const CHAT_FILE = path.join(DATA_DIR, 'chat_messages.json')
const MAX_MESSAGES = 500 // keep file size sane

type ChatRole = 'cs' | 'branch' | 'admin'

interface ChatMessage {
  id: string
  role: ChatRole
  author: string
  text: string
  createdAt: string
}

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  if (!fs.existsSync(CHAT_FILE)) fs.writeFileSync(CHAT_FILE, '[]')
}

function readAll(): ChatMessage[] {
  ensure()
  try {
    const raw = fs.readFileSync(CHAT_FILE, 'utf-8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeAll(msgs: ChatMessage[]) {
  ensure()
  fs.writeFileSync(CHAT_FILE, JSON.stringify(msgs, null, 2))
}

export async function GET(req: NextRequest) {
  try {
    const messages = readAll()
    const sinceParam = req.nextUrl.searchParams.get('since')
    const sinceTs = sinceParam ? Number(sinceParam) : 0

    const filtered = sinceTs
      ? messages.filter((m) => new Date(m.createdAt).getTime() > sinceTs)
      : messages.slice(-100) // last 100 by default

    return NextResponse.json({
      messages: filtered,
      serverTime: Date.now(),
    })
  } catch (error: any) {
    console.error('GET /api/chat error:', error)
    return NextResponse.json({ error: error?.message || 'failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    let body: any
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'invalid json' }, { status: 400 })
    }

    const role = body?.role as ChatRole
    const author = String(body?.author || '').trim()
    const text = String(body?.text || '').trim()

    if (!['cs', 'branch', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'role غير صالح' }, { status: 400 })
    }
    if (!author) return NextResponse.json({ error: 'author مطلوب' }, { status: 400 })
    if (!text) return NextResponse.json({ error: 'الرسالة فارغة' }, { status: 400 })
    if (text.length > 1000) return NextResponse.json({ error: 'الرسالة طويلة جداً' }, { status: 400 })

    const msg: ChatMessage = {
      id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      role,
      author,
      text,
      createdAt: new Date().toISOString(),
    }

    const all = readAll()
    all.push(msg)
    // Trim to last MAX_MESSAGES
    const trimmed = all.length > MAX_MESSAGES ? all.slice(-MAX_MESSAGES) : all
    writeAll(trimmed)

    return NextResponse.json({ message: msg })
  } catch (error: any) {
    console.error('POST /api/chat error:', error)
    return NextResponse.json({ error: error?.message || 'failed' }, { status: 500 })
  }
}
