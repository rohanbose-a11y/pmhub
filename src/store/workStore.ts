import { create } from 'zustand'

import type { Project } from '../features/projects/types/project.types'
import type { CreateTaskInput, Task, UpdateTaskInput } from '../features/tasks/types/task.types'
import type { Timesheet, UpdateTimesheetInput } from '../features/timesheets/types/timesheet.types'
import { timesheetApi } from '../api/timesheetApi'
import { taskApi } from '../api/taskApi'
import { projectService } from '../services/projectService'
import { taskService } from '../services/taskService'
import { timesheetService } from '../services/timesheetService'

type WorkspaceStatus = 'idle' | 'loading' | 'ready' | 'error'
type TaskMutationStatus = 'idle' | 'submitting' | 'success' | 'error'

interface WorkState {
  projects: Project[]
  tasks: Task[]
  timesheets: Timesheet[]
  /** Timesheets for employees who report to the current user (populated if user is a Reporting Manager). */
  teamTimesheets: Timesheet[]
  /** True when the current user has at least one employee reporting to them. */
  hasTeam: boolean
  status: WorkspaceStatus
  error: string | null
  createTaskStatus: TaskMutationStatus
  createTaskError: string | null
  lastCreatedTask: string | null
  /** ID of the timesheet auto-created on the 1st of the month, if any. Cleared by clearAutoTimesheetNotice(). */
  autoTimesheetName: string | null
  /** Prevents concurrent loadWorkspace calls from each firing createTimesheet. */
  _autoTimesheetAttempted: boolean
  /**
   * Maps yearMonth ("2026-05") → known timesheet ID resolved via OverlapError.
   * Used when ERPNext's DocPerm blocks list queries but the document is still
   * accessible via a direct GET by ID.
   */
  _knownMonthTimesheets: Record<string, string>
  loadWorkspace: (username: string, silent?: boolean) => Promise<void>
  createTask: (input: CreateTaskInput, username: string) => Promise<boolean>
  updateTaskStatus: (taskId: string, status: string, completedBy?: string, completedOn?: string) => Promise<boolean>
  assignTask: (taskId: string, userId: string) => Promise<boolean>
  unassignTask: (taskId: string, userId: string) => Promise<boolean>
  updateTask: (taskId: string, input: UpdateTaskInput) => Promise<boolean>
  updateTimesheet: (id: string, input: UpdateTimesheetInput) => Promise<boolean>
  resetTaskFeedback: () => void
  clearAutoTimesheetNotice: () => void
}

/**
 * Parses an OverlapError response from ERPNext and returns the name of the
 * existing timesheet that caused the conflict, e.g. "TS-2026-00122".
 * The error message format is: "<new> is overlapping with <existing>"
 */
const extractOverlapId = (err: unknown): string | null => {
  if (!err || typeof err !== 'object') return null
  const response = (err as Record<string, unknown>).response
  if (!response || typeof response !== 'object') return null
  const data = (response as Record<string, unknown>).data
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, string>
  if (d.exc_type !== 'OverlapError') return null
  const match = String(d.exception ?? '').match(/overlapping with (\S+)/)
  return match?.[1] ?? null
}

const sortTasks = (tasks: Task[]) =>
  [...tasks].sort((leftTask, rightTask) =>
    (rightTask.updatedAt || '').localeCompare(leftTask.updatedAt || ''),
  )

const sortTimesheets = (timesheets: Timesheet[]) =>
  [...timesheets].sort((leftTimesheet, rightTimesheet) =>
    (rightTimesheet.updatedAt || '').localeCompare(leftTimesheet.updatedAt || ''),
  )

