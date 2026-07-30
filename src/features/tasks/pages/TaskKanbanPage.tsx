import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { useAuthStore } from '../../../store/authStore'
import { useWorkStore } from '../../../store/workStore'
import { AvatarStack } from '../../../shared/components/UserAvatar'
import { TaskDetailModal } from '../components/TaskDetailModal'
import { AssignTaskModal } from '../components/AssignTaskModal'
import { StatusChangeModal } from '../components/StatusChangeModal'
import { TasksHeader } from '../components/TasksHeader'
import { CreateTaskModal } from '../components/CreateTaskModal'
import type { Task, UpdateTaskInput, CreateTaskInput } from '../types/task.types'

// ─── Column definitions ────────────────────────────────────────────────────

const COLUMNS = [
  {
    status:  'Open',
    label:   'Open',
    dot:     'bg-indigo-400',
    badge:   'bg-indigo-100 text-indigo-700',
    drop:    'ring-2 ring-inset ring-indigo-300 bg-indigo-50/60',
    accent:  'border-t-indigo-400',
  },
  {
    status:  'Working',
    label:   'In Progress',
    dot:     'bg-amber-400',
    badge:   'bg-amber-100 text-amber-700',
    drop:    'ring-2 ring-inset ring-amber-300 bg-amber-50/60',
    accent:  'border-t-amber-400',
  },
  {
    status:  'Pending Review',
    label:   'Pending Review',
    dot:     'bg-violet-400',
    badge:   'bg-violet-100 text-violet-700',
    drop:    'ring-2 ring-inset ring-violet-300 bg-violet-50/60',
    accent:  'border-t-violet-400',
  },
  {
    status:  'Completed',
    label:   'Completed',
    dot:     'bg-emerald-400',
    badge:   'bg-emerald-100 text-emerald-700',
    drop:    'ring-2 ring-inset ring-emerald-300 bg-emerald-50/60',
    accent:  'border-t-emerald-400',
  },
  {
    status:  'Cancelled',
    label:   'Cancelled',
    dot:     'bg-slate-300',
    badge:   'bg-slate-100 text-slate-400',
    drop:    'ring-2 ring-inset ring-slate-300 bg-slate-100/60',
    accent:  'border-t-slate-300',
  },
] as const

type ColDef = typeof COLUMNS[number]

// ─── Helpers ───────────────────────────────────────────────────────────────

const isActive = (s: string) =>
  !s.toLowerCase().includes('complet') &&
  s.toLowerCase() !== 'cancelled' &&
  s.toLowerCase() !== 'closed'

const fmtDate = (v: string) =>
  new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(v))

const PRIORITY_DOT: Record<string, string> = {
  Urgent: 'bg-rose-500',
  High:   'bg-amber-500',
  Medium: 'bg-indigo-400',
  Low:    'bg-slate-300',
}

const PRIORITY_LABEL: Record<string, string> = {
  Urgent: 'text-rose-600',
  High:   'text-amber-600',
  Medium: 'text-indigo-500',
  Low:    'text-slate-400',
}

const LEFT_BORDER: Record<string, string> = {
  Urgent: 'border-l-rose-400',
  High:   'border-l-amber-400',
  Medium: 'border-l-indigo-300',
  Low:    'border-l-slate-200',
}

// ─── Kanban card ───────────────────────────────────────────────────────────

