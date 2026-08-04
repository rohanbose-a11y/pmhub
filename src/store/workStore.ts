import { create } from 'zustand'

import type { Project } from '../features/projects/types/project.types'
import type { CreateTaskInput, Task, UpdateTaskInput } from '../features/tasks/types/task.types'
import { taskApi } from '../api/taskApi'
import { projectService } from '../services/projectService'
import { taskService } from '../services/taskService'

type WorkspaceStatus = 'idle' | 'loading' | 'ready' | 'error'
type TaskMutationStatus = 'idle' | 'submitting' | 'success' | 'error'

interface WorkState {
  projects: Project[]
  tasks: Task[]
  status: WorkspaceStatus
  error: string | null
  createTaskStatus: TaskMutationStatus
  createTaskError: string | null
  lastCreatedTask: string | null
  updateTaskError: string | null
  loadWorkspace: (username: string, silent?: boolean) => Promise<void>
  createTask: (input: CreateTaskInput, username: string) => Promise<Task | null>
  updateTaskStatus: (taskId: string, status: string, completedBy?: string, completedOn?: string) => Promise<boolean>
  assignTask: (taskId: string, userId: string) => Promise<boolean>
  unassignTask: (taskId: string, userId: string) => Promise<boolean>
  updateTask: (taskId: string, input: UpdateTaskInput) => Promise<boolean>
  resetTaskFeedback: () => void
  clearUpdateTaskError: () => void
}

const sortTasks = (tasks: Task[]) =>
  [...tasks].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))

export const useWorkStore = create<WorkState>((set, get) => ({
  projects: [],
  tasks: [],
  status: 'idle',
  error: null,
  createTaskStatus: 'idle',
  createTaskError: null,
  lastCreatedTask: null,
  updateTaskError: null,

  resetTaskFeedback: () => set({ createTaskStatus: 'idle', createTaskError: null, lastCreatedTask: null }),
  clearUpdateTaskError: () => set({ updateTaskError: null }),

  loadWorkspace: async (username, silent = false) => {
    if (!silent) set((state) => ({ ...state, status: 'loading', error: null }))

    const [projectsResult, userTasksResult] = await Promise.allSettled([
      projectService.getAssignedProjects(username),
      taskService.getTasksForUser(username),
    ])

    const projects  = projectsResult.status === 'fulfilled' ? projectsResult.value : []
    const userTasks = userTasksResult.status === 'fulfilled' ? userTasksResult.value : []

    const projectNames = projects.map((p) => p.name)
    let projectTasks: Task[] = []
    if (projectNames.length > 0) {
      try { projectTasks = await taskApi.listTasksByProjects(projectNames) } catch { /* non-fatal */ }
    }

    const taskMap = new Map<string, Task>()
    ;[...userTasks, ...projectTasks].forEach((t) => taskMap.set(t.id, t))
    const tasks = sortTasks([...taskMap.values()])

    const hasFailure = projectsResult.status === 'rejected' || userTasksResult.status === 'rejected'

    set({
      projects,
      tasks,
      status: hasFailure && projects.length === 0 && tasks.length === 0 ? 'error' : 'ready',
      error: hasFailure ? 'Some ERPNext data could not be loaded. Check your permissions or field setup.' : null,
    })
  },

  createTask: async (input, username) => {
    set({ createTaskStatus: 'submitting', createTaskError: null, lastCreatedTask: null })
    try {
      const createdTask = await taskService.createTask(input)
      set((state) => ({
        tasks: sortTasks([createdTask, ...state.tasks]),
        createTaskStatus: 'success',
        createTaskError: null,
        lastCreatedTask: createdTask.subject,
      }))
      await get().loadWorkspace(username)
      return createdTask
    } catch (error) {
      set({
        createTaskStatus: 'error',
        createTaskError: error instanceof Error ? error.message : 'Unable to create the task right now.',
        lastCreatedTask: null,
      })
      return null
    }
  },

  updateTask: async (taskId, input) => {
    try {
      const updated = await taskService.updateTask(taskId, input)
      set((state) => ({ tasks: state.tasks.map((t) => (t.id === taskId ? updated : t)) }))
      return true
    } catch (e) {
      set({ updateTaskError: e instanceof Error ? e.message : 'Unable to update task.' })
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
    } catch { return false }
  },

  unassignTask: async (taskId, userId) => {
    try {
      await taskApi.unassignTask(taskId, userId)
      set((state) => ({
        tasks: state.tasks.map((t) =>
          t.id === taskId ? { ...t, assignedTo: t.assignedTo.filter((a) => a !== userId) } : t,
        ),
      }))
      return true
    } catch { return false }
  },

  updateTaskStatus: async (taskId, status, completedBy, completedOn) => {
    set((state) => ({ tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, status } : t)) }))
    try {
      const updated = await taskService.updateTaskStatus(taskId, status, completedBy, completedOn)
      set((state) => ({ tasks: state.tasks.map((t) => (t.id === taskId ? updated : t)) }))
      return true
    } catch (e) {
      set({ updateTaskError: e instanceof Error ? e.message : 'Unable to update task status.' })
      return false
    }
  },
}))
