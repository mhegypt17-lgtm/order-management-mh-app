'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import type { User } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { useVisibilityPoll } from '@/hooks/useVisibilityPoll'

interface ChatMessage {
  id: string
  role: 'cs' | 'branch' | 'admin'
  author: string
  text: string
  createdAt: string
  replyToId?: string | null
  replyToAuthor?: string | null
  replyToText?: string | null
  mentions?: string[] | null
}

// Matches the server's MENTION_RE — used only for client-side highlighting,
// the actual mentions array is computed and stored server-side.
const MENTION_RE = /(@admin|@cs|@branch)\b/gi
const MENTION_LABELS: Record<string, string> = {
  admin: 'الإدارة',
  cs: 'خدمة العملاء',
  branch: 'الفرع',
}

function renderMessageText(text: string) {
  const parts = text.split(MENTION_RE)
  return parts.map((part, i) => {
    const key = part.slice(1).toLowerCase()
    if (MENTION_LABELS[key]) {
      return (
        <span
          key={i}
          className="font-bold bg-yellow-200/70 text-gray-900 rounded px-0.5"
        >
          {part}
        </span>
      )
    }
    return <span key={i}>{part}</span>
  })
}

interface ChatButtonProps {
  user: User
}

// Phase 2D.1a: dropped the 60s fallback poll entirely. Realtime provides
// live INSERTs (see subscribe below) and useVisibilityPoll(fetchMessages,
// null) still catches us up when the tab regains focus, which is when the
// user actually looks at the chat panel. This eliminates a per-user
// background request every minute across every open tab.
const MAX_MESSAGES = 200
const lastSeenKey = (userId: string) => `chat:lastSeen:${userId}`

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function roleBadge(role: ChatMessage['role']) {
  const map = {
    cs: { label: 'خدمة العملاء', cls: 'bg-blue-100 text-blue-700 border-blue-300' },
    branch: { label: 'الفرع', cls: 'bg-orange-100 text-orange-700 border-orange-300' },
    admin: { label: 'الإدارة', cls: 'bg-purple-100 text-purple-700 border-purple-300' },
  } as const
  return map[role]
}

