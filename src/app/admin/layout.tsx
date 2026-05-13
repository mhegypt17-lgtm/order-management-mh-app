'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/auth'
import Navbar from '@/components/Navbar'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const { user, hasHydrated } = useAuthStore()

  useEffect(() => {
    if (!hasHydrated) return

    if (!user) {
      router.push('/')
    } else if (user.role !== 'admin') {
      router.push('/')
    }
  }, [hasHydrated, user, router])

  if (!hasHydrated) {
    return <div className="p-8 text-center text-gray-500">⏳ جاري التحميل...</div>
  }

  if (!user || user.role !== 'admin') {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} />
      <main className="p-3 sm:p-4 lg:p-6 max-w-7xl mx-auto">
        {children}
      </main>
    </div>
  )
}
