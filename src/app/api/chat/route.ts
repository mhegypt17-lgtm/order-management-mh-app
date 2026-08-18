import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// Always run fresh — chat must never be cached.
export const dynamic = 'force-dynamic'
export const revalidate = 0

const MAX_MESSAGES = 200 // most-recent window returned by GET
type ChatRole = 'cs' | 'branch' | 'admin'

interface ChatMessage {
  id: string
  role: ChatRole
  author: string
  text: string
  createdAt: string
  replyToId?: string | null
  replyToAuthor?: string | null
  replyToText?: string | null
  mentions?: string[] | null
}

// Role tokens that can be @-mentioned in a message (kept to the 3 existing
// chat roles so this needs no user directory lookup / extra egress).
const MENTIONABLE_ROLES: ChatRole[] = ['cs', 'branch', 'admin']
const MENTION_RE = /@(admin|cs|branch)\b/gi
const REPLY_SNIPPET_LEN = 80

function extractMentions(text: string): string[] | null {
  const found = new Set<string>()
  for (const m of text.matchAll(MENTION_RE)) {
    const role = m[1].toLowerCase() as ChatRole
    if (MENTIONABLE_ROLES.includes(role)) found.add(role)
  }
  return found.size > 0 ? Array.from(found) : null
}

export async function GET(req: NextRequest) {
  try {
    const sinceParam = req.nextUrl.searchParams.get('since')
    const sinceTs = sinceParam ? Number(sinceParam) : 0

    let query = supabase
      .from('chat_messages')
      .select('id, role, author, text, "createdAt", "replyToId", "replyToAuthor", "replyToText", "mentions"')
      .order('"createdAt"', { ascending: false })
      .limit(MAX_MESSAGES)

    if (sinceTs && Number.isFinite(sinceTs)) {
      query = query.gt('"createdAt"', new Date(sinceTs).toISOString())
    }

    const { data, error } = await query
    if (error) {
      console.error('GET /api/chat supabase error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Return oldest → newest for the UI.
    const messages: ChatMessage[] = ((data as ChatMessage[]) || []).slice().reverse()

    return NextResponse.json({
      messages,
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
    const replyToId = body?.replyToId ? String(body.replyToId) : null

    if (!['cs', 'branch', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'role غير صالح' }, { status: 400 })
    }
    if (!author) return NextResponse.json({ error: 'author مطلوب' }, { status: 400 })
    if (!text) return NextResponse.json({ error: 'الرسالة فارغة' }, { status: 400 })
    if (text.length > 1000) return NextResponse.json({ error: 'الرسالة طويلة جداً' }, { status: 400 })

    // Resolve the reply target server-side (single indexed lookup by pk) so
    // the quoted preview can't be spoofed by the client, and denormalize it
    // onto the new row so reads never need a join.
    let replyToAuthor: string | null = null
    let replyToText: string | null = null
    let resolvedReplyToId: string | null = null
    if (replyToId) {
      const { data: parent } = await supabase
        .from('chat_messages')
        .select('id, author, text')
        .eq('id', replyToId)
        .maybeSingle()
      if (parent) {
        resolvedReplyToId = parent.id
        replyToAuthor = parent.author
        replyToText =
          parent.text.length > REPLY_SNIPPET_LEN
            ? `${parent.text.slice(0, REPLY_SNIPPET_LEN)}…`
            : parent.text
      }
    }

    const msg: ChatMessage = {
      id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      role,
      author,
      text,
      createdAt: new Date().toISOString(),
      replyToId: resolvedReplyToId,
      replyToAuthor,
      replyToText,
      mentions: extractMentions(text),
    }

    const { error } = await supabase.from('chat_messages').insert(msg)
    if (error) {
      console.error('POST /api/chat supabase error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ message: msg })
  } catch (error: any) {
    console.error('POST /api/chat error:', error)
    return NextResponse.json({ error: error?.message || 'failed' }, { status: 500 })
  }
}
