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

/** Collect IDs of all nodes that have children (can be expanded). */
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

const fmtDate = (v: string) =>
  new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(v))

function statusDot(status: string): string {
  const s = status.toLowerCase()
  if (s.includes('complet') || s === 'closed') return 'bg-emerald-400'
  if (s === 'working') return 'bg-amber-400'
  if (s.includes('pending')) return 'bg-violet-400'
  if (s === 'cancelled') return 'bg-slate-300'
  return 'bg-indigo-400'
}

const PRIORITY_BADGE: Record<string, string> = {
  Urgent: 'bg-rose-50 text-rose-600',
  High:   'bg-amber-50 text-amber-700',
  Medium: 'bg-indigo-50 text-indigo-700',
  Low:    'bg-slate-100 text-slate-500',
}

// ─── Task row ──────────────────────────────────────────────────────────────

function TaskRow({
  node,
  depth,
  expandedIds,
  onToggle,
  onEdit,
  today,
}: {
  node:        TreeNode
  depth:       number
  expandedIds: Set<string>
  onToggle:    (id: string) => void
  onEdit:      (task: Task) => void
  today:       Date
}) {
  const { task } = node
  const hasChildren = node.children.length > 0
  const isExpanded  = expandedIds.has(task.id)
  const isDone      = !isActive(task.status)
  const isOverdue   = !isDone && !!task.dueDate && new Date(task.dueDate) < today
  const badgeClass  = PRIORITY_BADGE[task.priority] ?? 'bg-slate-100 text-slate-500'

  return (
    <>
      <div
        className="flex items-center gap-2 py-1.5 rounded-lg hover:bg-slate-50 group cursor-pointer transition-colors select-none"
        style={{ paddingLeft: `${12 + depth * 22}px`, paddingRight: 12 }}
        onClick={() => onEdit(task)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onEdit(task)}
      >
        {/* Expand chevron — always same width so subjects align */}
        <span className="w-5 h-5 flex items-center justify-center flex-shrink-0">
          {hasChildren && (
            <button
              type="button"
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
              className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
              onClick={(e) => { e.stopPropagation(); onToggle(task.id) }}
            >
              <svg
                className={`w-3 h-3 transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`}
                fill="none" viewBox="0 0 12 12"
              >
                <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5"
                  strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </span>

        {/* Status dot */}
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot(task.status)}`} />

        {/* Milestone diamond */}
        {task.isMilestone && (
          <span className="w-2 h-2 bg-amber-400 rotate-45 flex-shrink-0 rounded-[2px]" />
        )}

        {/* Subject */}
        <span
          className={`flex-1 min-w-0 truncate text-sm leading-5 ${
            isDone
              ? 'text-slate-400 line-through'
              : depth === 0
                ? 'font-medium text-slate-800'
                : 'text-slate-700'
          }`}
        >
          {task.subject}
        </span>

        {/* Right-side metadata — desktop only */}
        <div className="hidden md:flex items-center gap-3 flex-shrink-0">
          {/* Progress bar */}
          {task.progress > 0 && (
            <div className="flex items-center gap-1.5 w-20">
              <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${isDone ? 'bg-emerald-300' : 'bg-indigo-400'}`}
                  style={{ width: `${task.progress}%` }}
                />
              </div>
              <span className="text-[10px] text-slate-400 tabular-nums">{task.progress}%</span>
            </div>
          )}

          {/* Due date */}
          {task.dueDate && (
            <span className={`text-xs flex items-center gap-0.5 ${isOverdue ? 'text-rose-500' : 'text-slate-400'}`}>
              {isOverdue && (
                <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 12 12">
                  <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M6 3.5v3l1.5 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
              )}
              {fmtDate(task.dueDate)}
            </span>
          )}

          {/* Priority */}
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md flex-shrink-0 ${badgeClass}`}>
            {task.priority}
          </span>

          {/* Assignees */}
          {task.assignedTo.length > 0 && (
            <AvatarStack max={2} userIds={task.assignedTo} />
          )}
        </div>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child) => (
            <TaskRow
              key={child.task.id}
              depth={depth + 1}
              expandedIds={expandedIds}
              node={child}
              onEdit={onEdit}
              onToggle={onToggle}
              today={today}
            />
          ))}
        </div>
      )}
    </>
  )
}

// ─── Project section ────────────────────────────────────────────────────────

function ProjectSection({
  project,
  roots,
  taskCount,
  expandedIds,
  onToggle,
  onEdit,
  today,
}: {
  project:     Project | null
  roots:       TreeNode[]
  taskCount:   number
  expandedIds: Set<string>
  onToggle:    (id: string) => void
  onEdit:      (task: Task) => void
  today:       Date
}) {
  const [open, setOpen] = useState(true)
  const label      = project ? (project.displayName || project.name) : 'No Project'
  const completion = project?.completion ?? null

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-3 last:mb-0">
      {/* Section header */}
      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <svg
          className={`w-3.5 h-3.5 text-slate-400 flex-shrink-0 transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
          fill="none" viewBox="0 0 12 12"
        >
          <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        <span
          className={`w-2.5 h-2.5 rounded-sm flex-shrink-0 ${project ? 'bg-indigo-500' : 'bg-slate-300'}`}
        />

        <span className="text-sm font-semibold text-slate-800 flex-1 truncate">{label}</span>

        {/* Project completion */}
        {completion !== null && completion > 0 && (
          <div className="hidden md:flex items-center gap-2 mr-2">
            <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${completion}%` }} />
            </div>
            <span className="text-xs text-slate-400">{completion}%</span>
          </div>
        )}

        <span className="text-xs text-slate-400 flex-shrink-0">
          {taskCount} task{taskCount !== 1 ? 's' : ''}
        </span>
      </button>

      {open && (
        <div className="border-t border-slate-100 py-1 px-1">
          {roots.map((node) => (
            <TaskRow
              key={node.task.id}
              depth={0}
              expandedIds={expandedIds}
              node={node}
              onEdit={onEdit}
              onToggle={onToggle}
              today={today}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Skeleton ──────────────────────────────────────────────────────────────

function SkeletonSection() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-3 animate-pulse">
      <div className="px-4 py-3 flex items-center gap-3">
        <div className="w-3.5 h-3.5 bg-slate-100 rounded" />
        <div className="w-2.5 h-2.5 bg-slate-100 rounded-sm" />
        <div className="h-4 bg-slate-100 rounded-md w-40" />
        <div className="ml-auto h-3 bg-slate-100 rounded-md w-12" />
      </div>
      <div className="border-t border-slate-100 py-2 px-3 space-y-1.5">
        {[80, 65, 72].map((w) => (
          <div key={w} className="flex items-center gap-2 px-2 py-1.5">
            <div className="w-5 h-5 bg-slate-50 rounded" />
            <div className="w-2 h-2 bg-slate-100 rounded-full" />
            <div className={`h-3 bg-slate-100 rounded-md`} style={{ width: `${w}%` }} />
            <div className="ml-auto flex gap-2">
              <div className="h-3 bg-slate-50 rounded-md w-10" />
              <div className="h-3 bg-slate-50 rounded-md w-12" />
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

  // ── Expanded state — default to all expanded after first load ───────────

  const allExpandableIds = useMemo(() => {
    const ids: string[] = []
    projectTrees.forEach((roots) => ids.push(...collectExpandableIds(roots)))
    ids.push(...collectExpandableIds(noProjectTree))
    return ids
  }, [projectTrees, noProjectTree])

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [initialized,  setInitialized]  = useState(false)

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

  const expandAll  = () => setExpandedIds(new Set(allExpandableIds))
  const collapseAll = () => setExpandedIds(new Set())

  // ── Refresh ─────────────────────────────────────────────────────────────

  const handleRefresh = async () => {
    if (!username) return
    setInitialized(false)
    await loadWorkspace(username)
  }

  // ── Counts ──────────────────────────────────────────────────────────────

  const totalCount = filteredTasks.length

  const overdueCount = useMemo(() => {
    const t = new Date(); t.setHours(0, 0, 0, 0)
    return filteredTasks.filter((tk) => {
      if (!tk.dueDate) return false
      if (!isActive(tk.status)) return false
      return new Date(tk.dueDate) < t
    }).length
  }, [filteredTasks])

  // ── Create task modal handlers ──────────────────────────────────────────

  const openCreateModal  = () => { resetTaskFeedback(); setIsCreateOpen(true) }
  const closeCreateModal = () => { if (createTaskStatus === 'submitting') return; setIsCreateOpen(false) }
  const handleCreateTask = (input: CreateTaskInput) => {
    if (!username) return Promise.resolve(false)
    return createTask(input, username)
  }

  // ── Detail / assign modals ─────────────────────────────────────────────────
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null)
  const [assigningTask, setAssigningTask] = useState<Task | null>(null)

  const handleUpdate = async (taskId: string, input: UpdateTaskInput) => {
    const enriched = input.status === 'Completed'
      ? { ...input, completedBy: input.completedBy || username || userFullName, completedOn: input.completedOn || new Date().toISOString().split('T')[0] }
      : input
    return updateTask(taskId, enriched)
  }

  const handleAssign = async (userId: string): Promise<boolean> => {
    if (!assigningTask) return false
    return assignTask(assigningTask.id, userId)
  }
  const handleUnassign = async (userId: string): Promise<boolean> => {
    if (!assigningTask) return false
    return unassignTask(assigningTask.id, userId)
  }

  // ── Status-change modal ─────────────────────────────────────────────────

  const [statusChangeTarget, setStatusChangeTarget] = useState<Task | null>(null)
  const [isStatusChanging, setIsStatusChanging] = useState(false)

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

  // ─── Render ──────────────────────────────────────────────────────────────

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
        overdueCount={overdueCount}
        projectFilter={projectFilter}
        projects={projects}
        showClosed={showClosed}
        totalCount={totalCount}
      />

      {/* ── Content ── */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 md:px-8 scrollbar-none">
        {/* Expand/Collapse controls */}
        {!isLoading && allExpandableIds.length > 0 && (
          <div className="flex items-center gap-2 mb-3">
            <button type="button" onClick={expandAll} className="text-[11.5px] text-slate-500 hover:text-slate-800 hover:bg-slate-100 px-2.5 py-1 rounded-md transition-colors">
              Expand all
            </button>
            <button type="button" onClick={collapseAll} className="text-[11.5px] text-slate-500 hover:text-slate-800 hover:bg-slate-100 px-2.5 py-1 rounded-md transition-colors">
              Collapse all
            </button>
          </div>
        )}

        {isLoading ? (
          <div>
            <SkeletonSection />
            <SkeletonSection />
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-slate-300" fill="none" viewBox="0 0 24 24">
                <circle cx="12" cy="4.5" r="2" stroke="currentColor" strokeWidth="1.8" />
                <path d="M12 6.5v4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M6.5 11h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M6.5 11v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M17.5 11v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <circle cx="6.5"  cy="17.5" r="2" stroke="currentColor" strokeWidth="1.8" />
                <circle cx="17.5" cy="17.5" r="2" stroke="currentColor" strokeWidth="1.8" />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-600">No tasks yet</p>
            <button
              type="button"
              onClick={openCreateModal}
              className="mt-3 flex items-center gap-1.5 h-8 px-4 bg-slate-900 text-white text-xs font-medium rounded-lg hover:bg-slate-700 transition-colors mx-auto"
            >
              <svg fill="none" viewBox="0 0 14 14" width="12" height="12"><path d="M7 2v10M2 7h10" stroke="white" strokeLinecap="round" strokeWidth="1.8"/></svg>
              Add Task
            </button>
          </div>
        ) : (
          <div>
            {sortedProjectIds.map((projectId) => (
              <ProjectSection
                key={projectId}
                expandedIds={expandedIds}
                onEdit={(t) => setDetailTaskId(t.id)}
                onToggle={toggleExpanded}
                project={projectMap.get(projectId) ?? null}
                roots={projectTrees.get(projectId) ?? []}
                taskCount={projectGroups.get(projectId)?.length ?? 0}
                today={today}
              />
            ))}

            {noProjectTasks.length > 0 && (
              <ProjectSection
                expandedIds={expandedIds}
                onEdit={(t) => setDetailTaskId(t.id)}
                onToggle={toggleExpanded}
                project={null}
                roots={noProjectTree}
                taskCount={noProjectTasks.length}
                today={today}
              />
            )}
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
