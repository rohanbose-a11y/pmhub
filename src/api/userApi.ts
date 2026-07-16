import { httpClient } from './httpClient'

interface FrappeUserRecord {
  name: string
  full_name?: string | null
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
}
