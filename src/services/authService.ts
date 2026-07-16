import axios from 'axios'

import { authApi } from '../api/authApi'
import type { AuthUser, LoginCredentials } from '../features/auth/types/auth.types'

interface FrappeErrorPayload {
  message?: string
  _server_messages?: string
}

const parseServerMessage = (serverMessages?: string): string | null => {
  if (!serverMessages) {
    return null
  }

  try {
    const parsed = JSON.parse(serverMessages) as string[]
    const firstMessage = parsed[0]

    if (!firstMessage) {
      return null
    }

    try {
      const structuredMessage = JSON.parse(firstMessage) as { message?: string }
      return structuredMessage.message?.trim() || null
    } catch {
      return firstMessage
    }
  } catch {
    return null
  }
}

const toReadableError = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const payload = error.response?.data as FrappeErrorPayload | undefined
    const serverMessage =
      parseServerMessage(payload?._server_messages) ||
      payload?.message ||
      error.message

    if (error.code === 'ERR_NETWORK') {
      return 'Unable to reach the ERPNext server. Check connectivity and CORS settings.'
    }

    if (/incorrect password|invalid login|authentication/i.test(serverMessage)) {
      return 'Invalid username or password.'
    }

    return serverMessage || 'Unable to sign in right now. Please try again.'
  }

  return 'Unable to sign in right now. Please try again.'
}

export const authService = {
  async login(credentials: LoginCredentials): Promise<AuthUser> {
    try {
      const loginResponse = await authApi.login(credentials)

      // Resolve the canonical Frappe User.name (email) — needed to query Has Role
      const user         = await authApi.getLoggedInUser().catch(() => null)
      const resolvedUser = user ?? await authApi.resolveUserIdentity(credentials.username).catch(() => null)
      const frappe_name  = resolvedUser?.username ?? credentials.username.trim()

      const roles = await authApi.getRoles(frappe_name).catch(() => [] as string[])

      if (resolvedUser) {
        return {
          ...resolvedUser,
          fullName: loginResponse.full_name?.trim() || resolvedUser.fullName,
          loginId:  credentials.username.trim(),
          roles,
        }
      }

      return {
        username: credentials.username.trim(),
        fullName: loginResponse.full_name?.trim() || undefined,
        loginId:  credentials.username.trim(),
        roles,
      }
    } catch (error) {
      throw new Error(toReadableError(error))
    }
  },

  async restoreSession(): Promise<AuthUser | null> {
    try {
      const user = await authApi.getLoggedInUser()
      if (!user) return null
      const roles = await authApi.getRoles(user.username).catch(() => [] as string[])
      return { ...user, roles }
    } catch (error) {
      if (axios.isAxiosError(error) && [401, 403].includes(error.response?.status ?? 0)) {
        return null
      }

      return null
    }
  },

  async logout(): Promise<void> {
    await authApi.logout()
  },
}
