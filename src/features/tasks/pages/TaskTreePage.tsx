import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { useAuthStore } from '../../../store/authStore'
import { useWorkStore } from '../../../store/workStore'
import { AvatarStack } from '../../../shared/components/UserAvatar'
import { TaskDetailModal } from '../components/TaskDetailModal'
import { AssignTaskModal } from '../components/AssignTaskModal'
import { StatusChangeModal } from '../components/StatusChangeModal'
import { TasksHeader } from '../components/TasksHeader'
import { CreateTaskModal } from '../components/CreateTaskModal'
import type { AddNewType, Task, UpdateTaskInput, CreateTaskInput } from '../types/task.types'
import { getTaskTypeDefaults } from '../types/task.types'
import type { Project } from '../../projects/types/project.types'

// ─── Types ─────────────────────────────────────────────────────────────────

interface TreeNode {
  task: Task
  children: TreeNode[]
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function buildTree(tasks: Task[]): TreeNode[] {
  const nodeMap = new Map<string, TreeNode>()
  tasks.forEach((t) => nodeMap.set(t.id, { task: t, children: [] }))
  const roots: TreeNode[] = []
  tasks.forEach((t) => {
    const node = nodeMap.get(t.id)!
    if (t.parentTask && nodeMap.has(t.parentTask)) {
      nodeMap.get(t.parentTask)!.children.push(node)
    } else {
      roots.push(node)
    }
  })
  return roots
}

function collectExpandableIds(nodes: TreeNode[]): string[] {
  const ids: string[] = []
  function walk(node: TreeNode) {
    if (node.children.length > 0) {
      ids.push(node.task.id)
      node.children.forEach(walk)
    }
  }
  nodes.forEach(walk)
  return ids
}

const isActive = (s: string) =>
  !s.toLowerCase().includes('complet') &&
  s.toLowerCase() !== 'cancelled' &&
  s.toLowerCase() !== 'closed'

function fmtDue(v: string | null): { text: string; overdue: boolean } {
  if (!v) return { text: '', overdue: false }
  const d = new Date(v); d.setHours(0, 0, 0, 0)
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const diff = Math.round((d.getTime() - now.getTime()) / 86_400_000)
  const full = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
  return { text: full, overdue: diff < 0 }
}

function statusDot(status: string): string {
  const s = status.toLowerCase()
  if (s.includes('complet') || s === 'closed') return '#22C55E'
  if (s === 'working')                          return '#3B82F6'
  if (s.includes('pending'))                    return '#7B3FF2'
  if (s === 'cancelled')                        return '#9CA3AF'
  return '#6366F1'
}

function statusBadge(status: string): { bg: string; text: string } {
  const s = status.toLowerCase()
  if (s.includes('complet') || s === 'closed') return { bg: '#F0FDF4', text: '#15803D' }
  if (s === 'working')                          return { bg: '#EFF6FF', text: '#1D4ED8' }
  if (s.includes('pending'))                    return { bg: '#F3F0FF', text: '#5623BE' }
  if (s === 'cancelled')                        return { bg: '#F5F5F5', text: '#6B7280' }
  return { bg: '#F0F0FF', text: '#4338CA' }
}

function priorityBadge(priority: string): { bg: string; text: string } {
  const map: Record<string, { bg: string; text: string }> = {
    Urgent: { bg: '#FEE2E2', text: '#B91C1C' },
    High:   { bg: '#FFEDD5', text: '#C2410C' },
    Medium: { bg: '#DBEAFE', text: '#1D4ED8' },
    Low:    { bg: '#F3F4F6', text: '#6B7280' },
  }
  return map[priority] ?? { bg: '#F3F4F6', text: '#6B7280' }
}

// ─── Column widths ─────────────────────────────────────────────────────────

const COL = {
  progress: 120,
  due:      112,
  priority: 112,
  status:   148,
  repeat:    96,
  members:   72,
  add:       200,
} as const

// ─── Column header strip ────────────────────────────────────────────────────

function ColHeader({ onAdd }: { onAdd: () => void }) {
  return (
    <div
      className="flex-shrink-0 flex items-center border-b border-slate-100 bg-slate-50"
      style={{ height: 30, paddingLeft: 8, paddingRight: 12 }}
    >
      {/* Name area — mirrors TaskRow left side */}
      <div style={{ width: 24 + 14, flexShrink: 0 }} /> {/* chevron + status dot space */}
      <span className="flex-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 pl-1">
        Task
      </span>
      <div className="hidden md:flex items-center flex-shrink-0">
        <div className="flex items-center justify-center" style={{ width: COL.add, flexShrink: 0 }}>
          <button
            type="button"
            aria-label="New task"
            onClick={onAdd}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-indigo-100 transition-colors"
          >
            <svg fill="none" viewBox="0 0 12 12" width="10" height="10" className="text-slate-400">
              <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        {([
          { label: 'Progress', w: COL.progress },
          { label: 'Due',      w: COL.due      },
          { label: 'Priority', w: COL.priority },
          { label: 'Status',   w: COL.status   },
          { label: 'Members',  w: COL.members  },
          { label: 'Repeat',   w: COL.repeat   },
        ] as const).map(({ label, w }) => (
          <div key={label} style={{ width: w, flexShrink: 0 }}>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Activity flow: step 1 task picker ────────────────────────────────────

function ActivityTaskPicker({
  tasks,
  projectName,
  onSelect,
  onClose,
}: {
  tasks: Task[]
  projectName: string
  onSelect: (tasks: Task[]) => void
  onClose: () => void
}) {
  const [query,    setQuery]    = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const options = tasks.filter(
    (t) => !t.isMilestone && !t.isGroup &&
    (projectName === 'all' || t.project === projectName)
  ).filter((t) => !query || t.subject.toLowerCase().includes(query.toLowerCase()))

  const toggle = (id: string) =>
    setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })

  const selectedTasks = tasks.filter((t) => selected.has(t.id))

  // Unique users across selected tasks — assignedTo preferred, owner as fallback
  const uniqueUsers = new Set(
    selectedTasks.flatMap((t) => t.assignedTo.length > 0 ? t.assignedTo : (t.owner ? [t.owner] : []))
  )
  const hasEnoughTasks  = selected.size >= 2
  const hasEnoughUsers  = uniqueUsers.size >= 2
  const canNext         = hasEnoughTasks && hasEnoughUsers

  const hint = !hasEnoughTasks
    ? null
    : !hasEnoughUsers
      ? 'All selected tasks belong to the same user — select a task from a different user'
      : null

  // Helper: display label for a task's user
  const taskUser = (t: Task) => {
    const u = t.assignedTo[0] ?? t.owner
    return u ? u.split('@')[0] : null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col max-h-[70vh]">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-[15px] font-semibold text-slate-800">Select Tasks</h2>
          <p className="text-[12px] text-slate-400 mt-0.5">Select at least 2 tasks from 2 different users</p>
        </div>
        <div className="px-4 py-2.5 border-b border-slate-100">
          <input
            autoFocus
            type="text"
            placeholder="Search tasks…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full text-[13px] outline-none text-slate-700 placeholder:text-slate-300"
          />
        </div>
        <div className="overflow-y-auto flex-1 py-1">
          {options.length === 0 ? (
            <p className="text-[12.5px] text-slate-400 text-center py-6">No tasks found</p>
          ) : options.map((t) => {
            const checked = selected.has(t.id)
            const user    = taskUser(t)
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => toggle(t.id)}
                className={[
                  'w-full text-left px-4 py-2.5 text-[13px] transition-colors flex items-center gap-3',
                  checked ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-50',
                ].join(' ')}
              >
                <span className={[
                  'w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors',
                  checked ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300',
                ].join(' ')}>
                  {checked && (
                    <svg fill="none" viewBox="0 0 10 10" width="8" height="8">
                      <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block truncate">{t.subject}</span>
                  {user && <span className="block text-[11px] text-slate-400 truncate">{user}</span>}
                </span>
              </button>
            )
          })}
        </div>
        <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between gap-3">
          <button type="button" onClick={onClose} className="text-[13px] text-slate-500 hover:text-slate-700 px-3 py-2 rounded-lg hover:bg-slate-50 flex-shrink-0">
            Cancel
          </button>
          <div className="flex items-center gap-3 min-w-0">
            {hint && (
              <span className="text-[11.5px] text-rose-500 truncate">{hint}</span>
            )}
            {!hint && selected.size > 0 && (
              <span className="text-[12px] text-slate-400 flex-shrink-0">{selected.size} selected</span>
            )}
            <button
              type="button"
              disabled={!canNext}
              onClick={() => onSelect(selectedTasks)}
              className="px-5 py-2 bg-indigo-600 text-white text-[13px] font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:pointer-events-none flex-shrink-0"
            >
              Next →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Milestone add-child dropdown ──────────────────────────────────────────

function MilestoneAddMenu({ onSelect, canAddActivity }: { onSelect: (type: AddNewType) => void; canAddActivity: boolean }) {
  const [open, setOpen] = useState(false)
  const types = canAddActivity ? (['activity', 'task'] as const) : (['task'] as const)
  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Add child"
        className="w-5 h-5 flex items-center justify-center rounded hover:bg-indigo-100 transition-colors"
        onClick={(e) => { e.stopPropagation(); if (types.length === 1) { onSelect('task') } else { setOpen((v) => !v) } }}
      >
        <svg fill="none" viewBox="0 0 12 12" width={10} height={10} className="text-slate-400">
          <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setOpen(false) }} />
          <div className="absolute left-0 top-6 z-50 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden" style={{ minWidth: 120 }}>
            {types.map((type) => (
              <button
                key={type}
                type="button"
                className="w-full text-left px-3 py-2 text-[12.5px] text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 capitalize transition-colors"
                onClick={(e) => { e.stopPropagation(); setOpen(false); onSelect(type) }}
              >
                {type === 'activity' ? 'Activity' : 'Task'}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Task row ──────────────────────────────────────────────────────────────

function TaskRow({
  node,
  depth,
  expandedIds,
  onToggle,
  onEdit,
  onAddChild,
  canAddActivity,
  today,
  childCounts,
}: {
  node:        TreeNode
  depth:       number
  expandedIds: Set<string>
  onToggle:       (id: string) => void
  onEdit:         (task: Task) => void
  onAddChild:     (task: Task, type: AddNewType) => void
  canAddActivity: boolean
  today:          Date
  childCounts:    Map<string, { done: number; total: number }>
}) {
  const { task }    = node
  const hasChildren = node.children.length > 0
  const isExpanded  = expandedIds.has(task.id)
  const isDone      = !isActive(task.status)
  const cc          = childCounts.get(task.id)
  const ccPct       = cc && cc.total > 0 ? Math.round((cc.done / cc.total) * 100) : 0
  const due         = fmtDue(task.dueDate)
  const sb          = statusBadge(task.status)
  const pb          = priorityBadge(task.priority)
  const leftPad     = 8 + depth * 20

  return (
    <>
      <div
        className="flex items-center hover:bg-slate-50/80 cursor-pointer transition-colors select-none group border-b border-slate-50"
        style={{ paddingLeft: leftPad, paddingRight: 12, minHeight: 38 }}
        onClick={() => onEdit(task)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onEdit(task)}
      >
        {/* Chevron / leaf — 24px */}
        <span className="flex-shrink-0 flex items-center justify-center" style={{ width: 24 }}>
          {hasChildren ? (
            <button
              type="button"
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
              className="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-200/70 transition-colors"
              onClick={(e) => { e.stopPropagation(); onToggle(task.id) }}
            >
              <svg
                className={`text-slate-400 transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`}
                fill="none" viewBox="0 0 10 10" width={9} height={9}
              >
                <path d="M3 1.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          ) : (
            <span className="w-1.5 h-1.5 rounded-full bg-slate-200 flex-shrink-0" />
          )}
        </span>

        {/* Status dot — 14px total (dot + gap) */}
        <span
          className="flex-shrink-0 rounded-full mr-2"
          style={{ width: 7, height: 7, background: statusDot(task.status) }}
        />

        {/* Milestone diamond */}
        {task.isMilestone && (
          <span className="w-2 h-2 bg-amber-400 rotate-45 flex-shrink-0 rounded-[2px] mr-1.5" />
        )}

        {/* Subject */}
        <span
          className={`flex-1 min-w-0 truncate group-hover:text-indigo-600 transition-colors ${
            isDone
              ? 'text-slate-500 text-[12px]'
              : depth === 0
                ? 'font-semibold text-slate-800 text-[13px]'
                : 'text-slate-700 text-[12.5px]'
          }`}
        >
          {task.subject}
        </span>

        {/* Right columns — desktop only */}
        <div className="hidden md:flex items-center flex-shrink-0">

          {/* Add child — milestones and activities only */}
          <div className="relative flex items-center justify-center" style={{ width: COL.add }}>
            {task.isMilestone
              ? <MilestoneAddMenu canAddActivity={canAddActivity} onSelect={(type) => onAddChild(task, type)} />
              : task.isGroup && (
                <button
                  type="button"
                  aria-label="Add task"
                  className="w-5 h-5 flex items-center justify-center rounded hover:bg-indigo-100 transition-colors"
                  onClick={(e) => { e.stopPropagation(); onAddChild(task, 'task') }}
                >
                  <svg fill="none" viewBox="0 0 12 12" width={10} height={10} className="text-slate-400">
                    <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                  </svg>
                </button>
              )
            }
          </div>

          {/* Progress / child count */}
          <div className="flex items-center gap-1.5" style={{ width: COL.progress }}>
            {cc && cc.total > 0 ? (
              <>
                <div className="w-10 h-1 bg-slate-100 rounded-full overflow-hidden flex-shrink-0">
                  <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${ccPct}%` }} />
                </div>
                <span className="text-[10px] text-slate-400 tabular-nums">{cc.done}/{cc.total}</span>
              </>
            ) : task.progress > 0 ? (
              <>
                <div className="w-10 h-1 bg-slate-100 rounded-full overflow-hidden flex-shrink-0">
                  <div className={`h-full rounded-full ${isDone ? 'bg-emerald-300' : 'bg-indigo-400'}`} style={{ width: `${task.progress}%` }} />
                </div>
                <span className="text-[10px] text-slate-400 tabular-nums">{task.progress}%</span>
              </>
            ) : null}
          </div>

          {/* Due date */}
          <div style={{ width: COL.due }}>
            {due.text && (
              <span
                className="text-[11px] flex items-center gap-0.5"
                style={{ color: due.overdue ? '#EF4444' : '#9CA3AF', fontWeight: due.overdue ? 600 : 400 }}
              >
                {due.overdue && (
                  <svg fill="none" viewBox="0 0 10 10" width={9} height={9} className="flex-shrink-0">
                    <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.2"/>
                    <path d="M5 3v2.5l1 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  </svg>
                )}
                {due.text}
              </span>
            )}
          </div>

          {/* Priority */}
          <div style={{ width: COL.priority }}>
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md flex-shrink-0"
              style={{ background: pb.bg, color: pb.text }}
            >
              {task.priority}
            </span>
          </div>

          {/* Status */}
          <div style={{ width: COL.status }}>
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md flex-shrink-0 whitespace-nowrap"
              style={{ background: sb.bg, color: sb.text }}
            >
              {task.status}
            </span>
          </div>

          {/* Assignees */}
          <div style={{ width: COL.members }}>
            {task.assignedTo.length > 0 && <AvatarStack max={2} userIds={task.assignedTo} />}
          </div>

          {/* Repeat */}
          <div className="flex items-center gap-1" style={{ width: COL.repeat }}>
            {task.autoRepeat && (
              <>
                <svg fill="none" viewBox="0 0 14 14" width={12} height={12} className="text-indigo-400 flex-shrink-0">
                  <path d="M1 4h9a3 3 0 010 6H2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M3.5 1.5L1 4l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className="text-[10px] font-medium text-indigo-400">Repeat</span>
              </>
            )}
          </div>

        </div>
      </div>

      {/* Children with vertical guide line */}
      {hasChildren && isExpanded && (
        <div className="relative">
          <div
            className="absolute top-0 bottom-0 bg-slate-100"
            style={{ left: leftPad + 11, width: 1 }}
          />
          {node.children.map((child) => (
            <TaskRow
              key={child.task.id}
              depth={depth + 1}
              expandedIds={expandedIds}
              node={child}
              onEdit={onEdit}
              onAddChild={onAddChild}
              canAddActivity={canAddActivity}
              onToggle={onToggle}
              today={today}
              childCounts={childCounts}
            />
          ))}
        </div>
      )}
    </>
  )
}

// ─── Project divider (non-collapsible label row) ────────────────────────────

function ProjectDivider({
  project,
  taskCount,
  doneCount,
  totalCount,
}: {
  project:    Project | null
  taskCount:  number
  doneCount:  number
  totalCount: number
}) {
  const label  = project ? (project.displayName || project.name) : 'No Project'
  const accent = project ? '#6366F1' : '#CBD5E1'
  const pct    = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0

  return (
    <div
      className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/70"
      style={{ paddingLeft: 12, paddingRight: 12, minHeight: 34, borderLeft: `3px solid ${accent}` }}
    >
      <span className="text-[11px] font-bold text-slate-600 flex-1 truncate tracking-wide uppercase">
        {label}
      </span>

      {totalCount > 0 && (
        <div className="hidden md:flex items-center gap-2">
          <div className="w-14 h-1 bg-slate-200 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[10px] text-slate-400 tabular-nums w-10 text-right">{doneCount}/{totalCount}</span>
        </div>
      )}

      <span className="text-[10px] font-semibold text-slate-400 bg-slate-200/70 px-2 py-0.5 rounded-full flex-shrink-0 tabular-nums">
        {taskCount}
      </span>
    </div>
  )
}

// ─── Skeleton ──────────────────────────────────────────────────────────────

function SkeletonTree() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col flex-1 min-h-0 animate-pulse">
      {/* Header strip */}
      <div className="flex-shrink-0 h-[30px] bg-slate-50 border-b border-slate-100" />
      {/* Rows */}
      <div className="py-1">
        {[82, 60, 72, 90, 55].map((w, i) => (
          <div key={i} className="flex items-center gap-2 border-b border-slate-50" style={{ paddingLeft: i > 1 ? 28 : 8, paddingRight: 12, minHeight: 38 }}>
            <div className="w-5 h-5 bg-slate-100 rounded flex-shrink-0" />
            <div className="w-2 h-2 bg-slate-100 rounded-full flex-shrink-0" />
            <div className="h-3 bg-slate-100 rounded-md flex-1" style={{ maxWidth: `${w}%` }} />
            <div className="ml-auto hidden md:flex gap-3 flex-shrink-0">
              <div className="h-2 bg-slate-50 rounded-md w-16" />
              <div className="h-2 bg-slate-50 rounded-md w-12" />
              <div className="h-5 bg-slate-50 rounded-md w-16" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────

export function TaskTreePage() {
  const username        = useAuthStore((s) => s.user?.username)
  const userFullName    = useAuthStore((s) => s.user?.fullName)
  const canAddActivity  = useAuthStore((s) => s.user?.roles?.some((r) => ['Project Lead', 'Projects Manager'].includes(r)) ?? false)
  const tasks        = useWorkStore((s) => s.tasks)
  const projects     = useWorkStore((s) => s.projects)
  const status       = useWorkStore((s) => s.status)
  const updateTask    = useWorkStore((s) => s.updateTask)
  const assignTask    = useWorkStore((s) => s.assignTask)
  const unassignTask  = useWorkStore((s) => s.unassignTask)
  const loadWorkspace = useWorkStore((s) => s.loadWorkspace)
  const createTask         = useWorkStore((s) => s.createTask)
  const createTaskStatus   = useWorkStore((s) => s.createTaskStatus)
  const createTaskError    = useWorkStore((s) => s.createTaskError)
  const resetTaskFeedback  = useWorkStore((s) => s.resetTaskFeedback)
  const deleteTask         = useWorkStore((s) => s.deleteTask)
  const setParentTask      = useWorkStore((s) => s.setParentTask)

  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }, [])

  const [searchParams]  = useSearchParams()
  const [myTasksOnly,   setMyTasksOnly]   = useState(false)
  const [projectFilter, setProjectFilter] = useState(() => searchParams.get('project') ?? 'all')
  const [showClosed,    setShowClosed]    = useState(true)
  const [isCreateOpen,   setIsCreateOpen]   = useState(false)
  const [createType,     setCreateType]     = useState<AddNewType>('task')
  const [createParentId, setCreateParentId] = useState<string | undefined>(undefined)
  // Two-step activity creation flow: pick tasks first, then create activity with them as sub-tasks
  const [actStep,        setActStep]        = useState<'task' | 'activity' | null>(null)
  const [actFlowParent,  setActFlowParent]  = useState<string | undefined>()
  const [actFlowTasks,   setActFlowTasks]   = useState<Task[]>([])
  const [actFlowError,   setActFlowError]   = useState<string | null>(null)
  const [isLinkingTasks, setIsLinkingTasks] = useState(false)

  useEffect(() => {
    setProjectFilter(searchParams.get('project') ?? 'all')
  }, [searchParams])

  const resolvedProjectName = useMemo(
    () => projectFilter === 'all' ? 'all' : (projects.find((p) => p.slug === projectFilter)?.name ?? projectFilter),
    [projectFilter, projects],
  )

  const myTaskIds = useMemo(() => {
    if (!username) return new Set<string>()
    return new Set(tasks.filter((t) => t.owner === username || t.assignedTo.includes(username)).map((t) => t.id))
  }, [tasks, username])

  const filteredTasks = useMemo(() => {
    let t = tasks
    if (myTasksOnly && username) t = t.filter((tk) => myTaskIds.has(tk.id))
    if (resolvedProjectName !== 'all') t = t.filter((tk) => tk.project === resolvedProjectName)
    if (!showClosed) t = t.filter((tk) => isActive(tk.status))
    return t
  }, [tasks, myTasksOnly, myTaskIds, resolvedProjectName, showClosed, username])

  // ── Group tasks by project ──────────────────────────────────────────────

  const projectMap = useMemo(() => {
    const m = new Map<string, Project>()
    projects.forEach((p) => m.set(p.name, p))
    return m
  }, [projects])

  const { projectGroups, noProjectTasks } = useMemo(() => {
    const map = new Map<string, Task[]>()
    const noProject: Task[] = []
    filteredTasks.forEach((t) => {
      if (t.project) {
        if (!map.has(t.project)) map.set(t.project, [])
        map.get(t.project)!.push(t)
      } else {
        noProject.push(t)
      }
    })
    return { projectGroups: map, noProjectTasks: noProject }
  }, [filteredTasks])

  const sortedProjectIds = useMemo(
    () =>
      [...projectGroups.keys()].sort((a, b) => {
        const na = projectMap.get(a)?.displayName ?? a
        const nb = projectMap.get(b)?.displayName ?? b
        return na.localeCompare(nb)
      }),
    [projectGroups, projectMap],
  )

  // ── Per-project trees ───────────────────────────────────────────────────

  const projectTrees = useMemo(() => {
    const m = new Map<string, TreeNode[]>()
    projectGroups.forEach((pts, id) => m.set(id, buildTree(pts)))
    return m
  }, [projectGroups])

  const noProjectTree = useMemo(() => buildTree(noProjectTasks), [noProjectTasks])

  // ── Expanded state ──────────────────────────────────────────────────────

  const allExpandableIds = useMemo(() => {
    const ids: string[] = []
    projectTrees.forEach((roots) => ids.push(...collectExpandableIds(roots)))
    ids.push(...collectExpandableIds(noProjectTree))
    return ids
  }, [projectTrees, noProjectTree])

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    if (!initialized && allExpandableIds.length > 0) {
      setExpandedIds(new Set(allExpandableIds))
      setInitialized(true)
    }
  }, [allExpandableIds, initialized])

  const toggleExpanded = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  // ── Refresh ─────────────────────────────────────────────────────────────

  const handleRefresh = async () => {
    if (!username) return
    setInitialized(false)
    await loadWorkspace(username)
  }

  // ── Counts (from tasksForCounts — unaffected by showClosed) ─────────────

  const tasksForCounts = useMemo(() => {
    let t = tasks
    if (myTasksOnly && username) t = t.filter((tk) => myTaskIds.has(tk.id))
    if (resolvedProjectName !== 'all') t = t.filter((tk) => tk.project === resolvedProjectName)
    return t
  }, [tasks, myTasksOnly, myTaskIds, resolvedProjectName, username])

  const projectCounts = useMemo(() => {
    const m = new Map<string, { done: number; total: number }>()
    tasksForCounts.forEach((t) => {
      const key = t.project ?? '__none__'
      const c   = m.get(key) ?? { done: 0, total: 0 }
      c.total++
      if (!isActive(t.status)) c.done++
      m.set(key, c)
    })
    return m
  }, [tasksForCounts])

  const taskChildCounts = useMemo(() => {
    const m = new Map<string, { done: number; total: number }>()
    tasksForCounts.forEach((t) => {
      if (!t.parentTask) return
      const c = m.get(t.parentTask) ?? { done: 0, total: 0 }
      c.total++
      if (!isActive(t.status)) c.done++
      m.set(t.parentTask, c)
    })
    return m
  }, [tasksForCounts])

  const totalCount   = tasksForCounts.length
  const doneCount    = useMemo(
    () => tasksForCounts.filter((tk) => !isActive(tk.status) && tk.status !== 'Cancelled').length,
    [tasksForCounts],
  )
  const overdueCount = useMemo(() => {
    const t = new Date(); t.setHours(0, 0, 0, 0)
    return tasksForCounts.filter((tk) => {
      if (!tk.dueDate || !isActive(tk.status)) return false
      return new Date(tk.dueDate) < t
    }).length
  }, [tasksForCounts])

  // ── Modals ───────────────────────────────────────────────────────────────

  const openCreateModal  = (type: AddNewType = 'task') => { resetTaskFeedback(); setCreateType(type); setCreateParentId(undefined); setIsCreateOpen(true) }
  const openCreateChild  = (parent: Task, type: AddNewType = 'task') => {
    resetTaskFeedback()
    if (type === 'activity') {
      // Two-step flow: create task first, then create the activity with task as sub-task
      setActStep('task'); setActFlowParent(parent.id); setActFlowTasks([])
    } else {
      setIsCreateOpen(true); setCreateType(type); setCreateParentId(parent.id)
    }
  }
  const closeCreateModal = () => {
    if (createTaskStatus === 'submitting' || isLinkingTasks) return
    setIsCreateOpen(false); setCreateParentId(undefined)
    setActStep(null); setActFlowParent(undefined); setActFlowTasks([]); setIsLinkingTasks(false)
  }
  const handleCreateTask = (input: CreateTaskInput) => {
    if (!username) return Promise.resolve(null)
    return createTask(input, username)
  }
  const handleActivityFlowStep1 = (selectedTasks: Task[]) => {
    setActFlowTasks(selectedTasks)
    setActStep('activity')
    resetTaskFeedback()
  }
  const handleActivityFlowStep2 = async (activity?: Task | null) => {
    if (!activity) return
    setActFlowError(null)
    setIsLinkingTasks(true)
    try {
      // Snapshot original parents before touching anything (needed for rollback)
      const snapshots = actFlowTasks.map((t) => ({ id: t.id, origParent: t.parentTask ?? null }))

      // Use minimal setParentTask to avoid triggering unrelated field validation (was causing 500s)
      const results = await Promise.allSettled(
        snapshots.map((s) => setParentTask(s.id, activity.id))
      )

      const succeeded = snapshots.filter((_, i) => {
        const r = results[i]
        return r.status === 'fulfilled' && r.value
      })
      const anyFailed = succeeded.length < snapshots.length

      if (anyFailed) {
        // Revert the ones that did link so the activity has no children, then delete it
        await Promise.allSettled(succeeded.map((s) => setParentTask(s.id, s.origParent)))
        await deleteTask(activity.id)
        setActFlowError('Could not link all tasks to the activity — it was not saved. Please try again.')
      } else {
        setActStep(null); setActFlowParent(undefined); setActFlowTasks([]); setActFlowError(null)
      }
    } finally {
      setIsLinkingTasks(false)
    }
  }

  const [detailTaskId,  setDetailTaskId]  = useState<string | null>(null)
  const [assigningTask, setAssigningTask] = useState<Task | null>(null)

  const handleUpdate = async (taskId: string, input: UpdateTaskInput) => {
    const enriched = input.status === 'Completed'
      ? { ...input, completedBy: input.completedBy || username || userFullName, completedOn: input.completedOn || new Date().toISOString().split('T')[0] }
      : input
    return updateTask(taskId, enriched)
  }

  const handleAssign   = async (userId: string): Promise<boolean> => {
    if (!assigningTask) return false
    return assignTask(assigningTask.id, userId)
  }
  const handleUnassign = async (userId: string): Promise<boolean> => {
    if (!assigningTask) return false
    return unassignTask(assigningTask.id, userId)
  }

  const [statusChangeTarget, setStatusChangeTarget] = useState<Task | null>(null)
  const [isStatusChanging,   setIsStatusChanging]   = useState(false)

  const handleStatusChangeConfirm = async (newStatus: string, note: string) => {
    if (!statusChangeTarget) return
    setIsStatusChanging(true)
    const noteHtml = `<p><strong>→ ${newStatus}:</strong> ${note}</p>`
    await updateTask(statusChangeTarget.id, {
      subject: statusChangeTarget.subject, status: newStatus, priority: statusChangeTarget.priority,
      description: statusChangeTarget.description ? `${statusChangeTarget.description}${noteHtml}` : noteHtml,
      ...(newStatus === 'Completed'
        ? { completedBy: username || userFullName, completedOn: new Date().toISOString().split('T')[0] }
        : {}),
    })
    setIsStatusChanging(false)
    setStatusChangeTarget(null)
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const isLoading = status === 'loading'

  return (
    <main className="flex flex-col animate-fade-in md:h-[calc(100vh-48px)] md:overflow-hidden">

      <TasksHeader
        isLoading={isLoading}
        myTasksOnly={myTasksOnly}
        onAddNew={openCreateModal}
        onMyTasksOnlyChange={setMyTasksOnly}
        onProjectFilterChange={setProjectFilter}
        onRefresh={handleRefresh}
        onShowClosedChange={setShowClosed}
        doneCount={doneCount}
        overdueCount={overdueCount}
        projectFilter={projectFilter}
        projects={projects}
        showClosed={showClosed}
        totalCount={totalCount}
      />

      {/* ── Content ── */}
      <div className="flex-1 min-h-0 overflow-hidden px-2 pt-3 pb-3 md:px-3 flex flex-col">

        {isLoading ? (
          <SkeletonTree />
        ) : filteredTasks.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 flex flex-col items-center justify-center p-16 text-center">
            <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-slate-300" fill="none" viewBox="0 0 24 24">
                <circle cx="12" cy="4.5" r="2" stroke="currentColor" strokeWidth="1.8" />
                <path d="M12 6.5v4.5M6.5 11h11M6.5 11v4M17.5 11v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <circle cx="6.5"  cy="17.5" r="2" stroke="currentColor" strokeWidth="1.8" />
                <circle cx="17.5" cy="17.5" r="2" stroke="currentColor" strokeWidth="1.8" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-slate-600 mb-1">No tasks yet</p>
            <p className="text-xs text-slate-400 mb-4">Add your first milestone to get started</p>
            <button
              type="button"
              onClick={() => openCreateModal('milestone')}
              className="flex items-center gap-1.5 h-8 px-4 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <svg fill="none" viewBox="0 0 12 12" width={10} height={10}><path d="M6 1v10M1 6h10" stroke="white" strokeLinecap="round" strokeWidth="1.9"/></svg>
              Add Milestone
            </button>
          </div>
        ) : (
          /* Single card — fixed header + scrollable body */
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col flex-1 min-h-0">
            <ColHeader onAdd={() => openCreateModal('task')} />

            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-none">
              {projectFilter === 'all' ? (
                <>
                  {sortedProjectIds.map((projectId) => {
                    const counts = projectCounts.get(projectId) ?? { done: 0, total: 0 }
                    return (
                      <div key={projectId}>
                        <ProjectDivider
                          project={projectMap.get(projectId) ?? null}
                          taskCount={projectGroups.get(projectId)?.length ?? 0}
                          doneCount={counts.done}
                          totalCount={counts.total}
                        />
                        {(projectTrees.get(projectId) ?? []).map((node) => (
                          <TaskRow
                            key={node.task.id}
                            depth={0}
                            expandedIds={expandedIds}
                            node={node}
                            onEdit={(t) => setDetailTaskId(t.id)}
                            onAddChild={openCreateChild}
                            canAddActivity={canAddActivity}
                            onToggle={toggleExpanded}
                            today={today}
                            childCounts={taskChildCounts}
                          />
                        ))}
                      </div>
                    )
                  })}
                  {noProjectTasks.length > 0 && (() => {
                    const counts = projectCounts.get('__none__') ?? { done: 0, total: 0 }
                    return (
                      <div>
                        <ProjectDivider
                          project={null}
                          taskCount={noProjectTasks.length}
                          doneCount={counts.done}
                          totalCount={counts.total}
                        />
                        {noProjectTree.map((node) => (
                          <TaskRow
                            key={node.task.id}
                            depth={0}
                            expandedIds={expandedIds}
                            node={node}
                            onEdit={(t) => setDetailTaskId(t.id)}
                            onAddChild={openCreateChild}
                            canAddActivity={canAddActivity}
                            onToggle={toggleExpanded}
                            today={today}
                            childCounts={taskChildCounts}
                          />
                        ))}
                      </div>
                    )
                  })()}
                </>
              ) : (
                <>
                  {[...projectTrees.values()].flatMap((r) => r).concat(noProjectTree).map((node) => (
                    <TaskRow
                      key={node.task.id}
                      depth={0}
                      expandedIds={expandedIds}
                      node={node}
                      onEdit={(t) => setDetailTaskId(t.id)}
                      onAddChild={openCreateChild}
                      canAddActivity={canAddActivity}
                      onToggle={toggleExpanded}
                      today={today}
                      childCounts={taskChildCounts}
                    />
                  ))}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Status-change modal ── */}
      {statusChangeTarget && (
        <StatusChangeModal
          currentStatus={statusChangeTarget.status}
          isSubmitting={isStatusChanging}
          onCancel={() => setStatusChangeTarget(null)}
          onConfirm={handleStatusChangeConfirm}
        />
      )}

      {/* ── Task detail modal ── */}
      {detailTaskId && (() => {
        const t = tasks.find((tk) => tk.id === detailTaskId)
        if (!t) return null
        return (
          <TaskDetailModal
            task={t}
            allTasks={tasks}
            projects={projects}
            onClose={() => setDetailTaskId(null)}
            onUpdate={handleUpdate}
            onStatusChange={(tk) => setStatusChangeTarget(tk)}
            onAssign={(tk) => setAssigningTask(tk)}
          />
        )
      })()}

      {/* ── Assign modal ── */}
      {assigningTask && (() => {
        const liveTask = tasks.find((tk) => tk.id === assigningTask.id) ?? assigningTask
        return (
          <AssignTaskModal
            task={liveTask}
            currentUser={username ?? ''}
            onAssign={handleAssign}
            onUnassign={handleUnassign}
            onClose={() => setAssigningTask(null)}
          />
        )
      })()}

      {/* ── Create task modal (normal flow) ── */}
      {isCreateOpen && !actStep && (
        <CreateTaskModal
          isSubmitting={createTaskStatus === 'submitting'}
          onClose={closeCreateModal}
          onSubmit={handleCreateTask}
          onSuccess={closeCreateModal}
          projects={projects}
          tasks={tasks}
          serverError={createTaskError}
          initialProject={resolvedProjectName !== 'all' ? resolvedProjectName : undefined}
          initialParentTask={createParentId}
          {...getTaskTypeDefaults(createType)}
          mode={createType}
        />
      )}

      {/* ── Activity flow: step 1 — pick an existing task ── */}
      {actStep === 'task' && (
        <ActivityTaskPicker
          tasks={tasks}
          projectName={resolvedProjectName}
          onSelect={handleActivityFlowStep1}
          onClose={closeCreateModal}
        />
      )}

      {/* ── Activity flow: step 2 — create activity with pending sub-task ── */}
      {actStep === 'activity' && (
        <CreateTaskModal
          key="af-activity"
          isSubmitting={createTaskStatus === 'submitting' || isLinkingTasks}
          onClose={closeCreateModal}
          onSubmit={handleCreateTask}
          onSuccess={handleActivityFlowStep2}
          projects={projects}
          tasks={tasks}
          serverError={createTaskError ?? actFlowError}
          initialProject={resolvedProjectName !== 'all' ? resolvedProjectName : undefined}
          initialParentTask={actFlowParent}
          initialIsGroup={true}
          pendingSubTasks={actFlowTasks}
          onSubTasksChange={setActFlowTasks}
          mode="activity"
        />
      )}
    </main>
  )
}
