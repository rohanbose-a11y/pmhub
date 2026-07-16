import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../../store/authStore'
import { useWorkStore } from '../../../store/workStore'
import { useNotifStore } from '../../../store/notifStore'

// ─── Types ────────────────────────────────────────────────────────────────────

type NotifType = 'overdue' | 'due-soon' | 'assigned'
type Filter    = 'all' | 'overdue' | 'due-soon' | 'assigned'

interface Notif {
  id:        string       // task id
  type:      NotifType
  subject:   string
  project:   string | null
  dueDate:   string | null
  sortTs:    string       // primary timestamp for grouping/sorting
  priority:  string
  owner:     string | null
  assignedTo: string[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const isActive = (s: string) =>
  !s.toLowerCase().includes('complet') &&
  s.toLowerCase() !== 'cancelled' &&
  s.toLowerCase() !== 'closed'

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  if (m < 2)  return 'just now'
  if (m < 60) return `${m}m ago`
  if (h < 24) return `${h}h ago`
  if (d < 7)  return `${d}d ago`
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(iso))
}

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(iso))
}

function dayGroup(iso: string): string {
  const now  = new Date(); now.setHours(0, 0, 0, 0)
  const d    = new Date(iso); d.setHours(0, 0, 0, 0)
  const diff = Math.round((now.getTime() - d.getTime()) / 86_400_000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff < 7)  return 'This Week'
  return 'Older'
}

const GROUP_ORDER = ['Today', 'Yesterday', 'This Week', 'Older']

