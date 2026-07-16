import { authApi } from '../api/authApi'
import { projectApi } from '../api/projectApi'
import type { Project } from '../features/projects/types/project.types'
import { getErrorMessage } from '../shared/lib/getErrorMessage'

export const projectService = {
  async getAssignedProjects(username: string): Promise<Project[]> {
    try {
      const resolvedUser = await authApi.resolveUserIdentity(username).catch(() => null)

      const identityTokens = [
        username,
        resolvedUser?.username,
        resolvedUser?.fullName,
        resolvedUser?.loginId,
      ].filter((value): value is string => Boolean(value?.trim()))

      return await projectApi.listAssignedProjects(identityTokens)
    } catch (error) {
      throw new Error(getErrorMessage(error, 'Unable to load assigned projects right now.'))
    }
  },
}
