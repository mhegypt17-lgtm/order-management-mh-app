import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin, isValidRole } from '@/lib/admin-guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/admin/users — list all profiles. */
export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request)
  if (guard instanceof NextResponse) return guard

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id,email,name,role,"isActive","createdAt","updatedAt"')
    .order('createdAt', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ users: data ?? [] })
}

/** POST /api/admin/users — create a new user. */
export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request)
  if (guard instanceof NextResponse) return guard

  let body: {
    email?: string
    password?: string
    name?: string
    role?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const email = (body.email || '').trim().toLowerCase()
  const password = body.password || ''
  const name = (body.name || '').trim()
  const role = body.role

  if (!email || !password || !name || !role) {
    return NextResponse.json(
      { error: 'email, password, name and role are required' },
      { status: 400 },
    )
  }
  if (!isValidRole(role)) {
    return NextResponse.json(
      { error: 'role must be one of: cs, branch, admin' },
      { status: 400 },
    )
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: 'password must be at least 8 characters' },
      { status: 400 },
    )
  }

  // Create the auth user (auto-confirmed so they can log in immediately).
  const { data: created, error: createError } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, role },
    })

  if (createError || !created.user) {
    return NextResponse.json(
      { error: createError?.message || 'Failed to create auth user' },
      { status: 400 },
    )
  }

  // The on_auth_user_created trigger inserts a default profile row with
  // role='cs' and a derived name — overwrite it with the admin-supplied
  // values.
  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .update({
      name,
      role,
      email,
      isActive: true,
      updatedAt: new Date().toISOString(),
    })
    .eq('id', created.user.id)

  if (profileError) {
    // Roll back auth user so we don't leave an orphan.
    await supabaseAdmin.auth.admin.deleteUser(created.user.id)
    return NextResponse.json(
      { error: `Profile creation failed: ${profileError.message}` },
      { status: 500 },
    )
  }

  return NextResponse.json(
    {
      user: {
        id: created.user.id,
        email,
        name,
        role,
        isActive: true,
      },
    },
    { status: 201 },
  )
}
