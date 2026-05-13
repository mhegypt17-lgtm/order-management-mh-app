'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { usePathname } from 'next/navigation'
import { useAuthStore, User } from '@/lib/auth'
import toast from 'react-hot-toast'
import NotificationBell from './NotificationBell'
import ChatButton from './ChatButton'
import OnDutyBadge from './OnDutyBadge'

interface NavbarProps {
  user: User
}

export default function Navbar({ user }: NavbarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { logout } = useAuthStore()
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  useEffect(() => {
    if (typeof document === 'undefined') return
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  const handleLogout = () => {
    logout()
    toast.success('تم تسجيل الخروج')
    router.push('/')
  }

  const handleMenuNavigation = (href: string) => {
    setMobileOpen(false)
    const isOnNewOrderPage = pathname === '/orders/new'
    const hasUnsavedNewOrderEdits =
      typeof window !== 'undefined' && window.sessionStorage.getItem('order-form-dirty') === 'true'

    if (isOnNewOrderPage && hasUnsavedNewOrderEdits && href !== '/orders/new') {
      const confirmedLeave = window.confirm('You have unsaved changes. Do you want to leave this order?')
      if (!confirmedLeave) return
      router.push(href)
      return
    }

    if (href !== '/orders/new') {
      router.push(href)
      return
    }

    if (isOnNewOrderPage && hasUnsavedNewOrderEdits) {
      const confirmed = window.confirm('Do you want to create a new order and cancel this one?')
      if (!confirmed) return
    }

    window.location.href = `/orders/new?reset=${Date.now()}`
  }

  const menuItems = {
    admin: [
      { label: '📊 لوحة التحكم', href: '/dashboard' },
      { label: '📋 الطلبات', href: '/orders' },
      { label: '➕ طلب جديد', href: '/orders/new' },
      { label: '📈 التقارير', href: '/orders/reports' },
      { label: '🐑 اضاحي', href: '/admin/adahi' },
      { label: '🏍️ التوصيل', href: '/admin/delivery' },
      { label: '⚙️ الإعدادات', href: '/admin/settings' },
      { label: '🕐 الورديات', href: '/admin/shifts' },
      { label: '📦 المنتجات', href: '/admin/products' },
      { label: '👥 Customers', href: '/admin/crm' },
    ],
    cs: [
      { label: '➕ طلب جديد', href: '/orders/new' },
      { label: '📋 الطلبات', href: '/orders' },
      { label: '📋 البريفينج اليومي', href: '/orders/briefings' },
      { label: '🎫 الشكاوى', href: '/orders/complaints' },
      { label: '✅ المهام', href: '/orders/tasks' },
      { label: '🕐 الورديات', href: '/orders/shifts' },
      { label: '🏍️ التوصيل', href: '/orders/delivery' },
      { label: '📦 المنتجات', href: '/orders/products' },
      { label: '📈 التقارير', href: '/orders/reports' },
      { label: '🐑 اضاحي', href: '/orders/adahi' },
      { label: '👥 Customers', href: '/orders/crm' },
    ],
    branch: [
      { label: '🏍️ التوصيلات', href: '/branch' },
      { label: '📊 التقارير', href: '/branch/reports' },
      { label: '🐑 اضاحي', href: '/branch/adahi' },
      { label: '🏍️ التوصيل', href: '/branch/delivery' },
      { label: '📦 المنتجات', href: '/branch/products' },
    ],
  }

  const defaultHome = {
    admin: '/dashboard',
    cs: '/orders/new',
    branch: '/branch',
  }[user.role]

  const roleLabel = {
    admin: 'الإدارة',
    cs: 'خدمة العملاء',
    branch: 'الفرع',
  }[user.role]

  const items = menuItems[user.role as keyof typeof menuItems] || []

  return (
    <>
      <nav className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-40">
        <div className="px-3 sm:px-4 py-2 sm:py-3 max-w-7xl mx-auto flex items-center gap-2 lg:gap-3 lg:flex-wrap">
          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="فتح القائمة"
            className="lg:hidden p-2 -mr-1 rounded-lg hover:bg-gray-100 text-gray-700 min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="3" y1="7" x2="21" y2="7" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="17" x2="21" y2="17" />
            </svg>
          </button>

          {/* Logo */}
          <button
            type="button"
            onClick={() => router.push(defaultHome)}
            className="flex items-center gap-2 sm:gap-3 text-right flex-1 lg:flex-initial min-w-0"
          >
            <img src="/logo.jpeg" alt="Meathouse" className="h-7 sm:h-8 w-auto flex-shrink-0" />
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base lg:text-xl font-bold text-gray-900 truncate">نظام إدارة الطلبات</h1>
              <p className="text-[10px] sm:text-xs text-gray-500 hidden sm:block">واجهة مبسطة وسريعة</p>
            </div>
          </button>

          {/* Desktop menu */}
          <div className="hidden lg:flex flex-wrap items-center gap-2 lg:gap-3 flex-1 justify-end">
            {items.map((item) => (
              <button
                type="button"
                key={item.href}
                onClick={() => handleMenuNavigation(item.href)}
                className={`px-3 py-1.5 rounded-lg font-medium text-sm transition ${
                  pathname === item.href
                    ? 'bg-red-100 text-red-700'
                    : 'text-gray-700 hover:text-red-600 hover:bg-gray-100'
                }`}
              >
                {item.label}
              </button>
            ))}

            <NotificationBell user={user} />
            <ChatButton user={user} />
            {(user.role === 'cs' || user.role === 'admin') && <OnDutyBadge />}

            <div className="flex items-center space-x-3 rtl:space-x-reverse border-r pr-3 mr-1 rtl:border-r-0 rtl:border-l rtl:pl-3 rtl:mr-0 rtl:ml-1">
              <div className="text-right rtl:text-left">
                <p className="text-sm font-medium text-gray-900">{user.name}</p>
                <p className="text-xs text-gray-500">{roleLabel}</p>
              </div>
              <div className="w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center font-bold">
                {user.name.charAt(0)}
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="text-red-600 hover:text-red-700 font-medium text-sm transition"
            >
              تسجيل الخروج
            </button>
          </div>

          {/* Mobile right cluster */}
          <div className="lg:hidden flex items-center gap-1">
            <NotificationBell user={user} />
            <ChatButton user={user} />
            <div className="w-9 h-9 bg-red-500 text-white rounded-full flex items-center justify-center font-bold text-sm" title={`${user.name} · ${roleLabel}`}>
              {user.name.charAt(0)}
            </div>
          </div>
        </div>

        {(user.role === 'cs' || user.role === 'admin') && (
          <div className="lg:hidden px-3 pb-2 flex justify-end">
            <OnDutyBadge />
          </div>
        )}
      </nav>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="إغلاق القائمة"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-black/50"
          />
          <aside className="absolute top-0 right-0 h-full w-[85%] max-w-[320px] bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-to-l from-red-50 to-white">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 bg-red-500 text-white rounded-full flex items-center justify-center font-bold text-base flex-shrink-0">
                  {user.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{user.name}</p>
                  <p className="text-xs text-gray-500">{roleLabel}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="إغلاق"
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 min-w-[44px] min-h-[44px] flex items-center justify-center text-xl"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-2">
              {items.map((item) => (
                <button
                  type="button"
                  key={item.href}
                  onClick={() => handleMenuNavigation(item.href)}
                  className={`w-full text-right px-4 py-3 text-sm font-medium transition flex items-center min-h-[48px] ${
                    pathname === item.href
                      ? 'bg-red-50 text-red-700 border-r-4 border-red-600'
                      : 'text-gray-700 hover:bg-gray-50 active:bg-gray-100'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="border-t border-gray-200 p-3">
              <button
                onClick={handleLogout}
                className="w-full py-3 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 font-bold text-sm min-h-[48px]"
              >
                🚪 تسجيل الخروج
              </button>
            </div>
          </aside>
        </div>
      )}
    </>
  )
}
