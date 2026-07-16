import { useEffect, useMemo, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'

import type { CreateTaskInput, Task, UpdateTaskInput } from '../types/task.types'
import { CreateTaskModal } from '../components/CreateTaskModal'
import { EditTaskForm } from '../components/EditTaskForm'
import { StatusChangeModal } from '../components/StatusChangeModal'
import { AssignTaskModal } from '../components/AssignTaskModal'
import { TaskDetailModal } from '../components/TaskDetailModal'
import { TasksHeader } from '../components/TasksHeader'
import { useAuthStore } from '../../../store/authStore'
import { useWorkStore } from '../../../store/workStore'

// ─── Status groups — ClickUp color system ────────────────────────────────────

interface StatusGroup {
  key: string
  label: string
  statuses: string[]
  dot: string   // dot color
  hBg: string   // header bg
  hText: string // header text
  closed: boolean
  blocked: boolean
}

const STATUS_GROUPS: StatusGroup[] = [
  { key: 'open',      label: 'Open',           statuses: ['Open'],           dot: '#9CA3AF', hBg: '#F5F5F5', hText: '#6B7280', closed: false, blocked: false },
  { key: 'working',   label: 'Working',         statuses: ['Working'],        dot: '#3B82F6', hBg: '#EFF6FF', hText: '#1D4ED8', closed: false, blocked: false },
  { key: 'review',    label: 'Pending Review',  statuses: ['Pending Review'], dot: '#7B3FF2', hBg: '#F3F0FF', hText: '#5623BE', closed: false, blocked: false },
  { key: 'overdue',   label: 'Overdue',         statuses: ['Overdue'],        dot: '#F97316', hBg: '#FFF7ED', hText: '#C2410C', closed: false, blocked: true  },
  { key: 'done',      label: 'Completed',       statuses: ['Completed'],      dot: '#22C55E', hBg: '#F0FDF4', hText: '#15803D', closed: true,  blocked: false },
  { key: 'cancelled', label: 'Cancelled',       statuses: ['Cancelled'],      dot: '#EF4444', hBg: '#FEF2F2', hText: '#B91C1C', closed: true,  blocked: true  },
]

// ─── Priority config ─────────────────────────────────────────────────────────

const PRIORITY: Record<string, { dot: string; text: string; label: string }> = {
  Urgent: { dot: '#EF4444', text: '#B91C1C', label: 'Urgent' },
  High:   { dot: '#F97316', text: '#C2410C', label: 'High'   },
  Medium: { dot: '#3B82F6', text: '#1D4ED8', label: 'Medium' },
  Low:    { dot: '#9CA3AF', text: '#6B7280', label: 'Low'    },
}

const PAGE_SIZE = 20

// ─── Avatar helpers ───────────────────────────────────────────────────────────

function initials(s: string): string {
  return s.replace(/[@.]/g, ' ').split(/\s+/).filter(Boolean).map((p) => p[0]).join('').toUpperCase().slice(0, 2)
}

// ─── Due date formatter ───────────────────────────────────────────────────────

function fmtDue(v: string | null): { text: string; color: string } {
  if (!v) return { text: '', color: '' }
  const d = new Date(v); d.setHours(0, 0, 0, 0)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000)
  if (diff < 0)  return { text: new Date(v).toLocaleDateString('en', { month: 'short', day: 'numeric' }), color: '#EF4444' }
  if (diff === 0) return { text: 'Today',    color: '#F59E0B' }
  if (diff === 1) return { text: 'Tomorrow', color: '#6B7280' }
  if (diff <= 6)  return { text: new Date(v).toLocaleDateString('en', { weekday: 'short' }), color: '#6B7280' }
  return { text: new Date(v).toLocaleDateString('en', { month: 'short', day: 'numeric' }), color: '#6B7280' }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Avatar({ name, size = 22 }: { name: string; size?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-full text-white font-bold flex-shrink-0 cursor-pointer"
      style={{ width: size, height: size, fontSize: size * 0.38, background: '#444' }}
      title={name}
    >
      {initials(name)}
    </div>
  )
}

function Checkbox({ checked, onClick }: { checked: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick() }}
      style={{
        width: 16,
        height: 16,
        borderRadius: '50%',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: checked ? '#22C55E' : 'transparent',
        border: checked ? '1px solid #22C55E' : '1.5px dashed #D1D5DB',
        cursor: 'pointer',
        transition: 'all 150ms',
      }}
    >
      {checked && (
        <svg fill="none" viewBox="0 0 10 10" width="9" height="9">
          <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"/>
        </svg>
      )}
    </button>
  )
}

// ─── Task list column widths ──────────────────────────────────────────────────
// [28px checkbox] [flex-1 name ≥200px] [76px assignee] [100px due] [100px priority] [120px status] [64px comments] [28px +]

// ─── Page ─────────────────────────────────────────────────────────────────────

