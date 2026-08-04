import axios from 'axios'
import type { CreateTaskInput, Task, TaskComment, UpdateTaskInput } from '../features/tasks/types/task.types'
import { httpClient } from './httpClient'

interface FrappeListResponse<T> {
  data: T[]
}

interface FrappeDocumentResponse<T> {
  data: T
}

interface FrappeTaskRecord {
  name: string
  subject?: string | null
  project?: string | null
  status?: string | null
  priority?: string | null
  type?: string | null
  custom_kra?: string | null
  is_milestone?: number | null
  is_group?: number | null
  parent_task?: string | null
  depends_on_tasks?: string | null
  exp_start_date?: string | null
  exp_end_date?: string | null
  review_date?: string | null
  closing_date?: string | null
  progress?: number | null
  custom_engagement_days?: number | null
  department?: string | null
  color?: string | null
  description?: string | null
  owner?: string | null
  modified?: string | null
  _assign?: string | null
  completed_by?: string | null
  completed_on?: string | null
  custom_comments?: string | null
  auto_repeat?: string | null
}

/**
 * Full field list — all standard ERPNext Task fields plus common extras.
 * custom_kra is intentionally excluded: Frappe's validate_fields blocks Link
 * fields whose linked doctype the user cannot list (Activity Type in production).
 * KRA is fetched separately via the single-doc GET in taskApi.getTask().
 */
const taskFieldsFull = [
  'name',
  'subject',
  'project',
  'status',
  'priority',
  'type',
  'is_milestone',
  'is_group',
  'parent_task',
  'depends_on_tasks',
  'exp_start_date',
  'exp_end_date',
  'review_date',
  'closing_date',
  'progress',
  'custom_engagement_days',
  'department',
  'color',
  'description',
  'owner',
  'modified',
  '_assign',
  'completed_by',
  'completed_on',
  'custom_comments',
  'auto_repeat',
]

/** Fallback without exotic fields — used when the server returns 400/417 on the full list. */
const taskFieldsCore = [
  'name',
  'subject',
  'project',
  'status',
  'priority',
  'exp_end_date',
  'description',
  'owner',
  'modified',
  '_assign',
  'completed_by',
  'completed_on',
]

/** Absolute minimum — used when even taskFieldsCore triggers a 400/417. */
const taskFieldsMinimal = [
  'name',
  'subject',
  'project',
  'status',
  'priority',
  'exp_end_date',
  'description',
  'owner',
  'modified',
  '_assign',
  'completed_by',
  'completed_on',
]