function KanbanCard({
  task,
  isDragging,
  projectName,
  onEdit,
  onDragStart,
  onDragEnd,
  today,
}: {
  task:        Task
  isDragging:  boolean
  projectName: string | null
  onEdit:      (t: Task) => void
  onDragStart: (e: React.DragEvent, id: string) => void
  onDragEnd:   () => void
  today:       Date
}) {
  const isDone    = !isActive(task.status)
  const isOverdue = !isDone && !!task.dueDate && new Date(task.dueDate) < today
  const leftBdr   = LEFT_BORDER[task.priority]   ?? 'border-l-slate-200'
  const priDot    = PRIORITY_DOT[task.priority]  ?? 'bg-slate-300'
  const priLabel  = PRIORITY_LABEL[task.priority] ?? 'text-slate-400'

  return (
    <article
      draggable
      onDragStart={(e) => onDragStart(e, task.id)}
      onDragEnd={onDragEnd}
      onClick={() => onEdit(task)}
      className={[
        'group relative bg-white rounded-xl border-l-[3px]',
        'shadow-[0_1px_3px_0_rgb(0,0,0,0.06),0_1px_2px_-1px_rgb(0,0,0,0.04)]',
        'cursor-grab active:cursor-grabbing select-none',
        'transition-all duration-150 will-change-transform',
        leftBdr,
        isDragging
          ? 'opacity-30 scale-95 shadow-xl rotate-1'
          : 'hover:shadow-[0_4px_12px_0_rgb(0,0,0,0.10)] hover:-translate-y-0.5',
      ].join(' ')}
    >
      <div className="p-3.5">
        {/* Subject */}
        <p className={[
          'text-[13px] leading-snug mb-2 line-clamp-2',
          isDone ? 'text-slate-400 line-through' : 'font-medium text-slate-800',
        ].join(' ')}>
          {task.isMilestone && (
            <span className="inline-block w-2 h-2 bg-amber-400 rotate-45 rounded-[2px] mr-1.5 align-middle" />
          )}
          {task.subject}
        </p>

        {/* Project */}
        {projectName && (
          <p className="text-[11px] text-slate-400 truncate mb-2.5 -mt-0.5 flex items-center gap-1">
            <svg className="w-2.5 h-2.5 flex-shrink-0 opacity-60" fill="none" viewBox="0 0 12 12">
              <rect x="1" y="1" width="4" height="4" rx="0.8" stroke="currentColor" strokeWidth="1.2" />
              <rect x="7" y="1" width="4" height="4" rx="0.8" stroke="currentColor" strokeWidth="1.2" />
              <rect x="1" y="7" width="4" height="4" rx="0.8" stroke="currentColor" strokeWidth="1.2" />
              <path d="M7 9h4M7 7.5h2.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.2" />
            </svg>
            {projectName}
          </p>
        )}

        {/* Progress bar */}
        {task.progress > 0 && (
          <div className="mb-3">
            <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${isDone ? 'bg-emerald-400' : 'bg-indigo-400'}`}
                style={{ width: `${task.progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between gap-2">
          {/* Priority */}
          <span className={`flex items-center gap-1 text-[11px] font-medium ${priLabel}`}>
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${priDot}`} />
            {task.priority}
          </span>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Due date */}
            {task.dueDate && (
              <span className={`text-[11px] flex items-center gap-0.5 ${isOverdue ? 'text-rose-500 font-medium' : 'text-slate-400'}`}>
                {isOverdue ? (
                  <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 12 12">
                    <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M6 3.5v3l1.5 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg className="w-3 h-3 flex-shrink-0 opacity-50" fill="none" viewBox="0 0 12 12">
                    <rect x="1.5" y="2" width="9" height="8.5" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M4 1v2M8 1v2M1.5 5.5h9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                )}
                {fmtDate(task.dueDate)}
              </span>
            )}

            {/* Assignees */}
            {task.assignedTo.length > 0 && (
              <AvatarStack max={2} userIds={task.assignedTo} />
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

// ─── Kanban column ─────────────────────────────────────────────────────────

function KanbanColumn({
  col,
  tasks,
  isDragOver,
  draggingId,
  projectNameMap,
  onDragOver,
  onDrop,
  onEdit,
  onDragStart,
  onDragEnd,
  today,
}: {
  col:            ColDef
  tasks:          Task[]
  isDragOver:     boolean
  draggingId:     string | null
  projectNameMap: Map<string, string>
  onDragOver:     (e: React.DragEvent, status: string) => void
  onDrop:         (e: React.DragEvent, status: string) => void
  onEdit:         (t: Task) => void
  onDragStart:    (e: React.DragEvent, id: string) => void
  onDragEnd:      () => void
  today:          Date
}) {
  return (
    <div
      onDragOver={(e) => onDragOver(e, col.status)}
      onDrop={(e) => onDrop(e, col.status)}
      className={[
        'flex flex-col min-w-[220px] flex-1 rounded-2xl border-t-[3px]',
        'transition-all duration-150',
        isDragOver
          ? col.drop
          : `bg-slate-50/70 border-slate-200 ${col.accent}`,
      ].join(' ')}
    >
      {/* Column header */}
      <div className="flex items-center gap-2.5 px-4 pt-3.5 pb-3 flex-shrink-0">
        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${col.dot}`} />
        <span className="text-[13px] font-semibold text-slate-700 flex-1 leading-none tracking-tight">
          {col.label}
        </span>
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full tabular-nums ${col.badge}`}>
          {tasks.length}
        </span>
      </div>

      {/* Divider */}
      <div className="mx-3 h-px bg-slate-200/60 flex-shrink-0" />

      {/* Cards — scrolls internally, no visible scrollbar */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-none px-2.5 py-2.5 space-y-2">
        {tasks.map((task) => (
          <KanbanCard
            key={task.id}
            isDragging={draggingId === task.id}
            onDragEnd={onDragEnd}
            onDragStart={onDragStart}
            onEdit={onEdit}
            projectName={task.project ? (projectNameMap.get(task.project) ?? task.project) : null}
            task={task}
            today={today}
          />
        ))}

        {/* Empty column placeholder */}
        {tasks.length === 0 && (
          <div className={[
            'flex flex-col items-center justify-center gap-1.5 rounded-xl h-24',
            'border-2 border-dashed transition-colors duration-150',
            isDragOver ? 'border-slate-400 bg-white/50' : 'border-slate-200',
          ].join(' ')}>
            <span className="text-xs text-slate-300 font-medium">
              {isDragOver ? 'Drop here' : 'No tasks'}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Loading skeleton ──────────────────────────────────────────────────────

const SKELETON_HEIGHTS = [
  [72, 56, 80],
  [56, 80, 56, 64],
  [64, 72],
  [80, 56, 64, 56],
  [56, 72],
]

function SkeletonColumn({ col, heights }: { col: ColDef; heights: number[] }) {
  return (
    <div className={`flex flex-col min-w-[220px] flex-1 rounded-2xl border-t-[3px] bg-slate-50/70 border-slate-200 ${col.accent} animate-pulse`}>
      <div className="flex items-center gap-2.5 px-4 pt-3.5 pb-3">
        <span className={`w-2.5 h-2.5 rounded-full ${col.dot}`} />
        <div className="h-3.5 bg-slate-200/70 rounded flex-1" />
        <div className="h-4 w-5 bg-slate-200/70 rounded-full" />
      </div>
      <div className="mx-3 h-px bg-slate-200/60" />
      <div className="px-2.5 py-2.5 space-y-2">
        {heights.map((h, i) => (
          <div
            key={i}
            className="bg-white rounded-xl border-l-[3px] border-l-slate-200 shadow-sm p-3.5"
            style={{ height: h }}
          >
            <div className="h-3 bg-slate-100 rounded-md w-4/5 mb-2" />
            <div className="h-2.5 bg-slate-50 rounded-md w-2/5 mb-3" />
            <div className="flex justify-between items-center pt-2 border-t border-slate-100">
              <div className="h-3 bg-slate-100 rounded w-12" />
              <div className="h-3 bg-slate-100 rounded w-10" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────

export function TaskKanbanPage() {
  const username      = useAuthStore((s) => s.user?.username)
  const userFullName  = useAuthStore((s) => s.user?.fullName)
  const tasks         = useWorkStore((s) => s.tasks)
  const projects      = useWorkStore((s) => s.projects)
  const status        = useWorkStore((s) => s.status)
  const updateTask    = useWorkStore((s) => s.updateTask)
  const assignTask    = useWorkStore((s) => s.assignTask)
  const unassignTask  = useWorkStore((s) => s.unassignTask)
  const loadWorkspace = useWorkStore((s) => s.loadWorkspace)
  const createTask         = useWorkStore((s) => s.createTask)
  const createTaskStatus   = useWorkStore((s) => s.createTaskStatus)
  const createTaskError    = useWorkStore((s) => s.createTaskError)
  const resetTaskFeedback  = useWorkStore((s) => s.resetTaskFeedback)

  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }, [])

  // ── Filters ──────────────────────────────────────────────────────────────

  const [searchParams]  = useSearchParams()
  const [myTasksOnly,   setMyTasksOnly]   = useState(false)
  const [projectFilter, setProjectFilter] = useState(() => searchParams.get('project') ?? 'all')
  const [showClosed,     setShowClosed]     = useState(false)
  const [isCreateOpen,   setIsCreateOpen]   = useState(false)

  useEffect(() => {
    setProjectFilter(searchParams.get('project') ?? 'all')
  }, [searchParams])

  const myTaskIds = useMemo(() => {
    if (!username) return new Set<string>()
    return new Set(
      tasks.filter((t) => t.owner === username || t.assignedTo.includes(username)).map((t) => t.id),
    )
  }, [tasks, username])

  const projectNameMap = useMemo(() => {
    const m = new Map<string, string>()
    projects.forEach((p) => m.set(p.name, p.displayName || p.name))
    return m
  }, [projects])

  const filteredTasks = useMemo(() => {
    let t = tasks
    if (myTasksOnly && username) t = t.filter((task) => myTaskIds.has(task.id))
    if (projectFilter !== 'all')  t = t.filter((task) => task.project === projectFilter)
    if (!showClosed) t = t.filter((task) => isActive(task.status))
    return t
  }, [tasks, myTasksOnly, myTaskIds, projectFilter, username, showClosed])

  // ── Group by column ───────────────────────────────────────────────────────

  const columnTasks = useMemo(() => {
    const map = new Map<string, Task[]>()
    COLUMNS.forEach((c) => map.set(c.status, []))
    filteredTasks.forEach((t) => {
      const s = t.status
      const bucket =
        s === 'Closed' || s.toLowerCase().includes('complet') ? 'Completed'
        : COLUMNS.some((c) => c.status === s) ? s
        : 'Open'
      map.get(bucket)!.push(t)
    })
    return map
  }, [filteredTasks])

  // ── Drag & drop ───────────────────────────────────────────────────────────

  const [draggingId,     setDraggingId]     = useState<string | null>(null)
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null)

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('text/plain', id)
    e.dataTransfer.effectAllowed = 'move'
    setDraggingId(id)
  }

  const handleDragEnd = () => {
    setDraggingId(null)
    setDragOverStatus(null)
  }

  const handleDragOver = (e: React.DragEvent, colStatus: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverStatus !== colStatus) setDragOverStatus(colStatus)
  }

  const handleDrop = (e: React.DragEvent, newStatus: string) => {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/plain')
    setDragOverStatus(null)
    setDraggingId(null)
    const task = tasks.find((t) => t.id === id)
    if (!task || task.status === newStatus) return
    setStatusChangeTarget(task)
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

  const openCreateModal  = () => { resetTaskFeedback(); setIsCreateOpen(true) }
  const closeCreateModal = () => { if (createTaskStatus === 'submitting') return; setIsCreateOpen(false) }
  const handleCreateTask = (input: CreateTaskInput) => {
    if (!username) return Promise.resolve(null)
    return createTask(input, username)
  }

  // ── Status-change modal ───────────────────────────────────────────────────

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

  // ── Stats ─────────────────────────────────────────────────────────────────

  const overdueCount = useMemo(
    () => filteredTasks.filter((t) => isActive(t.status) && t.dueDate && new Date(t.dueDate) < today).length,
    [filteredTasks, today],
  )

  const totalCount = filteredTasks.length

  const isLoading = status === 'loading'

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    /*
     * On desktop the page fills the available viewport exactly.
     * md:h-screen  → total height minus the 64px top bar
     * md:-mb-10                → cancels the parent shell's pb-10 so nothing clips
     * overflow-hidden          → no page-level scrollbar
     */
    <main className="flex flex-col animate-fade-in md:h-[calc(100vh-48px)] md:overflow-hidden">

      <TasksHeader
        isLoading={isLoading}
        myTasksOnly={myTasksOnly}
        onAddTask={openCreateModal}
        onMyTasksOnlyChange={setMyTasksOnly}
        onProjectFilterChange={setProjectFilter}
        onRefresh={() => username && void loadWorkspace(username)}
        onShowClosedChange={setShowClosed}
        overdueCount={overdueCount}
        projectFilter={projectFilter}
        projects={projects}
        showClosed={showClosed}
        totalCount={totalCount}
      />

      {/* ── Board ── */}
      <div className="flex-1 min-h-0 flex flex-col px-4 py-4 md:px-6">
        {isLoading ? (
          /* Skeleton — fills remaining height */
          <div className="flex-1 min-h-0 flex gap-3 overflow-hidden">
            {COLUMNS.map((col, i) => (
              <SkeletonColumn key={col.status} col={col} heights={SKELETON_HEIGHTS[i] ?? [72, 56]} />
            ))}
          </div>

        ) : tasks.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center max-w-xs w-full">
              <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-slate-300" fill="none" viewBox="0 0 24 24">
                  <rect x="3"  y="3"  width="5.5" height="9"  rx="1.5" stroke="currentColor" strokeWidth="1.8" />
                  <rect x="10" y="3"  width="5.5" height="6"  rx="1.5" stroke="currentColor" strokeWidth="1.8" />
                  <rect x="10" y="12" width="5.5" height="9"  rx="1.5" stroke="currentColor" strokeWidth="1.8" />
                  <rect x="17" y="3"  width="4.5" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
                </svg>
              </div>
              <p className="text-sm font-medium text-slate-600">No tasks yet</p>
              <p className="text-xs text-slate-400 mt-1">
                <Link to="/tasks" className="text-indigo-500 hover:text-indigo-700 hover:underline">Go to Tasks</Link>{' '}
                to create your first one
              </p>
            </div>
          </div>

        ) : (
          /*
           * Board fills remaining height.
           * overflow-x: hidden on desktop (5 columns always fit).
           * On mobile/tablet allow horizontal scroll, but hide the scrollbar.
           */
          <div
            className="flex-1 min-h-0 flex gap-3 overflow-x-auto overflow-y-hidden scrollbar-none md:pb-4"
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverStatus(null)
            }}
          >
            {COLUMNS.map((col) => (
              <KanbanColumn
                key={col.status}
                col={col}
                draggingId={draggingId}
                isDragOver={dragOverStatus === col.status}
                onDragEnd={handleDragEnd}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onEdit={(t) => setDetailTaskId(t.id)}
                onDragStart={handleDragStart}
                projectNameMap={projectNameMap}
                tasks={columnTasks.get(col.status) ?? []}
                today={today}
              />
            ))}
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
