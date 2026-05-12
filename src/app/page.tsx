'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/auth'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const [email, setEmail] = useState('admin@example.com')
  const [password, setPassword] = useState('123456')
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const { login } = useAuthStore()

  const fillDemoAccount = (role: 'admin' | 'cs' | 'branch') => {
    const map = {
      admin: 'admin@example.com',
      cs: 'cs@example.com',
      branch: 'branch@example.com',
    }
    setEmail(map[role])
    setPassword('123456')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      await login(email, password)
      toast.success('✅ تم تسجيل الدخول بنجاح')
      
      // Redirect based on role
      setTimeout(() => {
        const user = useAuthStore.getState().user
        if (user?.role === 'cs') {
          router.push('/orders/new')
        } else if (user?.role === 'branch') {
          router.push('/branch')
        } else if (user?.role === 'admin') {
          router.push('/dashboard')
        }
      }, 500)
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

        {/* Demo Info */}
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-6 text-sm rtl-text">
          <p className="font-semibold text-red-900 mb-2">🔐 حسابات تجريبية:</p>
          <ul className="space-y-1 text-red-800 text-xs">
            <li>• الإدارة: admin@example.com / 123456</li>
            <li>• خدمة العملاء: cs@example.com / 123456</li>
            <li>• الفرع: branch@example.com / 123456</li>
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fillDemoAccount('admin')}
              className="px-2 py-1 text-xs rounded bg-white border border-red-200 text-red-700 hover:bg-red-100"
            >
              دخول كإدارة
            </button>
            <button
              type="button"
              onClick={() => fillDemoAccount('cs')}
              className="px-2 py-1 text-xs rounded bg-white border border-red-200 text-red-700 hover:bg-red-100"
            >
              دخول كخدمة العملاء
            </button>
            <button
              type="button"
              onClick={() => fillDemoAccount('branch')}
              className="px-2 py-1 text-xs rounded bg-white border border-red-200 text-red-700 hover:bg-red-100"
            >
              دخول كفرع
            </button>
          </div>
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
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-right"
              dir="rtl"
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
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-right"
              dir="rtl"
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
        </form>

        {/* Footer */}
        <p className="text-center text-xs text-gray-500 mt-6">
          جاهز للاستخدام
        </p>
      </div>
    </div>
  )
}
