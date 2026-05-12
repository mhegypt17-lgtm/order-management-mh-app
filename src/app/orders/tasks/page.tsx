'use client'

import { useState, useEffect } from 'react'
import { useAuthStore } from '@/lib/auth'
import toast from 'react-hot-toast'
import { TaskRecord, OrderRecord } from '@/lib/omsData'

const AGENTS = ['رنا', 'مى', 'ميرنا', 'أمل'] as const
const STATUSES = ['جديدة', 'قيد الإنجاز', 'مكتملة', 'معلقة'] as const
const PRIORITIES = ['منخفضة', 'متوسطة', 'عالية'] as const

export default function TasksPage() {
  const { user } = useAuthStore()
  const [tasks, setTasks] = useState<TaskRecord[]>([])
  const [orders, setOrders] = useState<OrderRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Form state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assignedTo, setAssignedTo] = useState<typeof AGENTS[number]>('رنا')
  const [linkedOrderId, setLinkedOrderId] = useState('')
  const [priority, setPriority] = useState<typeof PRIORITIES[number]>('متوسطة')
  const [dueDate, setDueDate] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')

  // Load tasks and orders
  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const [tasksRes, ordersRes] = await Promise.all([
        fetch('/api/tasks'),
        fetch('/api/orders'),
      ])
      const tasksData = await tasksRes.json()
      const ordersData = await ordersRes.json()
      setTasks(tasksData)
      // Orders API returns { orders: [...] }
      setOrders(Array.isArray(ordersData) ? ordersData : ordersData.orders || [])
    } catch (error) {
      console.error('Error loading data:', error)
      toast.error('خطأ في تحميل البيانات')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!title.trim()) {
      toast.error('يجب إدخال عنوان المهمة')
      return
    }

    try {
      if (editingId) {
        // Update task
        const res = await fetch(`/api/tasks/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            description,
            assignedTo,
            linkedOrderId: linkedOrderId || null,
            priority,
            dueDate: dueDate || null,
          }),
        })

        if (!res.ok) throw new Error('Failed to update task')
        toast.success('تم تحديث المهمة بنجاح')
        setEditingId(null)
      } else {
        // Create task
        const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            description,
            assignedTo,
            linkedOrderId: linkedOrderId || null,
            priority,
            dueDate: dueDate || null,
            createdBy: user?.name || 'System',
          }),
        })

        if (!res.ok) throw new Error('Failed to create task')
        toast.success('تم إنشاء المهمة بنجاح')
      }

      // Reset form
      setTitle('')
      setDescription('')
      setAssignedTo('رنا')
      setLinkedOrderId('')
      setPriority('متوسطة')
      setDueDate('')
      setShowForm(false)
      await loadData()
    } catch (error) {
      console.error('Error saving task:', error)
      toast.error(editingId ? 'خطأ في تحديث المهمة' : 'خطأ في إنشاء المهمة')
    }
  }

  const handleEdit = (task: TaskRecord) => {
    setEditingId(task.id)
    setTitle(task.title)
    setDescription(task.description)
    setAssignedTo(task.assignedTo)
    setLinkedOrderId(task.linkedOrderId || '')
    setPriority(task.priority)
    setDueDate(task.dueDate ? task.dueDate.split('T')[0] : '')
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذه المهمة؟')) return

    try {
      const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete task')
      toast.success('تم حذف المهمة بنجاح')
      await loadData()
    } catch (error) {
      console.error('Error deleting task:', error)
      toast.error('خطأ في حذف المهمة')
    }
  }

  const handleStatusChange = async (taskId: string, newStatus: typeof STATUSES[number]) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })

      if (!res.ok) throw new Error('Failed to update status')
      toast.success('تم تحديث الحالة')
      await loadData()
    } catch (error) {
      console.error('Error updating status:', error)
      toast.error('خطأ في تحديث الحالة')
    }
  }

  const filteredTasks = statusFilter
    ? tasks.filter(t => t.status === statusFilter)
    : tasks

  const taskStats = {
    total: tasks.length,
    new: tasks.filter(t => t.status === 'جديدة').length,
    inProgress: tasks.filter(t => t.status === 'قيد الإنجاز').length,
    completed: tasks.filter(t => t.status === 'مكتملة').length,
    pending: tasks.filter(t => t.status === 'معلقة').length,
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-3"></div>
          <p className="text-gray-600">جاري التحميل...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">📋 إدارة المهام</h1>
          <p className="text-gray-600">إنشاء وتعيين مهام للوكلاء</p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <div className="bg-white rounded-lg shadow p-4 text-center">
            <div className="text-2xl font-bold text-gray-900">{taskStats.total}</div>
            <div className="text-sm text-gray-600">المجموع</div>
          </div>
          <div className="bg-blue-50 rounded-lg shadow p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{taskStats.new}</div>
            <div className="text-sm text-gray-600">جديدة</div>
          </div>
          <div className="bg-yellow-50 rounded-lg shadow p-4 text-center">
            <div className="text-2xl font-bold text-yellow-600">{taskStats.inProgress}</div>
            <div className="text-sm text-gray-600">قيد الإنجاز</div>
          </div>
          <div className="bg-green-50 rounded-lg shadow p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{taskStats.completed}</div>
            <div className="text-sm text-gray-600">مكتملة</div>
          </div>
          <div className="bg-red-50 rounded-lg shadow p-4 text-center">
            <div className="text-2xl font-bold text-red-600">{taskStats.pending}</div>
            <div className="text-sm text-gray-600">معلقة</div>
          </div>
        </div>

        {/* Create Button */}
        {!showForm && (
          <button
            onClick={() => {
              setShowForm(true)
              setEditingId(null)
              setTitle('')
              setDescription('')
              setAssignedTo('رنا')
              setLinkedOrderId('')
              setPriority('متوسطة')
              setDueDate('')
            }}
            className="mb-6 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition"
          >
            ➕ مهمة جديدة
          </button>
        )}

        {/* Form */}
        {showForm && (
          <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">
              {editingId ? 'تعديل المهمة' : 'إنشاء مهمة جديدة'}
            </h2>

            <div className="grid md:grid-cols-2 gap-4">
              {/* Title */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  عنوان المهمة *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="مثال: متابعة طلب العميل"
                  required
                />
              </div>

              {/* Description */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  الوصف
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="تفاصيل المهمة..."
                  rows={3}
                />
              </div>

              {/* Assigned To */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  تعيين إلى (الوكيل) *
                </label>
                <select
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value as typeof AGENTS[number])}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  {AGENTS.map((agent) => (
                    <option key={agent} value={agent}>
                      {agent}
                    </option>
                  ))}
                </select>
              </div>

              {/* Priority */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  الأولوية
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as typeof PRIORITIES[number])}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              {/* Linked Order */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ربط بطلب (اختياري)
                </label>
                <select
                  value={linkedOrderId}
                  onChange={(e) => setLinkedOrderId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="">-- بدون ربط --</option>
                  {orders.map((order) => (
                    <option key={order.id} value={order.id}>
                      {order.appOrderNo} - {order.customerName}
                    </option>
                  ))}
                </select>
              </div>

              {/* Due Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  تاريخ الاستحقاق (اختياري)
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-3 mt-4">
              <button
                type="submit"
                className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition"
              >
                {editingId ? '💾 حفظ التعديلات' : '➕ إنشاء المهمة'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false)
                  setEditingId(null)
                }}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-400 transition"
              >
                ❌ إلغاء
              </button>
            </div>
          </form>
        )}

        {/* Filters */}
        <div className="flex gap-2 mb-6 flex-wrap">
          <button
            onClick={() => setStatusFilter('')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
              statusFilter === ''
                ? 'bg-red-600 text-white'
                : 'bg-white text-gray-700 border border-gray-300 hover:border-red-300'
            }`}
          >
            الكل
          </button>
          {STATUSES.map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                statusFilter === status
                  ? 'bg-red-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:border-red-300'
              }`}
            >
              {status}
            </button>
          ))}
        </div>

        {/* Tasks List */}
        {filteredTasks.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-600">لا توجد مهام في الوقت الحالي</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredTasks.map((task) => {
              const linkedOrder = task.linkedOrderId
                ? orders.find(o => o.id === task.linkedOrderId)
                : null

              return (
                <div
                  key={task.id}
                  className="bg-white rounded-lg shadow p-4 border-r-4 border-red-600"
                >
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    {/* Task Info */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-lg font-bold text-gray-900">{task.title}</h3>
                        <span
                          className={`text-xs px-2 py-1 rounded-full font-medium ${
                            task.priority === 'عالية'
                              ? 'bg-red-100 text-red-700'
                              : task.priority === 'متوسطة'
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-green-100 text-green-700'
                          }`}
                        >
                          {task.priority}
                        </span>
                      </div>

                      {task.description && (
                        <p className="text-gray-600 text-sm mb-2">{task.description}</p>
                      )}

                      <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                        <div>
                          <span className="font-medium">الوكيل:</span> {task.assignedTo}
                        </div>
                        {task.dueDate && (
                          <div>
                            <span className="font-medium">الاستحقاق:</span>{' '}
                            {new Date(task.dueDate).toLocaleDateString('ar-EG')}
                          </div>
                        )}
                        {linkedOrder && (
                          <div>
                            <span className="font-medium">الطلب:</span> {linkedOrder.appOrderNo}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Status & Actions */}
                    <div className="flex flex-col gap-2 md:items-end">
                      {/* Status */}
                      <select
                        value={task.status}
                        onChange={(e) =>
                          handleStatusChange(
                            task.id,
                            e.target.value as typeof STATUSES[number]
                          )
                        }
                        className={`px-3 py-1.5 border rounded-lg text-sm font-medium transition ${
                          task.status === 'مكتملة'
                            ? 'border-green-300 bg-green-50 text-green-700'
                            : task.status === 'قيد الإنجاز'
                            ? 'border-yellow-300 bg-yellow-50 text-yellow-700'
                            : task.status === 'معلقة'
                            ? 'border-red-300 bg-red-50 text-red-700'
                            : 'border-blue-300 bg-blue-50 text-blue-700'
                        }`}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>

                      {/* Actions */}
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(task)}
                          className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-200 transition"
                        >
                          ✏️ تعديل
                        </button>
                        <button
                          onClick={() => handleDelete(task.id)}
                          className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200 transition"
                        >
                          🗑️ حذف
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
