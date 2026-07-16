import { AvatarStack } from '../../../shared/components/UserAvatar'
import type { Project } from '../types/project.types'

// ── Helpers ────────────────────────────────────────────────────────────────

const ICON_GRADIENTS = [
  'from-indigo-500 to-violet-600',
  'from-violet-500 to-purple-600',
  'from-emerald-400 to-teal-500',
  'from-amber-400 to-orange-500',
  'from-sky-400 to-indigo-500',
  'from-rose-400 to-pink-500',
  'from-fuchsia-400 to-violet-500',
  'from-cyan-400 to-sky-500',
]

function iconGradient(id: string) {
  const hash = [...id].reduce((a, c) => a + c.charCodeAt(0), 0)
  return ICON_GRADIENTS[hash % ICON_GRADIENTS.length]
}

function fmtDate(v: string | null) {
  if (!v) return null
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(v))
}

function timeAgo(iso: string | null) {
  if (!iso) return null
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

function statusBadge(s: string) {
  const lower = s.toLowerCase()
  if (lower === 'completed') return 'bg-emerald-50 text-emerald-700'
  if (lower === 'cancelled') return 'bg-slate-100 text-slate-500'
  if (lower === 'open' || lower === 'active') return 'bg-indigo-50 text-indigo-700'
  return 'bg-amber-50 text-amber-700'
}

// ── Skeleton ───────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 animate-pulse">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-8 h-8 bg-slate-100 rounded-lg flex-shrink-0" />
        <div className="flex-1 space-y-1.5">
          <div className="h-4 bg-slate-100 rounded-md w-3/5" />
          <div className="h-3 bg-slate-50 rounded-md w-2/5" />
        </div>
      </div>
      <div className="h-0.5 bg-slate-100 rounded-full" />
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

interface ProjectsPanelProps {
  projects: Project[]
  isLoading: boolean
  onView: (project: Project) => void
}

export function ProjectsPanel({ projects, isLoading, onView }: ProjectsPanelProps) {
  if (isLoading) {
    return (
      <div className="space-y-3 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-4 md:space-y-0 animate-fade-in">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    )
  }

  if (projects.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
        <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6 text-slate-300" fill="none" viewBox="0 0 24 24">
            <rect x="3.5" y="4.5" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.8" />
            <rect x="13.5" y="4.5" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.8" />
            <rect x="3.5" y="14.5" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        </div>
        <p className="text-sm font-medium text-slate-600">No projects yet</p>
        <p className="text-xs text-slate-400 mt-1">Projects will appear here when assigned</p>
      </div>
    )
  }

  return (
    <div className="space-y-3 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-4 md:space-y-0 animate-fade-in">
      {projects.map((project) => {
        const gradient  = iconGradient(project.id)
        const pct       = Math.min(project.completion ?? 0, 100)
        const startDate = fmtDate(project.expectedStartDate)
        const endDate   = fmtDate(project.expectedEndDate)
        const updated   = timeAgo(project.updatedAt ?? null)
        const hasTeam   = (project.members?.length ?? 0) > 0

        return (
          <article
            key={project.id}
            className="bg-white rounded-xl border border-slate-200 hover:border-slate-300 hover:shadow-sm cursor-pointer transition-all group"
            onClick={() => onView(project)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onView(project)}
          >
            <div className="p-4">
              {/* ── Header: icon + name + status ── */}
              <div className="flex items-start gap-3 mb-3">
                <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center flex-shrink-0`}>
                  <span className="text-xs font-bold text-white">
                    {project.displayName.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-slate-900 leading-tight truncate group-hover:text-indigo-600 transition-colors">
                    {project.displayName}
                  </h3>
                  <p className="text-[11px] text-slate-400 font-mono truncate mt-0.5">{project.name}</p>
                </div>
                <span className={`flex-shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-md ${statusBadge(project.status)}`}>
                  {project.status}
                </span>
              </div>

              {/* ── Meta: timeline + updated ── */}
              {(startDate || endDate || updated) ? (
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-3">
                  {(startDate || endDate) && (
                    <>
                      <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 16 16">
                        <rect x="2" y="3.5" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.4" />
                        <path d="M5 2v3M11 2v3M2 7h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                      </svg>
                      {startDate && endDate ? (
                        <span>{startDate}<span className="text-slate-200 mx-1">→</span>{endDate}</span>
                      ) : startDate ? (
                        <span>Started {startDate}</span>
                      ) : (
                        <span>Due {endDate}</span>
                      )}
                    </>
                  )}
                  {updated ? (
                    <>
                      {(startDate || endDate) && <span className="text-slate-200">·</span>}
                      <span>Updated {updated}</span>
                    </>
                  ) : null}
                </div>
              ) : null}

              {/* ── Footer: progress + team ── */}
              <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
                <div className="flex-1 h-0.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full transition-all duration-700"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-[11px] text-slate-400 font-medium flex-shrink-0">{pct}%</span>
                {hasTeam ? <AvatarStack userIds={project.members!} max={4} /> : null}
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}
