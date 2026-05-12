'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import type { User } from '@/lib/auth'

interface ChatMessage {
  id: string
  role: 'cs' | 'branch' | 'admin'
  author: string
  text: string
  createdAt: string
}

interface ChatButtonProps {
  user: User
}

const POLL_MS = 5_000
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
  const [lastSeen, setLastSeen] = useState<number>(() => {
    if (typeof window === 'undefined') return 0
    const v = window.localStorage.getItem(lastSeenKey(user.id))
    return v ? parseInt(v, 10) : 0
  })

  const panelRef = useRef<HTMLDivElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const knownIdsRef = useRef<Set<string>>(new Set())
  const initialLoadRef = useRef(true)

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch('/api/chat', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      const next: ChatMessage[] = Array.isArray(data.messages) ? data.messages : []
      setMessages(next)

      if (!initialLoadRef.current) {
        const fresh = next.filter(
          (m) => !knownIdsRef.current.has(m.id) && m.role !== user.role,
        )
        if (fresh.length > 0 && !open) {
          const top = fresh[fresh.length - 1]
          toast(`💬 ${top.author}: ${top.text.slice(0, 60)}`, {
            duration: 4000,
            style: { textAlign: 'right', direction: 'rtl' },
          })
        }
      }
      knownIdsRef.current = new Set(next.map((m) => m.id))
      initialLoadRef.current = false
    } catch {
      /* silent */
    }
  }, [open, user.role])

  useEffect(() => {
    fetchMessages()
    const id = setInterval(fetchMessages, POLL_MS)
    return () => clearInterval(id)
  }, [fetchMessages])

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
    } catch (e: any) {
      toast.error(e?.message || 'تعذر إرسال الرسالة')
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
          className="absolute left-0 mt-2 w-[360px] sm:w-[420px] bg-white rounded-xl shadow-2xl border border-gray-200 z-50 flex flex-col"
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
                    className={`flex ${mine ? 'justify-start' : 'justify-end'}`}
                  >
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
                      <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                        {m.text}
                      </p>
                      <div
                        className={`text-[10px] mt-1 ${mine ? 'text-red-100' : 'text-gray-400'}`}
                      >
                        {formatTime(m.createdAt)}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>

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
