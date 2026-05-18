'use client'

import { useState, useEffect } from 'react'
import { useAuthStore } from '@/lib/auth'
import toast from 'react-hot-toast'

interface Complaint {
  id: string
  ticketNumber: string
  channel: string
  subject: string
  description: string
  reason: string
  status: 'open' | 'in-progress' | 'closed'
  priority: 'low' | 'medium' | 'high'
  customerId: string | null
  customerName: string | null
  customerPhone: string | null
  linkedOrderId: string | null
  assignedTo: string
  createdBy: string
  compensationAmount: number
  comments: Array<{ id: string; authorName: string; text: string; createdAt: string }>
  openedAt: string
  closedAt: string | null
  createdAt: string
  updatedAt: string
}

interface Order {
  id: string
  appOrderNo: string
  orderDate: string
  orderTime: string
  customerId: string
  customerName?: string
  orderTotal?: number
  customer?: {
    id: string
    phone: string
    customerName: string
  }
}

interface Customer {
  id: string
  phone: string
  customerName: string
}

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-red-100 border-red-300 text-red-900',
  'in-progress': 'bg-amber-100 border-amber-300 text-amber-900',
  closed: 'bg-green-100 border-green-300 text-green-900',
}

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-blue-50 border-blue-200',
  medium: 'bg-amber-50 border-amber-200',
  high: 'bg-red-50 border-red-200',
}

const PRIORITY_ICONS: Record<string, string> = {
  low: '◇',
  medium: '◆',
  high: '●',
}

