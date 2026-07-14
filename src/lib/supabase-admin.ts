import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let cachedClient: SupabaseClient | null = null

/**
 * Returns a server-only Supabase client authenticated with the service_role
 * key. Lazy-initialised so `next build` (which imports route modules to
 * collect metadata) doesn't fail when the env var is missing. The error is
 * only raised at request time, giving a clear runtime message instead of a
 * build-time crash.
 *
 * NEVER call this from a client component — the `import 'server-only'`
 * above will cause a build error if it leaks into a client bundle.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (cachedClient) return cachedClient

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured')
  }
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured')
  }

  cachedClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
  return cachedClient
}
