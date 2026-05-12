import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type UserRole = 'cs' | 'branch' | 'admin'

export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  createdAt: string
}

export interface AuthState {
  user: User | null
  isLoading: boolean
  error: string | null
  hasHydrated: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  setUser: (user: User | null) => void
  setHasHydrated: (value: boolean) => void
}

// Demo users for Phase 1 (in production, validate against a proper user database)
const DEMO_USERS = {
  'cs@example.com': { password: '123456', role: 'cs' as UserRole, name: 'خدمة العملاء' },
  'branch@example.com': { password: '123456', role: 'branch' as UserRole, name: 'الفرع' },
  'admin@example.com': { password: '123456', role: 'admin' as UserRole, name: 'الإدارة' },
}

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
          // Simulate API delay
          await new Promise((resolve) => setTimeout(resolve, 500))

          const user = DEMO_USERS[email as keyof typeof DEMO_USERS]

          if (!user || user.password !== password) {
            throw new Error('البريد الإلكتروني أو كلمة المرور غير صحيحة')
          }

          const newUser: User = {
            id: `user_${Date.now()}`,
            email,
            name: user.name,
            role: user.role,
            createdAt: new Date().toISOString(),
          }

          set({ user: newUser, isLoading: false, error: null })
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'حدث خطأ في تسجيل الدخول',
          })
          throw error
        }
      },

      logout: () => {
        set({ user: null, error: null })
      },

      setUser: (user) => {
        set({ user })
      },

      setHasHydrated: (value) => {
        set({ hasHydrated: value })
      },
    }),
    {
      name: 'auth-store',
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    }
  )
)
