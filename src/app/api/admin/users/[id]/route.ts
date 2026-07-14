import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin, isValidRole } from '@/lib/admin-guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** PATCH /api/admin/users/[id] — update name / role / isActive / password. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireAdmin(request)
  if (guard instanceof NextResponse) return guard

  const userId = params.id
  if (!userId) {
    return NextResponse.json({ error: 'Missing user id' }, { status: 400 })
  }

  let body: {
    name?: string
    role?: string
    isActive?: boolean
    password?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Guard: prevent an admin from deactivating or demoting themselves —
  // avoids the "lock everyone out" foot-gun.
  if (
    userId === guard.userId &&
    (body.isActive === false || (body.role && body.role !== 'admin'))
  ) {
    return NextResponse.json(
      { error: 'لا يمكنك تعطيل أو تخفيض صلاحيات حسابك الحالي' },
      { status: 400 },
    )
  }

  const supabaseAdmin = getSupabaseAdmin()

  // Password change (via Supabase auth admin API).
  if (body.password !== undefined) {
    if (body.password.length < 8) {
      return NextResponse.json(
        { error: 'password must be at least 8 characters' },
        { status: 400 },
      )
    }
    const { error: pwdError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { password: body.password },
    )
    if (pwdError) {
      return NextResponse.json({ error: pwdError.message }, { status: 400 })
    }
  }

  // Profile updates.
  const profilePatch: Record<string, unknown> = {}
  if (body.name !== undefined) profilePatch.name = body.name.trim()
  if (body.role !== undefined) {
    if (!isValidRole(body.role)) {
      return NextResponse.json(
        { error: 'role must be one of: cs, branch, admin' },
        { status: 400 },
      )
    }
    profilePatch.role = body.role
  }
  if (body.isActive !== undefined) profilePatch.isActive = !!body.isActive

  if (Object.keys(profilePatch).length > 0) {
    profilePatch.updatedAt = new Date().toISOString()
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update(profilePatch)
      .eq('id', userId)
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}

/** DELETE /api/admin/users/[id] — permanently delete an auth user (cascades to profile). */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireAdmin(request)
  if (guard instanceof NextResponse) return guard

  const userId = params.id
  if (!userId) {
    return NextResponse.json({ error: 'Missing user id' }, { status: 400 })
  }

  if (userId === guard.userId) {
    return NextResponse.json(
      { error: 'لا يمكنك حذف حسابك الحالي' },
      { status: 400 },
    )
  }

  const { error } = await getSupabaseAdmin().auth.admin.deleteUser(userId)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}
