import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { useAuthStore } from '../../../store/authStore'
import { useWorkStore } from '../../../store/workStore'
import { TaskDetailModal } from '../components/TaskDetailModal'
import { AssignTaskModal } from '../components/AssignTaskModal'
import { StatusChangeModal } from '../components/StatusChangeModal'
import { TasksHeader } from '../components/TasksHeader'
import { CreateTaskModal } from '../components/CreateTaskModal'
import type { Task, UpdateTaskInput, CreateTaskInput } from '../types/task.types'
import type { Project } from '../../projects/types/project.types'

// ─── Layout constants ──────────────────────────────────────────────────────

const DAY_W    = 40
const LEFT_W   = 280
const ROW_H    = 38
const GROUP_H  = 32
const HDR_H    = 52
const PADDING  = 14
const INDENT   = 16
const BASE_PAD = 14

// ─── Depth colour palette ──────────────────────────────────────────────────
// Each hierarchy level gets a distinct hue so users can instantly distinguish
// root tasks, subtasks, sub-subtasks, and deeper nesting.

const DEPTH_PALETTE = [
  { bar: '#7B3FF2', rowBg: 'rgba(123,63,242,0.05)', accent: '#c4b5fd', label: 'Root'    }, // depth 0
  { bar: '#2563EB', rowBg: 'rgba(37,99,235,0.05)',  accent: '#93c5fd', label: 'Sub'     }, // depth 1
  { bar: '#0891B2', rowBg: 'rgba(8,145,178,0.05)',  accent: '#7dd3fc', label: 'Sub²'    }, // depth 2
  { bar: '#059669', rowBg: 'rgba(5,150,105,0.05)',  accent: '#6ee7b7', label: 'Sub³+'   }, // depth 3+
] as const

const depthP = (d: number) => DEPTH_PALETTE[Math.min(d, DEPTH_PALETTE.length - 1)]

// ─── Date helpers ──────────────────────────────────────────────────────────

const sol = (d: Date): Date => { const r = new Date(d); r.setHours(0, 0, 0, 0); return r }

const diffDays = (a: Date, b: Date): number =>
  Math.round((sol(b).getTime() - sol(a).getTime()) / 86_400_000)

const addDays = (d: Date, n: number): Date => {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}

const fmtDate = (d: Date) =>
  d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

// ─── Colour helpers ────────────────────────────────────────────────────────

const isActiveStatus = (s: string) =>
  !s.toLowerCase().includes('complet') &&
  s.toLowerCase() !== 'cancelled' &&
  s.toLowerCase() !== 'closed'

function statusDot(status: string): string {
  const s = status.toLowerCase()
  if (s.includes('complet') || s === 'closed') return 'bg-emerald-400'
  if (s === 'working')                         return 'bg-amber-400'
  if (s.includes('pending'))                   return 'bg-violet-400'
  if (s === 'cancelled')                       return 'bg-slate-300'
  return 'bg-indigo-400'
}


// ─── Timeline builder ──────────────────────────────────────────────────────

interface MonthSeg { label: string; numDays: number }
interface DayCell  { label: string; isToday: boolean; isWeekend: boolean }

function buildTimeline(rangeStart: Date, totalDays: number, today: Date) {
  const months: MonthSeg[] = []
  const days: DayCell[]    = []
  let prevMonth = -1
  for (let i = 0; i < totalDays; i++) {
    const date = addDays(rangeStart, i)
    const m    = date.getMonth()
    if (m !== prevMonth) {
      months.push({ label: date.toLocaleString('default', { month: 'short', year: 'numeric' }), numDays: 0 })
      prevMonth = m
    }
    months[months.length - 1].numDays++
    const dow = date.getDay()
    days.push({
      label:     String(date.getDate()),
      isToday:   diffDays(rangeStart, today) === i,
      isWeekend: dow === 0 || dow === 6,
    })
  }
  return { months, days }
}

// ─── Bar geometry ──────────────────────────────────────────────────────────

interface Bar { left: number; width: number }

function getBar(task: Task, rangeStart: Date, totalDays: number): Bar | null {
  const s = task.startDate ? sol(new Date(task.startDate)) : null
  const e = task.dueDate   ? sol(new Date(task.dueDate))   : null
  if (!s && !e) return null
  const barS = s ?? e!
  const barE = e ?? s!
  const px0 = diffDays(rangeStart, barS) * DAY_W
  const px1 = (diffDays(rangeStart, barE) + 1) * DAY_W
  const cl  = Math.max(0, px0)
  const cr  = Math.min(totalDays * DAY_W, px1)
  if (cr <= cl) return null
  return { left: cl, width: Math.max(cr - cl, DAY_W * 0.5) }
}

// ─── Bar drag helpers ──────────────────────────────────────────────────────

type DragType = 'move' | 'resize-left' | 'resize-right'

interface BarDragState {
  taskId:   string
  type:     DragType
  startX:   number   // client X at drag start
  startBar: Bar      // bar geometry at drag start
  startTask: Task    // task snapshot at drag start
}

