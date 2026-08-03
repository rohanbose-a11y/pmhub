import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAuthStore } from '../../store/authStore'
import { useWorkStore } from '../../store/workStore'

// ─── Icon helpers ──────────────────────────────────────────────────────────────

function IconSearch({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.5 10.5L13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function IconCalendar({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="1.5" y="3" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5 1.5v3M11 1.5v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M1.5 7h13" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

function IconChevronDown({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconDoubleCheck({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M1.5 9.5l4.5 4.5 9-9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 9.5l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconInbox({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M3 4.5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H8L5 14V11.5H4a1 1 0 0 1-1-1V4.5z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// 4-pointed AI sparkle — each arm a different color, no fill on the center so
// arms visually "meet" as a crisp star shape.
function AiSparkle({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden>
      {/* Top arm — purple */}
      <path d="M10 2L11.3 9L10 10L8.7 9Z" fill="#a855f7" />
      {/* Right arm — blue */}
      <path d="M18 10L11 8.7L10 10L11 11.3Z" fill="#3b82f6" />
      {/* Bottom arm — orange */}
      <path d="M10 18L8.7 11L10 10L11.3 11Z" fill="#f97316" />
      {/* Left arm — pink */}
      <path d="M2 10L9 11.3L10 10L9 8.7Z" fill="#ec4899" />
    </svg>
  )
}

// ─── Command palette items ─────────────────────────────────────────────────────

interface PaletteItem {
  label:     string
  shortcut?: string
  to?:       string
  action?:   () => void
  // enriched fields for task / project results
  taskId?:   string
  status?:   string
  project?:  string
  subtitle?: string
  type?:     'nav' | 'task' | 'project'
}
interface PaletteGroup {
  group: string
  items: PaletteItem[]
}

const NAV_GROUPS: PaletteGroup[] = [
  {
    group: 'Navigate',
    items: [
      { label: 'Dashboard',          shortcut: 'G D', to: '/dashboard',        type: 'nav' },
      { label: 'Project Dashboard',  shortcut: 'G P', to: '/dashboard/project', type: 'nav' },
      { label: 'Projects',                            to: '/projects',          type: 'nav' },
      { label: 'Notifications',      shortcut: 'G N', to: '/notifications',     type: 'nav' },
      { label: 'Profile',                             to: '/profile',           type: 'nav' },
    ],
  },
]

const STATUS_DOT: Record<string, string> = {
  Completed:       '#22C55E',
  Working:         '#3B82F6',
  'Pending Review':'#7B3FF2',
  Overdue:         '#EF4444',
  Cancelled:       '#9CA3AF',
  Open:            '#6B7280',
}
function sdot(s: string) { return STATUS_DOT[s] ?? '#6B7280' }

// ─── Component ─────────────────────────────────────────────────────────────────

export function TopNavBar() {
  const navigate = useNavigate()

  // ── Auth ──────────────────────────────────────────────────────────────────
  const fullName = useAuthStore((s) => s.user?.fullName)
  const username = useAuthStore((s) => s.user?.username)
  const logout   = useAuthStore((s) => s.logout)

  const initials    = (fullName ?? username ?? '?').split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase()
  const displayName = fullName?.split(' ').slice(0, 2).join(' ') ?? username ?? ''

  // ── Workspace data (for live search) ─────────────────────────────────────
  const tasks    = useWorkStore((s) => s.tasks)
  const projects = useWorkStore((s) => s.projects)

  // ── Command palette state ─────────────────────────────────────────────────
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [query, setQuery]             = useState('')
  const inputRef                      = useRef<HTMLInputElement>(null)
  const [activeIdx, setActiveIdx]     = useState(0)

  // ── Avatar menu state ─────────────────────────────────────────────────────
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function onOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [menuOpen])

  // Global Ctrl+K / Cmd+K shortcut
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setPaletteOpen((v) => !v) }
      if (e.key === 'Escape') setPaletteOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // Focus input & reset when palette opens/closes
  useEffect(() => {
    if (paletteOpen) {
      setActiveIdx(0)
      const t = setTimeout(() => inputRef.current?.focus(), 30)
      return () => clearTimeout(t)
    } else {
      setQuery('')
    }
  }, [paletteOpen])

  // ── Build filtered groups (nav + live task/project search) ────────────────
  const filteredGroups = useMemo((): PaletteGroup[] => {
    const q = query.trim().toLowerCase()

    // Nav items — always shown when no query; filtered when there is one
    const navGroups: PaletteGroup[] = NAV_GROUPS.map((g) => ({
      ...g,
      items: q ? g.items.filter((i) => i.label.toLowerCase().includes(q)) : g.items,
    })).filter((g) => g.items.length > 0)

    if (!q || q.length < 2) return navGroups

    // Live task search (match subject)
    const matchedTasks: PaletteItem[] = tasks
      .filter((t) => t.subject.toLowerCase().includes(q))
      .slice(0, 8)
      .map((t) => ({
        type:    'task' as const,
        label:   t.subject,
        taskId:  t.id,
        status:  t.status,
        project: t.project ?? undefined,
        subtitle: [t.project, t.status].filter(Boolean).join(' · '),
      }))

    // Live project search (match name)
    const matchedProjects: PaletteItem[] = projects
      .filter((p) => (p.displayName || p.name).toLowerCase().includes(q))
      .slice(0, 4)
      .map((p) => ({
        type:     'project' as const,
        label:    p.displayName || p.name,
        to:       `/tasks?project=${encodeURIComponent(p.name)}`,
        subtitle: `${tasks.filter((t) => t.project === p.name).length} tasks`,
      }))

    const result = [...navGroups]
    if (matchedTasks.length)    result.push({ group: 'Tasks',    items: matchedTasks    })
    if (matchedProjects.length) result.push({ group: 'Projects', items: matchedProjects })
    return result
  }, [query, tasks, projects])

  // Flat list for keyboard navigation
  const flatItems: PaletteItem[] = filteredGroups.flatMap((g) => g.items)

  function handlePaletteKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, flatItems.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter' && flatItems[activeIdx]) executePaletteItem(flatItems[activeIdx])
  }

  function executePaletteItem(item: PaletteItem) {
    setPaletteOpen(false)
    if (item.taskId) {
      navigate('/tasks', { state: { taskId: item.taskId } })
    } else if (item.to) {
      navigate(item.to)
    }
    item.action?.()
  }

  return (
    <>
      {/* ═══════════════════════════════════════════════════════════════════
          TOP NAV BAR
      ═══════════════════════════════════════════════════════════════════ */}
      <header
        className="relative flex items-center w-full bg-white px-4"
        style={{ height: 48, borderBottom: '0.5px solid #eee' }}
      >

        {/* ── LEFT: workspace + calendar ──────────────────────────── */}
        <div className="flex items-center gap-0.5">

          {/* Workspace button */}
          <button
            type="button"
            className="flex items-center gap-1.5 h-8 px-2 rounded-md hover:bg-gray-100 transition-colors"
            aria-label="Open workspace menu"
          >
            {/* Green squircle app icon */}
            <div
              className="w-6 h-6 flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0 select-none"
              style={{ background: '#22c55e', borderRadius: 6 }}
            >
              S
            </div>
            <span className="text-[14px] font-medium text-gray-800 whitespace-nowrap">
              Sauramandala
            </span>
            <IconChevronDown className="text-gray-400" />
          </button>

          {/* Calendar / planner */}
          <button
            type="button"
            className="w-8 h-8 flex items-center justify-center rounded-md text-gray-400 hover:text-slate-600 hover:bg-gray-100 transition-colors"
            aria-label="Open planner"
          >
            <IconCalendar />
          </button>
        </div>

        {/* ── CENTER: search bar (absolutely centered) ─────────────── */}
        <div
          className="absolute left-1/2 -translate-x-1/2"
          style={{ width: 320 }}
        >
          <button
            type="button"
            className="w-full h-8 flex items-center gap-2 px-3 rounded-[20px] text-gray-400 hover:bg-[#ebebeb] transition-colors"
            style={{ background: '#f2f2f2' }}
            onClick={() => setPaletteOpen(true)}
            aria-label="Search (Ctrl K)"
          >
            <IconSearch className="flex-shrink-0" />
            <span className="flex-1 text-left text-[13px] text-gray-400 select-none">
              Search
            </span>
            <span
              className="flex-shrink-0 text-[11px] text-gray-400 font-mono px-1.5 py-[1px] rounded select-none"
              style={{ background: 'rgba(0,0,0,0.07)' }}
            >
              Ctrl K
            </span>
            <AiSparkle size={15} />
          </button>
        </div>

        {/* ── RIGHT: AI icon + actions + avatar ────────────────────── */}
        <div className="ml-auto flex items-center gap-0.5">

          {/* Standalone AI sparkle */}
          <button
            type="button"
            className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-gray-100 transition-colors"
            aria-label="AI assistant"
          >
            <AiSparkle size={18} />
          </button>

          {/* Double-check / completed tasks */}
          <button
            type="button"
            className="w-8 h-8 flex items-center justify-center rounded-md text-gray-400 hover:text-slate-600 hover:bg-gray-100 transition-colors"
            aria-label="Completed tasks"
          >
            <IconDoubleCheck />
          </button>

          {/* Chat / inbox */}
          <button
            type="button"
            className="w-8 h-8 flex items-center justify-center rounded-md text-gray-400 hover:text-slate-600 hover:bg-gray-100 transition-colors"
            aria-label="Inbox"
          >
            <IconInbox />
          </button>

          {/* User avatar + dropdown */}
          <div className="relative ml-1" ref={menuRef}>
            <button
              type="button"
              className="relative w-8 h-8 flex items-center justify-center text-white text-[11px] font-bold hover:opacity-80 transition-opacity select-none"
              style={{ background: '#2c2c2c', borderRadius: 8 }}
              aria-label="User menu"
              onClick={() => setMenuOpen((v) => !v)}
            >
              {initials}
              {/* Online presence dot */}
              <span className="absolute -bottom-[2px] -right-[2px] w-2.5 h-2.5 bg-emerald-400 rounded-full ring-2 ring-white" />
            </button>

            {menuOpen && (
              <div
                className="absolute right-0 top-[calc(100%+6px)] w-52 bg-white rounded-xl overflow-hidden z-50"
                style={{ border: '1px solid #eee', boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}
              >
                {/* User info */}
                <div className="px-3.5 py-2.5 border-b border-gray-100">
                  <p className="text-[13px] font-medium text-gray-800 truncate">{displayName}</p>
                  {username && (
                    <p className="text-[11.5px] text-gray-400 truncate">{username}</p>
                  )}
                </div>

                {/* Menu items */}
                <div className="py-1">
                  <button
                    type="button"
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[13px] text-gray-700 hover:bg-gray-50 transition-colors"
                    onClick={() => { setMenuOpen(false); navigate('/profile') }}
                  >
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
                      <circle cx="8" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.4"/>
                      <path d="M3 13c0-2.76 2.24-4 5-4s5 1.24 5 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                    </svg>
                    Profile
                  </button>

                  <div className="h-px bg-gray-100 mx-2 my-1" />

                  <button
                    type="button"
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[13px] text-gray-500 hover:text-rose-500 hover:bg-rose-50 transition-colors"
                    onClick={() => { setMenuOpen(false); void logout() }}
                  >
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
                      <path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4"/>
                      <path d="M10.5 11L14 8l-3.5-3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4"/>
                      <path d="M14 8H6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4"/>
                    </svg>
                    Log out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════════════════
          COMMAND PALETTE OVERLAY
      ═══════════════════════════════════════════════════════════════════ */}
      {paletteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center"
          style={{ background: 'rgba(0,0,0,0.32)', paddingTop: '14vh' }}
          onMouseDown={() => setPaletteOpen(false)}
        >
          <div
            className="bg-white w-full max-w-[500px] rounded-xl overflow-hidden mx-4"
            style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.18)' }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Search input */}
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-gray-100">
              <IconSearch className="text-gray-400 flex-shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setActiveIdx(0) }}
                onKeyDown={handlePaletteKeyDown}
                placeholder="Search or jump to…"
                className="flex-1 text-[14px] text-gray-800 placeholder-gray-400 bg-transparent outline-none"
              />
              <kbd
                className="text-[11px] text-gray-400 font-mono px-1.5 py-[2px] rounded select-none"
                style={{ background: '#f2f2f2' }}
              >
                Esc
              </kbd>
            </div>

            {/* Results */}
            <div className="py-1.5 max-h-80 overflow-y-auto">
              {filteredGroups.length === 0 ? (
                <p className="text-center text-[13px] text-gray-400 py-8">
                  No results for &ldquo;{query}&rdquo;
                </p>
              ) : (
                (() => {
                  let globalIdx = 0
                  return filteredGroups.map((group) => (
                    <div key={group.group}>
                      <p className="px-4 pt-2.5 pb-1 text-[10.5px] font-semibold text-gray-400 uppercase tracking-widest">
                        {group.group}
                      </p>
                      {group.items.map((item) => {
                        const idx      = globalIdx++
                        const active   = idx === activeIdx
                        const isTask   = item.type === 'task'
                        const isProj   = item.type === 'project'
                        return (
                          <button
                            key={item.taskId ?? item.label}
                            type="button"
                            className={[
                              'w-full flex items-center gap-3 px-4 transition-colors',
                              isTask || isProj ? 'py-2' : 'py-2',
                              active ? 'bg-[#F3F0FF]' : 'hover:bg-gray-50',
                            ].join(' ')}
                            onMouseEnter={() => setActiveIdx(idx)}
                            onClick={() => executePaletteItem(item)}
                          >
                            {/* Task: status dot */}
                            {isTask && (
                              <span
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ background: sdot(item.status ?? '') }}
                              />
                            )}

                            {/* Project: folder icon */}
                            {isProj && (
                              <svg fill="none" viewBox="0 0 16 16" width={13} height={13} className="flex-shrink-0 text-indigo-400">
                                <path d="M2 4.5A1.5 1.5 0 013.5 3h3l1.5 1.5H12.5A1.5 1.5 0 0114 6v5.5A1.5 1.5 0 0112.5 13h-9A1.5 1.5 0 012 11.5v-7z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                              </svg>
                            )}

                            {/* Label + subtitle */}
                            <span className="flex-1 text-left min-w-0">
                              <span className={['block text-[13px] truncate', active ? 'text-[#7B3FF2] font-medium' : 'text-gray-700'].join(' ')}>
                                {item.label}
                              </span>
                              {item.subtitle && (
                                <span className="block text-[11px] text-gray-400 truncate">{item.subtitle}</span>
                              )}
                            </span>

                            {/* Keyboard shortcut (nav items only) */}
                            {item.shortcut && (
                              <kbd className="text-[11px] text-gray-400 font-mono px-1.5 py-[2px] rounded select-none flex-shrink-0" style={{ background: '#f2f2f2' }}>
                                {item.shortcut}
                              </kbd>
                            )}

                            {/* Task: open indicator */}
                            {isTask && (
                              <svg fill="none" viewBox="0 0 12 12" width={11} height={11} className="flex-shrink-0 text-gray-300">
                                <path d="M2 6h8M6 2l4 4-4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  ))
                })()
              )}
            </div>

            {/* Footer hint */}
            <div className="flex items-center gap-3 px-4 py-2 border-t border-gray-100">
              <span className="text-[11px] text-gray-400">
                <kbd className="font-mono bg-gray-100 px-1 py-0.5 rounded text-[10px]">↑↓</kbd> navigate
              </span>
              <span className="text-[11px] text-gray-400">
                <kbd className="font-mono bg-gray-100 px-1 py-0.5 rounded text-[10px]">↵</kbd> open
              </span>
              <span className="text-[11px] text-gray-400">
                <kbd className="font-mono bg-gray-100 px-1 py-0.5 rounded text-[10px]">Esc</kbd> close
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