export default function ChatButton({ user }: ChatButtonProps) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
  const [lastSeen, setLastSeen] = useState<number>(() => {
    if (typeof window === 'undefined') return 0
    const v = window.localStorage.getItem(lastSeenKey(user.id))
    return v ? parseInt(v, 10) : 0
  })

  const panelRef = useRef<HTMLDivElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const knownIdsRef = useRef<Set<string>>(new Set())
  const initialLoadRef = useRef(true)
  // Highest createdAt seen — used as the `since` cursor for incremental
  // fetches so we never re-download the same 200 messages.
  const sinceTsRef = useRef<number>(0)
  // Latest user.role / user.name available to the fetcher & merge logic
  // without forcing a re-create.
  const userRoleRef = useRef(user.role)
  const userNameRef = useRef(user.name)
  useEffect(() => { userRoleRef.current = user.role }, [user.role])
  useEffect(() => { userNameRef.current = user.name }, [user.name])
  const openRef = useRef(open)
  useEffect(() => { openRef.current = open }, [open])

  const mergeMessages = useCallback((incoming: ChatMessage[]) => {
    if (!incoming.length) return
    setMessages((prev) => {
      const existing = new Set(prev.map((m) => m.id))
      const fresh = incoming.filter((m) => !existing.has(m.id))
      if (fresh.length === 0) return prev
      const merged = [...prev, ...fresh].slice(-MAX_MESSAGES)
      // Update since cursor
      for (const m of fresh) {
        const ts = new Date(m.createdAt).getTime()
        if (ts > sinceTsRef.current) sinceTsRef.current = ts
      }
      // Toast for messages from another role, or ones that @-mention my
      // role (even from my own role's channel), when panel is closed.
      if (!initialLoadRef.current && !openRef.current) {
        const notable = fresh.filter(
          (m) =>
            m.author !== userNameRef.current &&
            (m.role !== userRoleRef.current || m.mentions?.includes(userRoleRef.current)),
        )
        if (notable.length > 0) {
          const top = notable[notable.length - 1]
          const mentioned = top.mentions?.includes(userRoleRef.current)
          toast(`${mentioned ? '📣' : '💬'} ${top.author}: ${top.text.slice(0, 60)}`, {
            duration: 4000,
            style: { textAlign: 'right', direction: 'rtl' },
          })
        }
      }
      for (const m of fresh) knownIdsRef.current.add(m.id)
      return merged
    })
  }, [])

  const fetchMessages = useCallback(async () => {
    try {
      const url = sinceTsRef.current
        ? `/api/chat?since=${sinceTsRef.current}`
        : '/api/chat'
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      const next: ChatMessage[] = Array.isArray(data.messages) ? data.messages : []
      if (sinceTsRef.current === 0) {
        // Initial load — hydrate full set without merge dedupe overhead.
        setMessages(next)
        knownIdsRef.current = new Set(next.map((m) => m.id))
        for (const m of next) {
          const ts = new Date(m.createdAt).getTime()
          if (ts > sinceTsRef.current) sinceTsRef.current = ts
        }
        initialLoadRef.current = false
      } else {
        mergeMessages(next)
      }
    } catch {
      /* silent */
    }
  }, [mergeMessages])

  // Initial fetch + Realtime subscription. Visibility handling & focus
  // refetch live in the useVisibilityPoll hook below (no periodic poll:
  // Realtime is authoritative, and focus refetch handles the reconnect
  // corner case).
  useEffect(() => {
    // 1) Initial load (last 200 messages).
    fetchMessages()

    // 2) Realtime: push new INSERTs straight to the merge buffer.
    const channel = supabase
      .channel('chat-messages-rt')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        (payload) => {
          const row = payload.new as ChatMessage
          if (row && row.id) mergeMessages([row])
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // fetchMessages is stable thanks to refs; mergeMessages too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Refetch when tab regains focus (no periodic poll — pass null).
  useVisibilityPoll(fetchMessages, null)

  // Outside click to close
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Auto-scroll to bottom when messages arrive or panel opens
  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages, open])

  // When opening, mark all as read
  useEffect(() => {
    if (open) {
      const now = Date.now()
      window.localStorage.setItem(lastSeenKey(user.id), String(now))
      setLastSeen(now)
    }
  }, [open, user.id])

  const unreadCount = messages.filter(
    (m) => m.role !== user.role && new Date(m.createdAt).getTime() > lastSeen,
  ).length

  const sendMessage = async () => {
    const value = text.trim()
    if (!value) return
    if (value.length > 1000) {
      toast.error('الرسالة طويلة جداً')
      return
    }
    setSending(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: user.role,
          author: user.name,
          text: value,
          replyToId: replyTo?.id,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error || 'failed')
      }
      const data = await res.json()
      setMessages((prev) => [...prev, data.message])
      knownIdsRef.current.add(data.message.id)
      setText('')
      setReplyTo(null)
    } catch (e: any) {
      toast.error(e?.message || 'تعذر إرسال الرسالة')
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // IME composition guard — Arabic keyboards (especially with
    // autocomplete/prediction on Windows and mobile) fire an Enter key
    // event to COMMIT the composed word, not to submit the message. If
    // we don't skip these, every prediction-commit accidentally sends
    // the message. `keyCode === 229` is the legacy signal some browsers
    // still emit while composing.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-lg hover:bg-gray-100 transition"
        aria-label="المحادثة"
        title="محادثة الفرع وخدمة العملاء"
      >
        <span className="text-xl">💬</span>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          dir="rtl"
          className="fixed sm:absolute top-16 sm:top-auto right-2 sm:right-auto left-2 sm:left-0 sm:mt-2 sm:w-[420px] max-w-[calc(100vw-1rem)] bg-white rounded-xl shadow-2xl border border-gray-200 z-50 flex flex-col"
          style={{ maxHeight: '70vh' }}
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-200 bg-gradient-to-l from-red-50 to-white rounded-t-xl flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-gray-900">💬 المحادثة</h3>
              <p className="text-[11px] text-gray-500">قناة موحدة بين الفرع وخدمة العملاء</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-gray-400 hover:text-gray-600 text-lg"
              aria-label="إغلاق"
            >
              ✕
            </button>
          </div>

          {/* Messages */}
          <div
            ref={listRef}
            className="flex-1 overflow-y-auto px-3 py-3 space-y-2 bg-gray-50"
            style={{ minHeight: '280px', maxHeight: '50vh' }}
          >
            {messages.length === 0 ? (
              <div className="text-center text-sm text-gray-400 py-10">
                لا توجد رسائل بعد. ابدأ الحوار 👋
              </div>
            ) : (
              messages.map((m) => {
                const mine = m.role === user.role && m.author === user.name
                const badge = roleBadge(m.role)
                return (
                  <div
                    key={m.id}
                    className={`group flex items-end gap-1 ${mine ? 'justify-start' : 'justify-end'}`}
                  >
                    {mine && (
                      <button
                        type="button"
                        onClick={() => setReplyTo(m)}
                        className="opacity-0 group-hover:opacity-100 transition text-gray-400 hover:text-red-600 text-xs shrink-0"
                        title="رد"
                        aria-label="رد على الرسالة"
                      >
                        ↩
                      </button>
                    )}
                    <div
                      className={`max-w-[80%] rounded-2xl px-3 py-2 shadow-sm border ${
                        mine
                          ? 'bg-red-600 text-white border-red-700 rounded-bl-sm'
                          : 'bg-white text-gray-900 border-gray-200 rounded-br-sm'
                      }`}
                    >
                      {!mine && (
                        <div className="flex items-center gap-1 mb-1">
                          <span
                            className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold border ${badge.cls}`}
                          >
                            {badge.label}
                          </span>
                          <span className="text-[11px] text-gray-600 font-semibold">
                            {m.author}
                          </span>
                        </div>
                      )}
                      {m.replyToId && (
                        <div
                          className={`text-[11px] rounded-lg px-2 py-1 mb-1 border-r-2 truncate ${
                            mine
                              ? 'bg-red-700/40 border-red-200 text-red-50'
                              : 'bg-gray-100 border-gray-300 text-gray-600'
                          }`}
                        >
                          <span className="font-bold">{m.replyToAuthor}: </span>
                          {m.replyToText}
                        </div>
                      )}
                      <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                        {renderMessageText(m.text)}
                      </p>
                      <div
                        className={`text-[10px] mt-1 ${mine ? 'text-red-100' : 'text-gray-400'}`}
                      >
                        {formatTime(m.createdAt)}
                      </div>
                    </div>
                    {!mine && (
                      <button
                        type="button"
                        onClick={() => setReplyTo(m)}
                        className="opacity-0 group-hover:opacity-100 transition text-gray-400 hover:text-red-600 text-xs shrink-0"
                        title="رد"
                        aria-label="رد على الرسالة"
                      >
                        ↩
                      </button>
                    )}
                  </div>
                )
              })
            )}
          </div>

          {/* Reply preview bar */}
          {replyTo && (
            <div
              dir="rtl"
              className="px-3 py-2 border-t border-gray-200 bg-gray-50 flex items-center justify-between gap-2"
            >
              <div className="text-[11px] text-gray-600 truncate">
                <span className="font-bold">الرد على {replyTo.author}: </span>
                {replyTo.text.slice(0, 60)}
              </div>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                className="text-gray-400 hover:text-gray-600 text-sm shrink-0"
                aria-label="إلغاء الرد"
              >
                ✕
              </button>
            </div>
          )}

          {/* Composer */}
          <div className="border-t border-gray-200 p-3 bg-white rounded-b-xl">
            <div className="flex gap-2 items-end">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="اكتب رسالتك... (Enter للإرسال، Shift+Enter لسطر جديد)"
                rows={2}
                maxLength={1000}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <button
                type="button"
                onClick={sendMessage}
                disabled={sending || !text.trim()}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-sm disabled:opacity-50"
              >
                {sending ? '...' : 'إرسال'}
              </button>
            </div>
            <p className="text-[10px] text-gray-400 mt-1 text-left">
              {text.length}/1000
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
