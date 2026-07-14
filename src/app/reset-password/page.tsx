'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/lib/auth'
import toast from 'react-hot-toast'

export default function ResetPasswordPage() {
  const router = useRouter()
  const refreshFromSession = useAuthStore((s) => s.refreshFromSession)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [ready, setReady] = useState(false)

  // When Supabase redirects here from the recovery email, the token is
  // exchanged automatically by supabase-js and fires a PASSWORD_RECOVERY
  // event. We wait for a valid session before allowing submit.
  useEffect(() => {
    let cancelled = false

    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session) setReady(true)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        setReady(true)
      }
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (password.length < 8) {
      toast.error('يجب أن تكون كلمة المرور 8 أحرف على الأقل')
      return
    }
    if (password !== confirm) {
      toast.error('كلمتا المرور غير متطابقتين')
      return
    }

    setIsLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error

      toast.success('✅ تم تغيير كلمة المرور بنجاح')

      // The recovery session is now a real session — reconcile & land the
      // user on their role's home page.
      await refreshFromSession()
      const user = useAuthStore.getState().user
      if (user?.role === 'cs') router.replace('/orders/new')
      else if (user?.role === 'branch') router.replace('/branch')
      else if (user?.role === 'admin') router.replace('/dashboard')
      else router.replace('/')
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'تعذر تغيير كلمة المرور',
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
            تعيين كلمة مرور جديدة
          </h1>
          <p className="text-sm text-gray-600">
            أدخل كلمة المرور الجديدة الخاصة بحسابك
          </p>
        </div>

        {!ready ? (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-900 text-right">
            ⏳ جاري التحقق من الرابط... إذا لم يعمل، افتح رابط الاستعادة من
            بريدك الإلكتروني مرة أخرى.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 text-right">
                كلمة المرور الجديدة
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-right"
                dir="ltr"
                minLength={8}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 text-right">
                تأكيد كلمة المرور
              </label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-right"
                dir="ltr"
                minLength={8}
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-semibold py-2 px-4 rounded-lg transition duration-200 mt-2"
            >
              {isLoading ? '⏳ جاري الحفظ...' : '💾 حفظ كلمة المرور'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
