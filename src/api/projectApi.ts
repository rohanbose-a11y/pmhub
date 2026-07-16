import type { Project, UpdateProjectInput, RawProjectMember } from '../features/projects/types/project.types'
import { httpClient } from './httpClient'

interface FrappeListResponse<T> {
  data: T[]
}

interface FrappeProjectRecord {
  name: string
  project_name?: string | null
  status?: string | null
  percent_complete?: number | null
  expected_start_date?: string | null
  expected_end_date?: string | null
  owner?: string | null
  modified?: string | null
}

interface FrappeProjectMemberRecord {
  user?: string | null
  full_name?: string | null
}

interface FrappeDocumentResponse<T> {
  data: T
}

interface FrappeProjectDetails extends FrappeProjectRecord {
  users?: FrappeProjectMemberRecord[]
  _assign?: string | null
}

const projectFields = [
  'name',
  'project_name',
  'status',
  'percent_complete',
  'expected_start_date',
  'expected_end_date',
  'owner',
  'modified',
]

const normalizeIdentity = (value: string) => value.trim().toLowerCase()

const getUniqueIdentityTokens = (values: string[]) =>
  [...new Set(values.map((value) => value.trim()).filter(Boolean))]

const buildIdentityFilters = (
  doctype: string,
  fields: Array<{ name: string; operator: '=' | 'like' }>,
  identityTokens: string[],
) =>
  identityTokens.flatMap((token) =>
    fields.map(({ name, operator }) => [doctype, name, operator, operator === 'like' ? `%${token}%` : token]),
  )

const matchesIdentity = (value: string | null | undefined, identityTokens: string[]) => {
  if (!value) {
    return false
  }

  const normalizedValue = normalizeIdentity(value)
  return identityTokens.some((token) => normalizedValue === normalizeIdentity(token))
}

const toProject = (record: FrappeProjectRecord): Project => ({
  id: record.name,
  name: record.name,
  displayName: record.project_name?.trim() || record.name,
  status: record.status?.trim() || 'Open',
  completion: typeof record.percent_complete === 'number' ? record.percent_complete : null,
  expectedStartDate: record.expected_start_date || null,
  expectedEndDate: record.expected_end_date || null,
  owner: record.owner || null,
  updatedAt: record.modified || null,
})

const fetchProjects = async (params: Record<string, string>) => {
  const { data } = await httpClient.get<FrappeListResponse<FrappeProjectRecord>>(
    '/api/resource/Project',
    {
      params: {
        fields: JSON.stringify(projectFields),
        order_by: 'modified desc',
        limit_page_length: 100,
        ...params,
      },
    },
  )

  return data.data.map(toProject)
}

const fetchProjectDetails = async (projectNames: string[]) => {
  const results = await Promise.allSettled(
    projectNames.map((projectName) =>
      httpClient.get<FrappeDocumentResponse<FrappeProjectDetails>>(
        `/api/resource/Project/${encodeURIComponent(projectName)}`,
      ),
    ),
  )

  return results.flatMap((result) =>
    result.status === 'fulfilled' ? [result.value.data.data] : [],
  )
}

const dedupeProjects = (projects: Project[]) => {
  const projectMap = new Map<string, Project>()

  projects.forEach((project) => {
    projectMap.set(project.id, project)
  })

  return [...projectMap.values()].sort((leftProject, rightProject) =>
    (rightProject.updatedAt || '').localeCompare(leftProject.updatedAt || ''),
  )
}

export const projectApi = {
  async getProjectMembers(name: string): Promise<RawProjectMember[]> {
    const { data } = await httpClient.get<FrappeDocumentResponse<FrappeProjectDetails>>(
      `/api/resource/Project/${encodeURIComponent(name)}`,
    )
    return (data.data.users ?? []).map((u) => ({ user: u.user ?? '', full_name: u.full_name }))
  },

  async updateProject(name: string, input: UpdateProjectInput): Promise<boolean> {
    const body: Record<string, unknown> = {}
    if (input.status             !== undefined) body.status                = input.status
    if (input.expectedStartDate  !== undefined) body.expected_start_date   = input.expectedStartDate ?? ''
    if (input.expectedEndDate    !== undefined) body.expected_end_date     = input.expectedEndDate ?? ''
    if (input.completion         !== undefined) body.percent_complete      = input.completion
    await httpClient.put(`/api/resource/Project/${encodeURIComponent(name)}`, body)
    return true
  },

  async saveProjectMembers(name: string, members: RawProjectMember[]): Promise<boolean> {
    await httpClient.put(`/api/resource/Project/${encodeURIComponent(name)}`, {
      users: members.map((m) => ({ user: m.user })),
    })
    return true
  },

  async listAssignedProjects(identityInput: string | string[]): Promise<Project[]> {
    const identityTokens = getUniqueIdentityTokens(
      Array.isArray(identityInput) ? identityInput : [identityInput],
    )

    if (identityTokens.length === 0) {
      return []
    }

    const [directProjectsResult, accessibleProjectsResult] =
      await Promise.allSettled([
        fetchProjects({
          or_filters: JSON.stringify(
            buildIdentityFilters(
              'Project',
              [
                { name: '_assign', operator: 'like' },
                { name: 'owner', operator: '=' },
              ],
              identityTokens,
            ),
          ),
        }),
        fetchProjects({}),
      ])

    const directProjects =
      directProjectsResult.status === 'fulfilled' ? directProjectsResult.value : []

    const accessibleProjects =
      accessibleProjectsResult.status === 'fulfilled' ? accessibleProjectsResult.value : []

    const candidateProjects = dedupeProjects([...directProjects])
    const projectDetails = await fetchProjectDetails(
      getUniqueIdentityTokens([...candidateProjects.map((project) => project.name), ...accessibleProjects.map((project) => project.name)]),
    )

    const projectNamesFromUsersTable = new Set(
      projectDetails
        .filter((project) => {
          const users = project.users || []

          const hasUserMatch = users.some(
            (member: FrappeProjectMemberRecord) =>
              matchesIdentity(member.user, identityTokens) ||
              matchesIdentity(member.full_name, identityTokens),
          )

          const hasDirectMatch =
            matchesIdentity(project.owner, identityTokens) ||
            identityTokens.some((token) =>
              (project._assign || '').toLowerCase().includes(normalizeIdentity(token)),
            )

          return hasUserMatch || hasDirectMatch
        })
        .map((project) => project.name),
    )

    // Build a name → members map from the fetched project details
    const membersMap = new Map<string, string[]>()
    projectDetails.forEach((detail) => {
      const seen = new Set<string>()
      const members: string[] = []
      if (detail.owner) { seen.add(detail.owner); members.push(detail.owner) }
      ;(detail.users ?? []).forEach((m: FrappeProjectMemberRecord) => {
        if (m.user && !seen.has(m.user)) { seen.add(m.user); members.push(m.user) }
      })
      membersMap.set(detail.name, members)
    })

    return dedupeProjects(
      [...candidateProjects, ...accessibleProjects].filter((project) =>
        projectNamesFromUsersTable.has(project.name),
      ),
    ).map((project) => ({
      ...project,
      members: membersMap.get(project.name) ?? (project.owner ? [project.owner] : []),
    }))
  },
}
