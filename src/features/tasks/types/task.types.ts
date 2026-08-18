export interface TaskComment {
  user: string       // ERPNext username (email)
  fullName?: string  // Display name
  text: string
  timestamp: string  // ISO date string
}

export interface Task {
  id: string
  subject: string
  project: string | null
  status: string
  priority: string
  type: string | null
  activityType: string | null
  customRaci: string | null
  isMilestone: boolean
  isGroup: boolean
  parentTask: string | null
  dependsOnTasks: string | null
  startDate: string | null
  dueDate: string | null
  reviewDate: string | null
  closingDate: string | null
  progress: number
  engagementDays: number | null
  department: string | null
  color: string | null
  description: string | null
  owner: string | null
  updatedAt: string | null
  assignedTo: string[]
  completedBy: string | null
  completedOn: string | null
  comments: TaskComment[]
  autoRepeat: string | null   // Auto Repeat document name, set by Frappe on the Task
}

export interface UpdateTaskInput {
  subject: string
  project?: string
  activityType?: string
  customRaci?: string
  status: string
  priority: string
  isMilestone?: boolean
  isGroup?: boolean
  parentTask?: string
  dependsOnTasks?: string
  startDate?: string
  dueDate?: string
  reviewDate?: string
  closingDate?: string
  progress?: number
  engagementDays?: number
  department?: string
  color?: string
  description?: string
  completedBy?: string
  completedOn?: string
  comments?: TaskComment[]
}

export interface CreateTaskInput {
  subject: string
  project?: string
  activityType?: string
  customRaci?: string
  priority: string
  isMilestone?: boolean
  isGroup?: boolean
  parentTask?: string
  dependsOnTasks?: string
  startDate?: string
  dueDate?: string
  engagementDays?: number
  description?: string
  assignedTo?: string[]
  comments?: TaskComment[]
}

export interface CreateTaskFormValues {
  subject: string
  project: string
  activityType: string
  priority: string
  isMilestone: boolean
  parentTask: string
  startDate: string
  dueDate: string
  engagementDays: string
  description: string
}

export type CreateTaskFieldErrors = Partial<Record<'subject' | 'project', string>>

// ── RACI options ─────────────────────────────────────────────────────────────

export const RACI_OPTIONS = ['CMYC Operations', 'Procurement Team', 'M&E', 'Internal Team', 'Communication Team'] as const

// ── Task-type domain ──────────────────────────────────────────────────────────

/** The three user-facing creation types surfaced by the "Add New" dropdown. */
export type AddNewType = 'task' | 'milestone' | 'activity'

/**
 * Single source of truth for what each AddNewType means at the data level.
 * Any change to milestone/activity/task defaults needs updating here only.
 *
 * | type      | isMilestone | isGroup |
 * |-----------|-------------|---------|
 * | milestone | true        | true    |
 * | activity  | false       | true    |
 * | task      | false       | false   |
 */
export function getTaskTypeDefaults(type: AddNewType): { initialIsMilestone: boolean; initialIsGroup: boolean } {
  switch (type) {
    case 'milestone': return { initialIsMilestone: true,  initialIsGroup: true  }
    case 'activity':  return { initialIsMilestone: false, initialIsGroup: true  }
    case 'task':      return { initialIsMilestone: false, initialIsGroup: false }
  }
}
