'use client'

import { useState, useEffect } from 'react'
import { useAuthStore } from '@/lib/auth'
import toast from 'react-hot-toast'

interface DailyBriefing {
  id: string
  authorName: string
  authorRole: 'admin' | 'cs'
  message: string
  type: 'announcement' | 'alert' | 'workingHours' | 'general'
  priority: 'low' | 'medium' | 'high'
  isCompleted: boolean
  createdAt: string
  updatedAt: string
}

const TYPE_META: Record<string, { icon: string; color: string; label: string }> = {
  announcement: { icon: '📢', color: 'bg-blue-50 border-blue-200', label: 'إعلان' },
  alert: { icon: '🚨', color: 'bg-red-50 border-red-200', label: 'تنبيه' },
  workingHours: { icon: '⏰', color: 'bg-amber-50 border-amber-200', label: 'ساعات العمل' },
  general: { icon: '💬', color: 'bg-gray-50 border-gray-200', label: 'عام' },
}

const PRIORITY_META: Record<string, { icon: string; badge: string; label: string }> = {
  low: { icon: '◇', badge: 'bg-blue-100 text-blue-800', label: 'منخفضة' },
  medium: { icon: '◆', badge: 'bg-amber-100 text-amber-800', label: 'متوسطة' },
  high: { icon: '●', badge: 'bg-red-100 text-red-800', label: 'عالية' },
}

