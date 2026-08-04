import { useEffect, useRef, useState } from 'react'
import { userApi, type UserOption } from '../../../api/userApi'
import type { Task } from '../types/task.types'
import { UserAvatar } from '../../../shared/components/UserAvatar'

// ─── Props ────────────────────────────────────────────────────────────────────

interface AssignTaskModalProps {
  task: Task
  currentUser: string
  onAssign: (userId: string) => Promise<boolean>
  onUnassign: (userId: string) => Promise<boolean>
  onClose: () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AssignTaskModal({
  task,
  currentUser,
  onAssign,
  onUnassign,
  onClose,
}: AssignTaskModalProps) {
  const [query, setQuery]         = useState('')
  const [allUsers, setAllUsers]   = useState<UserOption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeOp, setActiveOp]   = useState<string | null>(null)
  const searchRef                 = useRef<HTMLInputElement>(null)

  // Pre-load active employees on mount
  useEffect(() => {
    setIsLoading(true)
    userApi.searchActiveEmployees('')
      .then((u) => setAllUsers(u))
      .catch(() => setAllUsers([]))
      .finally(() => setIsLoading(false))
  }, [])

  // Focus search on open
  useEffect(() => {
    const t = setTimeout(() => searchRef.current?.focus(), 80)
    return () => clearTimeout(t)
  }, [])

  // Re-search when query changes
  useEffect(() => {
    if (!query.trim()) return
    const timer = setTimeout(async () => {
      try {
        const users = await userApi.searchActiveEmployees(query.trim())
        setAllUsers(users)
      } catch {
        // keep current list
      }
    }, 250)
    return () => clearTimeout(timer)
  }, [query])

  // Escape closes
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  // Filter displayed users by query (local filter over pre-loaded list)
  const lowerQ = query.toLowerCase()
  const visibleUsers = allUsers.filter((u) =>
    !lowerQ ||
    u.name.toLowerCase().includes(lowerQ) ||
    u.fullName.toLowerCase().includes(lowerQ),
  )

  const toggle = async (userId: string) => {
    if (activeOp) return
    setActiveOp(userId)
    const isAssigned = task.assignedTo.includes(userId)
    if (isAssigned) {
      await onUnassign(userId)
    } else {
      await onAssign(userId)
    }
    setActiveOp(null)
  }

  return (
    <div
      className="fixed inset-0 bg-black/30 z-[60] flex items-center justify-center animate-fade-in p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-[320px] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >

        {/* Search bar */}
        <div className="flex items-center gap-2 px-3 border-b border-slate-100">
          <svg fill="none" viewBox="0 0 16 16" width="14" height="14" className="text-slate-400 flex-shrink-0">
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M10.5 10.5L13.5 13.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people..."
            className="flex-1 h-10 text-[13px] text-slate-700 placeholder:text-slate-400 bg-transparent outline-none border-0"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="w-4 h-4 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors flex-shrink-0"
            >
              <svg fill="none" viewBox="0 0 10 10" width="9" height="9">
                <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4"/>
              </svg>
            </button>
          )}
        </div>

        {/* User list */}
        <div className="overflow-y-auto scrollbar-none" style={{ maxHeight: 320 }}>
          {isLoading ? (
            <div className="py-8 flex items-center justify-center">
              <svg className="w-5 h-5 text-slate-300 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            </div>
          ) : visibleUsers.length === 0 ? (
            <p className="text-[12.5px] text-slate-400 text-center py-8">No users found</p>
          ) : (
            visibleUsers.map((user) => {
              const isAssigned = task.assignedTo.includes(user.name)
              const isMe       = user.name === currentUser
              const isPending  = activeOp === user.name

              return (
                <button
                  key={user.name}
                  type="button"
                  disabled={!!activeOp && !isPending}
                  onClick={() => toggle(user.name)}
                  className={[
                    'w-full flex items-center gap-2.5 px-3 py-2 transition-colors text-left',
                    isAssigned ? 'bg-indigo-50/60' : 'hover:bg-slate-50',
                    activeOp && !isPending ? 'opacity-50' : '',
                  ].join(' ')}
                >
                  {/* Avatar */}
                  {isPending ? (
                    <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                      <svg className="w-3.5 h-3.5 animate-spin text-slate-400" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                    </div>
                  ) : (
                    <UserAvatar name={user.name} size="sm" />
                  )}

                  {/* Name + email */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[12.5px] font-medium text-slate-800 truncate leading-tight">
                      {user.fullName}
                      {isMe && (
                        <span className="ml-1.5 text-[10px] text-indigo-500 font-semibold">(me)</span>
                      )}
                    </p>
                    {user.fullName !== user.name && (
                      <p className="text-[11px] text-slate-400 truncate leading-tight">{user.name}</p>
                    )}
                  </div>

                  {/* Check or add indicator */}
                  {isAssigned ? (
                    <svg fill="none" viewBox="0 0 14 14" width="14" height="14" className="text-indigo-500 flex-shrink-0">
                      <circle cx="7" cy="7" r="6" fill="currentColor" fillOpacity="0.12"/>
                      <path d="M4 7l2 2 4-4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"/>
                    </svg>
                  ) : (
                    <svg fill="none" viewBox="0 0 14 14" width="13" height="13" className="text-slate-300 group-hover:text-slate-400 flex-shrink-0">
                      <path d="M7 3v8M3 7h8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5"/>
                    </svg>
                  )}
                </button>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-3 py-2 border-t border-slate-100 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            {task.assignedTo.length > 0
              ? `${task.assignedTo.length} assigned`
              : 'No assignees'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-[12px] text-slate-500 hover:text-slate-700 font-medium transition-colors"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  )
}
