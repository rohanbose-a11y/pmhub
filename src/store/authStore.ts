import { create } from 'zustand'

import { authService } from '../services/authService'
import type { AuthUser, LoginCredentials } from '../features/auth/types/auth.types'

export type AuthStatus = 'checking' | 'loading' | 'authenticated' | 'unauthenticated'

interface AuthState {
  user: AuthUser | null
  status: AuthStatus
  error: string | null
  isBootstrapped: boolean
  bootstrap: () => Promise<void>
  login: (credentials: LoginCredentials) => Promise<boolean>
  logout: () => Promise<void>
  clearError: () => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  status: 'checking',
  error: null,
  isBootstrapped: false,

  clearError: () => set({ error: null }),

  bootstrap: async () => {
    if (get().isBootstrapped && get().status !== 'loading') {
      return
    }

    set((state) => ({
      ...state,
      status: state.user ? 'authenticated' : 'checking',
      error: null,
    }))

    const user = await authService.restoreSession()

    set({
      user,
      status: user ? 'authenticated' : 'unauthenticated',
      error: null,
      isBootstrapped: true,
    })
  },

  login: async (credentials) => {
    set({ status: 'loading', error: null })

    try {
      const user = await authService.login(credentials)

      set({
        user,
        status: 'authenticated',
        error: null,
        isBootstrapped: true,
      })

      return true
    } catch (error) {
      set({
        user: null,
        status: 'unauthenticated',
        error: error instanceof Error ? error.message : 'Unable to sign in.',
        isBootstrapped: true,
      })

      return false
    }
  },

  logout: async () => {
    try {
      await authService.logout()
    } finally {
      set({
        user: null,
        status: 'unauthenticated',
        error: null,
        isBootstrapped: true,
      })
    }
  },
}))
