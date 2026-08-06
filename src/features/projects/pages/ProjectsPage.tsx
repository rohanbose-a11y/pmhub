import { Fragment, useMemo, useState } from 'react'

import { useAuthStore } from '../../../store/authStore'
import { useWorkStore } from '../../../store/workStore'
import { ProjectDetailModal } from '../components/ProjectDetailModal'
import { AvatarStack } from '../../../shared/components/UserAvatar'
import type { Project } from '../types/project.types'

// ─── Constants ─────────────────────────────────────────────────────────────

const BRAND = '#7B3FF2'

// ─── Helpers ───────────────────────────────────────────────────────────────

const ICON_GRADIENTS = [
  ['#6366f1', '#7c3aed'], ['#8b5cf6', '#7c3aed'], ['#34d399', '#0d9488'],
  ['#fbbf24', '#f97316'], ['#38bdf8', '#6366f1'], ['#f87171', '#ec4899'],
  ['#e879f9', '#8b5cf6'], ['#22d3ee', '#38bdf8'],
]
function iconColors(id: string): [string, string] {
  const hash = [...id].reduce((a, c) => a + c.charCodeAt(0), 0)
  return ICON_GRADIENTS[hash % ICON_GRADIENTS.length] as [string, string]
}

function fmtDate(v: string | null | undefined) {
  if (!v) return null
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(v))
}

function timeAgo(iso: string | null | undefined) {
  if (!iso) return null
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30)  return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

function statusConfig(s: string) {
  const l = s.toLowerCase()
  if (l === 'completed') return { dot: '#10b981', bg: '#f0fdf4', text: '#15803d', label: 'Completed' }
  if (l === 'cancelled') return { dot: '#9ca3af', bg: '#f9fafb', text: '#6b7280', label: 'Cancelled' }
  if (l === 'open')      return { dot: BRAND,    bg: '#f5f3ff', text: '#6d28d9', label: 'Open'      }
  if (l === 'active')    return { dot: '#3b82f6', bg: '#eff6ff', text: '#1d4ed8', label: 'Active'    }
  return                        { dot: '#f59e0b', bg: '#fffbeb', text: '#b45309', label: s           }
}

// ─── Status group definitions ──────────────────────────────────────────────

const STATUS_GROUPS = [
  { key: 'active',    label: 'Active',    closed: false, match: (s: string) => { const l = s.toLowerCase(); return l === 'open' || l === 'active' } },
  { key: 'completed', label: 'Completed', closed: true,  match: (s: string) => s.toLowerCase() === 'completed' },
  { key: 'cancelled', label: 'Cancelled', closed: true,  match: (s: string) => s.toLowerCase() === 'cancelled' },
] as const

// ─── Page ──────────────────────────────────────────────────────────────────

type FilterKey = 'all' | 'active' | 'overdue'

