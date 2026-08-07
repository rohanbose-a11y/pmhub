import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'

import { useAuthStore } from '../../store/authStore'
import { useWorkStore } from '../../store/workStore'
import { useNotifStore } from '../../store/notifStore'
import { useNotificationSound } from '../../hooks/useNotificationSound'
import { appNavItems, MobileBottomNav } from './MobileBottomNav'
import { UserAvatar } from './UserAvatar'
import { useWhatsAppScheduler } from '../../features/whatsapp/useWhatsAppScheduler'

// ─── Command-palette types ────────────────────────────────────────────────────

interface PaletteItem {
  label:    string
  shortcut?: string
  to?:      string
  taskId?:  string
  status?:  string
  subtitle?: string
  type?:    'nav' | 'task' | 'project'
}
interface PaletteGroup { group: string; items: PaletteItem[] }

const NAV_PALETTE: PaletteGroup[] = [{
  group: 'Navigate',
  items: [
    { label: 'Personal Dashboard',  shortcut: 'G D', to: '/dashboard',          type: 'nav' },
    { label: 'Project Dashboard',            to: '/dashboard/project', type: 'nav' },
    { label: 'Projects',                     to: '/projects',          type: 'nav' },
    { label: 'Notifications',  shortcut: 'G N', to: '/notifications',     type: 'nav' },
    { label: 'Profile',                      to: '/profile',           type: 'nav' },
  ],
}]

const STATUS_DOT_CLR: Record<string, string> = {
  Completed: '#22C55E', Working: '#3B82F6', 'Pending Review': '#7B3FF2',
  Overdue: '#EF4444', Cancelled: '#9CA3AF', Open: '#6B7280',
}
function paletteDot(s: string) { return STATUS_DOT_CLR[s] ?? '#6B7280' }

// ─── Project color helpers ────────────────────────────────────────────────────

