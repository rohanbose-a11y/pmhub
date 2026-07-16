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
  isMilestone: boolean
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
}

export interface UpdateTaskInput {
  subject: string
  project?: string
  activityType?: string
  status: string
  priority: string
  isMilestone?: boolean
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
  priority: string
  isMilestone?: boolean
  parentTask?: string
  dependsOnTasks?: string
  startDate?: string
  dueDate?: string
  engagementDays?: number
  description?: string
  assignedTo?: string[]
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