export function TasksPage() {
  const location         = useLocation()
  const username         = useAuthStore((s) => s.user?.username)
  const userFullName     = useAuthStore((s) => s.user?.fullName)
  const tasks            = useWorkStore((s) => s.tasks)
  const projects         = useWorkStore((s) => s.projects)
  const status           = useWorkStore((s) => s.status)
  const createTaskStatus = useWorkStore((s) => s.createTaskStatus)
  const createTaskError  = useWorkStore((s) => s.createTaskError)
  const createTask       = useWorkStore((s) => s.createTask)
  const updateTask       = useWorkStore((s) => s.updateTask)
  const assignTask       = useWorkStore((s) => s.assignTask)
  const unassignTask     = useWorkStore((s) => s.unassignTask)
  const loadWorkspace    = useWorkStore((s) => s.loadWorkspace)
  const resetTaskFeedback = useWorkStore((s) => s.resetTaskFeedback)

  const myTaskIds = useMemo(() => {
    if (!username) return new Set<string>()
    return new Set(tasks.filter((t) => t.owner === username || t.assignedTo.includes(username)).map((t) => t.id))
  }, [tasks, username])

  // ── View filters ──────────────────────────────────────────────────────────────

  const [searchParams]  = useSearchParams()
  const [showClosed,    setShowClosed]    = useState(false)
  const [myTasksOnly,   setMyTasksOnly]   = useState(false)
  const [projectFilter, setProjectFilter] = useState(() => searchParams.get('project') ?? 'all')
  const [collapsed,     setCollapsed]     = useState<Set<string>>(new Set())
  const [groupBy, setGroupBy] = useState<'status' | 'none'>('none')

  // Sync project filter when URL search param changes (e.g. sidebar click)
  useEffect(() => {
    setProjectFilter(searchParams.get('project') ?? 'all')
  }, [searchParams])

  const toggleCollapse = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  // ── Modals ────────────────────────────────────────────────────────────────────

  const [isCreateOpen,       setIsCreateOpen]       = useState(false)
  const [detailTaskId,       setDetailTaskId]        = useState<string | null>(null)
  const [editingTaskId,      setEditingTaskId]       = useState<string | null>(null)
  const [editingTask,        setEditingTask]         = useState<Task | null>(null)
  const [editError,          setEditError]           = useState<string | null>(null)
  const [isEditSubmitting,   setIsEditSubmitting]    = useState(false)
  const [assigningTask,      setAssigningTask]       = useState<Task | null>(null)
  const [statusChangeTarget, setStatusChangeTarget]  = useState<Task | null>(null)
  const [isStatusChanging,   setIsStatusChanging]    = useState(false)
  const [editCommExpanded,   setEditCommExpanded]    = useState(true)
  const [editCommTab,        setEditCommTab]         = useState<'comments' | 'activity' | 'attachments'>('activity')
  const [editComingSoon,     setEditComingSoon]      = useState<string | null>(null)
  const triggerEditComingSoon = (msg: string) => {
    setEditComingSoon(msg)
    setTimeout(() => setEditComingSoon(null), 2800)
  }

  // Auto-open task detail from dashboard / notification link
  useEffect(() => {
    const taskId = (location.state as { taskId?: string } | null)?.taskId
    if (!taskId || !tasks.length) return
    const found = tasks.find((t) => t.id === taskId)
    if (found) {
      setDetailTaskId(found.id)
      window.history.replaceState({}, '')
    }
  }, [location.state, tasks])

  // Reset edit panel to open on Activity tab whenever a different task is opened for editing
  useEffect(() => {
    if (editingTaskId) { setEditCommExpanded(true); setEditCommTab('activity') }
  }, [editingTaskId])

  // ── Handlers ──────────────────────────────────────────────────────────────────

  const handleCreateTask = (input: CreateTaskInput) => {
    if (!username) return Promise.resolve(false)
    return createTask(input, username)
  }

  const openCreateModal  = () => { resetTaskFeedback(); setIsCreateOpen(true) }
  const closeCreateModal = () => { if (createTaskStatus === 'submitting') return; setIsCreateOpen(false) }

  const closeEditModal = () => {
    if (isEditSubmitting) return
    setEditingTaskId(null); setEditingTask(null); setEditError(null)
  }

  const handleEditSubmit = async (taskId: string, input: UpdateTaskInput) => {
    setIsEditSubmitting(true); setEditError(null)
    const enriched = input.status === 'Completed'
      ? { ...input, completedBy: input.completedBy || username || userFullName, completedOn: input.completedOn || new Date().toISOString().split('T')[0] }
      : input
    const ok = await updateTask(taskId, enriched)
    setIsEditSubmitting(false)
    if (!ok) setEditError('Failed to save changes. Please try again.')
    return ok
  }

  const handleStatusChangeConfirm = async (newStatus: string, note: string) => {
    if (!statusChangeTarget) return
    setIsStatusChanging(true)
    const noteHtml = `<p><strong>→ ${newStatus}:</strong> ${note}</p>`
    await updateTask(statusChangeTarget.id, {
      subject:     statusChangeTarget.subject,
      status:      newStatus,
      priority:    statusChangeTarget.priority,
      description: statusChangeTarget.description ? `${statusChangeTarget.description}${noteHtml}` : noteHtml,
      ...(newStatus === 'Completed' ? { completedBy: username || userFullName, completedOn: new Date().toISOString().split('T')[0] } : {}),
    })
    setIsStatusChanging(false)
    setStatusChangeTarget(null)
  }

  // ── Filtered + grouped tasks ──────────────────────────────────────────────────

  const filteredTasks = useMemo(() => {
    let t = tasks
    if (myTasksOnly && username) t = t.filter((tk) => myTaskIds.has(tk.id))
    if (projectFilter !== 'all') t = t.filter((tk) => tk.project === projectFilter)
    return t
  }, [tasks, myTasksOnly, myTaskIds, projectFilter, username])

  const knownStatuses = useMemo(() => new Set(STATUS_GROUPS.flatMap((g) => g.statuses)), [])

  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => { setCurrentPage(1) }, [myTasksOnly, projectFilter, showClosed, groupBy])

  const totalPages = Math.ceil(filteredTasks.length / PAGE_SIZE)

  const paginatedTasks = useMemo(
    () => filteredTasks.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filteredTasks, currentPage],
  )

  const grouped = useMemo(() => {
    const result: { group: StatusGroup; tasks: Task[] }[] = []
    STATUS_GROUPS.forEach((group) => {
      const groupTasks = paginatedTasks.filter((t) => group.statuses.includes(t.status))
      if (groupTasks.length > 0 || !group.closed) result.push({ group, tasks: groupTasks })
    })
    const overflowTasks = paginatedTasks.filter((t) => !knownStatuses.has(t.status))
    if (overflowTasks.length) {
      result.push({
        group: { key: 'other', label: 'Other', statuses: [], dot: '#9CA3AF', hBg: '#F5F5F5', hText: '#6B7280', closed: false, blocked: false },
        tasks: overflowTasks,
      })
    }
    return result
  }, [paginatedTasks, knownStatuses])

  const totalCount   = filteredTasks.length
  const overdueCount = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    return filteredTasks.filter((t) => {
      if (!t.dueDate) return false
      const s = t.status.toLowerCase()
      if (s.includes('complet') || s === 'cancelled' || s === 'closed') return false
      return new Date(t.dueDate) < today
    }).length
  }, [filteredTasks])

  const isLoading = status === 'loading'

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <main className="flex flex-col animate-fade-in bg-white md:h-[calc(100vh-48px)] md:overflow-hidden">

      <TasksHeader
        groupBy={groupBy}
        isLoading={isLoading}
        myTasksOnly={myTasksOnly}
        onAddTask={openCreateModal}
        onGroupByChange={setGroupBy}
        onMyTasksOnlyChange={setMyTasksOnly}
        onProjectFilterChange={setProjectFilter}
        onRefresh={() => { if (username) { resetTaskFeedback(); void loadWorkspace(username) } }}
        onShowClosedChange={setShowClosed}
        overdueCount={overdueCount}
        projectFilter={projectFilter}
        projects={projects}
        showClosed={showClosed}
        totalCount={totalCount}
      />

      {/* ══ Task list ══ */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto scrollbar-none" style={{ background: 'white' }}>
        <div style={{ minWidth: 720 }}>

          {/* Column header — sticky at top of scroll container */}
          <div
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 10,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              background: 'white',
              borderBottom: '1px solid #F3F4F6',
              paddingLeft: 20,
              paddingRight: 20,
            }}
          >
            <div style={{ width: 28, flexShrink: 0 }} />
            <div style={{ flex: '0 1 640px', minWidth: 120, paddingRight: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 500, color: '#9CA3AF' }}>Name</span>
            </div>
            {[
              { label: 'Assignee', w: 76  },
              { label: 'Due date', w: 100 },
              { label: 'Priority', w: 100 },
              { label: 'Status',   w: 120 },
              { label: 'Comments', w: 64  },
            ].map(({ label, w }) => (
              <div key={label} style={{ width: w, flexShrink: 0, padding: '0 4px' }}>
                <span style={{ fontSize: 11, fontWeight: 500, color: '#9CA3AF' }}>{label}</span>
              </div>
            ))}
            <div style={{ width: 28, flexShrink: 0 }}>
              <button style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#D1D5DB', background: 'none', border: 'none', cursor: 'pointer' }}>
                <svg fill="none" viewBox="0 0 12 12" width={11} height={11}><path d="M6 1v10M1 6h10" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5"/></svg>
              </button>
            </div>
          </div>

          {/* Loading skeleton */}
          {isLoading && (
            <div style={{ padding: '16px 20px' }}>
              {[80, 65, 90, 55, 75].map((w, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, height: 38, borderBottom: '1px solid #F9FAFB' }}>
                  <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#F3F4F6', flexShrink: 0 }} className="animate-pulse"/>
                  <div style={{ height: 11, background: '#F3F4F6', borderRadius: 4, width: `${w}%`, maxWidth: 300 }} className="animate-pulse"/>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 16 }}>
                    <div style={{ width: 60, height: 11, background: '#F3F4F6', borderRadius: 4 }} className="animate-pulse"/>
                    <div style={{ width: 50, height: 11, background: '#F3F4F6', borderRadius: 4 }} className="animate-pulse"/>
                    <div style={{ width: 70, height: 18, background: '#F3F4F6', borderRadius: 20 }} className="animate-pulse"/>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && filteredTasks.length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', textAlign: 'center' }}>
              <div style={{ width: 48, height: 48, background: '#F9FAFB', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                <svg fill="none" viewBox="0 0 24 24" width={22} height={22} style={{ color: '#D1D5DB' }}>
                  <path d="M9 11l3 3L22 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <p style={{ fontSize: 13.5, fontWeight: 600, color: '#374151', marginBottom: 4 }}>No tasks yet</p>
              <p style={{ fontSize: 12.5, color: '#9CA3AF', marginBottom: 16 }}>Create your first task to get started</p>
              <button
                type="button"
                onClick={openCreateModal}
                style={{ display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 16px', background: '#7B3FF2', color: 'white', fontSize: 12.5, fontWeight: 600, borderRadius: 8, border: 'none', cursor: 'pointer' }}
              >
                <svg fill="none" viewBox="0 0 12 12" width={11} height={11}><path d="M6 1v10M1 6h10" stroke="white" strokeLinecap="round" strokeWidth="1.8"/></svg>
                Add Task
              </button>
            </div>
          )}

          {/* Task list — grouped or flat */}
          {!isLoading && (() => {
            // ── shared row renderer ───────────────────────────────────────────
            const renderRow = (task: Task, group: StatusGroup) => {
              const isDone     = group.closed && !group.blocked
              const isBlocked  = group.blocked
              const due        = fmtDue(task.dueDate)
              const pri        = PRIORITY[task.priority] ?? { dot: '#9CA3AF', text: '#6B7280', label: task.priority }
              const assignees  = task.assignedTo.length > 0 ? task.assignedTo : (task.owner ? [task.owner] : [])

              return (
                <div
                  key={task.id}
                  className="group"
                  style={{
                    height: 38,
                    display: 'flex',
                    alignItems: 'center',
                    paddingLeft: isBlocked ? 17 : 20,
                    paddingRight: 20,
                    borderLeft: isBlocked ? `3px solid ${group.dot}` : undefined,
                    borderBottom: '1px solid #F9FAFB',
                    background: 'white',
                    cursor: 'pointer',
                    transition: 'background 100ms',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#F9F8FF')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
                  onClick={() => setDetailTaskId(task.id)}
                >
                  {/* Checkbox */}
                  <div style={{ width: 28, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={isDone} onClick={() => setStatusChangeTarget(task)} />
                  </div>

                  {/* Name */}
                  <div style={{ flex: '0 1 640px', display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, paddingRight: 8 }}>
                    {task.isMilestone && (
                      <span style={{ width: 8, height: 8, background: '#F59E0B', transform: 'rotate(45deg)', borderRadius: 2, flexShrink: 0 }} />
                    )}
                    <span
                      style={{
                        fontSize: 12.5,
                        color: isDone ? '#9CA3AF' : '#111827',
                        textDecoration: isDone ? 'line-through' : 'none',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        transition: 'color 100ms',
                      }}
                      className="group-hover:!text-[#7B3FF2]"
                    >
                      {task.subject}
                    </span>
                    {task.parentTask && (
                      <span style={{ fontSize: 10, color: '#9CA3AF', flexShrink: 0 }}>↳ subtask</span>
                    )}
                  </div>

                  {/* Assignees */}
                  <div
                    style={{ width: 76, flexShrink: 0, padding: '0 4px' }}
                    onClick={(e) => { e.stopPropagation(); setAssigningTask(task) }}
                  >
                    {assignees.length > 0 ? (
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        {assignees.slice(0, 3).map((name, i) => (
                          <div key={name} style={{ marginLeft: i > 0 ? -6 : 0, zIndex: assignees.length - i }}>
                            <Avatar name={name} size={22} />
                          </div>
                        ))}
                        {assignees.length > 3 && (
                          <div style={{ marginLeft: -6, width: 22, height: 22, borderRadius: '50%', background: '#E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: '#6B7280', flexShrink: 0 }}>
                            +{assignees.length - 3}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ width: 22, height: 22, borderRadius: '50%', border: '1.5px dashed #D1D5DB', cursor: 'pointer', transition: 'border-color 100ms' }} className="hover:border-brand-400" />
                    )}
                  </div>

                  {/* Due date */}
                  <div style={{ width: 100, flexShrink: 0, padding: '0 4px' }}>
                    {due.text && (
                      <span style={{ fontSize: 12, fontWeight: due.color === '#EF4444' ? 600 : 400, color: due.color || '#6B7280' }}>
                        {due.text}
                      </span>
                    )}
                  </div>

                  {/* Priority */}
                  <div style={{ width: 100, flexShrink: 0, padding: '0 4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: pri.dot, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: pri.text }}>{pri.label}</span>
                    </div>
                  </div>

                  {/* Status pill */}
                  <div style={{ width: 120, flexShrink: 0, padding: '0 4px' }}>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setStatusChangeTarget(task) }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '3px 8px',
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 600,
                        background: group.hBg,
                        color: group.hText,
                        border: 'none',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: group.dot, flexShrink: 0 }} />
                      {group.label}
                    </button>
                  </div>

                  {/* Comments */}
                  <div style={{ width: 64, flexShrink: 0, padding: '0 4px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#D1D5DB', transition: 'color 100ms' }} className="group-hover:text-gray-400">
                      <svg fill="none" viewBox="0 0 14 14" width={12} height={12}>
                        <path d="M11 2H3a1 1 0 00-1 1v6a1 1 0 001 1h1l2 2 2-2h3a1 1 0 001-1V3a1 1 0 00-1-1z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                      </svg>
                    </span>
                  </div>

                  {/* + column */}
                  <div style={{ width: 28, flexShrink: 0 }}>
                    <svg fill="none" viewBox="0 0 12 12" width={11} height={11} style={{ color: '#E5E7EB', display: 'block', margin: '0 auto', transition: 'color 100ms' }} className="group-hover:text-gray-400">
                      <path d="M6 1v10M1 6h10" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5"/>
                    </svg>
                  </div>
                </div>
              )
            }

            // ── flat list (Group: None) ────────────────────────────────────────
            if (groupBy === 'none') {
              const flatTasks = grouped
                .filter(({ group }) => !(group.closed && !showClosed))
                .flatMap(({ group, tasks: gt }) => gt.map((t) => ({ task: t, group })))
              return (
                <>
                  {flatTasks.map(({ task, group }) => renderRow(task, group))}
                  <button
                    type="button"
                    onClick={openCreateModal}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 12,
                      color: '#9CA3AF',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      width: '100%',
                      height: 34,
                      paddingLeft: 52,
                      paddingRight: 20,
                      borderBottom: '1px solid #F9FAFB',
                      transition: 'background 100ms, color 100ms',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#F9FAFB'; e.currentTarget.style.color = '#6B7280' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9CA3AF' }}
                  >
                    <svg fill="none" viewBox="0 0 12 12" width={11} height={11}><path d="M6 1v10M1 6h10" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5"/></svg>
                    Add Task
                  </button>
                </>
              )
            }

            // ── grouped list (Group: Status) ──────────────────────────────────
            return grouped.map(({ group, tasks: groupTasks }) => {
              if (group.closed && !showClosed) return null

              const isCollapsed  = collapsed.has(group.key)
              const visibleTasks = groupTasks

              return (
                <div key={group.key}>

                  {/* ── Group header (sticky) ── */}
                  <div
                    style={{
                      position: 'sticky',
                      top: 32,
                      zIndex: 8,
                      height: 38,
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0 20px',
                      background: group.hBg,
                      borderBottom: '1px solid rgba(0,0,0,.04)',
                      gap: 8,
                      cursor: 'pointer',
                    }}
                    onClick={() => toggleCollapse(group.key)}
                  >
                    {/* Chevron */}
                    <svg
                      fill="none"
                      viewBox="0 0 10 10"
                      width="9"
                      height="9"
                      style={{
                        flexShrink: 0,
                        color: group.hText,
                        opacity: 0.6,
                        transform: isCollapsed ? 'rotate(-90deg)' : 'none',
                        transition: 'transform 150ms',
                      }}
                    >
                      <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.3"/>
                    </svg>

                    {/* Status dot */}
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: group.dot, flexShrink: 0 }} />

                    {/* Label */}
                    <span style={{ fontSize: 12, fontWeight: 700, color: group.hText, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {group.label}
                    </span>

                    {/* Count */}
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: group.hText,
                        opacity: 0.65,
                        background: `${group.dot}22`,
                        padding: '1px 7px',
                        borderRadius: 999,
                      }}
                    >
                      {visibleTasks.length}
                    </span>

                    <div style={{ flex: 1 }} />

                  </div>

                  {/* ── Task rows ── */}
                  {!isCollapsed && visibleTasks.map((task) => renderRow(task, group))}

             

                </div>
              )
            })
          })()}

          <div style={{ height: 40 }} />
        </div>
      </div>

      {/* ══ Pagination ══ */}
      {totalPages > 1 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 20px',
            borderTop: '1px solid #F3F4F6',
            background: 'white',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 12, color: '#9CA3AF' }}>
            {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredTasks.length)} of {filteredTasks.length} tasks
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              type="button"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => p - 1)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                height: 28, padding: '0 10px', fontSize: 12, fontWeight: 500,
                color: currentPage === 1 ? '#D1D5DB' : '#374151',
                background: 'white', border: '1px solid #E5E7EB',
                borderRadius: 6, cursor: currentPage === 1 ? 'default' : 'pointer',
              }}
            >
              <svg fill="none" viewBox="0 0 6 10" width={6} height={10}><path d="M5 1L1 5l4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Prev
            </button>

            {(() => {
              const pages: (number | '...')[] = []
              if (totalPages <= 7) {
                for (let i = 1; i <= totalPages; i++) pages.push(i)
              } else {
                pages.push(1)
                if (currentPage > 3) pages.push('...')
                for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) pages.push(i)
                if (currentPage < totalPages - 2) pages.push('...')
                pages.push(totalPages)
              }
              return pages.map((p, idx) =>
                p === '...'
                  ? <span key={`ellipsis-${idx}`} style={{ fontSize: 12, color: '#9CA3AF', padding: '0 4px' }}>…</span>
                  : (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setCurrentPage(p)}
                      style={{
                        height: 28, minWidth: 28, padding: '0 6px', fontSize: 12,
                        fontWeight: p === currentPage ? 700 : 400,
                        color: p === currentPage ? 'white' : '#374151',
                        background: p === currentPage ? '#7B3FF2' : 'white',
                        border: `1px solid ${p === currentPage ? '#7B3FF2' : '#E5E7EB'}`,
                        borderRadius: 6, cursor: 'pointer',
                      }}
                    >{p}</button>
                  )
              )
            })()}

            <button
              type="button"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => p + 1)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                height: 28, padding: '0 10px', fontSize: 12, fontWeight: 500,
                color: currentPage === totalPages ? '#D1D5DB' : '#374151',
                background: 'white', border: '1px solid #E5E7EB',
                borderRadius: 6, cursor: currentPage === totalPages ? 'default' : 'pointer',
              }}
            >
              Next
              <svg fill="none" viewBox="0 0 6 10" width={6} height={10}><path d="M1 1l4 4-4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          </div>
        </div>
      )}

      {/* ══ Modals ══ */}

      {/* Task detail modal */}
      {detailTaskId && (() => {
        const live = tasks.find((t) => t.id === detailTaskId)
        if (!live) return null
        const detailIdx = filteredTasks.findIndex((t) => t.id === detailTaskId)
        return (
          <TaskDetailModal
            allTasks={tasks}
            onAssign={(t) => setAssigningTask(t)}
            onClose={() => setDetailTaskId(null)}
            onPrev={detailIdx > 0 ? () => setDetailTaskId(filteredTasks[detailIdx - 1].id) : undefined}
            onNext={detailIdx < filteredTasks.length - 1 ? () => setDetailTaskId(filteredTasks[detailIdx + 1].id) : undefined}
            onStatusChange={(t) => setStatusChangeTarget(t)}
            onUpdate={(taskId, input) => {
              const enriched = input.status === 'Completed'
                ? { ...input, completedBy: input.completedBy || username || userFullName, completedOn: input.completedOn || new Date().toISOString().split('T')[0] }
                : input
              return updateTask(taskId, enriched)
            }}
            task={live}
          />
        )
      })()}

      {/* Assign modal */}
      {assigningTask && username && (() => {
        const live = tasks.find((t) => t.id === assigningTask.id) ?? assigningTask
        return (
          <AssignTaskModal
            currentUser={username}
            onAssign={(userId) => assignTask(live.id, userId)}
            onClose={() => setAssigningTask(null)}
            onUnassign={(userId) => unassignTask(live.id, userId)}
            task={live}
          />
        )
      })()}

      {/* Status-change modal */}
      {statusChangeTarget && (
        <StatusChangeModal
          currentStatus={statusChangeTarget.status}
          isSubmitting={isStatusChanging}
          onCancel={() => setStatusChangeTarget(null)}
          onConfirm={handleStatusChangeConfirm}
        />
      )}

      {/* Create modal */}
      {isCreateOpen && (
        <CreateTaskModal
          isSubmitting={createTaskStatus === 'submitting'}
          onClose={closeCreateModal}
          onSubmit={handleCreateTask}
          onSuccess={closeCreateModal}
          projects={projects}
          tasks={tasks}
          serverError={createTaskError}
        />
      )}

      {/* Edit modal */}
      {editingTaskId !== null && (() => {
        const stub = tasks.find((t) => t.id === editingTaskId)
        return (
          <div
            className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center animate-fade-in md:p-4"
            onClick={() => { if (!isEditSubmitting) closeEditModal() }}
          >
            <div
              className="relative flex bg-white w-full max-w-[1100px] h-[96vh] md:h-[calc(100vh-2rem)] md:rounded-xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* ══ Main content ══ */}
              <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                {/* Top bar */}
                <div className="flex-shrink-0 flex items-center gap-2 px-3 h-11 border-b border-slate-100 bg-white">
                  <div className="flex items-center gap-1.5 text-[12px] min-w-0">
                    <span className="hidden sm:inline text-slate-400 shrink-0">Team Space</span>
                    <span className="hidden sm:inline text-slate-200">/</span>
                    <span className="text-slate-600 font-medium truncate">
                      {stub?.project ?? 'Edit Task'}
                    </span>
                  </div>
                  <div className="ml-auto flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={closeEditModal}
                      disabled={isEditSubmitting}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors disabled:opacity-50"
                    >
                      <svg fill="none" viewBox="0 0 14 14" width="13" height="13">
                        <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5"/>
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Scrollable body */}
                <div className="flex-1 overflow-y-auto scrollbar-none">
                  <div className="px-7 pt-5 pb-6">
                    {editingTask ? (
                      <EditTaskForm
                        canEdit={myTaskIds.has(editingTask.id)}
                        isSubmitting={isEditSubmitting}
                        onCancel={closeEditModal}
                        onSubmit={handleEditSubmit}
                        onSuccess={closeEditModal}
                        projects={projects}
                        tasks={tasks}
                        serverError={editError}
                        task={editingTask}
                      />
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
                        <svg className="w-6 h-6 animate-spin text-brand-400" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z"/>
                        </svg>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ══ Right communication panel (collapsible, open by default) ══ */}
              <div
                className={[
                  'hidden md:flex flex-col border-l border-slate-100 bg-white flex-shrink-0 overflow-hidden',
                  'transition-[width] duration-300 ease-in-out',
                  editCommExpanded ? 'w-[320px]' : 'w-[52px]',
                ].join(' ')}
              >
                {/* Collapsed icon strip */}
                {!editCommExpanded && (
                  <div className="flex flex-col items-center w-[52px] py-3 gap-0.5 bg-slate-50/30">
                    <button
                      type="button"
                      onClick={() => { setEditCommTab('attachments'); setEditCommExpanded(true) }}
                      title="Open activity panel"
                      className="flex items-center justify-center w-9 h-9 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-indigo-500 transition-colors mb-1"
                    >
                      <svg fill="none" viewBox="0 0 16 16" width="14" height="14">
                        <path d="M10 3L6 8l4 5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"/>
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEditCommTab('attachments'); setEditCommExpanded(true) }}
                      title="Activity"
                      className="flex flex-col items-center gap-0.5 w-9 py-2.5 rounded-lg bg-white shadow-sm text-violet-600 border border-slate-100/80 transition-colors"
                    >
                      <svg fill="none" viewBox="0 0 14 14" width="15" height="15">
                        <path d="M11 2H3a1 1 0 00-1 1v6a1 1 0 001 1h1l2 2 2-2h3a1 1 0 001-1V3a1 1 0 00-1-1z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                      </svg>
                      <span className="text-[9px] font-medium leading-none">Activity</span>
                    </button>
                  </div>
                )}

                {/* Expanded panel */}
                {editCommExpanded && (
                  <div className="flex flex-col h-full w-[320px]">
                    {/* Panel header */}
                    <div className="flex-shrink-0 flex items-center gap-2 px-3 h-11 border-b border-slate-100">
                      <span className="flex-1 text-[13px] font-semibold text-slate-700">Activity</span>
                      <button
                        type="button"
                        onClick={() => setEditCommExpanded(false)}
                        title="Collapse panel"
                        className="flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                      >
                        <svg fill="none" viewBox="0 0 16 16" width="14" height="14">
                          <path d="M6 3l4 5-4 5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"/>
                        </svg>
                      </button>
                    </div>

                    {/* Tabs */}
                    <div className="flex-shrink-0 flex items-center border-b border-slate-100 px-3">
                      {(['attachments', 'activity', 'comments'] as const).map((tab) => (
                        <button
                          key={tab}
                          type="button"
                          onClick={() => setEditCommTab(tab)}
                          className={[
                            'px-3 py-2.5 text-[12px] font-medium capitalize border-b-2 -mb-px transition-colors',
                            editCommTab === tab
                              ? 'border-indigo-500 text-indigo-600'
                              : 'border-transparent text-slate-400 hover:text-slate-600',
                          ].join(' ')}
                        >
                          {tab === 'comments' ? 'Comments' : tab === 'activity' ? 'Activity' : 'Files'}
                        </button>
                      ))}
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto scrollbar-none">
                      {editCommTab === 'comments' && (
                        <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-10 px-5">
                          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-100 flex items-center justify-center shadow-sm">
                            <svg fill="none" viewBox="0 0 20 20" width="20" height="20" className="text-violet-500">
                              <path d="M16 2H4a1 1 0 00-1 1v9a1 1 0 001 1h2l3 3 3-3h4a1 1 0 001-1V3a1 1 0 00-1-1z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                              <path d="M7 7h6M7 10h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                            </svg>
                          </div>
                          <div>
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-violet-50 text-violet-600 text-[10px] font-bold uppercase tracking-wider">
                              ✦ Coming Soon
                            </span>
                            <p className="text-[13px] font-semibold text-slate-700 mt-2">Team Conversations</p>
                            <p className="text-[11.5px] text-slate-400 mt-1.5 leading-relaxed max-w-[210px] mx-auto">
                              Threaded replies, @mentions, emoji reactions, and smart notifications — all in context, right where the work happens.
                            </p>
                          </div>
                        </div>
                      )}
                      {editCommTab === 'activity' && (
                        <div className="flex flex-col items-center justify-center h-full gap-2 text-center py-10 px-4">
                          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                            <svg fill="none" viewBox="0 0 20 20" width="18" height="18" className="text-slate-400">
                              <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.4"/>
                              <path d="M10 6v4l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                            </svg>
                          </div>
                          <p className="text-[12.5px] font-medium text-slate-600">No activity yet</p>
                          <p className="text-[11.5px] text-slate-400">Activity will appear after saving</p>
                        </div>
                      )}
                      {editCommTab === 'attachments' && (
                        <div className="flex flex-col items-center justify-center h-full gap-2 text-center py-10 px-4">
                          <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
                            <svg fill="none" viewBox="0 0 16 16" width="14" height="14" className="text-slate-400">
                              <path d="M7 9a4 4 0 0 0 5.66.01l1.9-1.88a4 4 0 0 0-5.66-5.66L7.8 3.58" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4"/>
                              <path d="M9 7a4 4 0 0 0-5.66-.01L1.44 8.87a4 4 0 0 0 5.66 5.66l1.1-1.1" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4"/>
                            </svg>
                          </div>
                          <p className="text-[12px] text-slate-500 font-medium">No links yet</p>
                          <p className="text-[11px] text-slate-400">Links will appear after saving</p>
                        </div>
                      )}
                    </div>

                    {/* Composer — only for comments */}
                    {editCommTab === 'comments' && (
                      <div className="flex-shrink-0 border-t border-slate-100 p-3">
                        {editComingSoon && (
                          <div className="mb-2 px-3 py-2 rounded-lg bg-violet-50 border border-violet-100 text-[11.5px] text-violet-700 flex items-start gap-1.5">
                            <span className="flex-shrink-0 mt-px">✦</span>
                            <span>{editComingSoon}</span>
                          </div>
                        )}
                        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                          <textarea
                            readOnly
                            className="w-full px-3 pt-2.5 pb-1 text-[12.5px] text-slate-700 placeholder:text-slate-400 bg-transparent outline-none resize-none scrollbar-none cursor-not-allowed"
                            placeholder="Add a comment… (@ to mention)"
                            rows={3}
                            onClick={() => triggerEditComingSoon('Real-time comments with @mentions, file attachments, and threaded replies — coming soon.')}
                          />
                          <div className="flex items-center justify-between px-2 pb-2 pt-1 border-t border-slate-100">
                            <div className="flex items-center gap-0.5">
                              <button type="button" title="Bold" onClick={() => triggerEditComingSoon('Rich text formatting — bold, italic, inline code, lists, and more.')} className="w-6 h-6 flex items-center justify-center rounded text-slate-300 hover:text-violet-500 hover:bg-violet-50 transition-colors">
                                <svg fill="none" viewBox="0 0 12 12" width="11" height="11">
                                  <path d="M3 2h4a2 2 0 010 4H3zM3 6h4.5a2 2 0 010 4H3z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                                </svg>
                              </button>
                              <button type="button" title="Attach file" onClick={() => triggerEditComingSoon('Drag-and-drop files, image previews, and document storage directly on tasks.')} className="w-6 h-6 flex items-center justify-center rounded text-slate-300 hover:text-violet-500 hover:bg-violet-50 transition-colors">
                                <svg fill="none" viewBox="0 0 12 12" width="11" height="11">
                                  <path d="M10 5.5L6 9.5a3 3 0 01-4.2-4.2l5-5a1.7 1.7 0 012.4 2.4L4 7.9A1 1 0 012.6 6.5L7 2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.2"/>
                                </svg>
                              </button>
                              <button type="button" title="Mention" onClick={() => triggerEditComingSoon('@mention teammates to notify them instantly and loop them into the conversation.')} className="w-6 h-6 flex items-center justify-center rounded text-slate-300 hover:text-violet-500 hover:bg-violet-50 transition-colors">
                                <svg fill="none" viewBox="0 0 12 12" width="11" height="11">
                                  <circle cx="6" cy="5.5" r="1.8" stroke="currentColor" strokeWidth="1.2"/>
                                  <path d="M9.5 6A3.5 3.5 0 116 2.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.2"/>
                                  <path d="M9.5 6v1.2a1.3 1.3 0 002.5 0V6a6 6 0 10-2.5 4.8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.2"/>
                                </svg>
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() => triggerEditComingSoon('Send comments, updates, and questions — keep the whole conversation on the task.')}
                              className="h-6 px-2.5 bg-violet-100 hover:bg-violet-200 text-violet-600 text-[11.5px] font-medium rounded-lg transition-colors flex items-center gap-1"
                            >
                              Send
                              <svg fill="none" viewBox="0 0 10 10" width="9" height="9">
                                <path d="M2 5h6M5.5 2.5L8 5l-2.5 2.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.3"/>
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}
    </main>
  )
}
