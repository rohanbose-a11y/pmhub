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
import type { Task, UpdateTaskInput, CreateTaskInput } from '../types/task.types'
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
  const overdue = diff < 0
  if (diff < 0)   return { text: d.toLocaleDateString('en', { month: 'short', day: 'numeric' }), overdue: true }
  if (diff === 0) return { text: 'Today',    overdue: false }
  if (diff === 1) return { text: 'Tomorrow', overdue: false }
  if (diff <= 6)  return { text: d.toLocaleDateString('en', { weekday: 'short' }), overdue: false }
  return { text: d.toLocaleDateString('en', { month: 'short', day: 'numeric' }), overdue: false }
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
} as const

// ─── Column header strip ────────────────────────────────────────────────────

function ColHeader() {
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

// ─── Task row ──────────────────────────────────────────────────────────────

function TaskRow({
  node,
  depth,
  expandedIds,
  onToggle,
  onEdit,
  today,
  childCounts,
}: {
  node:        TreeNode
  depth:       number
  expandedIds: Set<string>
  onToggle:    (id: string) => void
  onEdit:      (task: Task) => void
  today:       Date
  childCounts: Map<string, { done: number; total: number }>
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
        className={`flex items-center hover:bg-slate-50/80 cursor-pointer transition-colors select-none group border-b border-slate-50 ${isDone ? 'opacity-55' : ''}`}
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
              ? 'text-slate-400 line-through text-[12px]'
              : depth === 0
                ? 'font-semibold text-slate-800 text-[13px]'
                : 'text-slate-700 text-[12.5px]'
          }`}
        >
          {task.subject}
        </span>

        {/* Right columns — desktop only */}
        <div className="hidden md:flex items-center flex-shrink-0">

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
  const username     = useAuthStore((s) => s.user?.username)
  const userFullName = useAuthStore((s) => s.user?.fullName)
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

  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }, [])

  const [searchParams]  = useSearchParams()
  const [myTasksOnly,   setMyTasksOnly]   = useState(false)
  const [projectFilter, setProjectFilter] = useState(() => searchParams.get('project') ?? 'all')
  const [showClosed,    setShowClosed]    = useState(false)
  const [isCreateOpen,  setIsCreateOpen]  = useState(false)

  useEffect(() => {
    setProjectFilter(searchParams.get('project') ?? 'all')
  }, [searchParams])

  const myTaskIds = useMemo(() => {
    if (!username) return new Set<string>()
    return new Set(tasks.filter((t) => t.owner === username || t.assignedTo.includes(username)).map((t) => t.id))
  }, [tasks, username])

  const filteredTasks = useMemo(() => {
    let t = tasks
    if (myTasksOnly && username) t = t.filter((tk) => myTaskIds.has(tk.id))
    if (projectFilter !== 'all') t = t.filter((tk) => tk.project === projectFilter)
    if (!showClosed) t = t.filter((tk) => isActive(tk.status))
    return t
  }, [tasks, myTasksOnly, myTaskIds, projectFilter, showClosed, username])

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

  const expandAll   = () => setExpandedIds(new Set(allExpandableIds))
  const collapseAll = () => setExpandedIds(new Set())

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
    if (projectFilter !== 'all') t = t.filter((tk) => tk.project === projectFilter)
    return t
  }, [tasks, myTasksOnly, myTaskIds, projectFilter, username])

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

  const openCreateModal  = () => { resetTaskFeedback(); setIsCreateOpen(true) }
  const closeCreateModal = () => { if (createTaskStatus === 'submitting') return; setIsCreateOpen(false) }
  const handleCreateTask = (input: CreateTaskInput) => {
    if (!username) return Promise.resolve(null)
    return createTask(input, username)
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
        onAddTask={openCreateModal}
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
        onExpandAll={expandAll}
        onCollapseAll={collapseAll}
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
            <p className="text-xs text-slate-400 mb-4">Add your first task to get started</p>
            <button
              type="button"
              onClick={openCreateModal}
              className="flex items-center gap-1.5 h-8 px-4 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <svg fill="none" viewBox="0 0 12 12" width={10} height={10}><path d="M6 1v10M1 6h10" stroke="white" strokeLinecap="round" strokeWidth="1.9"/></svg>
              Add Task
            </button>
          </div>
        ) : (
          /* Single card — fixed header + scrollable body */
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col flex-1 min-h-0">
            <ColHeader />

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

      {/* ── Create task modal ── */}
      {isCreateOpen && (
        <CreateTaskModal
          isSubmitting={createTaskStatus === 'submitting'}
          onClose={closeCreateModal}
          onSubmit={handleCreateTask}
          onSuccess={closeCreateModal}
          projects={projects}
          tasks={tasks}
          serverError={createTaskError}
          initialProject={projectFilter !== 'all' ? projectFilter : undefined}
        />
      )}
    </main>
  )
}