const TYPE_META: Record<NotifType, { label: string; color: string; bg: string; icon: ReactNode }> = {
  overdue: {
    label: 'Overdue',
    color: '#EF4444',
    bg:    '#FEF2F2',
    icon: (
      <svg fill="none" viewBox="0 0 14 14" width="11" height="11">
        <path d="M7 1.5L12.5 11H1.5L7 1.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
        <path d="M7 5.5v2.5M7 9.5v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      </svg>
    ),
  },
  'due-soon': {
    label: 'Due Soon',
    color: '#F59E0B',
    bg:    '#FFFBEB',
    icon: (
      <svg fill="none" viewBox="0 0 14 14" width="11" height="11">
        <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4"/>
        <path d="M7 4v3.5l2 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  assigned: {
    label: 'Assigned',
    color: '#7B3FF2',
    bg:    '#F5F3FF',
    icon: (
      <svg fill="none" viewBox="0 0 14 14" width="11" height="11">
        <circle cx="5.5" cy="4" r="2" stroke="currentColor" strokeWidth="1.4"/>
        <path d="M1 12c0-2.49 2.01-4.5 4.5-4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        <path d="M9 9l1.5 1.5L13 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
}

const PRIORITY_COLOR: Record<string, string> = {
  Urgent: '#EF4444',
  High:   '#F59E0B',
  Medium: '#6366F1',
  Low:    '#CBD5E1',
}

function avBg(s: string) {
  const palette = ['#7c3aed','#2563eb','#059669','#d97706','#dc2626','#0891b2','#4f46e5','#db2777']
  let h = 0; for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h)
  return palette[Math.abs(h) % palette.length]
}

function avInits(s: string) {
  return s.replace(/[@.]/g, ' ').split(/\s+/).filter(Boolean).map((p) => p[0]).join('').toUpperCase().slice(0, 2)
}

// ─── Notification row ─────────────────────────────────────────────────────────

interface RowProps {
  notif:   Notif
  read:    boolean
  onOpen:  (n: Notif) => void
  onDismiss: (n: Notif) => void
}

function NotifRow({ notif, read, onOpen, onDismiss }: RowProps) {
  const meta   = TYPE_META[notif.type]
  const actor  = notif.assignedTo[0] ?? notif.owner ?? 'system'
  const prioClr = PRIORITY_COLOR[notif.priority] ?? '#CBD5E1'

  const contextLabel =
    notif.type === 'overdue'   ? `Overdue · due ${fmtDate(notif.dueDate!)}` :
    notif.type === 'due-soon'  ? `Due ${fmtDate(notif.dueDate!)}` :
                                  `Updated ${fmtRelative(notif.sortTs)}`

  return (
    <div
      className="group relative flex items-start gap-0 cursor-pointer transition-colors"
      style={{ background: read ? 'transparent' : '#FAFAFF' }}
      onClick={() => onOpen(notif)}
    >
      {/* Unread stripe */}
      <div
        style={{
          width:            4,
          alignSelf:        'stretch',
          flexShrink:       0,
          background:       read ? 'transparent' : '#7B3FF2',
          borderRadius:     '0 2px 2px 0',
          transition:       'background 200ms',
        }}
      />

      {/* Main content */}
      <div className="flex items-start gap-3 flex-1 min-w-0 px-4 py-3.5">

        {/* Avatar stack */}
        <div className="relative flex-shrink-0 mt-0.5">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
            style={{ backgroundColor: avBg(actor) }}
          >
            {avInits(actor)}
          </div>
          {/* Type badge */}
          <div
            className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center ring-2 ring-white"
            style={{ background: meta.bg, color: meta.color }}
          >
            {meta.icon}
          </div>
        </div>

        {/* Text block */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              {/* Type chip */}
              <span
                className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md mb-1"
                style={{ background: meta.bg, color: meta.color }}
              >
                {meta.icon}
                {meta.label}
              </span>

              {/* Task name */}
              <p
                className="text-[13px] leading-snug truncate"
                style={{ fontWeight: read ? 400 : 600, color: read ? '#6B7280' : '#111827' }}
              >
                {/* Priority pip */}
                <span
                  className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle flex-shrink-0"
                  style={{ background: prioClr }}
                />
                {notif.subject}
              </p>

              {/* Project + context */}
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                {notif.project && (
                  <span className="text-[11px] text-slate-400 truncate max-w-[160px]">
                    {notif.project}
                  </span>
                )}
                {notif.project && <span className="text-slate-200 text-[8px]">●</span>}
                <span
                  className="text-[11px]"
                  style={{ color: read ? '#9CA3AF' : meta.color, fontWeight: read ? 400 : 500 }}
                >
                  {contextLabel}
                </span>
              </div>
            </div>

            {/* Timestamp */}
            <span className="text-[10.5px] text-slate-400 flex-shrink-0 mt-0.5 tabular-nums">
              {fmtRelative(notif.sortTs)}
            </span>
          </div>
        </div>
      </div>

      {/* Hover action: dismiss */}
      <button
        type="button"
        className="absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: '#F3F4F6', color: '#9CA3AF' }}
        title={read ? 'Already read' : 'Mark as read'}
        onClick={(e) => { e.stopPropagation(); onDismiss(notif) }}
      >
        <svg fill="none" viewBox="0 0 12 12" width="10" height="10">
          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ filter }: { filter: Filter }) {
  const msgs: Record<Filter, { title: string; sub: string }> = {
    all:        { title: 'All caught up!',        sub: 'No overdue, upcoming, or new assignments'  },
    overdue:    { title: 'No overdue tasks',       sub: 'Everything is on track — keep it up!'     },
    'due-soon': { title: 'Nothing due this week',  sub: 'Enjoy the calm before the storm'          },
    assigned:   { title: 'No recent assignments',  sub: 'New task assignments will appear here'     },
  }
  const { title, sub } = msgs[filter]
  return (
    <div className="flex flex-col items-center py-20 gap-4">
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center"
        style={{ background: '#F5F3FF' }}
      >
        <svg fill="none" viewBox="0 0 24 24" width="26" height="26" style={{ color: '#7B3FF2' }}>
          <path d="M12 3C9.24 3 7 5.24 7 8v5l-2 2v1h14v-1l-2-2V8c0-2.76-2.24-5-5-5z"
            stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
          <path d="M10 19a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
          <path d="M9 8l6 6M15 8l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".4"/>
        </svg>
      </div>
      <div className="text-center">
        <p className="text-[14px] font-semibold text-slate-800">{title}</p>
        <p className="text-[12px] text-slate-400 mt-1">{sub}</p>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function NotificationsPage() {
  const navigate      = useNavigate()
  const tasks         = useWorkStore((state) => state.tasks)
  const wsStatus      = useWorkStore((state) => state.status)
  const loadWorkspace = useWorkStore((state) => state.loadWorkspace)
  const username      = useAuthStore((state) => state.user?.username)
  const readIds       = useNotifStore((s) => s.readIds)
  const markRead      = useNotifStore((s) => s.markRead)
  const markAllRead   = useNotifStore((s) => s.markAllRead)

  const [filter, setFilter]       = useState<Filter>('all')
  const [currentPage, setPage]    = useState(1)
  const PAGE_SIZE                 = 20
  const isLoading = wsStatus === 'loading'

  const handleRefresh = () => {
    if (username) void loadWorkspace(username)
  }

  const handleOpen = (n: Notif) => {
    if (username) markRead(n.id, username)
    navigate('/tasks', { state: { taskId: n.id } })
  }

  const handleDismiss = (n: Notif) => {
    if (username) markRead(n.id, username)
  }

  // ── Build unified notification list ─────────────────────────────────────────
  const allNotifs = useMemo((): Notif[] => {
    const today       = new Date(); today.setHours(0, 0, 0, 0)
    const week        = new Date(today.getTime() + 7  * 86_400_000)
    const sevenDaysAgo = new Date(today.getTime() - 7 * 86_400_000)

    const myTasks = username
      ? tasks.filter((t) => t.assignedTo.includes(username) || t.owner === username)
      : tasks

    const overdueNotifs: Notif[] = myTasks
      .filter((t) => t.dueDate && isActive(t.status) && new Date(t.dueDate) < today)
      .map((t) => ({
        id: t.id, type: 'overdue', subject: t.subject,
        project: t.project, dueDate: t.dueDate,
        sortTs: t.updatedAt ?? t.dueDate ?? new Date().toISOString(),
        priority: t.priority, owner: t.owner, assignedTo: t.assignedTo,
      }))

    const dueSoonNotifs: Notif[] = myTasks
      .filter((t) => {
        if (!t.dueDate || !isActive(t.status)) return false
        const due = new Date(t.dueDate)
        return due >= today && due <= week
      })
      .map((t) => ({
        id: t.id, type: 'due-soon', subject: t.subject,
        project: t.project, dueDate: t.dueDate,
        sortTs: t.updatedAt ?? t.dueDate ?? new Date().toISOString(),
        priority: t.priority, owner: t.owner, assignedTo: t.assignedTo,
      }))

    const assignedNotifs: Notif[] = tasks
      .filter((t) => {
        if (!username || !t.assignedTo.includes(username)) return false
        if (!t.updatedAt || !isActive(t.status)) return false
        return new Date(t.updatedAt) >= sevenDaysAgo
      })
      .map((t) => ({
        id: t.id, type: 'assigned', subject: t.subject,
        project: t.project, dueDate: t.dueDate,
        sortTs: t.updatedAt ?? new Date().toISOString(),
        priority: t.priority, owner: t.owner, assignedTo: t.assignedTo,
      }))

    // Deduplicate by task id, preferring overdue > due-soon > assigned
    const seen = new Map<string, Notif>()
    ;[...overdueNotifs, ...dueSoonNotifs, ...assignedNotifs].forEach((n) => {
      if (!seen.has(n.id)) seen.set(n.id, n)
    })

    return [...seen.values()].sort((a, b) => b.sortTs.localeCompare(a.sortTs))
  }, [tasks, username])

  // ── Filter ───────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    setPage(1)
    if (filter === 'all') return allNotifs
    return allNotifs.filter((n) => n.type === filter)
  }, [allNotifs, filter])

  const totalPages     = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage       = Math.min(currentPage, totalPages)
  const pageStart      = (safePage - 1) * PAGE_SIZE
  const paginated      = filtered.slice(pageStart, pageStart + PAGE_SIZE)

  // ── Group by date (current page only) ────────────────────────────────────────
  const grouped = useMemo(() => {
    const map = new Map<string, Notif[]>()
    paginated.forEach((n) => {
      const g = dayGroup(n.sortTs)
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(n)
    })
    return GROUP_ORDER.flatMap((g) => {
      const items = map.get(g)
      return items ? [{ group: g, items }] : []
    })
  }, [paginated])

  const unreadCount = allNotifs.filter((n) => !readIds.has(n.id)).length
  const allIds      = allNotifs.map((n) => n.id)

  const TABS: { id: Filter; label: string; count: number }[] = [
    { id: 'all',        label: 'All',        count: allNotifs.length },
    { id: 'overdue',    label: 'Overdue',    count: allNotifs.filter((n) => n.type === 'overdue').length },
    { id: 'due-soon',   label: 'Due Soon',   count: allNotifs.filter((n) => n.type === 'due-soon').length },
    { id: 'assigned',   label: 'Assigned',   count: allNotifs.filter((n) => n.type === 'assigned').length },
  ]

  return (
    <div className="min-h-screen" style={{ background: '#F8FAFC' }}>
      <div className="max-w-6xl mx-auto px-4 md:px-8 pt-6 pb-16">

        {/* ── Page header ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <h1 className="text-[20px] font-bold text-slate-900 tracking-tight">Notifications</h1>
            {unreadCount > 0 && (
              <span
                className="text-[11px] font-bold px-2 py-0.5 rounded-full text-white"
                style={{ background: '#7B3FF2' }}
              >
                {unreadCount} new
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Mark all read */}
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => username && markAllRead(allIds, username)}
                className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg transition-colors"
                style={{ color: '#7B3FF2', background: '#F5F3FF' }}
              >
                <svg fill="none" viewBox="0 0 14 14" width="12" height="12">
                  <path d="M2 7l4 4 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Mark all read
              </button>
            )}

            {/* Refresh */}
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isLoading}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 transition-colors disabled:opacity-40"
              style={{ background: 'white', border: '1px solid #E5E7EB' }}
              title="Refresh"
            >
              <svg className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 16 16">
                <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5a5.5 5.5 0 0 1 3.89 1.61L13.5 5.5"
                  stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                <path d="M13.5 2.5v3h-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>

        {/* ── Filter tabs ─────────────────────────────────────────────────── */}
        <div
          className="flex items-center gap-1 p-1 rounded-xl mb-5 overflow-x-auto scrollbar-none"
          style={{ background: 'white', border: '1px solid #E5E7EB' }}
        >
          {TABS.map((tab) => {
            const active = filter === tab.id
            const typeColor = tab.id === 'overdue' ? '#EF4444' : tab.id === 'due-soon' ? '#F59E0B' : tab.id === 'assigned' ? '#7B3FF2' : undefined
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px] font-semibold transition-all whitespace-nowrap flex-shrink-0"
                style={{
                  background: active ? (typeColor ? TYPE_META[tab.id as NotifType]?.bg ?? '#F5F3FF' : '#F5F3FF') : 'transparent',
                  color:      active ? (typeColor ?? '#7B3FF2') : '#6B7280',
                }}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-md tabular-nums"
                    style={{
                      background: active ? (typeColor ?? '#7B3FF2') : '#F3F4F6',
                      color:      active ? 'white' : '#9CA3AF',
                    }}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* ── Content ─────────────────────────────────────────────────────── */}
        {isLoading ? (
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: 'white', border: '1px solid #E5E7EB' }}
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3 px-5 py-4 border-b border-slate-50 animate-pulse last:border-0">
                <div className="w-8 h-8 rounded-full bg-slate-100 flex-shrink-0 mt-0.5"/>
                <div className="flex-1 space-y-2 pt-1">
                  <div className="h-2 bg-slate-100 rounded-full w-1/4"/>
                  <div className="h-3 bg-slate-100 rounded-full w-3/4"/>
                  <div className="h-2 bg-slate-100 rounded-full w-1/2"/>
                </div>
                <div className="w-10 h-2 bg-slate-100 rounded-full flex-shrink-0 mt-1"/>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div
            className="rounded-2xl"
            style={{ background: 'white', border: '1px solid #E5E7EB' }}
          >
            <EmptyState filter={filter} />
          </div>
        ) : (
          <div className="space-y-5">
            {grouped.map(({ group, items }) => (
              <div key={group}>
                {/* Group header */}
                <div className="flex items-center gap-3 mb-2 px-1">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">
                    {group}
                  </span>
                  <div className="flex-1 h-px" style={{ background: '#E5E7EB' }}/>
                  <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-md">
                    {items.length}
                  </span>
                </div>

                {/* Notification cards */}
                <div
                  className="rounded-2xl overflow-hidden"
                  style={{ background: 'white', border: '1px solid #E5E7EB' }}
                >
                  {items.map((n, idx) => (
                    <div key={n.id}>
                      <NotifRow
                        notif={n}
                        read={readIds.has(n.id)}
                        onOpen={handleOpen}
                        onDismiss={handleDismiss}
                      />
                      {idx < items.length - 1 && (
                        <div className="mx-4" style={{ height: 1, background: '#F3F4F6' }}/>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Pagination ──────────────────────────────────────────────────── */}
        {!isLoading && filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between mt-6 px-1">
            {/* Range info */}
            <span className="text-[12px] text-slate-400">
              {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filtered.length)} of{' '}
              <span className="font-semibold text-slate-600">{filtered.length}</span>
            </span>

            {/* Controls */}
            <div className="flex items-center gap-1">
              {/* Prev */}
              <button
                type="button"
                disabled={safePage === 1}
                onClick={() => setPage((p) => p - 1)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ background: 'white', border: '1px solid #E5E7EB' }}
              >
                <svg fill="none" viewBox="0 0 12 12" width="12" height="12">
                  <path d="M7.5 2.5L4.5 6l3 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {/* Page numbers */}
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                .reduce<(number | '…')[]>((acc, p, idx, arr) => {
                  if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('…')
                  acc.push(p)
                  return acc
                }, [])
                .map((p, i) =>
                  p === '…' ? (
                    <span key={`ellipsis-${i}`} className="w-8 h-8 flex items-center justify-center text-[12px] text-slate-400">…</span>
                  ) : (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPage(p as number)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-[12.5px] font-semibold transition-colors"
                      style={{
                        background: safePage === p ? '#7B3FF2' : 'white',
                        color:      safePage === p ? 'white'   : '#374151',
                        border:     safePage === p ? 'none'    : '1px solid #E5E7EB',
                      }}
                    >
                      {p}
                    </button>
                  )
                )
              }

              {/* Next */}
              <button
                type="button"
                disabled={safePage === totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ background: 'white', border: '1px solid #E5E7EB' }}
              >
                <svg fill="none" viewBox="0 0 12 12" width="12" height="12">
                  <path d="M4.5 2.5L7.5 6l-3 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
