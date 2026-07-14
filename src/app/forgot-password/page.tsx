'use client'

import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setIsLoading(true)

    try {
      const redirectTo =
        typeof window !== 'undefined'
          ? `${window.location.origin}/reset-password`
          : undefined

      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        redirectTo ? { redirectTo } : undefined,
      )

      if (error) throw error

      setSent(true)
      toast.success('تم إرسال رابط إعادة التعيين إلى بريدك الإلكتروني')
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'تعذر إرسال رابط إعادة التعيين',
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-rose-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            استعادة كلمة المرور
          </h1>
          <p className="text-sm text-gray-600">
            سنرسل لك رابطاً لإعادة تعيين كلمة المرور على بريدك الإلكتروني
          </p>
        </div>

        {sent ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-900 text-right">
            ✅ تم إرسال رسالة إلى{' '}
            <span className="font-semibold" dir="ltr">
              {email}
            </span>
            . تحقق من صندوق الوارد (ومجلد الرسائل غير المرغوب فيها) واتبع الرابط.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 text-right">
                البريد الإلكتروني
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-right"
                dir="ltr"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-semibold py-2 px-4 rounded-lg transition duration-200"
            >
              {isLoading ? '⏳ جاري الإرسال...' : '📧 إرسال رابط الاستعادة'}
            </button>
          </form>
        )}

        <div className="text-center pt-6">
          <Link
            href="/"
            className="text-sm text-red-600 hover:text-red-700 hover:underline"
          >
            ← العودة لتسجيل الدخول
          </Link>
        </div>
      </div>
    </div>
  )
}
