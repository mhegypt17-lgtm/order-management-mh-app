'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'

/**
 * Admin preview of the daily ops email report.
 *
 * Loads the same HTML the cron will send, into an <iframe>, so the design
 * can be iterated on without triggering real emails. A "Send test email"
 * button also lets admins fire the cron endpoint on demand.
 */
export default function DailyReportPreviewPage() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data: session } = await supabase.auth.getSession()
      const token = session.session?.access_token
      if (!token) throw new Error('انتهت الجلسة، سجّل الدخول من جديد')

      const res = await fetch('/api/admin/reports/daily/preview', {
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
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const sendTest = async () => {
    if (
      !confirm(
        'إرسال تقرير أمس على البريد فورًا لكل من في REPORT_RECIPIENTS؟',
      )
    )
      return
    setSending(true)
    try {
      const res = await fetch('/api/admin/reports/daily/send-test', {
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
              📊 معاينة تقرير العمليات اليومي
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              نفس المحتوى اللي هيتبعت كل صباح على البريد. أضغط "إرسال اختباري"
              لإرسال التقرير فورًا لقائمة المستلمين.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={load}
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
          title="Daily report preview"
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