export default function DailyBriefings() {
  const { user } = useAuthStore()
  const [briefings, setBriefings] = useState<DailyBriefing[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    authorName: '',
    message: '',
    type: 'general' as const,
    priority: 'medium' as const,
  })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [agents] = useState(['رنا', 'مى', 'ميرنا', 'أمل', 'مدير الفريق'])

  useEffect(() => {
    fetchBriefings()
  }, [])

  const fetchBriefings = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/daily-briefings')
      if (!res.ok) throw new Error('Failed to fetch briefings')
      const data = await res.json()
      setBriefings(data)
    } catch (error) {
      console.error('Error fetching briefings:', error)
      toast.error('فشل تحميل البريفينج')
    } finally {
      setLoading(false)
    }
  }

  const handleAddBriefing = async () => {
    if (!formData.authorName.trim() || !formData.message.trim()) {
      toast.error('يرجى ملء الاسم والرسالة')
      return
    }

    try {
      const res = await fetch('/api/daily-briefings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authorName: formData.authorName,
          authorRole: user?.role || 'cs',
          message: formData.message,
          type: formData.type,
          priority: formData.priority,
        }),
      })

      if (!res.ok) throw new Error('Failed to create briefing')

      toast.success('✅ تم إضافة الرسالة بنجاح')
      setFormData({ authorName: '', message: '', type: 'general', priority: 'medium' })
      setShowForm(false)
      await fetchBriefings()
    } catch (error) {
      console.error('Error creating briefing:', error)
      toast.error('فشل إضافة الرسالة')
    }
  }

  const handleUpdateBriefing = async (id: string) => {
    if (!formData.message.trim()) {
      toast.error('يرجى ملء الرسالة')
      return
    }

    try {
      const res = await fetch('/api/daily-briefings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          message: formData.message,
          type: formData.type,
          priority: formData.priority,
          isCompleted: false,
        }),
      })

      if (!res.ok) throw new Error('Failed to update briefing')

      toast.success('✏️ تم تحديث الرسالة بنجاح')
      setFormData({ authorName: '', message: '', type: 'general', priority: 'medium' })
      setEditingId(null)
      setShowForm(false)
      await fetchBriefings()
    } catch (error) {
      console.error('Error updating briefing:', error)
      toast.error('فشل تحديث الرسالة')
    }
  }

  const handleToggleComplete = async (briefing: DailyBriefing) => {
    try {
      const res = await fetch('/api/daily-briefings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: briefing.id,
          message: briefing.message,
          type: briefing.type,
          priority: briefing.priority,
          isCompleted: !briefing.isCompleted,
        }),
      })

      if (!res.ok) throw new Error('Failed to update briefing')
      await fetchBriefings()
    } catch (error) {
      console.error('Error updating briefing:', error)
      toast.error('فشل تحديث الحالة')
    }
  }

  const handleDeleteBriefing = async (id: string) => {
    if (!window.confirm('هل تريد حذف هذه الرسالة؟')) return

    try {
      const res = await fetch('/api/daily-briefings', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })

      if (!res.ok) throw new Error('Failed to delete briefing')

      toast.success('🗑️ تم حذف الرسالة بنجاح')
      await fetchBriefings()
    } catch (error) {
      console.error('Error deleting briefing:', error)
      toast.error('فشل حذف الرسالة')
    }
  }

  const handleEditClick = (briefing: DailyBriefing) => {
    setEditingId(briefing.id)
    setFormData({
      authorName: briefing.authorName,
      message: briefing.message,
      type: briefing.type,
      priority: briefing.priority,
    })
    setShowForm(true)
  }

  if (loading) {
    return <div className="p-6 text-center text-gray-500">جاري التحميل...</div>
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">📋 البريفينج اليومي</h1>
          <p className="text-sm text-gray-500 mt-1">قائمة مهام الفريق والملاحظات المهمة</p>
        </div>
        <button
          onClick={() => {
            setEditingId(null)
            setFormData({ authorName: '', message: '', type: 'general', priority: 'medium' })
            setShowForm(!showForm)
          }}
          className="bg-red-600 hover:bg-red-700 text-white px-5 py-3 rounded-lg transition font-medium shadow-lg hover:shadow-xl"
        >
          {showForm ? '✕ إلغاء' : '➕ إضافة جديد'}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white border-2 border-red-200 rounded-xl p-6 space-y-4 shadow-lg">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {editingId ? '✏️ تعديل الرسالة' : '➕ رسالة جديدة'}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Author Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">الاسم</label>
              <select
                value={formData.authorName}
                onChange={(e) => setFormData({ ...formData, authorName: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600"
              >
                <option value="">-- اختر الاسم --</option>
                {agents.map((agent) => (
                  <option key={agent} value={agent}>
                    {agent}
                  </option>
                ))}
              </select>
            </div>

            {/* Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">نوع الرسالة</label>
              <select
                value={formData.type}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    type: e.target.value as typeof formData.type,
                  })
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600"
              >
                <option value="general">💬 عام</option>
                <option value="announcement">📢 إعلان</option>
                <option value="alert">🚨 تنبيه</option>
                <option value="workingHours">⏰ ساعات العمل</option>
              </select>
            </div>

            {/* Priority */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">الأولوية</label>
              <select
                value={formData.priority}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    priority: e.target.value as typeof formData.priority,
                  })
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600"
              >
                <option value="low">◇ منخفضة</option>
                <option value="medium">◆ متوسطة</option>
                <option value="high">● عالية</option>
              </select>
            </div>
          </div>

          {/* Message */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">الرسالة</label>
            <textarea
              value={formData.message}
              onChange={(e) => setFormData({ ...formData, message: e.target.value })}
              placeholder="اكتب الرسالة هنا..."
              rows={4}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600 resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end pt-4 border-t border-gray-200">
            <button
              onClick={() => {
                setShowForm(false)
                setEditingId(null)
                setFormData({ authorName: '', message: '', type: 'general', priority: 'medium' })
              }}
              className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
            >
              إلغاء
            </button>
            <button
              onClick={() =>
                editingId ? handleUpdateBriefing(editingId) : handleAddBriefing()
              }
              className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition font-medium"
            >
              {editingId ? 'تحديث' : 'إضافة'}
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      {briefings.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-700 font-medium">الإجمالي</p>
            <p className="text-2xl font-bold text-blue-900 mt-1">{briefings.length}</p>
          </div>
          <div className="bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200 rounded-lg p-4">
            <p className="text-sm text-amber-700 font-medium">قيد الإنجاز</p>
            <p className="text-2xl font-bold text-amber-900 mt-1">
              {briefings.filter((b) => !b.isCompleted).length}
            </p>
          </div>
          <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-lg p-4">
            <p className="text-sm text-green-700 font-medium">مكتملة</p>
            <p className="text-2xl font-bold text-green-900 mt-1">
              {briefings.filter((b) => b.isCompleted).length}
            </p>
          </div>
          <div className="bg-gradient-to-br from-red-50 to-red-100 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-700 font-medium">عالية الأولوية</p>
            <p className="text-2xl font-bold text-red-900 mt-1">
              {briefings.filter((b) => b.priority === 'high').length}
            </p>
          </div>
        </div>
      )}

      {/* Briefings List */}
      <div className="space-y-3">
        {briefings.length === 0 ? (
          <div className="bg-gradient-to-r from-gray-50 to-gray-100 border-2 border-dashed border-gray-300 rounded-lg p-12 text-center">
            <p className="text-lg font-medium text-gray-600">📭 لا توجد رسائل حالياً</p>
            <p className="text-sm text-gray-500 mt-2">ابدأ بإضافة أول رسالة للفريق</p>
          </div>
        ) : (
          briefings.map((briefing) => {
            const typeMeta = TYPE_META[briefing.type] || TYPE_META['general']
            const priorityMeta = PRIORITY_META[briefing.priority] || PRIORITY_META['medium']
            const formatDate = (date: string) => {
              const d = new Date(date)
              return d.toLocaleString('ar-EG', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })
            }

            return (
              <div
                key={briefing.id}
                className={`border-r-4 rounded-lg p-4 transition ${
                  briefing.isCompleted
                    ? 'bg-gray-100 border-gray-300 opacity-60'
                    : `${typeMeta.color} border-opacity-100`
                }`}
                style={{
                  borderRightColor: briefing.isCompleted ? '#9CA3AF' : 'currentColor',
                }}
              >
                <div className="flex items-start gap-4">
                  {/* Checkbox */}
                  <button
                    onClick={() => handleToggleComplete(briefing)}
                    className={`flex-shrink-0 w-6 h-6 rounded-md border-2 flex items-center justify-center transition mt-1 ${
                      briefing.isCompleted
                        ? 'bg-green-500 border-green-500'
                        : 'border-gray-300 hover:border-green-500'
                    }`}
                  >
                    {briefing.isCompleted && <span className="text-white text-sm">✓</span>}
                  </button>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {/* Header: Icon, Author, Type, Priority */}
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <span className="text-2xl">{typeMeta.icon}</span>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-gray-900">{briefing.authorName}</p>
                        <span className="inline-block bg-gray-200 text-gray-800 text-xs px-2 py-1 rounded">
                          {typeMeta.label}
                        </span>
                        <span
                          className={`inline-block ${priorityMeta.badge} text-xs px-2 py-1 rounded font-medium`}
                        >
                          {priorityMeta.icon} {priorityMeta.label}
                        </span>
                      </div>
                    </div>

                    {/* Message */}
                    <p
                      className={`text-gray-800 leading-relaxed whitespace-pre-wrap ${
                        briefing.isCompleted ? 'line-through text-gray-500' : ''
                      }`}
                    >
                      {briefing.message}
                    </p>

                    {/* Footer: Timestamp */}
                    <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                      <span>{formatDate(briefing.createdAt)}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleEditClick(briefing)}
                      className="text-gray-600 hover:text-blue-600 transition text-lg"
                      title="تعديل"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => handleDeleteBriefing(briefing.id)}
                      className="text-gray-600 hover:text-red-600 transition text-lg"
                      title="حذف"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
