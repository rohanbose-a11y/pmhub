export interface Project {
  id: string
  name: string
  displayName: string
  status: string
  completion: number | null
  expectedStartDate: string | null
  expectedEndDate: string | null
  owner?: string | null
  members?: string[]
  updatedAt?: string | null
  notes?: string | null
}

export interface UpdateProjectInput {
  status?: string
  expectedStartDate?: string | null
  expectedEndDate?: string | null
  completion?: number
}

export interface RawProjectMember {
  user: string
  full_name?: string | null
}