const parseComments = (raw: string | null | undefined): TaskComment[] => {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const parseAssign = (raw: string | null | undefined): string[] => {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const toTask = (record: FrappeTaskRecord): Task => ({
  id: record.name,
  subject: record.subject?.trim() || record.name,
  project: record.project || null,
  status: record.status?.trim() || 'Open',
  priority: record.priority?.trim() || 'Medium',
  type: record.type || null,
  activityType: record.custom_kra || null,
  isMilestone: !!record.is_milestone,
  isGroup: !!record.is_group,
  parentTask: record.parent_task || null,
  dependsOnTasks: record.depends_on_tasks || null,
  startDate: record.exp_start_date || null,
  dueDate: record.exp_end_date || null,
  reviewDate: record.review_date || null,
  closingDate: record.closing_date || null,
  progress: record.progress ?? 0,
  engagementDays: record.custom_engagement_days ?? null,
  department: record.department || null,
  color: record.color || null,
  description: record.description?.trim() || null,
  owner: record.owner || null,
  updatedAt: record.modified || null,
  assignedTo: parseAssign(record._assign),
  completedBy: record.completed_by || null,
  completedOn: record.completed_on || null,
  comments: parseComments(record.custom_comments),
  autoRepeat: record.auto_repeat || null,
})

type AnyTaskInput = UpdateTaskInput | CreateTaskInput

/** Full payload — includes all optional ERPNext fields. */
const toPayload = (input: AnyTaskInput) => {
  const u = input as UpdateTaskInput
  return {
    subject: input.subject?.trim(),
    project: input.project?.trim() || undefined,
    priority: input.priority,
    ...('isMilestone' in input && { is_milestone: (input as UpdateTaskInput).isMilestone ? 1 : 0 }),
    ...(input.isGroup !== undefined && { is_group: input.isGroup ? 1 : 0 }),
    parent_task: input.parentTask?.trim() || undefined,
    exp_start_date: input.startDate || undefined,
    exp_end_date: input.dueDate || undefined,
    description: input.description?.trim() || undefined,
    ...(input.activityType !== undefined && { custom_kra: input.activityType?.trim() || undefined }),
    ...(input.engagementDays !== undefined && { custom_engagement_days: input.engagementDays }),
    // depends_on_tasks is a read-only computed field in ERPNext; the writable
    // field is the depends_on child table (doctype: "Task Depends On").
    ...('dependsOnTasks' in input && {
      depends_on: u.dependsOnTasks
        ? u.dependsOnTasks.split(',').map((id) => ({ task: id.trim() })).filter((r) => r.task)
        : [],
    }),
    ...('status'      in input && { status:       u.status }),
    ...('reviewDate'  in input && { review_date:  u.reviewDate  || undefined }),
    ...('closingDate' in input && { closing_date: u.closingDate || undefined }),
    ...('department'  in input && { department:   u.department?.trim() || undefined }),
    ...('color'       in input && { color:        u.color || undefined }),
    ...('completedBy' in input && { completed_by: u.completedBy || undefined }),
    ...('completedOn' in input && { completed_on: u.completedOn || undefined }),
    ...('comments'    in input && { custom_comments: JSON.stringify(u.comments ?? []) }),
  }
}

/**
 * Core payload — used when the full payload is rejected with 400/417.
 * Keeps custom_kra so it is still saved even if exotic fields fail.
 * Omits: is_milestone, is_group, engagement_days, dates, depends_on child table,
 * description (HTML may fail on some ERPNext versions), and computed fields.
 */
const toPayloadCore = (input: AnyTaskInput) => {
  const u = input as UpdateTaskInput
  return {
    subject: input.subject?.trim(),
    project: input.project?.trim() || undefined,
    priority: input.priority,
    ...(input.activityType?.trim() && { custom_kra: input.activityType.trim() }),
    parent_task: input.parentTask?.trim() || undefined,
    ...('status'      in input && { status: u.status }),
    ...('completedBy' in input && u.completedBy && { completed_by: u.completedBy }),
    ...('completedOn' in input && u.completedOn && { completed_on: u.completedOn }),
    ...('comments'    in input && { custom_comments: JSON.stringify(u.comments ?? []) }),
  }
}

/**
 * Minimal payload — absolute last resort if custom_kra itself triggers 400/417.
 * Only fields guaranteed writable on every ERPNext/Frappe version.
 * project is kept here because it may be mandatory on the server.
 */
const toPayloadMinimal = (input: AnyTaskInput) => {
  const u = input as UpdateTaskInput
  return {
    subject: input.subject?.trim(),
    project: input.project?.trim() || undefined,
    priority: input.priority,
    ...('status'      in input && { status: u.status }),
    ...('completedBy' in input && u.completedBy && { completed_by: u.completedBy }),
    ...('completedOn' in input && u.completedOn && { completed_on: u.completedOn }),
  }
}

const fetchTasks = async (fields: string[], filters?: unknown[]) => {
  const { data } = await httpClient.get<FrappeListResponse<FrappeTaskRecord>>('/api/resource/Task', {
    params: {
      fields: JSON.stringify(fields),
      filters: filters?.length ? JSON.stringify(filters) : undefined,
      order_by: 'modified desc',
      limit_page_length: 500,
    },
  })
  return data.data.map(toTask)
}

/**
 * Returns true when Frappe rejects because a requested field doesn't exist on
 * the doctype (DataError=400, ValidationError=417).  We deliberately exclude
 * MandatoryError (also 417) so that "Value missing for Task: Project" is NOT
 * silently retried with smaller payloads — it should propagate to the user.
 */
const isFrappeMandatoryError = (err: unknown) =>
  axios.isAxiosError(err) &&
  err.response?.status === 417 &&
  (err.response.data as Record<string, unknown>)?.exc_type === 'MandatoryError'

const isFrappeBusinessRuleError = (err: unknown) =>
  axios.isAxiosError(err) &&
  err.response?.status === 417 &&
  !!(err.response.data as Record<string, unknown>)?._server_messages

const isFrappeFieldError = (err: unknown) =>
  !isFrappeMandatoryError(err) &&
  !isFrappeBusinessRuleError(err) &&
  axios.isAxiosError(err) &&
  (err.response?.status === 400 || err.response?.status === 417)

/**
 * Fetches tasks, falling back through field lists on 400/417.
 * Frappe returns 417 (ValidationError) or 400 (DataError) when a requested
 * field doesn't exist on the doctype — the exact code varies by Frappe version.
 */
const listTasks = async (filters?: unknown[]): Promise<Task[]> => {
  try {
    return await fetchTasks(taskFieldsFull, filters)
  } catch (err) {
    if (!isFrappeFieldError(err)) throw err
    try {
      return await fetchTasks(taskFieldsCore, filters)
    } catch (err2) {
      if (!isFrappeFieldError(err2)) throw err2
      return await fetchTasks(taskFieldsMinimal, filters)
    }
  }
}

export const taskApi = {
  listAccessibleTasks: () => listTasks(),

  listAssignedTasks: (username: string) =>
    listTasks([['Task', '_assign', 'like', `%${username}%`]]),

  listOwnedTasks: (username: string) => listTasks([['Task', 'owner', '=', username]]),

  /** Fetch all tasks belonging to a set of projects in one request. */
  listTasksByProjects: (projectNames: string[]) =>
    listTasks([['Task', 'project', 'in', projectNames]]),

  async updateTaskStatus(
    taskId: string,
    status: string,
    completedBy?: string,
    completedOn?: string,
  ): Promise<Task> {
    const payload: Record<string, unknown> = { status }
    if (status === 'Completed') {
      if (completedBy) payload.completed_by = completedBy
      if (completedOn) payload.completed_on = completedOn
    }
    const { data } = await httpClient.put<FrappeDocumentResponse<FrappeTaskRecord>>(
      `/api/resource/Task/${encodeURIComponent(taskId)}`,
      payload,
    )
    return toTask(data.data)
  },

  async updateTask(taskId: string, input: UpdateTaskInput): Promise<Task> {
    const url = `/api/resource/Task/${encodeURIComponent(taskId)}`
    try {
      const { data } = await httpClient.put<FrappeDocumentResponse<FrappeTaskRecord>>(url, toPayload(input))
      return toTask(data.data)
    } catch (err) {
      if (!isFrappeFieldError(err)) throw err
      console.warn('[taskApi] updateTask full-payload 400/417 — retrying with core payload.', axios.isAxiosError(err) ? err.response?.data : err)
      try {
        const { data } = await httpClient.put<FrappeDocumentResponse<FrappeTaskRecord>>(url, toPayloadCore(input))
        return toTask(data.data)
      } catch (err2) {
        if (!isFrappeFieldError(err2)) throw err2
        console.warn('[taskApi] updateTask core-payload 400/417 — retrying with minimal payload.', axios.isAxiosError(err2) ? err2.response?.data : err2)
        const { data } = await httpClient.put<FrappeDocumentResponse<FrappeTaskRecord>>(url, toPayloadMinimal(input))
        const saved = toTask(data.data)
        // Core payload (which includes custom_kra) was rejected — retry KRA alone so it isn't silently lost.
        if (input.activityType?.trim()) {
          try {
            const { data: kraData } = await httpClient.put<FrappeDocumentResponse<FrappeTaskRecord>>(url, { custom_kra: input.activityType.trim() })
            return toTask(kraData.data)
          } catch {
            /* custom_kra field unavailable on this ERPNext instance — task saved without it */
          }
        }
        return saved
      }
    }
  },

  async createTask(input: CreateTaskInput): Promise<Task> {
    // custom_engagement_days is mandatory on this ERPNext instance.
    // Frappe evaluates mandatory with Python's `not value`, so 0 also fails.
    // Default to 1 when the caller didn't provide a positive value so the
    // field is always satisfied without blocking the user.
    const normalizedInput: CreateTaskInput = {
      ...input,
      engagementDays: (input.engagementDays && input.engagementDays > 0)
        ? input.engagementDays
        : 1,
    }

    const createDoc = async (): Promise<Task> => {
      try {
        const { data } = await httpClient.post<FrappeDocumentResponse<FrappeTaskRecord>>(
          '/api/resource/Task',
          { ...toPayload(normalizedInput), status: 'Open' },
        )
        return toTask(data.data)
      } catch (err) {
        if (!isFrappeFieldError(err)) throw err
        console.warn('[taskApi] createTask full-payload 400/417 — retrying with core payload.', axios.isAxiosError(err) ? err.response?.data : err)
        try {
          const { data } = await httpClient.post<FrappeDocumentResponse<FrappeTaskRecord>>(
            '/api/resource/Task',
            { ...toPayloadCore(normalizedInput), status: 'Open' },
          )
          return toTask(data.data)
        } catch (err2) {
          if (!isFrappeFieldError(err2)) throw err2
          console.warn('[taskApi] createTask core-payload 400/417 — retrying with minimal payload.', axios.isAxiosError(err2) ? err2.response?.data : err2)
          const { data } = await httpClient.post<FrappeDocumentResponse<FrappeTaskRecord>>(
            '/api/resource/Task',
            { ...toPayloadMinimal(normalizedInput), status: 'Open' },
          )
          const created = toTask(data.data)
          if (normalizedInput.activityType?.trim()) {
            try {
              const kraUrl = `/api/resource/Task/${encodeURIComponent(created.id)}`
              const { data: kraData } = await httpClient.put<FrappeDocumentResponse<FrappeTaskRecord>>(kraUrl, { custom_kra: normalizedInput.activityType.trim() })
              return toTask(kraData.data)
            } catch {
              /* custom_kra field unavailable on this ERPNext instance — task created without it */
            }
          }
          return created
        }
      }
    }

    const created = await createDoc()

    // Assign all selected users in a single request so Frappe processes them
    // inside one transaction — avoids cross-request MySQL deadlocks on _assign.
    // notify:false skips email dispatch so a missing SMTP config cannot 500.
    if (input.assignedTo?.length) {
      try {
        await taskApi.bulkAssignTask(created.id, input.assignedTo)
      } catch {
        // non-fatal — task is created; assignment display will reflect what ERPNext accepted
      }
      try {
        return await taskApi.getTask(created.id)
      } catch {
        return { ...created, assignedTo: input.assignedTo }
      }
    }

    return created
  },

  /** Fetch a single Task document — returns all fields including custom_kra. */
  async getTask(taskId: string): Promise<Task> {
    const { data } = await httpClient.get<FrappeDocumentResponse<FrappeTaskRecord>>(
      `/api/resource/Task/${encodeURIComponent(taskId)}`,
    )
    return toTask(data.data)
  },

  async assignTask(taskId: string, userId: string, notify = true): Promise<void> {
    await httpClient.post('/api/method/frappe.desk.form.assign_to.add', {
      doctype: 'Task',
      name: taskId,
      assign_to: [userId],
      bulk_assign: false,
      re_assign: false,
      notify,
    })
  },

  /**
   * Assigns multiple users in a single server-side request so Frappe handles
   * all ToDo inserts within one transaction — prevents cross-request deadlocks.
   */
  async bulkAssignTask(taskId: string, userIds: string[]): Promise<void> {
    await httpClient.post('/api/method/frappe.desk.form.assign_to.add', {
      doctype: 'Task',
      name: taskId,
      assign_to: userIds,
      bulk_assign: false,
      re_assign: false,
      notify: false,
    })
  },

  async unassignTask(taskId: string, userId: string): Promise<void> {
    await httpClient.post('/api/method/frappe.desk.form.assign_to.remove', {
      doctype: 'Task',
      name: taskId,
      assign_to: userId,
    })
  },
}