export default function ComplaintsSection() {
  const { user } = useAuthStore()
  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [channels, setChannels] = useState<string[]>([])
  const [reasons, setReasons] = useState<string[]>([])
  const [agents, setAgents] = useState(['رنا', 'مى', 'ميرنا', 'أمل'])
  const [orders, setOrders] = useState<Order[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [slaHours, setSlaHours] = useState(4)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null)
  const [editedComplaint, setEditedComplaint] = useState<Partial<Complaint> | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'open' | 'in-progress' | 'closed'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Search states
  const [searchPhone, setSearchPhone] = useState('')
  const [searchOrderNo, setSearchOrderNo] = useState('')
  const [searchDate, setSearchDate] = useState('')
  const [searchResults, setSearchResults] = useState<Order[]>([])
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [showSearchResults, setShowSearchResults] = useState(false)

  const [formData, setFormData] = useState({
    channel: '',
    subject: '',
    description: '',
    reason: '',
    priority: 'medium' as const,
    customerSearch: '',
    orderSearch: '',
    assignedTo: '',
  })

  useEffect(() => {
    fetchData()
  }, [])

  // Set assignedTo when user is available
  useEffect(() => {
    if (user?.name) {
      setFormData((prev) => ({
        ...prev,
        assignedTo: user.name,
      }))
    }
  }, [user?.name])

  const fetchData = async () => {
    try {
      setLoading(true)
      const [complaintRes, settingsRes, ordersRes, customersRes] = await Promise.all([
        fetch('/api/complaints'),
        fetch('/api/order-settings'),
        fetch('/api/orders'),
        fetch('/api/customers'),
      ])

      if (complaintRes.ok) {
        const data = await complaintRes.json()
        setComplaints(Array.isArray(data) ? data : [])
      }

      if (settingsRes.ok) {
        const data = await settingsRes.json()
        // Use options.complaintChannels if available, otherwise fall back to settings.complaintChannels
        const chans = data.options?.complaintChannels || data.settings?.complaintChannels?.map((c: any) => c.label) || []
        const reasonsList = data.options?.complaintReasons || data.settings?.complaintReasons?.map((r: any) => r.label) || []
        setChannels(Array.isArray(chans) ? chans : [])
        setReasons(Array.isArray(reasonsList) ? reasonsList : [])
        // Load SLA hours from settings
        if (data.slaHours) {
          setSlaHours(data.slaHours)
        }
      }

      if (ordersRes.ok) {
        const data = await ordersRes.json()
        // Handle both array and {orders: [...]} formats
        const ordersArray = Array.isArray(data) ? data : (data.orders || [])
        setOrders(ordersArray)
      }

      if (customersRes.ok) {
        const data = await customersRes.json()
        setCustomers(Array.isArray(data) ? data : [])
      }
    } catch (error) {
      console.error('Error fetching data:', error)
      toast.error('فشل تحميل البيانات')
      setComplaints([])
      setChannels([])
      setReasons([])
      setOrders([])
      setCustomers([])
    } finally {
      setLoading(false)
    }
  }

  const handleCreateComplaint = async () => {
    if (!formData.channel || !formData.subject || !formData.description) {
      toast.error('يرجى ملء جميع الحقول المطلوبة')
      return
    }

    try {
      // Use embedded customer data from selected order
      const orderData = orders.find((o) => o.appOrderNo === formData.orderSearch)
      const customerData = orderData?.customer

      const res = await fetch('/api/complaints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: formData.channel,
          subject: formData.subject,
          description: formData.description,
          reason: formData.reason,
          priority: formData.priority,
          customerId: orderData?.customerId || null,
          customerName: customerData?.customerName || null,
          customerPhone: customerData?.phone || null,
          linkedOrderId: orderData?.id || null,
          assignedTo: formData.assignedTo,
          createdBy: user?.name || 'System',
        }),
      })

      if (!res.ok) throw new Error('Failed to create complaint')

      toast.success('✅ تم فتح تذكرة الشكوى بنجاح')
      setFormData({
        channel: '',
        subject: '',
        description: '',
        reason: '',
        priority: 'medium',
        customerSearch: '',
        orderSearch: '',
        assignedTo: user?.name || '',
      })
      setShowForm(false)
      await fetchData()
    } catch (error) {
      console.error('Error creating complaint:', error)
      toast.error('فشل فتح الشكوى')
    }
  }

  const handleAddComment = async () => {
    if (!selectedComplaint || !newComment.trim()) {
      toast.error('يرجى إدخال تعليق')
      return
    }

    try {
      const res = await fetch('/api/complaints', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedComplaint.id,
          action: 'add-comment',
          authorName: user?.name || 'Unknown',
          text: newComment,
        }),
      })

      if (!res.ok) throw new Error('Failed to add comment')

      const updatedComplaint = await res.json()
      
      toast.success('✅ تم إضافة التعليق')
      setNewComment('')
      setSelectedComplaint(updatedComplaint)
      await fetchData()
    } catch (error) {
      console.error('Error adding comment:', error)
      toast.error('فشل إضافة التعليق')
    }
  }

  const handleEditChange = (field: string, value: any) => {
    setEditedComplaint((prev) => ({
      ...prev,
      [field]: value,
    }))
    setHasUnsavedChanges(true)
  }

  const handleSaveComplaint = async () => {
    if (!selectedComplaint || !editedComplaint) return

    try {
      const res = await fetch('/api/complaints', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedComplaint.id,
          ...editedComplaint,
        }),
      })

      if (!res.ok) throw new Error('Failed to update complaint')

      const updatedComplaint = await res.json()
      
      toast.success('✅ تم حفظ التغييرات بنجاح')
      setSelectedComplaint(updatedComplaint)
      setEditedComplaint(null)
      setHasUnsavedChanges(false)
      await fetchData()
    } catch (error) {
      console.error('Error updating complaint:', error)
      toast.error('فشل حفظ التغييرات')
    }
  }

  const handleCancelChanges = () => {
    setEditedComplaint(null)
    setHasUnsavedChanges(false)
  }

  const handleQuickUpdate = async (complaintId: string, updates: Partial<Complaint>) => {
    try {
      const res = await fetch('/api/complaints', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: complaintId,
          ...updates,
        }),
      })

      if (!res.ok) throw new Error('Failed to update complaint')

      toast.success('✅ تم التحديث')
      await fetchData()
    } catch (error) {
      console.error('Error updating complaint:', error)
      toast.error('فشل التحديث')
    }
  }

  const handleDeleteComplaint = async (id: string) => {
    if (!window.confirm('هل تريد حذف هذه الشكوى؟')) return

    try {
      const res = await fetch('/api/complaints', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })

      if (!res.ok) throw new Error('Failed to delete complaint')

      toast.success('🗑️ تم حذف الشكوى')
      setSelectedComplaint(null)
      await fetchData()
    } catch (error) {
      console.error('Error deleting complaint:', error)
      toast.error('فشل حذف الشكوى')
    }
  }

  const calculateSLA = (complaint: Complaint): string => {
    const start = new Date(complaint.openedAt).getTime()
    const end = complaint.closedAt ? new Date(complaint.closedAt).getTime() : new Date().getTime()
    const diffMs = end - start
    
    const totalMinutes = Math.floor(diffMs / (1000 * 60))
    const totalHours = Math.floor(totalMinutes / 60)
    const totalDays = Math.floor(totalHours / 24)
    
    const remainingHours = totalHours % 24
    const remainingMinutes = totalMinutes % 60

    if (totalDays > 0) {
      return `${totalDays}د ${remainingHours}س ${remainingMinutes}د`
    }
    
    if (remainingHours > 0) {
      return `${remainingHours}س ${remainingMinutes}د`
    }
    
    return `${remainingMinutes}د`
  }

  const isExceededSla = (complaint: Complaint): boolean => {
    const start = new Date(complaint.openedAt).getTime()
    const end = complaint.closedAt ? new Date(complaint.closedAt).getTime() : new Date().getTime()
    const diffMs = end - start
    const totalHours = Math.floor(diffMs / (1000 * 60 * 60))
    return totalHours >= slaHours
  }

  const handleSearchOrders = () => {
    const results = orders.filter((order) => {
      let match = true

      // Search by phone - match customer phone from embedded customer object
      if (searchPhone.trim()) {
        const customerPhone = order.customer?.phone || ''
        // Match if phone includes search term or search term is in phone
        match = match && (customerPhone.includes(searchPhone.trim()) || searchPhone.trim().includes(customerPhone))
      }

      // Search by order number
      if (searchOrderNo.trim()) {
        match = match && order.appOrderNo.toLowerCase().includes(searchOrderNo.trim().toLowerCase())
      }

      // Search by date
      if (searchDate.trim()) {
        match = match && order.orderDate === searchDate
      }

      return match
    })

    setSearchResults(results)
    setShowSearchResults(true)
    
    if (results.length === 0 && (searchPhone.trim() || searchOrderNo.trim() || searchDate.trim())) {
      toast.error('لم يتم العثور على طلبات مطابقة')
    }
  }

  const handleSelectOrder = (order: Order) => {
    // Use embedded customer data from order
    const customerData = order.customer
    
    setSelectedOrder(order)
    setFormData({
      channel: '',
      subject: '',
      description: '',
      reason: '',
      priority: 'medium',
      customerSearch: customerData?.phone || '',
      orderSearch: order.appOrderNo,
      assignedTo: user?.name || '',
    })
    
    setShowSearchResults(false)
    setShowForm(true)
    
    toast.success(`✅ تم تحديد الطلب #${order.appOrderNo}`)
  }

  const filteredComplaints = complaints.filter((c) => {
    if (filterStatus !== 'all' && c.status !== filterStatus) return false
    if (searchQuery) {
      return (
        c.ticketNumber.includes(searchQuery) ||
        c.subject.includes(searchQuery) ||
        c.customerName?.includes(searchQuery) ||
        c.customerPhone?.includes(searchQuery)
      )
    }
    return true
  })

  if (loading) {
    return <div className="p-6 text-center text-gray-500">جاري التحميل...</div>
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Quick Search Section */}
      <div className="bg-gradient-to-r from-blue-50 to-blue-100 border-2 border-blue-200 rounded-xl p-6 shadow-md">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">🔍 البحث السريع عن طلب</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">رقم هاتف العميل</label>
            <input
              type="tel"
              value={searchPhone}
              onChange={(e) => setSearchPhone(e.target.value)}
              placeholder="01234567890"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-600"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">رقم الطلب</label>
            <input
              type="text"
              value={searchOrderNo}
              onChange={(e) => setSearchOrderNo(e.target.value)}
              placeholder="مثال: ORD001"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-600"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">التاريخ</label>
            <input
              type="date"
              value={searchDate}
              onChange={(e) => setSearchDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-600"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleSearchOrders}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition font-medium"
            >
              🔍 بحث
            </button>
          </div>
        </div>

        {/* Search Results */}
        {showSearchResults && searchResults.length > 0 && (
          <div className="mt-4 bg-white rounded-lg p-4 max-h-64 overflow-y-auto">
            <p className="text-sm font-medium text-gray-700 mb-2">النتائج ({searchResults.length}):</p>
            {searchResults.map((order) => {
              const cust = order.customer
              return (
                <button
                  key={order.id}
                  onClick={() => handleSelectOrder(order)}
                  className="w-full text-right mb-2 p-3 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition"
                >
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-blue-900">#{order.appOrderNo}</span>
                    <span className="text-sm text-gray-600">
                      {cust?.customerName} • {cust?.phone}
                    </span>
                    <span className="text-sm text-gray-500">{order.orderDate}</span>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {showSearchResults && searchResults.length === 0 && (
          <p className="mt-3 text-sm text-gray-600">❌ لا توجد نتائج مطابقة</p>
        )}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">🎫 إدارة الشكاوى</h1>
          <p className="text-sm text-gray-500 mt-1">تتبع وإدارة شكاوى العملاء والطلبات</p>
        </div>
        <button
          onClick={() => {
            setShowForm(!showForm)
            setSelectedComplaint(null)
            setSelectedOrder(null)
          }}
          className="bg-red-600 hover:bg-red-700 text-white px-5 py-3 rounded-lg transition font-medium shadow-lg"
        >
          {showForm ? '✕ إلغاء' : '🎫 فتح شكوى جديدة'}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white border-2 border-red-200 rounded-xl p-6 space-y-4 shadow-lg">
          <h2 className="text-lg font-semibold text-gray-900">🎫 فتح تذكرة شكوى جديدة</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Channel */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">القناة</label>
              <select
                value={formData.channel}
                onChange={(e) => setFormData({ ...formData, channel: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-red-600"
              >
                <option value="">-- اختر القناة --</option>
                {channels.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Priority */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">الأولوية</label>
              <select
                value={formData.priority}
                onChange={(e) =>
                  setFormData({ ...formData, priority: e.target.value as typeof formData.priority })
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-red-600"
              >
                <option value="low">◇ منخفضة</option>
                <option value="medium">◆ متوسطة</option>
                <option value="high">● عالية</option>
              </select>
            </div>

            {/* Assign To */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">المسؤول</label>
              <select
                value={formData.assignedTo}
                onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-red-600"
              >
                {agents.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>

            {/* Subject */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">الموضوع</label>
              <input
                type="text"
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                placeholder="ملخص الشكوى..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-red-600"
              />
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">السبب/المصدر</label>
            {reasons.length > 0 ? (
              <select
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-red-600"
              >
                <option value="">-- اختر السبب --</option>
                {reasons.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                placeholder="مثال: جودة منتج، تأخير توصيل..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-red-600"
              />
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">التفاصيل</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="اكتب تفاصيل الشكوى..."
              rows={4}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-red-600 resize-none"
            />
          </div>

          {/* Selected Order & Customer Display */}
          {selectedOrder && (
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300 rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xl">✅</span>
                <p className="font-semibold text-green-900">تم تحديد الطلب والعميل</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
                <div className="bg-white rounded p-3 border border-green-200">
                  <p className="text-xs font-medium text-gray-500 mb-1">رقم الطلب</p>
                  <p className="text-lg font-bold text-gray-900">{selectedOrder.appOrderNo}</p>
                </div>
                <div className="bg-white rounded p-3 border border-green-200">
                  <p className="text-xs font-medium text-gray-500 mb-1">اسم العميل</p>
                  <p className="text-lg font-bold text-gray-900">{selectedOrder.customer?.customerName || selectedOrder.customerName || 'غير محدد'}</p>
                </div>
                <div className="bg-white rounded p-3 border border-green-200">
                  <p className="text-xs font-medium text-gray-500 mb-1">رقم الهاتف</p>
                  <p className="text-lg font-bold text-gray-900">{selectedOrder.customer?.phone || 'غير محدد'}</p>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 justify-end pt-4 border-t border-gray-200">
            <button
              onClick={() => {
                setShowForm(false)
                setFormData({
                  channel: '',
                  subject: '',
                  description: '',
                  reason: '',
                  priority: 'medium',
                  customerSearch: '',
                  orderSearch: '',
                  assignedTo: user?.name || '',
                })
              }}
              className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
            >
              إلغاء
            </button>
            <button
              onClick={handleCreateComplaint}
              className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition font-medium"
            >
              فتح التذكرة
            </button>
          </div>
        </div>
      )}

      {/* Search & Filter */}
      <div className="flex gap-4 flex-col sm:flex-row">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="ابحث عن رقم التذكرة أو الموضوع..."
          className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:border-red-600"
        />
        <div className="flex gap-2">
          {(['all', 'open', 'in-progress', 'closed'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-4 py-2 rounded-lg transition font-medium ${
                filterStatus === status
                  ? `${STATUS_COLORS[status === 'all' ? 'open' : status]} border`
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {status === 'all' && 'الكل'}
              {status === 'open' && 'مفتوح'}
              {status === 'in-progress' && 'قيد المعالجة'}
              {status === 'closed' && 'مغلق'}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      {complaints.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-red-50 to-red-100 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-700 font-medium">مفتوح</p>
            <p className="text-2xl font-bold text-red-900 mt-1">
              {complaints.filter((c) => c.status === 'open').length}
            </p>
          </div>
          <div className="bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200 rounded-lg p-4">
            <p className="text-sm text-amber-700 font-medium">قيد المعالجة</p>
            <p className="text-2xl font-bold text-amber-900 mt-1">
              {complaints.filter((c) => c.status === 'in-progress').length}
            </p>
          </div>
          <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-lg p-4">
            <p className="text-sm text-green-700 font-medium">مغلق</p>
            <p className="text-2xl font-bold text-green-900 mt-1">
              {complaints.filter((c) => c.status === 'closed').length}
            </p>
          </div>
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-700 font-medium">الإجمالي</p>
            <p className="text-2xl font-bold text-blue-900 mt-1">{complaints.length}</p>
          </div>
        </div>
      )}

      {/* Complaints List */}
      <div className="space-y-3">
        {filteredComplaints.length === 0 ? (
          <div className="bg-gradient-to-r from-gray-50 to-gray-100 border-2 border-dashed border-gray-300 rounded-lg p-12 text-center">
            <p className="text-lg font-medium text-gray-600">📭 لا توجد شكاوى</p>
            <p className="text-sm text-gray-500 mt-2">ابدأ بفتح أول تذكرة شكوى</p>
          </div>
        ) : (
          filteredComplaints.map((complaint) => (
            <div
              key={complaint.id}
              onClick={() => {
                setSelectedComplaint(complaint)
                setEditedComplaint(null)
                setHasUnsavedChanges(false)
              }}
              className={`border-2 rounded-lg p-4 cursor-pointer transition hover:shadow-lg ${
                selectedComplaint?.id === complaint.id
                  ? 'border-red-400 bg-red-50'
                  : isExceededSla(complaint)
                  ? 'border-red-500 bg-red-50 shadow-lg shadow-red-200'
                  : `${PRIORITY_COLORS[complaint.priority]} border-opacity-50`
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl">{isExceededSla(complaint) ? '🚨' : '🎫'}</span>
                    <div>
                      <p className="font-bold text-lg text-gray-900">{complaint.ticketNumber}</p>
                      <p className="text-sm text-gray-600">{complaint.subject}</p>
                    </div>
                    <div className="mr-auto flex gap-2">
                      <select
                        value={complaint.status}
                        onChange={(e) => {
                          e.stopPropagation()
                          handleQuickUpdate(complaint.id, { status: e.target.value as any })
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className={`text-xs px-2 py-1 rounded border cursor-pointer transition font-medium ${STATUS_COLORS[complaint.status]} focus:outline-none focus:ring-2 focus:ring-offset-1`}
                      >
                        <option value="open">مفتوح</option>
                        <option value="in-progress">قيد المعالجة</option>
                        <option value="closed">مغلق</option>
                      </select>
                      <select
                        value={complaint.priority}
                        onChange={(e) => {
                          e.stopPropagation()
                          handleQuickUpdate(complaint.id, { priority: e.target.value as any })
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs px-2 py-1 rounded bg-blue-50 border border-blue-300 cursor-pointer transition font-medium hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-offset-1"
                      >
                        <option value="low">◇ منخفضة</option>
                        <option value="medium">◆ متوسطة</option>
                        <option value="high">● عالية</option>
                      </select>
                      {isExceededSla(complaint) && (
                        <span className="text-xs px-2 py-1 rounded bg-red-500 text-white font-bold border border-red-600">
                          ⏰ تجاوز الحد
                        </span>
                      )}
                    </div>
                  </div>

                  <p className={`mb-2 ${isExceededSla(complaint) ? 'text-red-700 font-semibold' : 'text-gray-700'}`}>{complaint.description}</p>

                  <div className={`flex flex-wrap gap-3 text-xs ${isExceededSla(complaint) ? 'text-red-600 font-semibold' : 'text-gray-600'} mt-2`}>
                    <span>📋 {complaint.channel}</span>
                    {complaint.customerName && <span>👤 {complaint.customerName}</span>}
                    {complaint.customerPhone && <span>📱 {complaint.customerPhone}</span>}
                    {complaint.linkedOrderId && <span>🛒 الطلب: {complaint.linkedOrderId}</span>}
                    <span>👨‍💼 {complaint.assignedTo}</span>
                    <span>⏱️ {calculateSLA(complaint)}</span>
                  </div>
                </div>

                {complaint.compensationAmount > 0 && (
                  <div className="text-right bg-green-50 border border-green-200 rounded px-3 py-2 min-w-[120px]">
                    <p className="text-xs text-green-700 font-medium">تعويض</p>
                    <p className="text-lg font-bold text-green-900">{complaint.compensationAmount} ج.م</p>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Detail Panel */}
      {selectedComplaint && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className={`sticky top-0 bg-gradient-to-r p-6 flex items-center justify-between border-b-2 ${
              isExceededSla(selectedComplaint)
                ? 'from-red-100 to-red-50 border-red-300'
                : 'from-red-50 to-red-100 border-red-200'
            }`}>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl font-bold text-gray-900">{selectedComplaint.ticketNumber}</h2>
                  {isExceededSla(selectedComplaint) && (
                    <span className="text-2xl animate-pulse">🚨</span>
                  )}
                </div>
                <p className="text-sm text-gray-600 mt-1">{selectedComplaint.subject}</p>
                {isExceededSla(selectedComplaint) && (
                  <p className="text-sm font-semibold text-red-600 mt-2">⏰ تنبيه: الطلب تجاوز {slaHours} ساعات!</p>
                )}
              </div>
              <button
                onClick={() => {
                  if (hasUnsavedChanges) {
                    if (window.confirm('هناك تغييرات غير محفوظة. هل تريد إلغاء التغييرات والإغلاق؟')) {
                      setSelectedComplaint(null)
                      setEditedComplaint(null)
                      setHasUnsavedChanges(false)
                    }
                  } else {
                    setSelectedComplaint(null)
                    setEditedComplaint(null)
                  }
                }}
                className="text-gray-600 hover:text-gray-900 text-2xl"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Status & Priority */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">الحالة</label>
                  <select
                    value={editedComplaint?.status ?? selectedComplaint.status}
                    onChange={(e) => handleEditChange('status', e.target.value)}
                    className={`w-full border rounded-lg px-3 py-2 font-medium ${STATUS_COLORS[editedComplaint?.status ?? selectedComplaint.status]} focus:outline-none`}
                  >
                    <option value="open">مفتوح</option>
                    <option value="in-progress">قيد المعالجة</option>
                    <option value="closed">مغلق</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">المسؤول</label>
                  <select
                    value={editedComplaint?.assignedTo ?? selectedComplaint.assignedTo}
                    onChange={(e) => handleEditChange('assignedTo', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-red-600"
                  >
                    {agents.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Compensation */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">مبلغ التعويض</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={editedComplaint?.compensationAmount ?? selectedComplaint.compensationAmount}
                    onChange={(e) => handleEditChange('compensationAmount', Number(e.target.value))}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-red-600"
                    placeholder="أدخل المبلغ"
                  />
                  <span className="flex items-center px-3 bg-gray-100 rounded-lg">ج.م</span>
                </div>
              </div>
              
              {/* Unsaved Changes Indicator */}
              {hasUnsavedChanges && (
                <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-3">
                  <p className="text-sm font-semibold text-amber-800">⚠️ لديك تغييرات غير محفوظة</p>
                </div>
              )}

              {/* Details */}
              <div className="space-y-3 bg-gray-50 border border-gray-200 rounded-lg p-4">
                <p>
                  <strong className="text-gray-700">القناة:</strong> <span className="text-gray-600">{selectedComplaint.channel}</span>
                </p>
                <p>
                  <strong className="text-gray-700">السبب:</strong> <span className="text-gray-600">{selectedComplaint.reason}</span>
                </p>
                <p>
                  <strong className="text-gray-700">الوقت المستغرق:</strong> <span className="text-gray-600">{calculateSLA(selectedComplaint)}</span>
                </p>
                {selectedComplaint.customerName && (
                  <p>
                    <strong className="text-gray-700">العميل:</strong> <span className="text-gray-600">{selectedComplaint.customerName}</span>
                  </p>
                )}
              </div>

              {/* Comments */}
              <div className="space-y-3">
                <h3 className="font-semibold text-gray-900">💬 التعليقات</h3>
                <div className="max-h-48 overflow-y-auto space-y-3 bg-gray-50 rounded-lg p-4">
                  {selectedComplaint.comments.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">لا توجد تعليقات</p>
                  ) : (
                    selectedComplaint.comments.map((comment) => (
                      <div key={comment.id} className="bg-white border border-gray-200 rounded p-3">
                        <p className="text-sm font-medium text-gray-900">{comment.authorName}</p>
                        <p className="text-xs text-gray-500 mb-1">
                          {new Date(comment.createdAt).toLocaleString('ar-EG')}
                        </p>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{comment.text}</p>
                      </div>
                    ))
                  )}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="أضف تعليق..."
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-red-600"
                  />
                  <button
                    onClick={handleAddComment}
                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition"
                  >
                    إضافة
                  </button>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 border-t border-gray-200 pt-4">
                <button
                  onClick={() => handleDeleteComplaint(selectedComplaint.id)}
                  className="px-4 py-2 bg-red-100 text-red-700 hover:bg-red-200 rounded-lg transition"
                >
                  🗑️ حذف
                </button>
                {hasUnsavedChanges && (
                  <button
                    onClick={handleCancelChanges}
                    className="px-4 py-2 bg-yellow-100 text-yellow-700 hover:bg-yellow-200 rounded-lg transition"
                  >
                    ↶ إلغاء التغييرات
                  </button>
                )}
                {hasUnsavedChanges && (
                  <button
                    onClick={handleSaveComplaint}
                    className="mr-auto px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition font-medium"
                  >
                    💾 حفظ التغييرات
                  </button>
                )}
                {!hasUnsavedChanges && (
                  <button
                    onClick={() => {
                      setSelectedComplaint(null)
                      setEditedComplaint(null)
                    }}
                    className="mr-auto px-4 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg transition"
                  >
                    إغلاق
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
