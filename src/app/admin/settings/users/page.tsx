'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'

type Role = 'cs' | 'branch' | 'admin'

interface ProfileRow {
  id: string
  email: string
  name: string
  role: Role
  isActive: boolean
  createdAt: string
  updatedAt?: string | null
}

const ROLE_LABELS: Record<Role, string> = {
  admin: 'إدارة',
  cs: 'خدمة العملاء',
  branch: 'فرع',
}

const ROLE_BADGE: Record<Role, string> = {
  admin: 'bg-purple-100 text-purple-800 border-purple-200',
  cs: 'bg-blue-100 text-blue-800 border-blue-200',
  branch: 'bg-emerald-100 text-emerald-800 border-emerald-200',
}

async function authedFetch(input: string, init?: RequestInit) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('انتهت الجلسة، سجّل الدخول من جديد')
  return fetch(input, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  })
}

/**
 * Reads the response body safely. If the server returned no body or non-JSON
 * (e.g. a runtime crash before a NextResponse.json was returned), we surface
 * a useful HTTP-status message instead of an opaque
 * "Unexpected end of JSON input".
 */
async function readJsonSafely(res: Response): Promise<{
  ok: boolean
  data: Record<string, unknown>
  errorMessage?: string
}> {
  const text = await res.text()
  if (!text) {
    return {
      ok: res.ok,
      data: {},
      errorMessage: res.ok ? undefined : `HTTP ${res.status} ${res.statusText}`,
    }
  }
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>
    return {
      ok: res.ok,
      data: parsed,
      errorMessage: res.ok
        ? undefined
        : typeof parsed.error === 'string'
          ? parsed.error
          : `HTTP ${res.status}`,
    }
  } catch {
    return {
      ok: res.ok,
      data: {},
      errorMessage: res.ok
        ? undefined
        : `HTTP ${res.status}: ${text.slice(0, 200)}`,
    }
  }
}


