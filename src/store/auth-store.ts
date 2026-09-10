import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import type { AuthUser, UserRole } from '@/types'

const VALID_ROLES: ReadonlySet<string> = new Set<UserRole>(['collection', 'processing', 'cs', 'qa', 'admin'])

export const AUTH_STORAGE_KEY = 'labs-auth'

interface AuthState {
  token: string | null
  user: AuthUser | null
  setSession: (token: string, user: AuthUser) => void
  clearSession: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setSession: (token, user) => set({ token, user }),
      clearSession: () => set({ token: null, user: null }),
    }),
    {
      name: AUTH_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      merge: (persisted, current) => {
        const state = (persisted ?? {}) as Partial<AuthState>
        const user =
          state.user && typeof state.user.displayName === "string" && VALID_ROLES.has(state.user.role)
            ? state.user
            : null
        return {
          ...current,
          ...state,
          user,
          token: user ? (state.token ?? null) : null,
        }
      },
    },
  ),
)