export function ProjectsPage() {
  const projects      = useWorkStore((s) => s.projects)
  const tasks         = useWorkStore((s) => s.tasks)
  const status        = useWorkStore((s) => s.status)
  const loadWorkspace = useWorkStore((s) => s.loadWorkspace)
  const username      = useAuthStore((s) => s.user?.username)

  const isLoading = status === 'loading'

  const [viewingProject, setViewingProject] = useState<Project | null>(null)
  const [filterKey,      setFilterKey]      = useState<FilterKey>('all')
  const [showClosed,     setShowClosed]     = useState(false)
  const [collapsed,      setCollapsed]      = useState<Set<string>>(new Set())

  const toggleCollapse = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next
    })

  // ── Stats ──────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const active    = projects.filter(p => { const l = p.status.toLowerCase(); return l === 'open' || l === 'active' }).length
    const completed = projects.filter(p => p.status.toLowerCase() === 'completed').length
    const overdue   = projects.filter(p => {
      if (!p.expectedEndDate) return false
      const l = p.status.toLowerCase()
      if (l === 'completed' || l === 'cancelled') return false
      return new Date(p.expectedEndDate) < today
    }).length
    return { active, completed, overdue }
  }, [projects])

  // ── Filtered list ──────────────────────────────────────────────────────
  const filteredProjects = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    return projects.filter(p => {
      if (filterKey === 'active') { const l = p.status.toLowerCase(); return l === 'open' || l === 'active' }
      if (filterKey === 'overdue') {
        if (!p.expectedEndDate) return false
        const l = p.status.toLowerCase()
        if (l === 'completed' || l === 'cancelled') return false
        return new Date(p.expectedEndDate) < today
      }
      return true
    })
  }, [projects, filterKey])

  // ── Grouped ────────────────────────────────────────────────────────────
  const grouped = useMemo(() => {
    const knownIds = new Set<string>()
    const result: { key: string; label: string; closed: boolean; rows: Project[] }[] = []
    STATUS_GROUPS.forEach(g => {
      const rows = filteredProjects.filter(p => g.match(p.status))
      rows.forEach(p => knownIds.add(p.id))
      result.push({ key: g.key, label: g.label, closed: g.closed, rows })
    })
    const other = filteredProjects.filter(p => !knownIds.has(p.id))
    if (other.length) result.push({ key: 'other', label: 'Other', closed: false, rows: other })
    return result
  }, [filteredProjects])

  // ── Task counts per project ────────────────────────────────────────────
  const taskCounts = useMemo(() => {
    const m = new Map<string, { total: number; done: number }>()
    tasks.forEach(t => {
      if (!t.project) return
      const cur = m.get(t.project) ?? { total: 0, done: 0 }
      cur.total++
      if (t.status.toLowerCase().includes('complet') || t.status.toLowerCase() === 'closed') cur.done++
      m.set(t.project, cur)
    })
    return m
  }, [tasks])

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <main className="flex flex-col animate-fade-in md:h-screen md:-mb-10 md:overflow-hidden">

      {/* ══ Header ══ */}
      <div className="flex-shrink-0 bg-white border-b border-gray-100">

        {/* Row 1 — breadcrumb + actions */}
        <div className="flex items-center gap-2 px-5 h-[46px]">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <span className="text-[12px] text-gray-400 select-none">Workspace</span>
            <span className="text-gray-200 select-none">/</span>
            <span className="text-[13px] font-semibold text-gray-900 select-none">Projects</span>
            {!isLoading && projects.length > 0 && (
              <span className="text-[11px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-md ml-0.5 select-none">
                {projects.length}
              </span>
            )}
            {!isLoading && stats.overdue > 0 && (
              <span className="text-[11px] font-medium bg-red-50 text-red-500 px-1.5 py-0.5 rounded-md select-none">
                {stats.overdue} overdue
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={() => username && void loadWorkspace(username)}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              title="Refresh"
            >
              <svg fill="none" viewBox="0 0 20 20" width="14" height="14">
                <path d="M4 10a6 6 0 1 0 6-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                <path d="M4 6v4h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Row 2 — filter toolbar */}
        <div className="flex items-center gap-1.5 px-5 py-2 border-t border-gray-100 overflow-x-auto scrollbar-none">
          {([
            { key: 'all'     as const, label: 'All',     count: projects.length },
            { key: 'active'  as const, label: 'Active',  count: stats.active    },
            { key: 'overdue' as const, label: 'Overdue', count: stats.overdue   },
          ]).map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilterKey(tab.key)}
              style={filterKey === tab.key ? { background: '#f5f3ff', color: BRAND, border: `1px solid #ddd6fe` } : undefined}
              className={[
                'flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11.5px] font-medium transition-colors whitespace-nowrap flex-shrink-0',
                filterKey === tab.key ? '' : 'text-gray-500 border border-transparent hover:bg-gray-50 hover:border-gray-200',
              ].join(' ')}
            >
              {tab.label}
              {tab.count > 0 && (
                <span
                  className="text-[10px] font-semibold px-1 py-px rounded"
                  style={filterKey === tab.key
                    ? { background: '#ede9fe', color: BRAND }
                    : { background: '#f3f4f6', color: '#6b7280' }}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}

          <div className="w-px h-4 bg-gray-200 mx-0.5 flex-shrink-0"/>

          {/* Closed toggle */}
          <button
            type="button"
            onClick={() => setShowClosed(v => !v)}
            className={[
              'flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11.5px] font-medium transition-colors whitespace-nowrap flex-shrink-0 border',
              showClosed ? 'bg-gray-100 text-gray-700 border-gray-200' : 'text-gray-400 border-transparent hover:bg-gray-50 hover:text-gray-600',
            ].join(' ')}
          >
            <svg fill="none" viewBox="0 0 14 14" width="11" height="11">
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M4.5 7l2 2 3-3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4"/>
            </svg>
            Closed
          </button>
        </div>
      </div>

      {/* ══ Table ══ */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto bg-white scrollbar-none">
        <div style={{ minWidth: 960 }}>

          {/* ── Column header ── */}
          <div
            className="sticky top-0 z-10 flex items-center bg-white border-b border-gray-100"
            style={{ height: 34, paddingLeft: 20, paddingRight: 20 }}
          >
            {/* Name col */}
            <div style={{ flex: 1, minWidth: 180, paddingRight: 12 }}>
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Name</span>
            </div>
            {/* Status */}
            <div style={{ width: 140, flexShrink: 0, padding: '0 8px' }}>
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Status</span>
            </div>
            {/* Progress */}
            <div style={{ width: 180, flexShrink: 0, padding: '0 8px' }}>
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Progress</span>
            </div>
            {/* Dates */}
            <div style={{ width: 210, flexShrink: 0, padding: '0 8px' }}>
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Timeline</span>
            </div>
            {/* Team */}
            <div style={{ width: 130, flexShrink: 0, padding: '0 8px' }}>
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Team</span>
            </div>
            {/* Updated */}
            <div style={{ width: 90, flexShrink: 0, padding: '0 8px' }}>
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Updated</span>
            </div>
          </div>

          {/* ── Loading skeleton ── */}
          {isLoading && (
            <div className="px-5 py-3 space-y-1.5">
              {[75, 55, 85, 65, 70].map((w, i) => (
                <div key={i} className="flex items-center gap-3 h-12">
                  <div className="w-7 h-7 rounded-lg bg-gray-100 animate-pulse flex-shrink-0"/>
                  <div className="flex flex-col gap-1.5 flex-1">
                    <div className="h-2.5 bg-gray-100 rounded animate-pulse" style={{ width: `${w}%`, maxWidth: 220 }}/>
                    <div className="h-2 bg-gray-50 rounded animate-pulse" style={{ width: `${w * 0.6}%`, maxWidth: 120 }}/>
                  </div>
                  <div className="ml-auto flex items-center gap-4">
                    <div className="w-16 h-5 bg-gray-100 rounded-full animate-pulse"/>
                    <div className="w-24 h-2 bg-gray-100 rounded-full animate-pulse"/>
                    <div className="w-20 h-2.5 bg-gray-100 rounded animate-pulse"/>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Empty state ── */}
          {!isLoading && filteredProjects.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: '#f5f3ff' }}>
                <svg fill="none" viewBox="0 0 24 24" width="24" height="24">
                  <rect x="3.5" y="4.5" width="7" height="7" rx="2" stroke={BRAND} strokeWidth="1.8"/>
                  <rect x="13.5" y="4.5" width="7" height="7" rx="2" stroke={BRAND} strokeWidth="1.8"/>
                  <rect x="3.5" y="14.5" width="7" height="7" rx="2" stroke={BRAND} strokeWidth="1.8"/>
                  <rect x="13.5" y="14.5" width="7" height="7" rx="2" stroke="#d1d5db" strokeWidth="1.8"/>
                </svg>
              </div>
              <p className="text-[14px] font-semibold text-gray-600">No projects found</p>
              <p className="text-[12px] text-gray-400 mt-1">Projects will appear here when assigned to you</p>
            </div>
          )}

          {/* ── Grouped rows ── */}
          {!isLoading && grouped.map(({ key, label, closed, rows }) => {
            if (closed && !showClosed && filterKey === 'all') return null
            if (rows.length === 0) return null

            const isCollapsed = collapsed.has(key)
            const today = new Date(); today.setHours(0, 0, 0, 0)

            return (
              <Fragment key={key}>

                {/* Group header */}
                <div
                  className="flex items-center gap-2 cursor-pointer select-none transition-colors hover:bg-gray-50"
                  style={{ height: 32, paddingLeft: 20, paddingRight: 20, borderBottom: '1px solid #f3f4f6', background: '#fafafa' }}
                  onClick={() => toggleCollapse(key)}
                >
                  <svg
                    fill="none" viewBox="0 0 8 8" width="8" height="8"
                    style={{ color: '#9ca3af', flexShrink: 0, transition: 'transform 150ms', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
                  >
                    <path d="M1 2.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {label}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', background: '#e5e7eb', padding: '1px 6px', borderRadius: 9999 }}>
                    {rows.length}
                  </span>
                </div>

                {/* Rows */}
                {!isCollapsed && rows.map(project => {
                  const [c1, c2]  = iconColors(project.id)
                  const pct       = Math.round(Math.min(project.completion ?? 0, 100))
                  const sc        = statusConfig(project.status)
                  const startDate = fmtDate(project.expectedStartDate)
                  const endDate   = fmtDate(project.expectedEndDate)
                  const updated   = timeAgo(project.updatedAt)
                  const counts    = taskCounts.get(project.name)
                  const isOverdue = !!project.expectedEndDate &&
                    !['completed', 'cancelled'].includes(project.status.toLowerCase()) &&
                    new Date(project.expectedEndDate) < today

                  return (
                    <div
                      key={project.id}
                      className="group flex items-center transition-colors cursor-pointer"
                      style={{ height: 48, paddingLeft: 20, paddingRight: 20, borderBottom: '1px solid #f9fafb' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#fafaff')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = '')}
                      onClick={() => setViewingProject(project)}
                    >

                      {/* Name */}
                      <div style={{ flex: 1, minWidth: 180, paddingRight: 12, display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
                        <div style={{
                          width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                          background: `linear-gradient(135deg, ${c1}, ${c2})`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          boxShadow: `0 1px 3px ${c2}55`,
                        }}>
                          <span style={{ fontSize: 11, fontWeight: 800, color: 'white', lineHeight: 1 }}>
                            {project.displayName.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div style={{ overflow: 'hidden' }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                            className="group-hover:text-[#7B3FF2] transition-colors">
                            {project.displayName}
                          </div>
                          {counts ? (
                            <div style={{ fontSize: 10.5, color: '#9ca3af', marginTop: 1 }}>
                              {counts.done}/{counts.total} tasks
                            </div>
                          ) : (
                            <div style={{ fontSize: 10.5, color: '#d1d5db', marginTop: 1 }}>No tasks</div>
                          )}
                        </div>
                      </div>

                      {/* Status */}
                      <div style={{ width: 140, flexShrink: 0, padding: '0 8px' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          padding: '3px 9px', borderRadius: 9999, fontSize: 11, fontWeight: 500,
                          background: sc.bg, color: sc.text,
                        }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: sc.dot, flexShrink: 0 }}/>
                          {sc.label}
                        </span>
                      </div>

                      {/* Progress */}
                      <div style={{ width: 180, flexShrink: 0, padding: '0 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 5, background: '#f1f5f9', borderRadius: 9999, overflow: 'hidden' }}>
                          <div style={{
                            width: `${pct}%`,
                            height: '100%',
                            borderRadius: 9999,
                            background: pct >= 100 ? '#10b981' : BRAND,
                            transition: 'width 0.6s ease',
                          }}/>
                        </div>
                        <span style={{ width: 34, flexShrink: 0, textAlign: 'right', fontSize: 11.5, fontWeight: 600, color: pct >= 100 ? '#059669' : BRAND, fontVariantNumeric: 'tabular-nums' }}>
                          {pct}%
                        </span>
                      </div>

                      {/* Timeline */}
                      <div style={{ width: 210, flexShrink: 0, padding: '0 8px', display: 'flex', alignItems: 'center', gap: 4 }}>
                        {startDate || endDate ? (
                          <>
                            {startDate && <span style={{ fontSize: 11.5, color: '#6b7280' }}>{startDate}</span>}
                            {startDate && endDate && <span style={{ fontSize: 11, color: '#d1d5db' }}>→</span>}
                            {endDate && (
                              <span style={{ fontSize: 11.5, fontWeight: 500, color: isOverdue ? '#ef4444' : '#6b7280' }}>
                                {endDate}
                              </span>
                            )}
                          </>
                        ) : (
                          <span style={{ fontSize: 11.5, color: '#e5e7eb' }}>—</span>
                        )}
                      </div>

                      {/* Team */}
                      <div style={{ width: 130, flexShrink: 0, padding: '0 8px' }}>
                        {(project.members?.length ?? 0) > 0
                          ? <AvatarStack userIds={project.members!.filter(m => m !== 'Administrator' && m !== 'Guest')} max={4} />
                          : <span style={{ fontSize: 11, color: '#e5e7eb' }}>—</span>
                        }
                      </div>

                      {/* Updated */}
                      <div style={{ width: 90, flexShrink: 0, padding: '0 8px' }}>
                        <span style={{ fontSize: 11, color: '#9ca3af' }}>{updated ?? '—'}</span>
                      </div>

                    </div>
                  )
                })}

              </Fragment>
            )
          })}

          <div style={{ height: 40 }}/>
        </div>
      </div>

      {/* Detail modal */}
      {viewingProject && (
        <ProjectDetailModal
          project={viewingProject}
          onClose={() => setViewingProject(null)}
          onRefresh={() => username && void loadWorkspace(username)}
        />
      )}

    </main>
  )
}