export default function AdminUsersPage() {
  const currentUser = useAuthStore((s) => s.user)
  const [users, setUsers] = useState<ProfileRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)

  // New user form state
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState<Role>('cs')
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authedFetch('/api/admin/users')
      const { ok, data, errorMessage } = await readJsonSafely(res)
      if (!ok) throw new Error(errorMessage || 'Request failed')
      setUsers((data.users as ProfileRow[]) ?? [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تحميل المستخدمين')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newEmail.trim() || !newPassword || !newName.trim()) {
      toast.error('كل الحقول مطلوبة')
      return
    }
    if (newPassword.length < 8) {
      toast.error('كلمة المرور 8 أحرف على الأقل')
      return
    }

    setCreating(true)
    try {
      const res = await authedFetch('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          email: newEmail.trim(),
          password: newPassword,
          name: newName.trim(),
          role: newRole,
        }),
      })
      const { ok, errorMessage } = await readJsonSafely(res)
      if (!ok) throw new Error(errorMessage || 'Request failed')

      toast.success('✅ تم إنشاء المستخدم')
      setNewEmail('')
      setNewPassword('')
      setNewName('')
      setNewRole('cs')
      setShowAdd(false)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر الإنشاء')
    } finally {
      setCreating(false)
    }
  }

  const patchUser = async (
    id: string,
    patch: { name?: string; role?: Role; isActive?: boolean; password?: string },
    successMessage: string,
  ) => {
    setSavingId(id)
    try {
      const res = await authedFetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      })
      const { ok, errorMessage } = await readJsonSafely(res)
      if (!ok) throw new Error(errorMessage || 'Request failed')
      toast.success(successMessage)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'فشل الحفظ')
    } finally {
      setSavingId(null)
    }
  }

  const handleRoleChange = (user: ProfileRow, role: Role) => {
    if (role === user.role) return
    patchUser(user.id, { role }, `✅ تم تغيير الدور إلى ${ROLE_LABELS[role]}`)
  }

  const handleToggleActive = (user: ProfileRow) => {
    const next = !user.isActive
    patchUser(
      user.id,
      { isActive: next },
      next ? '✅ تم التفعيل' : '⏸️ تم التعطيل',
    )
  }

  const handleRename = (user: ProfileRow) => {
    const name = window.prompt('الاسم الجديد:', user.name)
    if (!name || name.trim() === user.name) return
    patchUser(user.id, { name: name.trim() }, '✅ تم تعديل الاسم')
  }

  const handleResetPassword = (user: ProfileRow) => {
    const pwd = window.prompt(
      `كلمة مرور جديدة لـ ${user.email} (8 أحرف على الأقل):`,
    )
    if (!pwd) return
    if (pwd.length < 8) {
      toast.error('كلمة المرور 8 أحرف على الأقل')
      return
    }
    patchUser(user.id, { password: pwd }, '🔑 تم تغيير كلمة المرور')
  }

  const handleDelete = async (user: ProfileRow) => {
    if (
      !window.confirm(
        `هل تريد حذف المستخدم ${user.email} نهائياً؟ لا يمكن التراجع.`,
      )
    ) {
      return
    }
    setSavingId(user.id)
    try {
      const res = await authedFetch(`/api/admin/users/${user.id}`, {
        method: 'DELETE',
      })
      const { ok, errorMessage } = await readJsonSafely(res)
      if (!ok) throw new Error(errorMessage || 'Request failed')
      toast.success('🗑️ تم الحذف')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر الحذف')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between gap-2">
        <div>
          <div className="text-xs text-gray-500 mb-1">
            <Link href="/admin/settings" className="hover:underline">
              إعدادات النظام
            </Link>{' '}
            / المستخدمون
          </div>
          <h1 className="text-2xl font-bold text-gray-900">👥 إدارة المستخدمين</h1>
          <p className="text-sm text-gray-600 mt-1">
            إنشاء، تعديل، تعطيل أو حذف حسابات النظام (إدارة، خدمة العملاء، فرع).
          </p>
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg whitespace-nowrap"
        >
          {showAdd ? '✕ إلغاء' : '➕ إضافة مستخدم'}
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <form
          onSubmit={handleCreate}
          className="bg-white border border-gray-200 rounded-xl p-4 space-y-3"
        >
          <h2 className="text-lg font-semibold text-gray-900">مستخدم جديد</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 text-right">
                الاسم
              </label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-right"
                dir="rtl"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 text-right">
                الدور
              </label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as Role)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-right"
                dir="rtl"
              >
                <option value="cs">خدمة العملاء</option>
                <option value="branch">فرع</option>
                <option value="admin">إدارة</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 text-right">
                البريد الإلكتروني
              </label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                dir="ltr"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 text-right">
                كلمة المرور المبدئية (8 أحرف على الأقل)
              </label>
              <input
                type="text"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                dir="ltr"
                minLength={8}
                required
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={creating}
              className="bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-semibold py-2 px-6 rounded-lg"
            >
              {creating ? '⏳ جاري الإنشاء...' : '💾 إنشاء'}
            </button>
          </div>
        </form>
      )}

      {/* List */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">⏳ جاري التحميل...</div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-gray-500">لا يوجد مستخدمون</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {users.map((u) => {
              const isSelf = currentUser?.id === u.id
              const busy = savingId === u.id
              return (
                <div key={u.id} className="p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 truncate">
                        {u.name}
                      </span>
                      <span
                        className={`inline-block text-xs px-2 py-0.5 rounded-full border ${ROLE_BADGE[u.role]}`}
                      >
                        {ROLE_LABELS[u.role]}
                      </span>
                      {isSelf && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-200">
                          أنت
                        </span>
                      )}
                      {!u.isActive && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-200">
                          معطل
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-600 mt-1 truncate" dir="ltr">
                      {u.email}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={u.role}
                      onChange={(e) => handleRoleChange(u, e.target.value as Role)}
                      disabled={busy || isSelf}
                      className="px-2 py-1 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-50"
                      dir="rtl"
                      title={isSelf ? 'لا يمكنك تغيير دورك الحالي' : 'تغيير الدور'}
                    >
                      <option value="cs">خدمة العملاء</option>
                      <option value="branch">فرع</option>
                      <option value="admin">إدارة</option>
                    </select>

                    <button
                      onClick={() => handleRename(u)}
                      disabled={busy}
                      className="text-sm px-3 py-1 rounded-lg border border-gray-300 hover:bg-gray-50"
                    >
                      ✏️ اسم
                    </button>
                    <button
                      onClick={() => handleResetPassword(u)}
                      disabled={busy}
                      className="text-sm px-3 py-1 rounded-lg border border-gray-300 hover:bg-gray-50"
                    >
                      🔑 كلمة مرور
                    </button>
                    <button
                      onClick={() => handleToggleActive(u)}
                      disabled={busy || isSelf}
                      className={`text-sm px-3 py-1 rounded-lg border ${u.isActive ? 'border-amber-300 text-amber-700 hover:bg-amber-50' : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'} disabled:opacity-50`}
                      title={isSelf ? 'لا يمكنك تعطيل حسابك' : ''}
                    >
                      {u.isActive ? '⏸️ تعطيل' : '▶️ تفعيل'}
                    </button>
                    <button
                      onClick={() => handleDelete(u)}
                      disabled={busy || isSelf}
                      className="text-sm px-3 py-1 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50"
                      title={isSelf ? 'لا يمكنك حذف حسابك' : ''}
                    >
                      🗑️ حذف
                    </button>
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