const PROJ_PALETTE = [
  '#7B3FF2', '#3B82F6', '#22C55E', '#F97316',
  '#EF4444', '#14B8A6', '#8B5CF6', '#EC4899',
]
function projColor(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h)
  return PROJ_PALETTE[Math.abs(h) % PROJ_PALETTE.length]
}
function projInitials(s: string) {
  return s
    .replace(/[-_]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

// ─── Mock sidebar data ────────────────────────────────────────────────────────

const MOCK_CHANNELS = [
  { id: 'general',         name: 'general'         },
  { id: 'announcements',   name: 'announcements'   },
  { id: 'project-updates', name: 'project-updates' },
]
const MOCK_DMS = [
  { id: 'admin', name: 'Team Admin',    online: true  },
  { id: 'lead',  name: 'Project Lead',  online: false },
]

// ─── SectionHeader ────────────────────────────────────────────────────────────

function SectionHeader({
  label,
  collapsed,
  onToggle,
}: {
  label: string
  collapsed: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        width: '100%',
        height: 28,
        padding: '0 10px',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <svg
        fill="none"
        viewBox="0 0 10 10"
        width="9"
        height="9"
        style={{
          flexShrink: 0,
          color: '#9CA3AF',
          transform: collapsed ? 'rotate(-90deg)' : 'none',
          transition: 'transform 150ms',
        }}
      >
        <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.3"/>
      </svg>
      <span style={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9CA3AF' }}>
        {label}
      </span>
    </button>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AppShellLayout() {
  const location        = useLocation()
  const user            = useAuthStore((state) => state.user)
  const username        = user?.username
  const workspaceStatus    = useWorkStore((state) => state.status)
  const workspaceError     = useWorkStore((state) => state.error)
  const loadWorkspace      = useWorkStore((state) => state.loadWorkspace)
  const tasks              = useWorkStore((state) => state.tasks)
  const projects           = useWorkStore((state) => state.projects)
  const updateTaskError    = useWorkStore((state) => state.updateTaskError)
  const clearUpdateTaskError = useWorkStore((state) => state.clearUpdateTaskError)
  const readIds         = useNotifStore((s) => s.readIds)
  const loadForUser     = useNotifStore((s) => s.loadForUser)

  const navigate = useNavigate()

  // ── Command palette ────────────────────────────────────────────────────────
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [palQuery,    setPalQuery]    = useState('')
  const [palIdx,      setPalIdx]      = useState(0)
  const palInputRef                   = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setPaletteOpen((v) => !v) }
      if (e.key === 'Escape') setPaletteOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (paletteOpen) {
      setPalIdx(0)
      const t = setTimeout(() => palInputRef.current?.focus(), 30)
      return () => clearTimeout(t)
    } else {
      setPalQuery('')
    }
  }, [paletteOpen])

  const paletteGroups = useMemo((): PaletteGroup[] => {
    const q = palQuery.trim().toLowerCase()
    const navGroups = NAV_PALETTE.map((g) => ({
      ...g,
      items: q ? g.items.filter((i) => i.label.toLowerCase().includes(q)) : g.items,
    })).filter((g) => g.items.length > 0)

    if (!q || q.length < 2) return navGroups

    const matchedTasks: PaletteItem[] = tasks
      .filter((t) => t.subject.toLowerCase().includes(q))
      .slice(0, 8)
      .map((t) => ({
        type: 'task' as const, label: t.subject,
        taskId: t.id, status: t.status,
        subtitle: [t.project, t.status].filter(Boolean).join(' · '),
      }))

    const matchedProjects: PaletteItem[] = projects
      .filter((p) => (p.displayName || p.name).toLowerCase().includes(q))
      .slice(0, 4)
      .map((p) => ({
        type: 'project' as const,
        label: p.displayName || p.name,
        to: `/tasks?project=${encodeURIComponent(p.name)}`,
        subtitle: `${tasks.filter((t) => t.project === p.name).length} tasks`,
      }))

    const result = [...navGroups]
    if (matchedTasks.length)    result.push({ group: 'Tasks',    items: matchedTasks    })
    if (matchedProjects.length) result.push({ group: 'Projects', items: matchedProjects })
    return result
  }, [palQuery, tasks, projects])

  const palFlat = paletteGroups.flatMap((g) => g.items)

  function runPaletteItem(item: PaletteItem) {
    setPaletteOpen(false)
    if (item.taskId) navigate('/tasks', { state: { taskId: item.taskId } })
    else if (item.to) navigate(item.to)
  }

  function onPaletteKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setPalIdx((i) => Math.min(i + 1, palFlat.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setPalIdx((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter' && palFlat[palIdx]) runPaletteItem(palFlat[palIdx])
  }

  // ── Sidebar sections ───────────────────────────────────────────────────────
  const [dashboardCollapsed, setDashboardCollapsed] = useState(false)
  const [spacesCollapsed,   setSpacesCollapsed]   = useState(false)
  const [channelsCollapsed, setChannelsCollapsed] = useState(false)
  const [dmsCollapsed,      setDmsCollapsed]      = useState(false)

  useEffect(() => {
    if (username) loadForUser(username)
  }, [username, loadForUser])

  const { alertCount, myTaskIdsKey } = useMemo(() => {
    const today        = new Date(); today.setHours(0, 0, 0, 0)
    const week         = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)

    const isActive = (s: string) =>
      !s.toLowerCase().includes('complet') &&
      s.toLowerCase() !== 'cancelled' &&
      s.toLowerCase() !== 'closed'

    const myTasks = username
      ? tasks.filter((t) => t.assignedTo.includes(username) || t.owner === username)
      : tasks

    const overdueIds  = new Set(myTasks.filter((t) => t.dueDate && isActive(t.status) && new Date(t.dueDate) < today).map((t) => t.id))
    const soonIds     = new Set(myTasks.filter((t) => {
      if (!t.dueDate || !isActive(t.status)) return false
      const due = new Date(t.dueDate)
      return due >= today && due <= week
    }).map((t) => t.id))
    const assignedIds = new Set(tasks.filter((t) => {
      if (!username || !t.assignedTo.includes(username)) return false
      if (!t.updatedAt || !isActive(t.status)) return false
      return new Date(t.updatedAt) >= sevenDaysAgo
    }).map((t) => t.id))

    const allIds = new Set([...overdueIds, ...soonIds, ...assignedIds])
    const unread = [...allIds].filter((id) => !readIds.has(id)).length
    const idsKey = myTasks.map((t) => t.id).sort().join(',')
    return { alertCount: unread, myTaskIdsKey: idsKey }
  }, [tasks, username, readIds])

  useEffect(() => {
    if (!updateTaskError) return
    const t = setTimeout(clearUpdateTaskError, 4000)
    return () => clearTimeout(t)
  }, [updateTaskError, clearUpdateTaskError])

  useNotificationSound(myTaskIdsKey)
  useWhatsAppScheduler()

  const lastLoadedAt = useRef<number>(0)

  useEffect(() => {
    if (!username) return
    lastLoadedAt.current = Date.now()
    void loadWorkspace(username)
  }, [loadWorkspace, username])

  useEffect(() => {
    if (!username) return
    const id = setInterval(() => {
      lastLoadedAt.current = Date.now()
      void loadWorkspace(username, true)
    }, 30_000)
    return () => clearInterval(id)
  }, [username, loadWorkspace])

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible' || !username) return
      if (Date.now() - lastLoadedAt.current > 30_000) {
        lastLoadedAt.current = Date.now()
        void loadWorkspace(username, true)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [username, loadWorkspace])

  // Task counts per project
  const taskCountByProject = useMemo(() => {
    const counts: Record<string, number> = {}
    tasks.forEach((t) => {
      if (t.project) counts[t.project] = (counts[t.project] ?? 0) + 1
    })
    return counts
  }, [tasks])

  const isNotificationsPage   = location.pathname.startsWith('/notifications')
  const activeProjectFilter   = location.pathname.startsWith('/tasks')
    ? new URLSearchParams(location.search).get('project')
    : null

  // Sync dot
  const syncDot   = workspaceStatus === 'loading' ? '#F59E0B' : workspaceError ? '#EF4444' : '#22C55E'
  const syncLabel = workspaceStatus === 'loading' ? 'Syncing' : workspaceError ? 'Error' : 'Live'

  // Mobile page label
  const currentItem = appNavItems.find((item) => location.pathname.startsWith(item.to)) ?? appNavItems[0]
  const pageLabel   = isNotificationsPage ? 'Notifications' : currentItem.label

  // Sidebar nav item style helper
  const navItem = (active: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    height: 32,
    padding: '0 10px',
    borderRadius: 6,
    cursor: 'pointer',
    background: active ? '#F3F0FF' : 'transparent',
    color: active ? '#7B3FF2' : '#6B7280',
    textDecoration: 'none',
    marginBottom: 1,
  })

  return (
    <div style={{ minHeight: '100vh', background: '#F9FAFB' }}>

      {/* ═══════════════════════════════════════════════════════════════════
          DESKTOP — fixed topbar + fixed sidebar
      ═══════════════════════════════════════════════════════════════════ */}

      {/* Full-width topbar (48px) */}
      <header
        className="hidden md:flex items-center"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: 48,
          background: 'white',
          borderBottom: '1px solid #E5E7EB',
          paddingLeft: 16,
          paddingRight: 16,
          gap: 8,
          zIndex: 30,
        }}
      >
        {/* Logo — aligns with sidebar */}
        <div style={{ width: 214, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, background: '#7B3FF2', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="14" height="14" fill="none" viewBox="0 0 16 16">
              <rect x="2" y="2" width="5" height="5" rx="1" stroke="white" strokeWidth="1.5"/>
              <rect x="9" y="2" width="5" height="5" rx="1" stroke="white" strokeWidth="1.5"/>
              <rect x="2" y="9" width="5" height="5" rx="1" stroke="white" strokeWidth="1.5"/>
              <path d="M9 11.5h5M9 9.5h3.5" stroke="white" strokeLinecap="round" strokeWidth="1.5"/>
            </svg>
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>Sauramandala PM Hub</span>
        </div>

        {/* Search */}
        <div
          onClick={() => setPaletteOpen(true)}
          style={{
            flex: 1,
            maxWidth: 420,
            height: 32,
            background: '#F3F4F6',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            padding: '0 12px',
            marginLeft: '25px',
            gap: 8,
            cursor: 'pointer',
          }}
        >
          <svg fill="none" viewBox="0 0 16 16" width={13} height={13} style={{ color: '#9CA3AF', flexShrink: 0 }}>
            <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M11 11l2.5 2.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5"/>
          </svg>
          <span style={{ fontSize: 12.5, color: '#9CA3AF', flex: 1 }}>Search anything…</span>
          <span style={{ fontSize: 10, color: '#9CA3AF', background: 'white', padding: '2px 6px', borderRadius: 5, border: '1px solid #E5E7EB', fontWeight: 500 }}>⌘K</span>
        </div>

        <div style={{ flex: 1 }} />

        {/* Sync status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: syncDot,
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 10.5, fontWeight: 600, color: '#6B7280' }}>{syncLabel}</span>
        </div>

        {/* Notifications */}
        <Link
          to="/notifications"
          aria-label={alertCount > 0 ? `${alertCount} alerts` : 'Notifications'}
          style={{
            position: 'relative',
            width: 32,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 8,
            color: isNotificationsPage ? '#7B3FF2' : '#6B7280',
            background: isNotificationsPage ? '#F3F0FF' : 'transparent',
            textDecoration: 'none',
          }}
        >
          <svg fill="none" viewBox="0 0 24 24" width={17} height={17}>
            <path d="M12 3C9.24 3 7 5.24 7 8v5l-2 2v1h14v-1l-2-2V8c0-2.76-2.24-5-5-5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
            <path d="M10 19a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
          {alertCount > 0 && (
            <span style={{ position: 'absolute', top: 4, right: 4, minWidth: 14, height: 14, background: '#EF4444', color: 'white', fontSize: 9, fontWeight: 700, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', lineHeight: 1, pointerEvents: 'none' }}>
              {alertCount > 9 ? '9+' : alertCount}
            </span>
          )}
        </Link>

        {/* User avatar */}
        <Link to="/profile" style={{ textDecoration: 'none' }} title={username ?? ''}>
          <UserAvatar name={username ?? ''} fullName={user?.fullName} size="sm" />
        </Link>
      </header>

      {/* Sidebar (240px, starts below topbar) */}
      <aside
        className="hidden md:flex flex-col"
        style={{
          position: 'fixed',
          top: 48,
          left: 0,
          bottom: 0,
          width: 240,
          background: 'white',
          borderRight: '1px solid #E5E7EB',
          zIndex: 20,
          overflow: 'hidden',
        }}
      >
        <nav
          className="scrollbar-none"
          style={{ flex: 1, overflowY: 'auto', padding: '6px 8px 16px' }}
        >

          {/* ─── Top nav items ─── */}

          {/* Dashboard — collapsible with Personal + Project sub-links */}
          <div>
            <button
              type="button"
              onClick={() => setDashboardCollapsed((v) => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', height: 32, padding: '0 10px',
                borderRadius: 6, background: 'transparent', border: 'none',
                cursor: 'pointer', color: '#6B7280', marginBottom: 1,
              }}
            >
              <svg fill="none" viewBox="0 0 24 24" width={16} height={16} style={{ flexShrink: 0 }}>
                <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6"/>
                <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6"/>
                <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6"/>
                <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6"/>
              </svg>
              <span style={{ fontSize: 13, fontWeight: 500, flex: 1, textAlign: 'left' }}>Dashboard</span>
              <svg
                fill="none" viewBox="0 0 10 10" width={9} height={9}
                style={{ flexShrink: 0, color: '#9CA3AF', transform: dashboardCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 150ms' }}
              >
                <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.3"/>
              </svg>
            </button>

            {!dashboardCollapsed && (
              <div style={{ paddingLeft: 14 }}>
                <NavLink to="/dashboard" end style={{ textDecoration: 'none' }}>
                  {({ isActive }) => (
                    <div style={{ ...navItem(isActive), height: 30, paddingLeft: 10 }}>
                      <svg fill="none" viewBox="0 0 24 24" width={14} height={14} style={{ flexShrink: 0 }}>
                        <path d="M4 10.5L12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-5.5h-5V21H5a1 1 0 0 1-1-1v-9.5Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6"/>
                      </svg>
                      <span style={{ fontSize: 12.5, fontWeight: isActive ? 600 : 400 }}>Personal</span>
                    </div>
                  )}
                </NavLink>

                <NavLink to="/dashboard/project" style={{ textDecoration: 'none' }}>
                  {({ isActive }) => (
                    <div style={{ ...navItem(isActive), height: 30, paddingLeft: 10 }}>
                      <svg fill="none" viewBox="0 0 24 24" width={14} height={14} style={{ flexShrink: 0 }}>
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                      </svg>
                      <span style={{ fontSize: 12.5, fontWeight: isActive ? 600 : 400 }}>Project</span>
                    </div>
                  )}
                </NavLink>
              </div>
            )}
          </div>

          {/* ─── Divider ─── */}
          <div style={{ height: 1, background: '#F3F4F6', margin: '8px 0' }} />
          
          <NavLink to="/projects" style={{ textDecoration: 'none' }}>
            {({ isActive }) => (
              <div style={navItem(isActive)}>
                <svg fill="none" viewBox="0 0 24 24" width={16} height={16} style={{ flexShrink: 0 }}>
                  <rect x="3.5" y="4.5" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.6"/>
                  <rect x="13.5" y="4.5" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.6"/>
                  <rect x="3.5" y="14.5" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.6"/>
                  <path d="M14 18h6.5M14 15.5h4.5M14 20.5h3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6"/>
                </svg>
                <span style={{ fontSize: 13, fontWeight: isActive ? 600 : 400 }}>Projects</span>
              </div>
            )}
          </NavLink>

          <NavLink to="/timesheets" style={{ textDecoration: 'none' }}>
            {({ isActive }) => (
              <div style={navItem(isActive)}>
                <svg fill="none" viewBox="0 0 24 24" width={16} height={16} style={{ flexShrink: 0 }}>
                  <rect x="4" y="5" width="16" height="15" rx="3" stroke="currentColor" strokeWidth="1.6"/>
                  <path d="M8 3.5v3M16 3.5v3M7.5 10.5h9M7.5 15h5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6"/>
                </svg>
                <span style={{ fontSize: 13, fontWeight: isActive ? 600 : 400 }}>Timesheets</span>
              </div>
            )}
          </NavLink>

          <NavLink to="/calendar" style={{ textDecoration: 'none' }}>
            {({ isActive }) => (
              <div style={navItem(isActive)}>
                <svg fill="none" viewBox="0 0 24 24" width={16} height={16} style={{ flexShrink: 0 }}>
                  <rect x="3" y="4" width="18" height="17" rx="3" stroke="currentColor" strokeWidth="1.6"/>
                  <path d="M8 2v4M16 2v4M3 9h18" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6"/>
                  <rect x="7" y="12" width="3" height="3" rx="0.75" fill="currentColor" opacity=".5"/>
                  <rect x="12" y="12" width="3" height="3" rx="0.75" fill="currentColor"/>
                </svg>
                <span style={{ fontSize: 13, fontWeight: isActive ? 600 : 400 }}>Calendar</span>
              </div>
            )}
          </NavLink>

          <NavLink to="/notifications" style={{ textDecoration: 'none' }}>
            {({ isActive }) => (
              <div style={navItem(isActive)}>
                <svg fill="none" viewBox="0 0 24 24" width={16} height={16} style={{ flexShrink: 0 }}>
                  <path d="M12 3C9.24 3 7 5.24 7 8v5l-2 2v1h14v-1l-2-2V8c0-2.76-2.24-5-5-5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
                  <path d="M10 19a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                </svg>
                <span style={{ fontSize: 13, fontWeight: isActive ? 600 : 400, flex: 1 }}>Notifications</span>
                {alertCount > 0 && (
                  <span style={{ minWidth: 18, height: 18, background: '#EF4444', color: 'white', fontSize: 9.5, fontWeight: 700, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', flexShrink: 0 }}>
                    {alertCount > 9 ? '9+' : alertCount}
                  </span>
                )}
              </div>
            )}
          </NavLink>

          {/* ─── WhatsApp Admin (Administrator only) ─── */}
          {user?.roles?.includes('Administrator') && (
            <>
              <NavLink to="/whatsapp" style={{ textDecoration: 'none' }}>
                {({ isActive }) => (
                  <div style={navItem(isActive)}>
                    <svg fill="none" viewBox="0 0 24 24" width={16} height={16} style={{ flexShrink: 0 }}>
                      <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.37 5.07L2 22l5.09-1.35A9.94 9.94 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
                      <path d="M8.5 10.5c.5 1 1.5 2.5 3.5 3.5 1 .5 2 .5 2.5 0l.5-.5c.2-.2.2-.5 0-.7l-1.3-1.3c-.2-.2-.5-.2-.7 0l-.3.3c-.8-.4-1.3-.9-1.7-1.7l.3-.3c.2-.2.2-.5 0-.7L9.7 8.5c-.2-.2-.5-.2-.7 0l-.5.5c-.5.6-.5 1.5 0 2.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                    </svg>
                    <span style={{ fontSize: 13, fontWeight: isActive ? 600 : 400, flex: 1 }}>WhatsApp</span>
                    <span style={{ fontSize: 9.5, fontWeight: 600, background: '#FEF3C7', color: '#92400E', padding: '1px 5px', borderRadius: 4, flexShrink: 0 }}>Admin</span>
                  </div>
                )}
              </NavLink>
            </>
          )}

          {/* ─── Divider ─── */}
          <div style={{ height: 1, background: '#F3F4F6', margin: '8px 0' }} />

          {/* ─── SPACES ─── */}
          <SectionHeader label="Spaces" collapsed={spacesCollapsed} onToggle={() => setSpacesCollapsed((v) => !v)} />

          {!spacesCollapsed && projects.map((proj) => {
            const count    = taskCountByProject[proj.name] ?? 0
            const abbr     = projInitials(proj.displayName)
            const isActive = activeProjectFilter === proj.name
            return (
              <Link key={proj.name} to={`/tasks?project=${encodeURIComponent(proj.name)}`} style={{ textDecoration: 'none' }}>
                <div
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    height: 30, padding: '0 10px', borderRadius: 6,
                    cursor: 'pointer',
                    color: isActive ? '#7B3FF2' : '#374151',
                    background: isActive ? '#F3F0FF' : 'transparent',
                    transition: 'background 100ms',
                  }}
                  className={isActive ? '' : 'hover:bg-gray-50'}
                >
                  <div style={{ width: 18, height: 18, borderRadius: 4, background: projColor(proj.name), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: 'white', flexShrink: 0 }}>
                    {abbr}
                  </div>
                  <span style={{ fontSize: 12.5, fontWeight: isActive ? 600 : 400, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {proj.displayName}
                  </span>
                  {count > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 600, color: isActive ? '#7B3FF2' : '#9CA3AF', background: isActive ? '#EDE9FE' : '#F3F4F6', borderRadius: 999, padding: '1px 6px', flexShrink: 0 }}>
                      {count}
                    </span>
                  )}
                </div>
              </Link>
            )
          })}

          {!spacesCollapsed && projects.length === 0 && (
            <p style={{ fontSize: 11.5, color: '#9CA3AF', padding: '4px 10px' }}>No spaces yet</p>
          )}

          {/* ─── Divider ─── */}
          <div style={{ height: 1, background: '#F3F4F6', margin: '8px 0' }} />

          {/* ─── CHANNELS ─── */}
          <SectionHeader label="Channels" collapsed={channelsCollapsed} onToggle={() => setChannelsCollapsed((v) => !v)} />

          {!channelsCollapsed && MOCK_CHANNELS.map((ch) => (
            <Link key={ch.id} to="/channels" style={{ textDecoration: 'none' }}>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 6, height: 30, padding: '0 10px', borderRadius: 6, cursor: 'pointer', color: '#6B7280', transition: 'background 100ms' }}
                className="hover:bg-gray-50"
              >
                <span style={{ fontSize: 13, color: '#9CA3AF', flexShrink: 0 }}>#</span>
                <span style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ch.name}</span>
              </div>
            </Link>
          ))}

          {/* ─── Divider ─── */}
          <div style={{ height: 1, background: '#F3F4F6', margin: '8px 0' }} />

          {/* ─── DIRECT MESSAGES ─── */}
          <SectionHeader label="Direct Messages" collapsed={dmsCollapsed} onToggle={() => setDmsCollapsed((v) => !v)} />

          {!dmsCollapsed && MOCK_DMS.map((dm) => (
            <Link key={dm.id} to="/dm" style={{ textDecoration: 'none' }}>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 8, height: 30, padding: '0 10px', borderRadius: 6, cursor: 'pointer', color: '#6B7280', transition: 'background 100ms' }}
                className="hover:bg-gray-50"
              >
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: '#6B7280' }}>
                    {dm.name.slice(0, 2).toUpperCase()}
                  </div>
                  <span style={{ position: 'absolute', bottom: -1, right: -1, width: 6, height: 6, borderRadius: '50%', background: dm.online ? '#22C55E' : '#9CA3AF', border: '1.5px solid white' }} />
                </div>
                <span style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dm.name}</span>
              </div>
            </Link>
          ))}

        </nav>
      </aside>

      {/* ═══════════════════════════════════════════════════════════════════
          MOBILE — floating top bar
      ═══════════════════════════════════════════════════════════════════ */}
      <div className="md:hidden sticky top-3 z-20 flex justify-center px-4 pointer-events-none">
        <header className="pointer-events-auto w-full max-w-sm h-14 flex items-center px-3.5 relative bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/60 shadow-md">
          <div className="w-8 h-8 bg-brand-500 rounded-xl flex items-center justify-center flex-shrink-0 shadow-brand">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 16 16">
              <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
              <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
              <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M9 11.5h5M9 9.5h3.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5"/>
            </svg>
          </div>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <h1 className="text-[15px] font-bold text-gray-900 tracking-tight">{pageLabel}</h1>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="relative">
              <Link
                aria-label={alertCount > 0 ? `${alertCount} alert${alertCount !== 1 ? 's' : ''}` : 'Notifications'}
                className={`w-8 h-8 flex items-center justify-center rounded-xl transition-colors ${
                  isNotificationsPage ? 'text-brand-600 bg-brand-50' : 'text-gray-500 hover:text-brand-600 hover:bg-brand-50'
                }`}
                to="/notifications"
              >
                <svg fill="none" viewBox="0 0 24 24" width={18} height={18}>
                  <path d="M12 3C9.24 3 7 5.24 7 8v5l-2 2v1h14v-1l-2-2V8c0-2.76-2.24-5-5-5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
                  <path d="M10 19a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                </svg>
              </Link>
              {alertCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center pointer-events-none leading-none">
                  {alertCount > 9 ? '9+' : alertCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 pr-0.5">
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: syncDot }}/>
              <span className="text-[10px] font-semibold text-gray-500">{syncLabel}</span>
            </div>
          </div>
        </header>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          CONTENT — offset for desktop sidebar + topbar
      ═══════════════════════════════════════════════════════════════════ */}
      <div className="pb-28 md:pb-0 md:pt-12 md:ml-60">
        <Outlet />
      </div>

      {/* Mobile bottom nav (fixed) */}
      <div className="md:hidden">
        <MobileBottomNav />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          TASK UPDATE ERROR TOAST
      ═══════════════════════════════════════════════════════════════════ */}
      {updateTaskError && (
        <div
          style={{
            position: 'fixed',
            bottom: 80,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 60,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            background: '#fff',
            border: '1px solid #FECACA',
            borderLeft: '4px solid #EF4444',
            borderRadius: 10,
            padding: '12px 14px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.13)',
            maxWidth: 'min(380px, calc(100vw - 32px))',
            width: 'max-content',
          }}
        >
          <svg fill="none" viewBox="0 0 20 20" width={17} height={17} style={{ flexShrink: 0, color: '#EF4444', marginTop: 1 }}>
            <circle cx="10" cy="10" r="8.5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M10 6v4.5M10 13.5v.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7"/>
          </svg>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#111827', lineHeight: 1.4 }}>
              Task could not be updated
            </p>
            <p style={{ margin: '3px 0 0', fontSize: 12.5, color: '#6B7280', lineHeight: 1.45 }}>
              {updateTaskError}
            </p>
          </div>
          <button
            type="button"
            onClick={clearUpdateTaskError}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: '0 0 0 6px', lineHeight: 1, fontSize: 14, flexShrink: 0 }}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          COMMAND PALETTE
      ═══════════════════════════════════════════════════════════════════ */}
      {paletteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center"
          style={{ background: 'rgba(0,0,0,0.32)', paddingTop: '14vh' }}
          onMouseDown={() => setPaletteOpen(false)}
        >
          <div
            className="bg-white w-full mx-4 overflow-hidden"
            style={{ maxWidth: 520, borderRadius: 14, boxShadow: '0 24px 64px rgba(0,0,0,0.20)' }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Input */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid #F3F4F6' }}>
              <svg fill="none" viewBox="0 0 16 16" width={15} height={15} style={{ color: '#9CA3AF', flexShrink: 0 }}>
                <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M11 11l2.5 2.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5"/>
              </svg>
              <input
                ref={palInputRef}
                value={palQuery}
                onChange={(e) => { setPalQuery(e.target.value); setPalIdx(0) }}
                onKeyDown={onPaletteKey}
                placeholder="Search tasks, projects, navigate…"
                style={{
                  flex: 1, border: 'none', outline: 'none', fontSize: 14,
                  color: '#111827', background: 'transparent',
                }}
              />
              {palQuery && (
                <button
                  type="button"
                  onClick={() => setPalQuery('')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 0, lineHeight: 1 }}
                >
                  ✕
                </button>
              )}
            </div>

            {/* Results */}
            <div style={{ maxHeight: 360, overflowY: 'auto' }}>
              {paletteGroups.length === 0 && (
                <div style={{ padding: '32px 16px', textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>
                  No results for "{palQuery}"
                </div>
              )}
              {paletteGroups.map((group) => (
                <div key={group.group}>
                  <div style={{ padding: '8px 16px 4px', fontSize: 10.5, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                    {group.group}
                  </div>
                  {group.items.map((item) => {
                    const flatIdx = palFlat.indexOf(item)
                    const isActive = flatIdx === palIdx
                    return (
                      <div
                        key={item.label + (item.taskId ?? item.to ?? '')}
                        onMouseEnter={() => setPalIdx(flatIdx)}
                        onClick={() => runPaletteItem(item)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '7px 16px', cursor: 'pointer',
                          background: isActive ? '#F3F0FF' : 'transparent',
                          transition: 'background 80ms',
                        }}
                      >
                        {/* Icon / dot */}
                        {item.type === 'task' && item.status ? (
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: paletteDot(item.status), flexShrink: 0 }} />
                        ) : item.type === 'project' ? (
                          <span style={{ width: 8, height: 8, borderRadius: 2, background: '#7B3FF2', flexShrink: 0 }} />
                        ) : (
                          <svg fill="none" viewBox="0 0 16 16" width={12} height={12} style={{ color: isActive ? '#7B3FF2' : '#9CA3AF', flexShrink: 0 }}>
                            <path d="M3 8h10M8 3l5 5-5 5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"/>
                          </svg>
                        )}

                        {/* Label + subtitle */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: isActive ? '#7B3FF2' : '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.label}
                          </div>
                          {item.subtitle && (
                            <div style={{ fontSize: 11, color: '#9CA3AF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {item.subtitle}
                            </div>
                          )}
                        </div>

                        {/* Shortcut badge */}
                        {item.shortcut && (
                          <span style={{ fontSize: 10, color: '#9CA3AF', background: '#F3F4F6', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace', flexShrink: 0 }}>
                            {item.shortcut}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', gap: 16, padding: '8px 16px', borderTop: '1px solid #F3F4F6', fontSize: 11, color: '#9CA3AF' }}>
              <span><kbd style={{ fontFamily: 'monospace' }}>↑↓</kbd> navigate</span>
              <span><kbd style={{ fontFamily: 'monospace' }}>↵</kbd> open</span>
              <span><kbd style={{ fontFamily: 'monospace' }}>Esc</kbd> close</span>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
