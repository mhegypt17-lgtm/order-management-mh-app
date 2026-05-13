'use client'

import OrderSettingsView from '@/components/admin/OrderSettingsView'
import DiscountCodesView from '@/components/admin/DiscountCodesView'

export default function AdminSettingsPage() {
  return (
    <div className="space-y-5">
      <OrderSettingsView />
      <DiscountCodesView />
    </div>
  )
}
