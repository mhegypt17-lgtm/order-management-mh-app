import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '@/lib/supabase'

export type UserRole = 'cs' | 'branch' | 'admin'

export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  createdAt: string
  /**
   * When set, the user is currently *impersonating* another role for
   * testing/supervision. `role` is the effective role used by all UI
   * guards; `actualRole` is the real role from the profile row (always
   * 'admin' in practice, since only admins can impersonate).
   * Not persisted — a page reload clears the impersonation.
   */
  actualRole?: UserRole
}

export interface AuthState {
  user: User | null
  isLoading: boolean
  error: string | null
  hasHydrated: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  setUser: (user: User | null) => void
  setHasHydrated: (value: boolean) => void
  /**
   * Admin-only. Switch the effective role for the current session.
   * Pass `null` to revert to the real role. Silently no-ops for
   * non-admins. Not persisted across reloads.
   */
  setImpersonateRole: (role: UserRole | null) => void
  /**
   * Hydrates the store from the current Supabase session on app boot.
   * Called by `AuthBootstrap` inside the root layout. If a valid session
   * exists, this joins to the `profiles` table to pick up name + role
   * (source of truth). If not, it clears the user. Falls back gracefully
   * if the profile row is missing (shouldn't happen thanks to the
   * on_auth_user_created trigger, but we still guard).
   */
  refreshFromSession: () => Promise<void>
}

// Zustand persist keeps the user record in localStorage so the app can
// render immediately on reload without waiting for Supabase's async
// hydration. `refreshFromSession` is called on mount to reconcile with the
// real Supabase session and correct anything that has drifted (role
// change, deactivation, etc.).
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isLoading: false,
      error: null,
      hasHydrated: false,

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null })

        try {
          // 1. Authenticate via Supabase.
          const { data: signInData, error: signInError } =
            await supabase.auth.signInWithPassword({
              email: email.trim(),
              password,
            })

          if (signInError || !signInData.user) {
            throw new Error(
              signInError?.message?.toLowerCase().includes('invalid')
                ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة'
                : signInError?.message || 'تعذر تسجيل الدخول',
            )
          }

          // 2. Load the app-level profile (role + display name).
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('id,email,name,role,"isActive","createdAt"')
            .eq('id', signInData.user.id)
            .maybeSingle()

          if (profileError || !profile) {
            await supabase.auth.signOut()
            throw new Error('لم يتم العثور على صلاحيات المستخدم. راجع الإدارة.')
          }

          if (profile.isActive === false) {
            await supabase.auth.signOut()
            throw new Error('هذا الحساب معطل. راجع الإدارة.')
          }

          const nextUser: User = {
            id: profile.id,
            email: profile.email,
            name: profile.name,
            role: profile.role as UserRole,
            createdAt: profile.createdAt,
          }

          set({ user: nextUser, isLoading: false, error: null })
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'حدث خطأ في تسجيل الدخول',
          })
          throw error
        }
      },

      logout: async () => {
        try {
          await supabase.auth.signOut()
        } catch {
          // Even if the server rejects, we still want the local session cleared.
        }
        set({ user: null, error: null })
      },

      setUser: (user) => {
        set({ user })
      },

      setHasHydrated: (value) => {
        set({ hasHydrated: value })
      },

      setImpersonateRole: (role) => {
        const current = useAuthStore.getState().user
        if (!current) return
        const realRole = current.actualRole ?? current.role
        // Only admins can impersonate.
        if (realRole !== 'admin') return

        if (role === null || role === realRole) {
          // Revert to real role — strip actualRole marker.
          const { actualRole: _drop, ...rest } = current
          void _drop
          set({ user: { ...rest, role: realRole } })
          return
        }

        set({
          user: {
            ...current,
            role,
            actualRole: realRole,
          },
        })
      },

      refreshFromSession: async () => {
        try {
          const { data: sessionData } = await supabase.auth.getSession()
          const session = sessionData.session
          if (!session?.user) {
            set({ user: null })
            return
          }

          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('id,email,name,role,"isActive","createdAt"')
            .eq('id', session.user.id)
            .maybeSingle()

          if (profileError || !profile || profile.isActive === false) {
            // Session exists but profile is missing/deactivated — force
            // sign-out so the app doesn't sit in a half-authenticated state.
            await supabase.auth.signOut()
            set({ user: null })
            return
          }

          set({
            user: {
              id: profile.id,
              email: profile.email,
              name: profile.name,
              role: profile.role as UserRole,
              createdAt: profile.createdAt,
            },
          })
        } catch {
          // Network hiccup — leave the persisted user as-is so the app
          // remains usable offline. Next successful call will reconcile.
        }
      },
    }),
    {
      name: 'auth-store',
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
      // Only persist the user record — everything else is transient.
      // Impersonation is intentionally stripped so a page reload always
      // starts in the admin's real role.
      partialize: (state) => ({
        user: state.user
          ? {
              ...state.user,
              role: state.user.actualRole ?? state.user.role,
              actualRole: undefined,
            }
          : null,
      }),
    },
  ),
)