/** Compute the visual preview bar during a drag. */
function getPreviewBar(type: DragType, startBar: Bar, deltaDays: number): Bar {
  const dx = deltaDays * DAY_W
  const MIN = DAY_W / 2
  if (type === 'move') {
    return { left: startBar.left + dx, width: startBar.width }
  }
  if (type === 'resize-left') {
    const newLeft  = startBar.left + dx
    const newWidth = startBar.width - dx
    if (newWidth < MIN) return { left: startBar.left + startBar.width - MIN, width: MIN }
    return { left: newLeft, width: newWidth }
  }
  // resize-right
  return { left: startBar.left, width: Math.max(startBar.width + dx, MIN) }
}

/** Build the tooltip label shown above the bar while dragging. */
function getDragTooltip(task: Task, type: DragType, deltaDays: number): string {
  let s = task.startDate ? sol(new Date(task.startDate)) : null
  let e = task.dueDate   ? sol(new Date(task.dueDate))   : null

  if (type === 'move') {
    if (s) s = addDays(s, deltaDays)
    if (e) e = addDays(e, deltaDays)
  } else if (type === 'resize-left' && s) {
    s = addDays(s, deltaDays)
    if (e && s >= e) s = addDays(e, -1)
  } else if (type === 'resize-right' && e) {
    e = addDays(e, deltaDays)
    if (s && e <= s) e = addDays(s, 1)
  }

  if (s && e) return `${fmtDate(s)} – ${fmtDate(e)}`
  if (s) return fmtDate(s)
  if (e) return fmtDate(e)
  return ''
}

/** Compute the new date fields to send to updateTask after a drag. */
function computeNewDates(task: Task, type: DragType, deltaDays: number) {
  let s = task.startDate ? sol(new Date(task.startDate)) : null
  let e = task.dueDate   ? sol(new Date(task.dueDate))   : null

  if (type === 'move') {
    if (s) s = addDays(s, deltaDays)
    if (e) e = addDays(e, deltaDays)
  } else if (type === 'resize-left' && s) {
    s = addDays(s, deltaDays)
    if (e && s >= e) s = addDays(e, -1)
  } else if (type === 'resize-right' && e) {
    e = addDays(e, deltaDays)
    if (s && e <= s) e = addDays(s, 1)
  }

  const fmt = (d: Date) => d.toISOString().split('T')[0]
  return { startDate: s ? fmt(s) : undefined, dueDate: e ? fmt(e) : undefined }
}

// ─── Tree types & builders ─────────────────────────────────────────────────

interface TreeNode { task: Task; children: TreeNode[] }

interface FlatRow {
  task:            Task
  depth:           number
  hasChildren:     boolean
  isLast:          boolean
  parentContinues: boolean[]
}

function buildTree(tasks: Task[]): TreeNode[] {
  const map = new Map<string, TreeNode>()
  tasks.forEach((t) => map.set(t.id, { task: t, children: [] }))
  const roots: TreeNode[] = []
  tasks.forEach((t) => {
    const node = map.get(t.id)!
    if (t.parentTask && map.has(t.parentTask)) {
      map.get(t.parentTask)!.children.push(node)
    } else {
      roots.push(node)
    }
  })
  return roots
}

function flattenTree(
  nodes:           TreeNode[],
  collapsedIds:    Set<string>,
  depth            = 0,
  parentContinues: boolean[] = [],
): FlatRow[] {
  const rows: FlatRow[] = []
  nodes.forEach((node, idx) => {
    const isLast      = idx === nodes.length - 1
    const hasChildren = node.children.length > 0
    rows.push({ task: node.task, depth, hasChildren, isLast, parentContinues })
    if (hasChildren && !collapsedIds.has(node.task.id)) {
      rows.push(
        ...flattenTree(node.children, collapsedIds, depth + 1, [...parentContinues, !isLast]),
      )
    }
  })
  return rows
}

// ─── Group ─────────────────────────────────────────────────────────────────

interface Group { id: string; name: string; rows: FlatRow[] }

// ─── Page ───────────────────────────────────────────────────────────────────

