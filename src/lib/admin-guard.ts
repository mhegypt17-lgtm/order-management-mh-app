import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const ALLOWED_ROLES = ['cs', 'branch', 'admin'] as const
type Role = (typeof ALLOWED_ROLES)[number]

/**
 * Verifies the caller is an authenticated admin.
 * Returns the caller's user id on success, or a NextResponse to short-circuit
 * the handler with 401/403 on failure.
 */
export async function requireAdmin(
  request: NextRequest,
): Promise<{ userId: string } | NextResponse> {
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : ''

  if (!token) {
    return NextResponse.json(
      { error: 'Unauthorized: missing bearer token' },
      { status: 401 },
    )
  }

  // Use a scoped client that decodes the caller's token to identify them.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const scoped = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: userData, error: userError } = await scoped.auth.getUser(token)
  if (userError || !userData.user) {
    return NextResponse.json(
      { error: 'Unauthorized: invalid session' },
      { status: 401 },
    )
  }

  const { data: profile, error: profileError } = await getSupabaseAdmin()
    .from('profiles')
    .select('role,"isActive"')
    .eq('id', userData.user.id)
    .maybeSingle()

  if (profileError || !profile) {
    return NextResponse.json(
      { error: 'Forbidden: profile not found' },
      { status: 403 },
    )
  }
  if (profile.isActive === false) {
    return NextResponse.json(
      { error: 'Forbidden: account deactivated' },
      { status: 403 },
    )
  }
  if (profile.role !== 'admin') {
    return NextResponse.json(
      { error: 'Forbidden: admin role required' },
      { status: 403 },
    )
  }

  return { userId: userData.user.id }
}

export function isValidRole(value: unknown): value is Role {
  return typeof value === 'string' && (ALLOWED_ROLES as readonly string[]).includes(value)
}