export const useWorkStore = create<WorkState>((set, get) => ({
  projects: [],
  tasks: [],
  timesheets: [],
  teamTimesheets: [],
  hasTeam: false,
  status: 'idle',
  error: null,
  createTaskStatus: 'idle',
  createTaskError: null,
  lastCreatedTask: null,
  autoTimesheetName: null,
  _autoTimesheetAttempted: false,
  _knownMonthTimesheets: {},

  resetTaskFeedback: () => {
    set({ createTaskStatus: 'idle', createTaskError: null, lastCreatedTask: null })
  },

  clearAutoTimesheetNotice: () => {
    set({ autoTimesheetName: null })
  },

  loadWorkspace: async (username, silent = false) => {
    if (!silent) set((state) => ({ ...state, status: 'loading', error: null }))

    // Pass 1 — projects, user-assigned/owned tasks, and timesheets in parallel
    const [projectsResult, userTasksResult, timesheetsResult] = await Promise.allSettled([
      projectService.getAssignedProjects(username),
      taskService.getTasksForUser(username),
      timesheetService.getTimesheetsForUser(username),
    ])

    const projects     = projectsResult.status === 'fulfilled' ? projectsResult.value : []
    const userTasks    = userTasksResult.status === 'fulfilled' ? userTasksResult.value : []
    let   timesheets   = timesheetsResult.status === 'fulfilled' ? timesheetsResult.value : []

    // Pass 2 — all tasks in the user's assigned projects (catches tasks not assigned to the user)
    const projectNames = projects.map((p) => p.name)
    let projectTasks: Task[] = []
    if (projectNames.length > 0) {
      try {
        projectTasks = await taskApi.listTasksByProjects(projectNames)
      } catch {
        // non-fatal — userTasks already cover assigned/owned tasks
      }
    }

    // Merge and deduplicate by task ID (projectTasks provides the complete set)
    const taskMap = new Map<string, Task>()
    ;[...userTasks, ...projectTasks].forEach((t) => taskMap.set(t.id, t))
    const tasks = sortTasks([...taskMap.values()])

    // Auto-create a monthly timesheet if none exists for the current month.
    let autoTimesheetName: string | null = null
    const today = new Date()
    const yr  = today.getFullYear()
    const mo  = today.getMonth() + 1                              // 1-indexed
    const yearMonth = `${yr}-${String(mo).padStart(2, '0')}`    // e.g. "2026-05"

    // If the list API returned nothing (DocPerm blocks it for this user) but we
    // already resolved this month's timesheet ID via a previous OverlapError,
    // fetch it directly — document GET uses a different permission path.
    const knownId = get()._knownMonthTimesheets[yearMonth]
    if (timesheets.length === 0 && knownId) {
      try {
        const ts = await timesheetApi.getTimesheet(knownId)
        timesheets = [ts]
      } catch {
        // Stale cached ID (document deleted) — clear it so we try fresh below
        set((state) => {
          const next = { ...state._knownMonthTimesheets }
          delete next[yearMonth]
          return { _knownMonthTimesheets: next }
        })
      }
    }

    // Match on startDate OR endDate — ERPNext recomputes start_date from min(from_time).
    const hasThisMonth = timesheets.some(
      (ts) => ts.startDate?.startsWith(yearMonth) || ts.endDate?.startsWith(yearMonth),
    )

    // Guard against concurrent loadWorkspace calls both firing createTimesheet.
    // Auto-creation temporarily disabled.
    if (false && !hasThisMonth && !get()._autoTimesheetAttempted) {
      set({ _autoTimesheetAttempted: true })
      const startDate = `${yearMonth}-01`
      const lastDay   = new Date(yr, mo, 0).getDate()
      const endDate   = `${yearMonth}-${String(lastDay).padStart(2, '0')}`
      try {
        const created   = await timesheetApi.createTimesheet(startDate, endDate, username)
        timesheets      = [created, ...timesheets]
        autoTimesheetName = created.id
        set((state) => ({
          _knownMonthTimesheets: { ...state._knownMonthTimesheets, [yearMonth]: created.id },
        }))
      } catch (err) {
        // OverlapError means a timesheet for this month already exists in ERPNext
        // but the list API can't return it (DocPerm restriction). Extract the
        // conflicting document name from the error and fetch it directly by ID.
        const overlapId = extractOverlapId(err)
        if (overlapId) {
          // Share the existing timesheet with this user so the list API can
          // return it on future loads (DocShare overrides DocPerm restrictions).
          await timesheetApi.shareTimesheet(overlapId as string, username as string)
          try {
            const existing = await timesheetApi.getTimesheet(overlapId as string)
            timesheets = [existing, ...timesheets]
            set((state) => ({
              _knownMonthTimesheets: { ...state._knownMonthTimesheets, [yearMonth]: overlapId as string },
            }))
          } catch { /* non-fatal */ }
        }
        // If we still have nothing, try a general list refresh as a last resort.
        if (timesheets.length === 0) {
          try {
            const fresh = await timesheetService.getTimesheetsForUser(username)
            if (fresh.length > 0) timesheets = fresh
          } catch { /* non-fatal */ }
        }
      }
    }

    const hasFailure =
      projectsResult.status === 'rejected' ||
      userTasksResult.status === 'rejected' ||
      timesheetsResult.status === 'rejected'

    set({
      projects,
      tasks,
      timesheets: sortTimesheets(timesheets),
      teamTimesheets: [],
      hasTeam: false,
      autoTimesheetName,
      status:
        hasFailure && projects.length === 0 && tasks.length === 0 && timesheets.length === 0
          ? 'error'
          : 'ready',
      error: hasFailure
        ? 'Some ERPNext data could not be loaded. Check your permissions or field setup.'
        : null,
    })

    // Load team timesheets after main workspace is ready so the UI is not blocked.
    // Only runs if the current user is linked to an Employee document.
    const managerEmployeeIds = await timesheetApi.resolveEmployeeIds(username).catch(() => [] as string[])
    if (managerEmployeeIds.length > 0) {
      const teamResult = await timesheetApi
        .listTeamTimesheets(managerEmployeeIds)
        .catch(() => ({ timesheets: [] as Timesheet[], hasSubordinates: false }))
      if (teamResult.hasSubordinates) {
        set({ teamTimesheets: sortTimesheets(teamResult.timesheets), hasTeam: true })
      }
    }
  },

  createTask: async (input, username) => {
    set({
      createTaskStatus: 'submitting',
      createTaskError: null,
      lastCreatedTask: null,
    })

    try {
      const createdTask = await taskService.createTask(input)

      set((state) => ({
        tasks: sortTasks([createdTask, ...state.tasks]),
        createTaskStatus: 'success',
        createTaskError: null,
        lastCreatedTask: createdTask.subject,
      }))

      await get().loadWorkspace(username)
      return true
    } catch (error) {
      set({
        createTaskStatus: 'error',
        createTaskError:
          error instanceof Error ? error.message : 'Unable to create the task right now.',
        lastCreatedTask: null,
      })

      return false
    }
  },

  updateTask: async (taskId, input) => {
    try {
      const updated = await taskService.updateTask(taskId, input)
      set((state) => ({
        tasks: state.tasks.map((t) => (t.id === taskId ? updated : t)),
      }))
      return true
    } catch {
      return false
    }
  },

  assignTask: async (taskId, userId) => {
    try {
      await taskApi.assignTask(taskId, userId)
      set((state) => ({
        tasks: state.tasks.map((t) =>
          t.id === taskId && !t.assignedTo.includes(userId)
            ? { ...t, assignedTo: [...t.assignedTo, userId] }
            : t,
        ),
      }))
      return true
    } catch {
      return false
    }
  },

  unassignTask: async (taskId, userId) => {
    try {
      await taskApi.unassignTask(taskId, userId)
      set((state) => ({
        tasks: state.tasks.map((t) =>
          t.id === taskId
            ? { ...t, assignedTo: t.assignedTo.filter((a) => a !== userId) }
            : t,
        ),
      }))
      return true
    } catch {
      return false
    }
  },

  updateTimesheet: async (id, input) => {
    try {
      const updated = await timesheetApi.updateTimesheet(id, input)
      set((state) => ({
        timesheets: state.timesheets.map((t) => (t.id === id ? { ...updated, timeLogs: updated.timeLogs } : t)),
      }))
      return true
    } catch {
      return false
    }
  },

  updateTaskStatus: async (taskId, status, completedBy, completedOn) => {
    // Optimistic update
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, status } : t)),
    }))

    try {
      const updated = await taskService.updateTaskStatus(taskId, status, completedBy, completedOn)
      set((state) => ({
        tasks: state.tasks.map((t) => (t.id === taskId ? updated : t)),
      }))
      return true
    } catch {
      // Revert not needed — caller can handle; server error will surface via UI
      return false
    }
  },
}))