export function TaskGanttPage() {
  const username      = useAuthStore((s) => s.user?.username)
  const userFullName  = useAuthStore((s) => s.user?.fullName)
  const tasks         = useWorkStore((s) => s.tasks)
  const projects      = useWorkStore((s) => s.projects)
  const status        = useWorkStore((s) => s.status)
  const updateTask    = useWorkStore((s) => s.updateTask)
  const assignTask    = useWorkStore((s) => s.assignTask)
  const unassignTask  = useWorkStore((s) => s.unassignTask)
  const loadWorkspace = useWorkStore((s) => s.loadWorkspace)
  const createTask        = useWorkStore((s) => s.createTask)
  const createTaskStatus  = useWorkStore((s) => s.createTaskStatus)
  const createTaskError   = useWorkStore((s) => s.createTaskError)
  const resetTaskFeedback = useWorkStore((s) => s.resetTaskFeedback)

  const today = useMemo(() => sol(new Date()), [])

  // ── Filters ───────────────────────────────────────────────────────────────
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

  const projectMap = useMemo(() => {
    const m = new Map<string, Project>()
    projects.forEach((p) => m.set(p.name, p))
    return m
  }, [projects])

  const filteredTasks = useMemo(() => {
    let t = tasks
    if (myTasksOnly && username) t = t.filter((tk) => myTaskIds.has(tk.id))
    if (projectFilter !== 'all')  t = t.filter((tk) => tk.project === projectFilter)
    if (!showClosed) t = t.filter((tk) => isActiveStatus(tk.status))
    return t
  }, [tasks, myTasksOnly, myTaskIds, projectFilter, username, showClosed])

  const datedTasks = useMemo(
    () => filteredTasks.filter((t) => t.startDate || t.dueDate),
    [filteredTasks],
  )

  // ── Date range ─────────────────────────────────────────────────────────────
  const { rangeStart, totalDays } = useMemo(() => {
    const dates: number[] = [today.getTime()]
    datedTasks.forEach((t) => {
      if (t.startDate) dates.push(sol(new Date(t.startDate)).getTime())
      if (t.dueDate)   dates.push(sol(new Date(t.dueDate)).getTime())
    })
    const rs = sol(addDays(new Date(Math.min(...dates)), -PADDING))
    const re = sol(addDays(new Date(Math.max(...dates)),  PADDING))
    return { rangeStart: rs, totalDays: Math.max(diffDays(rs, re) + 1, 60) }
  }, [datedTasks, today])

  const totalWidth = totalDays * DAY_W
  const todayX     = useMemo(() => diffDays(rangeStart, today) * DAY_W, [rangeStart, today])

  const { months, days } = useMemo(
    () => buildTimeline(rangeStart, totalDays, today),
    [rangeStart, totalDays, today],
  )

  // ── Tree / collapse ────────────────────────────────────────────────────────
  const [collapsedIds, setCollapsedIds] = useState(new Set<string>())
  const toggleCollapse = (id: string) =>
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  // ── Groups (tree-structured per project) ──────────────────────────────────
  const groups = useMemo((): Group[] => {
    const map  = new Map<string, Task[]>()
    const none: Task[] = []
    filteredTasks.forEach((t) => {
      if (t.project) {
        if (!map.has(t.project)) map.set(t.project, [])
        map.get(t.project)!.push(t)
      } else {
        none.push(t)
      }
    })
    const sorted = [...map.keys()].sort((a, b) => {
      const na = projectMap.get(a)?.displayName ?? a
      const nb = projectMap.get(b)?.displayName ?? b
      return na.localeCompare(nb)
    })
    const toGroup = (pid: string, taskList: Task[]): Group => ({
      id:   pid,
      name: projectMap.get(pid)?.displayName || projectMap.get(pid)?.name || pid,
      rows: flattenTree(buildTree(taskList), collapsedIds),
    })
    const result = sorted.map((pid) => toGroup(pid, map.get(pid)!))
    if (none.length) result.push({ id: '__none', name: 'No Project', rows: flattenTree(buildTree(none), collapsedIds) })
    return result
  }, [filteredTasks, projectMap, collapsedIds])

  // ── Row Y map & bar map (for SVG arrows) ─────────────────────────────────
  const rowYMap = useMemo(() => {
    const m = new Map<string, number>()
    let y = HDR_H
    groups.forEach((g) => { y += GROUP_H; g.rows.forEach((r) => { m.set(r.task.id, y); y += ROW_H }) })
    return m
  }, [groups])

  const barMap = useMemo(() => {
    const m = new Map<string, Bar>()
    filteredTasks.forEach((t) => { const b = getBar(t, rangeStart, totalDays); if (b) m.set(t.id, b) })
    return m
  }, [filteredTasks, rangeStart, totalDays])

  // ── Derived progress for parent tasks ─────────────────────────────────────
  // For any task that has children, we compute fill % recursively:
  //   pct(task) = average of pct(children)
  //   pct(leaf) = 100 if done, else task.progress
  // This means a root bar fills proportionally as subtasks get completed.
  const computedProgressMap = useMemo(() => {
    const childrenOf = new Map<string, string[]>()
    const taskById   = new Map<string, Task>()
    filteredTasks.forEach((t) => {
      taskById.set(t.id, t)
      if (t.parentTask) {
        if (!childrenOf.has(t.parentTask)) childrenOf.set(t.parentTask, [])
        childrenOf.get(t.parentTask)!.push(t.id)
      }
    })
    function pct(id: string): number {
      const children = childrenOf.get(id) ?? []
      if (children.length === 0) {
        const t = taskById.get(id)
        if (!t) return 0
        return !isActiveStatus(t.status) ? 100 : t.progress
      }
      return children.reduce((sum, cId) => sum + pct(cId), 0) / children.length
    }
    const m = new Map<string, number>()
    filteredTasks.forEach((t) => {
      if (childrenOf.has(t.id)) m.set(t.id, Math.round(pct(t.id)))
    })
    return m
  }, [filteredTasks])

  const allRows = useMemo(() => groups.flatMap((g) => g.rows), [groups])

  const connectionArrows = useMemo(() => allRows.flatMap((row) => {
    if (!row.task.parentTask) return []
    const pBar  = barMap.get(row.task.parentTask)
    const cBar  = barMap.get(row.task.id)
    const pRowY = rowYMap.get(row.task.parentTask)
    const cRowY = rowYMap.get(row.task.id)
    if (!pBar || !cBar || pRowY === undefined || cRowY === undefined) return []
    const x1   = pBar.left - 2
    const x2   = cBar.left - 2
    const y1   = pRowY - HDR_H + ROW_H / 2
    const y2   = cRowY - HDR_H + ROW_H / 2
    const midX = Math.min(x1, x2) - 12
    return [{ key: `${row.task.parentTask}→${row.task.id}`, d: `M${x1} ${y1} H${midX} V${y2} H${x2}` }]
  }), [allRows, barMap, rowYMap])

  const svgH = useMemo(
    () => groups.reduce((acc, g) => acc + GROUP_H + g.rows.length * ROW_H, 0) + 16,
    [groups],
  )

  // ── Auto-scroll to today ──────────────────────────────────────────────────
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!scrollRef.current || status === 'loading') return
    const target = LEFT_W + todayX - scrollRef.current.clientWidth / 2 + DAY_W / 2
    scrollRef.current.scrollLeft = Math.max(0, target)
  }, [status, todayX])

  // ── Bar drag ──────────────────────────────────────────────────────────────
  // Ref holds the drag state for use in document-level handlers (avoids stale closures).
  const barDragRef                              = useRef<BarDragState | null>(null)
  const [barDragState, setBarDragState]         = useState<BarDragState | null>(null)
  // Keep a ref to the live tasks array so the onUp handler can clamp dates to parent bounds
  // without a stale closure (tasks changes on each workspace poll).
  const tasksRef = useRef(tasks)
  useEffect(() => { tasksRef.current = tasks }, [tasks])
  const [dragDeltaDays, setDragDeltaDays]       = useState(0)
  const [detailTaskId, setDetailTaskId]         = useState<string | null>(null)

  function startBarDrag(e: React.MouseEvent, task: Task, bar: Bar, type: DragType) {
    e.stopPropagation()
    e.preventDefault()
    const state: BarDragState = { taskId: task.id, type, startX: e.clientX, startBar: bar, startTask: task }
    barDragRef.current = state
    setBarDragState(state)
    setDragDeltaDays(0)
  }

  // Attach global mousemove / mouseup only while a bar drag is active.
  useEffect(() => {
    if (!barDragState) return

    function onMove(e: MouseEvent) {
      const drag = barDragRef.current
      if (!drag) return
      setDragDeltaDays(Math.round((e.clientX - drag.startX) / DAY_W))
    }

    function onUp(e: MouseEvent) {
      const drag = barDragRef.current
      if (!drag) return

      const pixelDelta = Math.abs(e.clientX - drag.startX)
      const deltaDays  = Math.round((e.clientX - drag.startX) / DAY_W)

      // Clear drag state first so the bar snaps back to its saved position.
      barDragRef.current = null
      setBarDragState(null)
      setDragDeltaDays(0)

      if (pixelDelta < 5) {
        // Treat as a click — open detail.
        setDetailTaskId(drag.taskId)
      } else if (deltaDays !== 0) {
        let dates = computeNewDates(drag.startTask, drag.type, deltaDays)

        // Clamp to parent task bounds to avoid ERPNext 417 InvalidDates error.
        // ERPNext enforces exp_end_date <= parent.exp_end_date on every save.
        const parent = drag.startTask.parentTask
          ? tasksRef.current.find((t) => t.id === drag.startTask.parentTask)
          : null
        if (parent) {
          if (parent.dueDate && dates.dueDate && new Date(dates.dueDate) > new Date(parent.dueDate)) {
            dates = { ...dates, dueDate: parent.dueDate }
          }
          if (parent.startDate && dates.startDate && new Date(dates.startDate) < new Date(parent.startDate)) {
            dates = { ...dates, startDate: parent.startDate }
          }
        }

        // After clamping, ensure start < end — clamping one side can invert them.
        // ERPNext enforces exp_end_date > exp_start_date; skip the save if invalid.
        if (dates.startDate && dates.dueDate && new Date(dates.startDate) >= new Date(dates.dueDate)) {
          return
        }

        void updateTask(drag.taskId, {
          subject:  drag.startTask.subject,
          status:   drag.startTask.status,
          priority: drag.startTask.priority,
          ...dates,
        })
      }
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup',   onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup',   onUp)
    }
  }, [barDragState, updateTask])

  // ── Modals (other than detail which is above) ────────────────────────────
  const [assigningTask,      setAssigningTask]      = useState<Task | null>(null)
  const [statusChangeTarget, setStatusChangeTarget] = useState<Task | null>(null)
  const [isStatusChanging,   setIsStatusChanging]   = useState(false)

  const handleUpdate = async (taskId: string, input: UpdateTaskInput) => {
    const enriched = input.status === 'Completed'
      ? { ...input, completedBy: input.completedBy || username || userFullName, completedOn: input.completedOn || new Date().toISOString().split('T')[0] }
      : input
    return updateTask(taskId, enriched)
  }

  const handleAssign   = async (userId: string) => assigningTask ? assignTask(assigningTask.id, userId)   : false
  const handleUnassign = async (userId: string) => assigningTask ? unassignTask(assigningTask.id, userId) : false

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

  const openCreateModal  = () => { resetTaskFeedback(); setIsCreateOpen(true) }
  const closeCreateModal = () => { if (createTaskStatus === 'submitting') return; setIsCreateOpen(false) }
  const handleCreateTask = (input: CreateTaskInput) => username ? createTask(input, username) : Promise.resolve(false)

  // ── Chart drag-to-scroll ──────────────────────────────────────────────────
  const [chartDragging, setChartDragging] = useState(false)
  const dragOrigin = useRef({ x: 0, scrollLeft: 0, moved: false })

  const onChartMouseDown = (e: React.MouseEvent) => {
    // Don't start chart scroll when a bar drag is being initiated.
    if (barDragRef.current) return
    if (!scrollRef.current) return
    dragOrigin.current = { x: e.clientX, scrollLeft: scrollRef.current.scrollLeft, moved: false }
    setChartDragging(true)
  }
  const onChartMouseMove = (e: React.MouseEvent) => {
    if (!chartDragging || !scrollRef.current) return
    const dx = e.clientX - dragOrigin.current.x
    if (Math.abs(dx) > 3) dragOrigin.current.moved = true
    scrollRef.current.scrollLeft = dragOrigin.current.scrollLeft - dx
  }
  const onChartMouseUp = () => setChartDragging(false)

  // ── Derived ───────────────────────────────────────────────────────────────
  const isLoading    = status === 'loading'
  const totalCount   = filteredTasks.length
  const overdueCount = useMemo(() => {
    const t = new Date(); t.setHours(0, 0, 0, 0)
    return filteredTasks.filter((tk) => tk.dueDate && isActiveStatus(tk.status) && new Date(tk.dueDate) < t).length
  }, [filteredTasks])

  // Cursor class for the chart scroll area
  const chartCursor = barDragState
    ? barDragState.type === 'move' ? 'cursor-grabbing' : 'cursor-ew-resize'
    : chartDragging ? 'cursor-grabbing' : 'cursor-grab'

  // ─────────────────────────────────────────────────────────────────────────
  return (
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

      {/* ── Chart area ─────────────────────────────────────────────────── */}
      {isLoading ? (

        <div className="flex-1 min-h-0 mx-4 mb-4 md:mx-6 bg-white rounded-xl border border-slate-200 overflow-hidden animate-pulse" style={{ minHeight: 320 }}>
          <div className="flex border-b border-slate-200" style={{ height: HDR_H }}>
            <div className="bg-white border-r border-slate-200 flex-shrink-0" style={{ width: LEFT_W }} />
            <div className="flex-1 bg-slate-50/60" />
          </div>
          {[80, 60, 100, 70, 90, 55, 75].map((w, i) => (
            <div key={i} className="flex border-b border-slate-100" style={{ height: ROW_H }}>
              <div className="bg-white border-r border-slate-100 flex items-center px-4 gap-2 flex-shrink-0" style={{ width: LEFT_W }}>
                <div className="w-1.5 h-1.5 rounded-full bg-slate-200 flex-shrink-0" />
                <div className="h-3 bg-slate-100 rounded flex-1" style={{ maxWidth: `${w}%` }} />
              </div>
              <div className="flex-1 relative">
                <div className="absolute top-1/2 -translate-y-1/2 h-5 bg-slate-100 rounded-full" style={{ left: 40 + i * 28, width: 60 + (i % 3) * 40 }} />
              </div>
            </div>
          ))}
        </div>

      ) : filteredTasks.length === 0 ? (

        <div className="flex-1 flex items-center justify-center px-4 md:px-6" style={{ minHeight: 320 }}>
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center max-w-sm">
            <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-slate-300" fill="none" viewBox="0 0 24 24">
                <rect x="3" y="5.5"  width="8"  height="2.5" rx="1.25" stroke="currentColor" strokeWidth="1.8" />
                <rect x="8" y="11"   width="10" height="2.5" rx="1.25" stroke="currentColor" strokeWidth="1.8" />
                <rect x="5" y="16.5" width="7"  height="2.5" rx="1.25" stroke="currentColor" strokeWidth="1.8" />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-600">No tasks</p>
            <p className="text-xs text-slate-400 mt-1">
              {myTasksOnly ? 'No tasks assigned to you' : 'No tasks found'}
            </p>
          </div>
        </div>

      ) : (

        <div className="flex-1 min-h-0 flex flex-col mx-4 mb-4 md:mx-6 bg-white rounded-xl border border-slate-200 overflow-hidden" style={{ minHeight: 320 }}>
          <div
            ref={scrollRef}
            className={`flex-1 overflow-auto scrollbar-none ${chartCursor} ${barDragState || chartDragging ? 'select-none' : ''}`}
            onMouseDown={onChartMouseDown}
            onMouseMove={onChartMouseMove}
            onMouseUp={onChartMouseUp}
            onMouseLeave={onChartMouseUp}
          >
            <div className="relative" style={{ width: LEFT_W + totalWidth }}>

              {/* ══ STICKY HEADER ══ */}
              <div className="sticky top-0 z-20 flex bg-white border-b border-slate-200" style={{ height: HDR_H }}>
                <div
                  className="sticky left-0 z-30 bg-white flex-shrink-0 flex flex-col justify-end px-4 pb-2 border-r border-slate-200 gap-1"
                  style={{ width: LEFT_W }}
                >
                  {/* Depth legend */}
                  <div className="flex items-center gap-2.5">
                    {DEPTH_PALETTE.map((p, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-[2px] flex-shrink-0" style={{ background: p.bar }} />
                        <span className="text-[9px] font-medium text-slate-400">{p.label}</span>
                      </div>
                    ))}
                  </div>
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Task</span>
                </div>
                <div className="flex-shrink-0 flex flex-col overflow-hidden" style={{ width: totalWidth }}>
                  <div className="flex border-b border-slate-100" style={{ height: 26 }}>
                    {months.map((m, i) => (
                      <div
                        key={i}
                        className="flex-shrink-0 flex items-center px-2.5 border-r border-slate-100 last:border-r-0 overflow-hidden"
                        style={{ width: m.numDays * DAY_W }}
                      >
                        {m.numDays * DAY_W >= 48 && (
                          <span className="text-[11px] font-semibold text-slate-600 truncate">{m.label}</span>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="flex" style={{ height: 26 }}>
                    {days.map((d, i) => (
                      <div
                        key={i}
                        className={[
                          'flex-shrink-0 flex items-center justify-center text-[10px] font-medium select-none',
                          d.isToday    ? 'bg-indigo-500 text-white font-bold rounded-sm'
                          : d.isWeekend ? 'text-slate-300 bg-slate-50/60'
                          :               'text-slate-400',
                        ].join(' ')}
                        style={{ width: DAY_W }}
                      >
                        {d.label}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ══ GROUPS ══ */}
              {groups.map((group) => (
                <Fragment key={group.id}>

                  {/* Group header */}
                  <div className="sticky z-10 flex border-b border-slate-200 bg-slate-50" style={{ height: GROUP_H, top: HDR_H }}>
                    <div
                      className="sticky left-0 z-20 flex items-center gap-2 px-4 flex-shrink-0 bg-slate-50 border-r border-slate-200"
                      style={{ width: LEFT_W }}
                    >
                      <span className="w-1.5 h-1.5 rounded-sm bg-indigo-500 flex-shrink-0" />
                      <span className="text-[11px] font-semibold text-slate-600 truncate flex-1">{group.name}</span>
                      <span className="text-[10px] text-slate-400 flex-shrink-0">{group.rows.length}</span>
                    </div>
                    <div className="flex-shrink-0 relative" style={{ width: totalWidth }}>
                      {days.map((d, i) => d.isWeekend && (
                        <div key={i} className="absolute inset-y-0 bg-slate-100/50 pointer-events-none" style={{ left: i * DAY_W, width: DAY_W }} />
                      ))}
                      <div className="absolute inset-y-0 w-px bg-rose-300/60 pointer-events-none" style={{ left: todayX }} />
                    </div>
                  </div>

                  {/* Task rows */}
                  {group.rows.map((row) => {
                    const { task, depth, hasChildren, isLast, parentContinues } = row
                    const bar              = getBar(task, rangeStart, totalDays)
                    const done             = !isActiveStatus(task.status)
                    const isCollapsed      = collapsedIds.has(task.id)
                    // For parent tasks: fill derived from children completion. For leaves: own progress (or 100 if done).
                    const effectiveProgress = computedProgressMap.get(task.id) ?? (done ? 100 : task.progress)

                    // Bar drag: compute visual position during drag
                    const isDraggingThis = barDragState?.taskId === task.id
                    const displayBar     = isDraggingThis && bar
                      ? getPreviewBar(barDragState!.type, barDragState!.startBar, dragDeltaDays)
                      : bar
                    const tooltipText = isDraggingThis && bar && dragDeltaDays !== 0
                      ? getDragTooltip(task, barDragState!.type, dragDeltaDays)
                      : null

                    return (
                      <div
                        key={task.id}
                        className="flex border-b border-slate-100/80 transition-colors group/row"
                        style={{ height: ROW_H }}
                      >

                        {/* ── Label cell (sticky left) ── */}
                        <div
                          className="sticky left-0 z-10 flex-shrink-0 border-r border-slate-100 cursor-pointer transition-colors relative overflow-hidden group-hover/row:brightness-[0.96]"
                          style={{
                            width: LEFT_W,
                            height: ROW_H,
                            background: depthP(depth).rowBg,
                            borderLeft: `3px solid ${depthP(depth).accent}`,
                          }}
                          onClick={() => { if (!dragOrigin.current.moved) setDetailTaskId(task.id) }}
                        >
                          {/* Tree guide lines */}
                          {depth > 0 && (
                            <>
                              {Array.from({ length: depth - 1 }).map((_, i) =>
                                parentContinues[i] ? (
                                  <div key={`av${i}`} className="absolute pointer-events-none" style={{ left: BASE_PAD + i * INDENT + INDENT / 2, top: 0, width: 1, height: ROW_H, background: '#e2e8f0' }} />
                                ) : null
                              )}
                              <div className="absolute pointer-events-none" style={{ left: BASE_PAD + (depth - 1) * INDENT + INDENT / 2, top: 0, width: 1, height: isLast ? ROW_H / 2 : ROW_H, background: '#e2e8f0' }} />
                              <div className="absolute pointer-events-none" style={{ left: BASE_PAD + (depth - 1) * INDENT + INDENT / 2, top: ROW_H / 2, width: INDENT / 2 + 2, height: 1, background: '#e2e8f0' }} />
                            </>
                          )}

                          {/* Row content */}
                          <div
                            className="flex items-center gap-1.5 h-full pr-3 overflow-hidden"
                            style={{ paddingLeft: BASE_PAD + depth * INDENT }}
                          >
                            {hasChildren ? (
                              <button
                                type="button"
                                className="w-4 h-4 flex-shrink-0 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                                onClick={(e) => { e.stopPropagation(); toggleCollapse(task.id) }}
                                aria-label={isCollapsed ? 'Expand' : 'Collapse'}
                              >
                                <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden>
                                  {isCollapsed
                                    ? <path d="M3 1.5l3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                                    : <path d="M1.5 3l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                                  }
                                </svg>
                              </button>
                            ) : (
                              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusDot(task.status)}`} />
                            )}
                            <span className={['text-[12px] flex-1 truncate leading-tight', done ? 'text-slate-400 line-through' : 'text-slate-700'].join(' ')}>
                              {task.isMilestone && <span className="inline-block w-2 h-2 bg-amber-400 rotate-45 rounded-[2px] mr-1.5 align-middle" />}
                              {task.subject}
                            </span>
                          </div>
                        </div>

                        {/* ── Timeline cell ── */}
                        <div className="relative flex-shrink-0" style={{ width: totalWidth }}>

                          {/* Weekend shading */}
                          {days.map((d, i) => d.isWeekend && (
                            <div key={i} className="absolute inset-y-0 bg-slate-100/30 pointer-events-none" style={{ left: i * DAY_W, width: DAY_W }} />
                          ))}

                          {/* Today line */}
                          <div className="absolute inset-y-0 w-px bg-rose-300/60 pointer-events-none" style={{ left: todayX }} />

                          {/* ── Gantt bar ── */}
                          {displayBar && (
                            <div
                              className="absolute top-1/2 -translate-y-1/2 group/bar"
                              style={{ left: displayBar.left + 2, width: Math.max(displayBar.width - 4, 8), height: 20 }}
                            >
                              {/* Gray shell — depth colour fills left-to-right by progress % */}
                              <div
                                className={[
                                  'absolute inset-0 rounded-full overflow-hidden flex items-center select-none',
                                  isDraggingThis ? 'ring-2 ring-white/40 ring-inset' : 'hover:brightness-95 active:brightness-90',
                                ].join(' ')}
                                style={{
                                  cursor: isDraggingThis && barDragState!.type === 'move' ? 'grabbing' : 'grab',
                                  background: '#CBD5E1',
                                  opacity: done ? 0.55 : isDraggingThis ? 0.75 : 1,
                                }}
                                onMouseDown={(e) => { e.stopPropagation(); if (!barDragState) startBarDrag(e, task, bar!, 'move') }}
                              >
                                {/* Depth-coloured progress fill */}
                                {effectiveProgress > 0 && (
                                  <div
                                    className="absolute inset-y-0 left-0 rounded-full pointer-events-none"
                                    style={{ width: `${effectiveProgress}%`, background: depthP(depth).bar }}
                                  />
                                )}
                                {/* Label — white when inside the fill, depth-coloured on the gray portion */}
                                {displayBar.width > 64 && (
                                  <span
                                    className="relative pl-2.5 pr-2 text-[10px] font-semibold truncate leading-none whitespace-nowrap pointer-events-none"
                                    style={{ color: effectiveProgress > 25 ? 'white' : depthP(depth).bar }}
                                  >
                                    {task.subject}
                                  </span>
                                )}
                              </div>

                              {/* Left resize handle — visible on hover, hidden during drag */}
                              {!isDraggingThis && (Math.max(displayBar.width - 4, 8)) >= 18 && (
                                <div
                                  className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-full z-10 opacity-0 group-hover/bar:opacity-100 transition-opacity"
                                  style={{ background: 'rgba(0,0,0,0.28)', cursor: 'ew-resize' }}
                                  onMouseDown={(e) => { e.stopPropagation(); startBarDrag(e, task, bar!, 'resize-left') }}
                                />
                              )}

                              {/* Right resize handle */}
                              {!isDraggingThis && (Math.max(displayBar.width - 4, 8)) >= 18 && (
                                <div
                                  className="absolute right-0 top-0 bottom-0 w-1.5 rounded-r-full z-10 opacity-0 group-hover/bar:opacity-100 transition-opacity"
                                  style={{ background: 'rgba(0,0,0,0.28)', cursor: 'ew-resize' }}
                                  onMouseDown={(e) => { e.stopPropagation(); startBarDrag(e, task, bar!, 'resize-right') }}
                                />
                              )}

                              {/* Date tooltip (shown while dragging with non-zero delta) */}
                              {tooltipText && (
                                <div
                                  className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10.5px] font-medium px-2.5 py-1 rounded-lg whitespace-nowrap pointer-events-none z-50"
                                  style={{ boxShadow: '0 4px 14px rgba(0,0,0,0.35)' }}
                                >
                                  {tooltipText}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Overdue completion line — task was completed after its due date */}
                          {!isDraggingThis && task.completedOn && task.dueDate && bar && (() => {
                            const compDate = sol(new Date(task.completedOn))
                            const dueDate  = sol(new Date(task.dueDate))
                            if (compDate <= dueDate) return null
                            const lineStart   = bar.left + bar.width
                            const lineEnd     = Math.min((diffDays(rangeStart, compDate) + 1) * DAY_W, totalDays * DAY_W)
                            if (lineEnd <= lineStart) return null
                            const overdueDays = diffDays(dueDate, compDate)
                            return (
                              <div
                                className="absolute pointer-events-none z-10"
                                style={{ left: lineStart, top: '50%', transform: 'translateY(-50%)', width: lineEnd - lineStart, height: 20 }}
                                title={`Completed ${overdueDays} day${overdueDays !== 1 ? 's' : ''} late`}
                              >
                                {/* Red dashed line */}
                                <div
                                  className="absolute rounded-r-full"
                                  style={{
                                    left: 0,
                                    right: 10,
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    height: 3,
                                    background: 'repeating-linear-gradient(90deg, #EF4444 0px, #EF4444 6px, transparent 6px, transparent 10px)',
                                  }}
                                />
                                {/* Circle marker at completedOn date */}
                                <div
                                  className="absolute rounded-full"
                                  style={{
                                    right: 0,
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    width: 9,
                                    height: 9,
                                    background: '#EF4444',
                                    boxShadow: '0 0 0 2px white, 0 0 0 3px #EF4444',
                                  }}
                                />
                              </div>
                            )
                          })()}

                          {/* Milestone diamond */}
                          {task.isMilestone && displayBar && (
                            <div
                              className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-amber-400 rotate-45 rounded-[3px] pointer-events-none shadow-sm"
                              style={{ left: displayBar.left + displayBar.width / 2 - 7 }}
                            />
                          )}

                          {/* No-bar placeholder */}
                          {!bar && (
                            <div className="absolute top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none" style={{ left: todayX + 6 }}>
                              <span className="w-1 h-1 rounded-full bg-slate-300" />
                              <span className="text-[9px] text-slate-300 whitespace-nowrap">no date</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </Fragment>
              ))}

              <div style={{ height: 16 }} />

              {/* ══ PARENT→CHILD ARROWS ══ */}
              {connectionArrows.length > 0 && (
                <svg
                  className="absolute pointer-events-none"
                  style={{ left: LEFT_W, top: HDR_H, width: totalWidth, height: svgH, overflow: 'visible' }}
                >
                  <defs>
                    <marker id="gantt-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                      <path d="M0 1L5 3L0 5Z" fill="#94a3b8" />
                    </marker>
                  </defs>
                  {connectionArrows.map((arrow) => (
                    <path key={arrow.key} d={arrow.d} fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 3" markerEnd="url(#gantt-arrow)" />
                  ))}
                </svg>
              )}

            </div>
          </div>
        </div>
      )}

      {/* ── Modals ─────────────────────────────────────────────────────── */}
      {statusChangeTarget && (
        <StatusChangeModal
          currentStatus={statusChangeTarget.status}
          isSubmitting={isStatusChanging}
          onCancel={() => setStatusChangeTarget(null)}
          onConfirm={handleStatusChangeConfirm}
        />
      )}

      {detailTaskId && (() => {
        const t = tasks.find((tk) => tk.id === detailTaskId)
        if (!t) return null
        return (
          <TaskDetailModal
            task={t} allTasks={tasks}
            projects={projects}
            onClose={() => setDetailTaskId(null)}
            onUpdate={handleUpdate}
            onStatusChange={(tk) => setStatusChangeTarget(tk)}
            onAssign={(tk) => setAssigningTask(tk)}
          />
        )
      })()}

      {assigningTask && (() => {
        const liveTask = tasks.find((tk) => tk.id === assigningTask.id) ?? assigningTask
        return (
          <AssignTaskModal
            task={liveTask} currentUser={username ?? ''}
            onAssign={handleAssign} onUnassign={handleUnassign}
            onClose={() => setAssigningTask(null)}
          />
        )
      })()}

      {isCreateOpen && (
        <CreateTaskModal
          isSubmitting={createTaskStatus === 'submitting'}
          onClose={closeCreateModal} onSubmit={handleCreateTask} onSuccess={closeCreateModal}
          projects={projects} tasks={tasks} serverError={createTaskError}
          initialProject={projectFilter !== 'all' ? projectFilter : undefined}
        />
      )}
    </main>
  )
}
