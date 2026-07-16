'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'

type ReportMode = 'daily' | 'weekly'

const CONFIG = {
  daily: {
    title: '📊 معاينة تقرير العمليات اليومي',
    hint: 'نفس المحتوى اللي بيتبعت كل صباح ٦ ص القاهرة (٠٤:٠٠ UTC).',
    previewUrl: '/api/admin/reports/daily/preview',
    sendUrl: '/api/admin/reports/daily/send-test',
    confirmMsg: 'إرسال تقرير أمس على البريد فورًا لكل من في REPORT_RECIPIENTS؟',
  },
  weekly: {
    title: '📈 معاينة التقرير الأسبوعي',
    hint: 'التقرير الأسبوعي بيتبعت كل يوم أحد ٨ ص القاهرة (٠٦:٠٠ UTC) — بيغطي آخر ٧ أيام.',
    previewUrl: '/api/admin/reports/weekly/preview',
    sendUrl: '/api/admin/reports/weekly/send-test',
    confirmMsg: 'إرسال التقرير الأسبوعي على البريد فورًا لكل من في REPORT_RECIPIENTS؟',
  },
} as const

/**
 * Admin preview for the daily + weekly ops emails.
 * Both are the exact HTML the cron will send.
 */
export default function ReportPreviewPage() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [mode, setMode] = useState<ReportMode>('daily')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  const load = useCallback(
    async (m: ReportMode) => {
      setLoading(true)
      try {
        const { data: session } = await supabase.auth.getSession()
        const token = session.session?.access_token
        if (!token) throw new Error('انتهت الجلسة، سجّل الدخول من جديد')

        const res = await fetch(CONFIG[m].previewUrl, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) {
          const body = await res.text()
          throw new Error(body || `HTTP ${res.status}`)
        }
        const html = await res.text()
        if (iframeRef.current?.contentDocument) {
          iframeRef.current.contentDocument.open()
          iframeRef.current.contentDocument.write(html)
          iframeRef.current.contentDocument.close()
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'فشل التحميل')
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    load(mode)
  }, [load, mode])

  const sendTest = async () => {
    if (!confirm(CONFIG[mode].confirmMsg)) return
    setSending(true)
    try {
      const res = await fetch(CONFIG[mode].sendUrl, {
        method: 'POST',
        headers: await authHeaders(),
      })
      const text = await res.text()
      let parsed: Record<string, unknown> = {}
      try {
        parsed = JSON.parse(text) as Record<string, unknown>
      } catch {
        /* not JSON */
      }
      if (!res.ok) {
        throw new Error(
          typeof parsed.error === 'string'
            ? parsed.error
            : `HTTP ${res.status}: ${text.slice(0, 200)}`,
        )
      }
      toast.success(`✅ تم الإرسال إلى ${parsed.recipients} عناوين`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'فشل الإرسال')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4" dir="rtl">
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {CONFIG[mode].title}
            </h1>
            <p className="text-sm text-gray-600 mt-1">{CONFIG[mode].hint}</p>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
              <button
                onClick={() => setMode('daily')}
                className={`px-3 py-2 text-sm font-medium ${
                  mode === 'daily'
                    ? 'bg-red-700 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                📊 يومي
              </button>
              <button
                onClick={() => setMode('weekly')}
                className={`px-3 py-2 text-sm font-medium ${
                  mode === 'weekly'
                    ? 'bg-red-700 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                📈 أسبوعي
              </button>
            </div>
            <button
              onClick={() => load(mode)}
              disabled={loading}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              {loading ? '⏳ جارٍ التحميل...' : '🔄 تحديث المعاينة'}
            </button>
            <button
              onClick={sendTest}
              disabled={sending}
              className="px-4 py-2 bg-red-700 text-white rounded-lg hover:bg-red-800 disabled:opacity-50 font-semibold"
            >
              {sending ? '⏳ جارٍ الإرسال...' : '📤 إرسال اختباري'}
            </button>
            <Link
              href="/admin/settings"
              className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900"
            >
              ← رجوع
            </Link>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <iframe
          ref={iframeRef}
          title={`${mode} report preview`}
          className="w-full"
          style={{ height: '80vh', border: 'none' }}
        />
      </div>
    </div>
  )
}

async function authHeaders() {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}
