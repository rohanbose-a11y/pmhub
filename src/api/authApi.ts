import type { AuthUser, LoginCredentials } from '../features/auth/types/auth.types'
import { httpClient } from './httpClient'

interface FrappeLoggedUserResponse {
  message?: string
}

interface FrappeLoginResponse {
  message?: string
  full_name?: string
  home_page?: string
}

interface FrappeListResponse<T> {
  data: T[]
}

interface FrappeUserRecord {
  name: string
  full_name?: string | null
  username?: string | null
  email?: string | null
  mobile_no?: string | null
  gender?: string | null
  birth_date?: string | null
}

export const authApi = {
  async login(credentials: LoginCredentials): Promise<FrappeLoginResponse> {
    const { data } = await httpClient.post<FrappeLoginResponse>('/api/method/login', {
      usr: credentials.username,
      pwd: credentials.password,
    })

    return data
  },

  async getLoggedInUser(): Promise<AuthUser | null> {
    const { data } = await httpClient.get<FrappeLoggedUserResponse>(
      '/api/method/frappe.auth.get_logged_user',
    )

    const username = data.message?.trim()

    if (!username || username === 'Guest') {
      return null
    }

    // Fetch full name from User doctype
    const userDetails = await authApi.resolveUserIdentity(username)

    return userDetails || { username, loginId: username }
  },

  async resolveUserIdentity(identifier: string): Promise<AuthUser | null> {
    const normalizedIdentifier = identifier.trim()

    if (!normalizedIdentifier) {
      return null
    }

    const { data } = await httpClient.get<FrappeListResponse<FrappeUserRecord>>('/api/resource/User', {
      params: {
        fields: JSON.stringify(['name', 'full_name', 'username', 'email', 'mobile_no', 'gender', 'birth_date']),
        or_filters: JSON.stringify([
          ['User', 'name', '=', normalizedIdentifier],
          ['User', 'email', '=', normalizedIdentifier],
          ['User', 'username', '=', normalizedIdentifier],
          ['User', 'full_name', '=', normalizedIdentifier],
        ]),
        limit_page_length: 1,
      },
    })

    const user = data.data[0]

    if (!user?.name) {
      return null
    }

    return {
      username:    user.name,
      fullName:    user.full_name?.trim()  || undefined,
      loginId:     normalizedIdentifier,
      mobileNo:    user.mobile_no?.trim()  || undefined,
      gender:      user.gender?.trim()     || undefined,
      dateOfBirth: user.birth_date         || undefined,
    }
  },

  /**
   * Returns application roles for the currently-authenticated session user.
   *
   * Strategy 0 (primary): GET /api/method/get_my_roles — a Frappe Server Script
   *   that calls frappe.get_roles() server-side. Reads from the session role
   *   cache, bypasses all doctype permission checks, and returns exact role names.
   *   Requires the Server Script to be created in Frappe (Settings → Server Script).
   *
   * Strategy 1: User document direct roles child table (fallback).
   * Strategy 1b: role_profile_name scalar field → fetch Role Profile roles.
   * Strategy 2: frappe.client.get POST — same document, different code path.
   */
  async getRoles(username: string): Promise<string[]> {
    const BASE_ROLES = new Set(['Guest', 'All', 'Desk User'])
    const toAppRoles = (list: { role: string }[]) =>
      list.map((r) => r.role).filter((r) => r && !BASE_ROLES.has(r))

    // Strategy 0 — Server Script endpoint (most reliable)
    try {
      const { data } = await httpClient.get<{ message?: string[] }>('/api/method/get_my_roles')
      const roles = (data.message ?? []).filter((r) => r && !BASE_ROLES.has(r))
      console.log('[getRoles] Strategy 0 response:', data.message, '→ app roles:', roles)
      if (roles.length > 0) return roles
    } catch (err) {
      console.warn('[getRoles] Strategy 0 failed (Server Script missing or erroring):', err)
    }

    const tryRoleProfile = async (profileName: string | null | undefined): Promise<string[]> => {
      if (!profileName?.trim()) return []
      try {
        const { data } = await httpClient.get<{ data: { roles?: { role: string }[] } }>(
          `/api/resource/Role Profile/${encodeURIComponent(profileName.trim())}`,
        )
        return toAppRoles(data.data.roles ?? [])
      } catch {
        return []
      }
    }

    // Strategy 1 — REST document endpoint (direct roles + role_profile_name)
    try {
      const { data } = await httpClient.get<{
        data: { roles?: { role: string }[]; role_profile_name?: string | null }
      }>(`/api/resource/User/${encodeURIComponent(username)}`)

      const direct = toAppRoles(data.data.roles ?? [])
      if (direct.length > 0) return direct

      const fromProfile = await tryRoleProfile(data.data.role_profile_name)
      if (fromProfile.length > 0) return fromProfile
    } catch { /* fall through */ }

    // Strategy 2 — frappe.client.get POST (same document, different code path)
    try {
      const { data } = await httpClient.post<{
        message?: { roles?: { role: string }[]; role_profile_name?: string | null }
      }>('/api/method/frappe.client.get', { doctype: 'User', name: username })

      const direct = toAppRoles(data.message?.roles ?? [])
      if (direct.length > 0) return direct

      const fromProfile = await tryRoleProfile(data.message?.role_profile_name)
      if (fromProfile.length > 0) return fromProfile
    } catch { /* fall through */ }

    return []
  },

  async logout(): Promise<void> {
    await httpClient.post('/api/method/logout')
  },
}
