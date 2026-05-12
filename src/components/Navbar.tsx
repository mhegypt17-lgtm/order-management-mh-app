'use client'

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

  const handleLogout = () => {
    logout()
    toast.success('تم تسجيل الخروج')
    router.push('/')
  }

  const handleMenuNavigation = (href: string) => {
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
      { label: '🐑 اضاحي', href: '/admin/adahi' },
      { label: '🏍️ التوصيل', href: '/admin/delivery' },
      { label: '⚙️ الإعدادات', href: '/admin/settings' },
      { label: '� الورديات', href: '/admin/shifts' },
      { label: '�📦 المنتجات', href: '/admin/products' },
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

  return (
    <nav className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-40">
      <div className="px-4 py-3 max-w-7xl mx-auto flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {/* Logo */}
        <button
          type="button"
          onClick={() => router.push(defaultHome)}
          className="flex items-center space-x-3 rtl:space-x-reverse text-right"
        >
          <img src="/logo.jpeg" alt="Meathouse" className="h-8 w-auto" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">نظام إدارة الطلبات</h1>
            <p className="text-xs text-gray-500">واجهة مبسطة وسريعة</p>
          </div>
        </button>

        {/* Menu */}
        <div className="flex flex-wrap items-center gap-2 lg:gap-3">
          {menuItems[user.role as keyof typeof menuItems]?.map((item) => (
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

          {/* Notification Bell */}
          <NotificationBell user={user} />

          {/* Chat */}
          <ChatButton user={user} />

          {/* On-duty shift badge (CS + admin) */}
          {(user.role === 'cs' || user.role === 'admin') && <OnDutyBadge />}

          {/* User Info */}
          <div className="flex items-center space-x-3 rtl:space-x-reverse border-r pr-3 mr-1 rtl:border-r-0 rtl:border-l rtl:pl-3 rtl:mr-0 rtl:ml-1">
            <div className="text-right rtl:text-left">
              <p className="text-sm font-medium text-gray-900">{user.name}</p>
              <p className="text-xs text-gray-500">{roleLabel}</p>
            </div>
            <div className="w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center font-bold">
              {user.name.charAt(0)}
            </div>
          </div>

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            className="text-red-600 hover:text-red-700 font-medium text-sm transition"
          >
            تسجيل الخروج
          </button>
        </div>
      </div>
    </nav>
  )
}
