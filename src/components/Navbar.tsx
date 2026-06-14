'use client'

import { useState } from 'react'
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const handleLogout = () => {
    logout()
    toast.success('تم تسجيل الخروج')
    router.push('/')
  }

  const handleMenuNavigation = (href: string) => {
    setMobileMenuOpen(false)
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

    // Force a full reload so the new-order form always resets to defaults.
    window.location.href = `/orders/new?reset=${Date.now()}`
  }

  const menuItems = {
    admin: [
      { label: '📊 لوحة التحكم', href: '/dashboard' },
      { label: '📋 الطلبات', href: '/orders' },
      { label: '➕ طلب جديد', href: '/orders/new' },
      { label: '📈 التقارير', href: '/orders/reports' },
      { label: '📊 مبيعات المنتجات', href: '/admin/products-sales' },
      { label: '📞 سجل المكالمات', href: '/orders/call-logs' },
      { label: '⭐ تقييمات العملاء', href: '/orders/feedback' },
      { label: '🐑 اضاحي', href: '/admin/adahi' },
      { label: '🚚 التوصيل', href: '/admin/delivery' },
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
      { label: '⭐ تقييمات العملاء', href: '/orders/feedback' },
      { label: '📞 سجل المكالمات', href: '/orders/call-logs' },
      { label: '✅ المهام', href: '/orders/tasks' },
      { label: '🕐 الورديات', href: '/orders/shifts' },
      { label: '🚚 التوصيل', href: '/orders/delivery' },
      { label: '📦 المنتجات', href: '/orders/products' },
      { label: '📈 التقارير', href: '/orders/reports' },
      { label: '🐑 اضاحي', href: '/orders/adahi' },
      { label: '👥 Customers', href: '/orders/crm' },
    ],
    branch: [
      { label: '🍖 الطلبات', href: '/branch' },
      { label: '📊 التقارير', href: '/branch/reports' },
      { label: '🐑 اضاحي', href: '/branch/adahi' },
      { label: '🚚 التوصيل', href: '/branch/delivery' },
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

  const items = menuItems[user.role as keyof typeof menuItems] ?? []

  return (
    <nav className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-40">
      <div className="px-3 sm:px-4 py-2 sm:py-3 max-w-7xl mx-auto">
        {/* Top row: logo + utilities + hamburger */}
        <div className="flex items-center justify-between gap-2">
          {/* Logo */}
          <button
            type="button"
            onClick={() => router.push(defaultHome)}
            className="flex items-center space-x-2 sm:space-x-3 rtl:space-x-reverse text-right shrink-0"
          >
            <img src="/logo.jpeg" alt="Meathouse" className="h-7 sm:h-8 w-auto" />
            <div className="hidden sm:block">
              <h1 className="text-base sm:text-xl font-bold text-gray-900 leading-tight">نظام إدارة الطلبات</h1>
              <p className="text-[10px] sm:text-xs text-gray-500">واجهة مبسطة وسريعة</p>
            </div>
          </button>

          {/* Utilities (always visible) */}
          <div className="flex items-center gap-1 sm:gap-2">
            <NotificationBell user={user} />
            <ChatButton user={user} />
            {(user.role === 'cs' || user.role === 'admin') && <OnDutyBadge />}

            {/* User Info (desktop only) */}
            <div className="hidden lg:flex items-center space-x-3 rtl:space-x-reverse border-r pr-3 mr-1 rtl:border-r-0 rtl:border-l rtl:pl-3 rtl:mr-0 rtl:ml-1">
              <div className="text-right rtl:text-left">
                <p className="text-sm font-medium text-gray-900">{user.name}</p>
                <p className="text-xs text-gray-500">{roleLabel}</p>
              </div>
              <div className="w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center font-bold">
                {user.name.charAt(0)}
              </div>
            </div>

            {/* User avatar only (mobile/tablet) */}
            <div
              className="lg:hidden w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center font-bold text-sm shrink-0"
              title={`${user.name} • ${roleLabel}`}
            >
              {user.name.charAt(0)}
            </div>

            {/* Logout (desktop) */}
            <button
              onClick={handleLogout}
              className="hidden lg:inline-block text-red-600 hover:text-red-700 font-medium text-sm transition px-2"
            >
              تسجيل الخروج
            </button>

            {/* Hamburger (mobile/tablet) */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen((o) => !o)}
              className="lg:hidden p-2 rounded-lg hover:bg-gray-100 transition"
              aria-label="القائمة"
              aria-expanded={mobileMenuOpen}
            >
              <span className="text-xl leading-none">{mobileMenuOpen ? '✕' : '☰'}</span>
            </button>
          </div>
        </div>

        {/* Desktop menu row */}
        <div className="hidden lg:flex flex-wrap items-center gap-2 mt-3">
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
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-gray-200 bg-white shadow-lg">
          <div className="px-3 py-3 max-w-7xl mx-auto">
            {/* User block */}
            <div className="flex items-center justify-between pb-3 mb-2 border-b border-gray-100">
              <div className="flex items-center gap-2 rtl:flex-row-reverse">
                <div className="w-9 h-9 bg-red-500 text-white rounded-full flex items-center justify-center font-bold">
                  {user.name.charAt(0)}
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">{user.name}</p>
                  <p className="text-xs text-gray-500">{roleLabel}</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="text-red-600 hover:text-red-700 font-medium text-sm transition px-3 py-1.5 rounded-lg border border-red-200"
              >
                تسجيل الخروج
              </button>
            </div>

            {/* Menu items grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {items.map((item) => (
                <button
                  type="button"
                  key={item.href}
                  onClick={() => handleMenuNavigation(item.href)}
                  className={`px-3 py-2 rounded-lg font-medium text-sm transition text-right ${
                    pathname === item.href
                      ? 'bg-red-100 text-red-700'
                      : 'text-gray-700 hover:text-red-600 hover:bg-gray-100 border border-gray-100'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </nav>
  )
}
