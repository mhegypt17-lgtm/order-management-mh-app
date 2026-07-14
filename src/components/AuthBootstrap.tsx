'use client'

import { useEffect } from 'react'
import { useAuthStore } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

/**
 * Mounts once at the app root. Reconciles the persisted zustand user with
 * the live Supabase session on load, and reacts to auth state changes
 * (sign-in / sign-out in another tab, password recovery, token refresh).
 * Renders nothing.
 */
export default function AuthBootstrap() {
  const refreshFromSession = useAuthStore((s) => s.refreshFromSession)
  const setUser = useAuthStore((s) => s.setUser)

  useEffect(() => {
    // Initial reconciliation on mount.
    refreshFromSession()

    // React to auth events from Supabase (other tabs, token refresh, etc.).
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setUser(null)
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        refreshFromSession()
      }
    })

    return () => {
      sub.subscription.unsubscribe()
    }
  }, [refreshFromSession, setUser])

  return null
}
