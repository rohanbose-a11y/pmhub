import { useMemo, useState } from 'react'
import { AvatarStack } from '../../../shared/components/UserAvatar'
import { formatUserDisplay } from '../../../shared/lib/formatUserDisplay'
import type { Task } from '../types/task.types'
import type { Project } from '../../projects/types/project.types'

export type TaskFilterType = 'all' | 'active' | 'done' | 'overdue'

interface TasksPanelProps {
  tasks: Task[]
  myTaskIds: Set<string>
  projects: Project[]
  isLoading: boolean
  filter: TaskFilterType
  onFilterChange: (f: TaskFilterType) => void
  onStatusChange: (taskId: string, status: string) => Promise<boolean>
  onEdit: (task: Task) => void
  onAssign: (task: Task) => void
}

// ── Constants ──────────────────────────────────────────────────────────────

const TASK_STATUSES = ['Open', 'Working', 'Pending Review', 'Completed', 'Cancelled']

const PRIORITY_BORDER: Record<string, string> = {
  Urgent: 'border-l-rose-400',
  High:   'border-l-amber-400',
  Medium: 'border-l-indigo-400',
  Low:    'border-l-slate-200',
}

const PRIORITY_BADGE: Record<string, string> = {
  Urgent: 'bg-rose-50 text-rose-600',
  High:   'bg-amber-50 text-amber-700',
  Medium: 'bg-indigo-50 text-indigo-700',
  Low:    'bg-slate-100 text-slate-500',
}

const GROUP_DEFS = [
  { key: 'working',   label: 'In Progress',   dot: 'bg-amber-400',   match: (s: string) => s === 'Working' },
  { key: 'open',      label: 'Open',           dot: 'bg-indigo-400',  match: (s: string) => s === 'Open' },
  { key: 'pending',   label: 'Pending Review', dot: 'bg-violet-400',  match: (s: string) => s.toLowerCase().includes('pending') },
  { key: 'completed', label: 'Completed',      dot: 'bg-emerald-400', match: (s: string) => s.toLowerCase().includes('complet') || s.toLowerCase() === 'closed' },
  { key: 'cancelled', label: 'Cancelled',      dot: 'bg-slate-300',   match: (s: string) => s.toLowerCase() === 'cancelled' },
]

// ── Helpers ────────────────────────────────────────────────────────────────

const isActive = (s: string) =>
  !s.toLowerCase().includes('complet') &&
  s.toLowerCase() !== 'cancelled' &&
  s.toLowerCase() !== 'closed'

const fmtDate = (v: string) =>
  new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(v))

function statusStyle(status: string) {
  const s = status.toLowerCase()
  if (s.includes('complet') || s === 'closed') return 'bg-emerald-50 text-emerald-700'
  if (s === 'working')                          return 'bg-amber-50 text-amber-700'
  if (s.includes('pending'))                    return 'bg-violet-50 text-violet-700'
  if (s === 'cancelled')                        return 'bg-slate-100 text-slate-400'
  return 'bg-indigo-50 text-indigo-700'
}

// ── Skeleton ───────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 border-l-[3px] border-l-slate-200 animate-pulse">
      <div className="p-4">
        <div className="space-y-2 mb-3">
          <div className="h-4 bg-slate-100 rounded-md w-3/4" />
          <div className="h-3 bg-slate-50 rounded-md w-2/5" />
        </div>
        <div className="flex items-center justify-between pt-2.5 border-t border-slate-100">
          <div className="h-4 bg-slate-100 rounded-md w-12" />
          <div className="h-4 bg-slate-100 rounded-full w-20" />
        </div>
      </div>
    </div>
  )
}

// ── Task card ──────────────────────────────────────────────────────────────

