import { httpClient } from './httpClient'
import { env } from '../config/env'

// Module-level cache — one fetch per username per session
const _imgCache = new Map<string, Promise<string | null>>()

interface FrappeUserRecord {
  name: string
  full_name?: string | null
}

interface FrappeEmployeeRecord {
  user_id?: string | null
  employee_name?: string | null
}

export interface UserOption {
  name: string
  fullName: string
}

export const userApi = {
  async searchUsers(query: string): Promise<UserOption[]> {
    const { data } = await httpClient.get<{ data: FrappeUserRecord[] }>('/api/resource/User', {
      params: {
        fields: JSON.stringify(['name', 'full_name']),
        filters: JSON.stringify([
          ['User', 'enabled', '=', 1],
          ['User', 'name', '!=', 'Administrator'],
          ['User', 'name', '!=', 'Guest'],
        ]),
        or_filters: JSON.stringify([
          ['User', 'name', 'like', `%${query}%`],
          ['User', 'full_name', 'like', `%${query}%`],
        ]),
        limit_page_length: 10,
      },
    })
    return data.data.map((u) => ({
      name: u.name,
      fullName: u.full_name?.trim() || u.name,
    }))
  },

  getImage(username: string): Promise<string | null> {
    if (!_imgCache.has(username)) {
      _imgCache.set(username,
        httpClient.get<{ data: { user_image?: string | null } }>(
          `/api/resource/User/${encodeURIComponent(username)}`,
          { params: { fields: JSON.stringify(['user_image']) } },
        )
          .then(({ data }) => {
            const path = data.data.user_image || null
            if (!path) return null
            return path.startsWith('http') ? path : env.apiBaseUrl + path
          })
          .catch(() => null),
      )
    }
    return _imgCache.get(username)!
  },

  async searchActiveEmployees(query: string, signal?: AbortSignal): Promise<UserOption[]> {
    const { data } = await httpClient.get<{ data: FrappeEmployeeRecord[] }>('/api/resource/Employee', {
      signal,
      params: {
        fields: JSON.stringify(['user_id', 'employee_name']),
        filters: JSON.stringify([
          ['Employee', 'status', '=', 'Active'],
          ['Employee', 'user_id', '!=', ''],
        ]),
        or_filters: query ? JSON.stringify([
          ['Employee', 'employee_name', 'like', `%${query}%`],
          ['Employee', 'user_id', 'like', `%${query}%`],
        ]) : undefined,
        limit_page_length: 50,
      },
    })
    return data.data
      .filter((e) => e.user_id)
      .map((e) => ({
        name: e.user_id!,
        fullName: e.employee_name?.trim() || e.user_id!,
      }))
  },
}
