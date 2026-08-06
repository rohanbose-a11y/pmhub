import { create } from 'zustand'

interface NotifState {
  readIds: Set<string>
  loadForUser: (username: string) => void
  markRead: (taskId: string, username: string) => void
  markAllRead: (taskIds: string[], username: string) => void
}

const storageKey = (username: string) => `notif_read_${username}`

const loadIds = (username: string): Set<string> => {
  try {
    const raw = localStorage.getItem(storageKey(username))
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
  } catch {
    return new Set()
  }
}

const MAX_READ_IDS = 2000

const saveIds = (username: string, ids: Set<string>) => {
  try {
    const arr = [...ids]
    localStorage.setItem(storageKey(username), JSON.stringify(arr.slice(-MAX_READ_IDS)))
  } catch {
    // storage unavailable — fail silently
  }
}

export const useNotifStore = create<NotifState>((set) => ({
  readIds: new Set(),

  loadForUser: (username) => {
    set({ readIds: loadIds(username) })
  },

  markRead: (taskId, username) => {
    set((state) => {
      const next = new Set(state.readIds)
      next.add(taskId)
      saveIds(username, next)
      return { readIds: next }
    })
  },

  markAllRead: (taskIds, username) => {
    set((state) => {
      const next = new Set(state.readIds)
      taskIds.forEach((id) => next.add(id))
      saveIds(username, next)
      return { readIds: next }
    })
  },
}))