function TaskCard({
  task,
  projectName,
  onStatusChange,
  onEdit,
  onAssign,
  canInteract = true,
}: {
  task: Task
  projectName: string | null
  onStatusChange: (taskId: string, status: string) => Promise<boolean>
  onEdit: (task: Task) => void
  onAssign: (task: Task) => void
  canInteract?: boolean
}) {
  const [updating, setUpdating] = useState(false)
  const isCompleted = !isActive(task.status)
  const borderClass = PRIORITY_BORDER[task.priority] ?? 'border-l-slate-200'
  const badgeClass  = PRIORITY_BADGE[task.priority]  ?? 'bg-slate-100 text-slate-500'

  const today = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d
  }, [])
  const isOverdue = !isCompleted && !!task.dueDate && new Date(task.dueDate) < today

  const handleStatusChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value
    if (next === task.status) return
    setUpdating(true)
    await onStatusChange(task.id, next)
    setUpdating(false)
  }

  return (
    <article
      className={`bg-white rounded-xl border border-slate-200 border-l-[3px] ${borderClass} hover:shadow-sm hover:border-slate-300 transition-all overflow-hidden`}
    >
      <div className="p-4">
        {/* Title row */}
        <div className="flex items-start gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <h3 className={`text-sm font-medium leading-snug ${isCompleted ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
              {task.subject}
            </h3>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              {projectName ? (
                <span className="text-xs text-slate-400 truncate max-w-[160px]">{projectName}</span>
              ) : null}
              {task.dueDate ? (
                <>
                  {task.project ? <span className="text-slate-200 text-xs">·</span> : null}
                  <span className={`text-xs flex items-center gap-0.5 ${isOverdue ? 'text-rose-500' : 'text-slate-400'}`}>
                    {isOverdue ? (
                      <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 12 12">
                        <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.3" />
                        <path d="M6 3.5v3l1.5 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                      </svg>
                    ) : null}
                    {isOverdue ? 'Overdue · ' : 'Due '}{fmtDate(task.dueDate)}
                  </span>
                </>
              ) : null}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-0.5 flex-shrink-0 -mt-0.5">
            {canInteract ? (
              <button
                aria-label="Assign task"
                className="w-6 h-6 flex items-center justify-center rounded-md text-slate-300 hover:text-indigo-600 hover:bg-slate-100 transition-colors"
                onClick={() => onAssign(task)}
                type="button"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16">
                  <circle cx="6" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M1 13c0-2.761 2.239-4 5-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  <path d="M11 9v5M8.5 11.5h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </button>
            ) : null}
            <button
              aria-label="View task"
              className="w-6 h-6 flex items-center justify-center rounded-md text-slate-300 hover:text-indigo-600 hover:bg-slate-100 transition-colors"
              onClick={() => onEdit(task)}
              type="button"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16">
                <ellipse cx="8" cy="8" rx="7" ry="4.5" stroke="currentColor" strokeWidth="1.4" />
                <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" />
              </svg>
            </button>
          </div>
        </div>

        {/* Completed by */}
        {isCompleted && (task.completedBy || task.completedOn) && (
          <p className="text-[11px] text-emerald-600 truncate mb-2.5">
            Completed by {formatUserDisplay(task.completedBy)}
            {task.completedOn ? ` · ${fmtDate(task.completedOn)}` : ''}
          </p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-slate-100">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md flex-shrink-0 ${badgeClass}`}>
              {task.priority}
            </span>
            {task.assignedTo.length > 0 ? (
              <AvatarStack userIds={task.assignedTo} max={3} />
            ) : null}
          </div>

          {/* Status */}
          {updating ? (
            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${statusStyle(task.status)}`}>
              <svg className="w-2.5 h-2.5 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Saving
            </div>
          ) : isCompleted || !canInteract ? (
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${statusStyle(task.status)}`}>
              {task.status}
            </span>
          ) : (
            <div className="relative flex-shrink-0">
              <select
                aria-label="Update task status"
                className={`appearance-none pl-2 pr-5 py-0.5 rounded-full text-[11px] font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-200 ${statusStyle(task.status)}`}
                onChange={handleStatusChange}
                value={task.status}
              >
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <svg className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 opacity-40" fill="none" viewBox="0 0 10 10">
                <path d="M2 3.5L5 6.5l3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          )}
        </div>
      </div>
    </article>
  )
}

// ── Section header ─────────────────────────────────────────────────────────

function SectionHeader({ dot, label, count }: { dot: string; label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 px-0.5 mb-2.5">
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <span className="text-xs text-slate-300">{count}</span>
      <div className="flex-1 h-px bg-slate-100" />
    </div>
  )
}

// ── Panel ──────────────────────────────────────────────────────────────────

export function TasksPanel({ tasks, myTaskIds, projects, isLoading, filter, onFilterChange, onStatusChange, onEdit, onAssign }: TasksPanelProps) {
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }, [])

  const projectNameMap = useMemo(() => {
    const map = new Map<string, string>()
    projects.forEach((p) => map.set(p.name, p.displayName || p.name))
    return map
  }, [projects])

  const filtered = useMemo(() => {
    if (filter === 'active')  return tasks.filter((t) => myTaskIds.has(t.id) && isActive(t.status))
    if (filter === 'overdue') return tasks.filter((t) => myTaskIds.has(t.id) && isActive(t.status) && !!t.dueDate && new Date(t.dueDate) < today)
    if (filter === 'done')    return tasks.filter((t) => !isActive(t.status))
    return tasks
  }, [tasks, myTaskIds, filter, today])

  const overdueList = useMemo(() => {
    if (filter !== 'overdue') return null
    return [...filtered].sort((a, b) =>
      (a.dueDate ?? '').localeCompare(b.dueDate ?? ''),
    )
  }, [filter, filtered])

  const allOverdueList = useMemo(() => {
    if (filter !== 'all') return null
    return tasks
      .filter((t) => isActive(t.status) && !!t.dueDate && new Date(t.dueDate) < today)
      .sort((a, b) => {
        const aMine = myTaskIds.has(a.id) ? 0 : 1
        const bMine = myTaskIds.has(b.id) ? 0 : 1
        if (aMine !== bMine) return aMine - bMine
        return (a.dueDate ?? '').localeCompare(b.dueDate ?? '')
      })
  }, [filter, tasks, myTaskIds, today])

  const groups = useMemo(() => {
    const overdueIds = allOverdueList ? new Set(allOverdueList.map((t) => t.id)) : null
    const base = overdueIds ? filtered.filter((t) => !overdueIds.has(t.id)) : filtered
    return GROUP_DEFS
      .map((def) => ({ ...def, tasks: base.filter((t) => def.match(t.status)) }))
      .filter((g) => g.tasks.length > 0)
  }, [filtered, allOverdueList])

  const emptyState = (
    <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
      <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center mx-auto mb-3">
        <svg className="w-6 h-6 text-slate-300" fill="none" viewBox="0 0 24 24">
          <path d="M8 7h10M8 12h10M8 17h7" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
          <path d="m4.5 7 1.5 1.5L8.5 6m-4 6 1.5 1.5 2.5-2.5m-4 5 1.5 1.5 2.5-2.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </svg>
      </div>
      <p className="text-sm font-medium text-slate-600">
        {filter === 'all' ? 'No tasks yet' : filter === 'active' ? 'No active tasks' : filter === 'overdue' ? 'No overdue tasks' : 'Nothing completed yet'}
      </p>
      <p className="text-xs text-slate-400 mt-1">
        {filter === 'all' ? 'Tap "New Task" to create your first one' : 'Switch to All to see everything'}
      </p>
    </div>
  )

  if (isLoading) {
    return (
      <div className="space-y-3 animate-fade-in">
        <div className="h-9 bg-slate-100 rounded-lg animate-pulse" />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    )
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* ── Filter bar ── */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
        {(['all', 'active', 'overdue', 'done'] as const).map((f) => (
          <button
            key={f}
            className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-all duration-150 ${
              filter === f
                ? f === 'overdue'
                  ? 'bg-rose-500 text-white shadow-sm'
                  : 'bg-white text-slate-900 shadow-sm'
                : f === 'overdue'
                  ? 'text-rose-400 hover:text-rose-500'
                  : 'text-slate-500 hover:text-slate-700'
            }`}
            onClick={() => onFilterChange(f)}
            type="button"
          >
            {f === 'all' ? 'All' : f === 'active' ? 'Active' : f === 'overdue' ? 'Overdue' : 'Done'}
          </button>
        ))}
      </div>

      {/* ── Overdue flat list ── */}
      {overdueList !== null ? (
        overdueList.length === 0 ? emptyState : (
          <div>
            <SectionHeader count={overdueList.length} dot="bg-rose-400" label="Overdue" />
            <div className="space-y-2.5 md:grid md:grid-cols-2 md:gap-3 md:space-y-0">
              {overdueList.map((task) => (
                <TaskCard
                  key={task.id}
                  canInteract={myTaskIds.has(task.id)}
                  onAssign={onAssign}
                  onEdit={onEdit}
                  onStatusChange={onStatusChange}
                  projectName={task.project ? (projectNameMap.get(task.project) ?? task.project) : null}
                  task={task}
                />
              ))}
            </div>
          </div>
        )
      ) : (
        <>
          {/* All filter: overdue at top */}
          {allOverdueList !== null && allOverdueList.length > 0 && (
            <div>
              <SectionHeader count={allOverdueList.length} dot="bg-rose-400" label="Overdue" />
              <div className="space-y-2.5 md:grid md:grid-cols-2 md:gap-3 md:space-y-0">
                {allOverdueList.map((task) => (
                  <TaskCard
                    key={task.id}
                    canInteract={myTaskIds.has(task.id)}
                    onAssign={onAssign}
                    onEdit={onEdit}
                    onStatusChange={onStatusChange}
                    projectName={task.project ? (projectNameMap.get(task.project) ?? task.project) : null}
                    task={task}
                  />
                ))}
              </div>
            </div>
          )}

          {groups.length === 0 && (allOverdueList === null || allOverdueList.length === 0) ? (
            emptyState
          ) : groups.length > 0 ? (
            <div className="space-y-5">
              {groups.map((group) => (
                <div key={group.key}>
                  <SectionHeader count={group.tasks.length} dot={group.dot} label={group.label} />
                  <div className="space-y-2.5 md:grid md:grid-cols-2 md:gap-3 md:space-y-0">
                    {group.tasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        canInteract={myTaskIds.has(task.id)}
                        onAssign={onAssign}
                        onEdit={onEdit}
                        onStatusChange={onStatusChange}
                        projectName={task.project ? (projectNameMap.get(task.project) ?? task.project) : null}
                        task={task}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
