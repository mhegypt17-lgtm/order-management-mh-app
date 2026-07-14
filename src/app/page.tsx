'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/auth'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const { login, user, hasHydrated } = useAuthStore()

  // If the user is already signed in, jump straight to their landing page.
  useEffect(() => {
    if (!hasHydrated || !user) return
    if (user.role === 'cs') router.replace('/orders/new')
    else if (user.role === 'branch') router.replace('/branch')
    else if (user.role === 'admin') router.replace('/dashboard')
  }, [hasHydrated, user, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      await login(email, password)
      toast.success('✅ تم تسجيل الدخول بنجاح')

      const nextUser = useAuthStore.getState().user
      if (nextUser?.role === 'cs') {
        router.push('/orders/new')
      } else if (nextUser?.role === 'branch') {
        router.push('/branch')
      } else if (nextUser?.role === 'admin') {
        router.push('/dashboard')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'خطأ في تسجيل الدخول')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-rose-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <img src="/logo.jpeg" alt="Meathouse" className="h-16 w-auto mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            نظام إدارة الطلبات
          </h1>
          <p className="text-gray-600">Order Management System</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email */}
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

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 text-right">
              كلمة المرور
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-right"
              dir="ltr"
              required
            />
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-semibold py-2 px-4 rounded-lg transition duration-200 mt-6"
          >
            {isLoading ? '⏳ جاري التحميل...' : '🔓 تسجيل الدخول'}
          </button>

          <div className="text-center pt-2">
            <Link
              href="/forgot-password"
              className="text-sm text-red-600 hover:text-red-700 hover:underline"
            >
              نسيت كلمة المرور؟
            </Link>
          </div>
        </form>

        {/* Footer */}
        <p className="text-center text-xs text-gray-500 mt-6">
          جاهز للاستخدام
        </p>
      </div>
    </div>
  )
}
