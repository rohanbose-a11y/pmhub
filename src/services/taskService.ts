import { taskApi } from '../api/taskApi'
import type { CreateTaskInput, Task, UpdateTaskInput } from '../features/tasks/types/task.types'
import { getErrorMessage } from '../shared/lib/getErrorMessage'

const dedupeTasks = (tasks: Task[]) => {
  const taskMap = new Map<string, Task>()

  tasks.forEach((task) => {
    taskMap.set(task.id, task)
  })

  return [...taskMap.values()].sort((leftTask, rightTask) =>
    (rightTask.updatedAt || '').localeCompare(leftTask.updatedAt || ''),
  )
}

export const taskService = {
  async getTasksForUser(username: string): Promise<Task[]> {
    try {
      const [assignedTasks, ownedTasks] = await Promise.allSettled([
        taskApi.listAssignedTasks(username),
        taskApi.listOwnedTasks(username),
      ])

      const mergedTasks = dedupeTasks([
        ...(assignedTasks.status === 'fulfilled' ? assignedTasks.value : []),
        ...(ownedTasks.status === 'fulfilled' ? ownedTasks.value : []),
      ])

      if (mergedTasks.length > 0) {
        return mergedTasks
      }

      return await taskApi.listAccessibleTasks()
    } catch (error) {
      throw new Error(getErrorMessage(error, 'Unable to load tasks right now.'))
    }
  },

  async updateTaskStatus(
    taskId: string,
    status: string,
    completedBy?: string,
    completedOn?: string,
  ): Promise<Task> {
    try {
      return await taskApi.updateTaskStatus(taskId, status, completedBy, completedOn)
    } catch (error) {
      throw new Error(getErrorMessage(error, 'Unable to update task status.'))
    }
  },

  async updateTask(taskId: string, input: UpdateTaskInput): Promise<Task> {
    try {
      return await taskApi.updateTask(taskId, input)
    } catch (error) {
      throw new Error(getErrorMessage(error, 'Unable to update the task right now.'))
    }
  },

  async createTask(input: CreateTaskInput): Promise<Task> {
    try {
      return await taskApi.createTask(input)
    } catch (error) {
      throw new Error(getErrorMessage(error, 'Unable to create the task right now.'))
    }
  },
}
