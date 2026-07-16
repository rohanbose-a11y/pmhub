export interface TimesheetLog {
  /** Child table row name — null for new (unsaved) rows */
  id: string | null
  activityType: string | null
  task: string | null
  project: string | null
  /** ISO datetime: "YYYY-MM-DD HH:MM:SS" */
  fromTime: string | null
  toTime: string | null
  hours: number | null
  description: string | null
  isBillable: boolean
  billingHours: number | null
  billingRate: number | null
  billingAmount: number | null
}

export interface Timesheet {
  id: string
  employee: string | null
  employeeName: string | null
  designation: string | null
  department: string | null
  reportingManager: string | null
  rm: string | null
  company: string | null
  status: string
  month: string | null
  totalHours: number | null
  totalBillableHours: number | null
  totalEngagementDays: number | null
  startDate: string | null
  endDate: string | null
  note: string | null
  /** Only populated when fetched as a full document (getTimesheet) */
  timeLogs?: TimesheetLog[]
  updatedAt?: string | null
}

export interface UpdateTimesheetInput {
  employee?: string
  designation?: string
  department?: string
  reportingManager?: string
  rm?: string
  month?: string
  startDate?: string
  endDate?: string
  note?: string
  timeLogs: TimesheetLogInput[]
}

export interface TimesheetLogInput {
  /** Existing row name (to update); omit for new rows */
  id?: string
  activityType?: string
  task?: string
  project?: string
  fromTime?: string
  toTime?: string
  hours?: number
  description?: string
  isBillable?: boolean
  billingHours?: number
  billingRate?: number
}
