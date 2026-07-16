import { authApi } from '../api/authApi'
import { timesheetApi } from '../api/timesheetApi'
import type { Timesheet } from '../features/timesheets/types/timesheet.types'
import { getErrorMessage } from '../shared/lib/getErrorMessage'

export const timesheetService = {
  async getTimesheetsForUser(username: string): Promise<Timesheet[]> {
    try {
      const resolvedUser = await authApi.resolveUserIdentity(username).catch(() => null)

      const identityTokens = [
        username,
        resolvedUser?.username,
        resolvedUser?.fullName,
        resolvedUser?.loginId,
      ].filter((value): value is string => Boolean(value?.trim()))

      return await timesheetApi.listUserTimesheets(identityTokens)
    } catch (error) {
      throw new Error(getErrorMessage(error, 'Unable to load timesheets right now.'))
    }
  },
}
