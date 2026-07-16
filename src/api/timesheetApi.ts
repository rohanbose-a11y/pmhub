import axios from 'axios'
import type { Timesheet, TimesheetLog, UpdateTimesheetInput } from '../features/timesheets/types/timesheet.types'
import { httpClient } from './httpClient'

interface FrappeListResponse<T> {
  data: T[]
}

interface FrappeDocumentResponse<T> {
  data: T
}

interface FrappeTimesheetRecord {
  name: string
  employee?: string | null
  employee_name?: string | null
  custom_designation?: string | null
  department?: string | null
  custom_reporting_manager?: string | null
  custom_rm_id?: string | null
  company?: string | null
  status?: string | null
  custom_month?: string | null
  total_hours?: number | null
  total_billable_hours?: number | null
  custom_total_engagement_days?: number | null
  start_date?: string | null
  end_date?: string | null
  note?: string | null
  modified?: string | null
}

interface FrappeTimesheetDetail {
  name?: string | null
  activity_type?: string | null
  task?: string | null
  project?: string | null
  from_time?: string | null
  to_time?: string | null
  hours?: number | null
  description?: string | null
  is_billable?: number | null
  billing_hours?: number | null
  billing_rate?: number | null
  billing_amount?: number | null
}

interface FrappeTimesheetFullRecord extends FrappeTimesheetRecord {
  time_logs?: FrappeTimesheetDetail[]
}

interface FrappeEmployeeRecord {
  name: string
  company?: string | null
  user_id?: string | null
  company_email?: string | null
  personal_email?: string | null
}

const timesheetListFields = [
  'name',
  'employee',
  'employee_name',
  'custom_designation',
  'department',
  'custom_reporting_manager',
  'custom_rm_id',
  'company',
  'status',
  'custom_month',
  'total_hours',
  'total_billable_hours',
  'custom_total_engagement_days',
  'start_date',
  'end_date',
  'note',
  'modified',
]

/**
 * Minimal safe fallback — only stored scalar fields guaranteed to exist in any
 * ERPNext Timesheet. Excludes Fetch-From fields (employee_name) and formula
 * fields (total_hours, total_billable_hours) that trigger 417 on strict instances.
 */
const timesheetListFieldsCore = [
  'name',
  'employee',
  'custom_designation',
  'department',
  'custom_reporting_manager',
  'custom_rm_id',
  'company',
  'status',
  'custom_month',
  'start_date',
  'end_date',
  'modified',
]

/** Returns true for Frappe field-validation HTTP codes (DataError=400, ValidationError=417). */
const isFrappeFieldError = (err: unknown) =>
  axios.isAxiosError(err) && (err.response?.status === 400 || err.response?.status === 417)

const getUniqueValues = (values: string[]) =>
  [...new Set(values.map((v) => v.trim()).filter(Boolean))]

const toTimesheetLog = (d: FrappeTimesheetDetail): TimesheetLog => ({
  id: d.name || null,
  activityType: d.activity_type || null,
  task: d.task || null,
  project: d.project || null,
  fromTime: d.from_time || null,
  toTime: d.to_time || null,
  hours: d.hours ?? null,
  description: d.description || null,
  isBillable: !!d.is_billable,
  billingHours: d.billing_hours ?? null,
  billingRate: d.billing_rate ?? null,
  billingAmount: d.billing_amount ?? null,
})

const toTimesheet = (record: FrappeTimesheetRecord): Timesheet => ({
  id: record.name,
  employee: record.employee || null,
  employeeName: record.employee_name || null,
  designation: record.custom_designation || null,
  department: record.department || null,
  reportingManager: record.custom_reporting_manager || null,
  rm: record.custom_rm_id || null,
  company: record.company || null,
  status: record.status?.trim() || 'Draft',
  month: record.custom_month || null,
  totalHours: typeof record.total_hours === 'number' ? record.total_hours : null,
  totalBillableHours: typeof record.total_billable_hours === 'number' ? record.total_billable_hours : null,
  totalEngagementDays: typeof record.custom_total_engagement_days === 'number' ? record.custom_total_engagement_days : null,
  startDate: record.start_date || null,
  endDate: record.end_date || null,
  note: record.note || null,
  updatedAt: record.modified || null,
})

const toTimesheetFull = (record: FrappeTimesheetFullRecord): Timesheet => ({
  ...toTimesheet(record),
  timeLogs: (record.time_logs || []).map(toTimesheetLog),
})

export const timesheetApi = {
  async listUserTimesheets(identityInput: string | string[]): Promise<Timesheet[]> {
    const identityTokens = getUniqueValues(
      Array.isArray(identityInput) ? identityInput : [identityInput],
    )
    if (identityTokens.length === 0) return []

    /**
     * Resolve the linked Employee record by trying all three email fields in parallel
     * (user_id, company_email, personal_email). ERPNext instances vary in which field
     * is populated, so checking all three avoids a silent miss that makes every
     * subsequent Timesheet query return empty due to the DocPerm match_field filter.
     */
    const primaryToken = identityTokens[0]
    const employeeFields: Array<'user_id' | 'company_email' | 'personal_email'> = [
      'user_id',
      'company_email',
      'personal_email',
    ]
    const employeeLookups = await Promise.all(
      employeeFields.map((field) =>
        httpClient
          .get<FrappeListResponse<FrappeEmployeeRecord>>('/api/resource/Employee', {
            params: {
              fields: JSON.stringify(['name']),
              filters: JSON.stringify([['Employee', field, '=', primaryToken]]),
              limit_page_length: 5,
            },
          })
          .then((res) => res.data.data.map((e) => e.name))
          .catch(() => [] as string[]),
      ),
    )

    const employeeIds = getUniqueValues(employeeLookups.flat())
    console.log('[timesheetApi] listUserTimesheets: token =', primaryToken, '| employeeIds =', employeeIds)

    /**
     * Fetch timesheets with full fields; on 400/417 retry with core fields.
     * A filter of field=value is applied when provided.
     */
    const fetchList = async (
      filter?: { field: 'owner' | 'employee'; value: string },
    ): Promise<Timesheet[]> => {
      const makeParams = (fields: string[]) => ({
        fields: JSON.stringify(fields),
        ...(filter && { filters: JSON.stringify([['Timesheet', filter.field, '=', filter.value]]) }),
        order_by: 'modified desc',
        limit_page_length: 500,
      })
      try {
        const res = await httpClient.get<FrappeListResponse<FrappeTimesheetRecord>>(
          '/api/resource/Timesheet', { params: makeParams(timesheetListFields) },
        )
        return res.data.data.map(toTimesheet)
      } catch (err) {
        if (isFrappeFieldError(err)) {
          try {
            const res = await httpClient.get<FrappeListResponse<FrappeTimesheetRecord>>(
              '/api/resource/Timesheet', { params: makeParams(timesheetListFieldsCore) },
            )
            return res.data.data.map(toTimesheet)
          } catch (err2) {
            console.error('[timesheetApi] listUserTimesheets: core fields failed.', filter, axios.isAxiosError(err2) ? err2.response?.data : err2)
          }
        } else {
          console.error('[timesheetApi] listUserTimesheets: unexpected error.', filter, axios.isAxiosError(err) ? err.response?.data : err)
        }
        return []
      }
    }

    // Run filtered queries (owner + employee) AND an unfiltered query in parallel.
    // ERPNext's row-level permissions scope the unfiltered query to only records
    // the session user can access — this reliably returns all the user's timesheets
    // even when the owner/employee field values don't match our identity tokens.
    const [unfilteredResults, ...filteredBuckets] = await Promise.all([
      fetchList(),                                                          // unfiltered
      ...identityTokens.map((token) => fetchList({ field: 'owner', value: token })),
      ...employeeIds.map((id)    => fetchList({ field: 'employee', value: id })),
    ])

    // When the user is a Reporting Manager, ERPNext's DocPerm grants access to the
    // entire team's timesheets. The unfiltered query returns all of those, which
    // would pollute this list. Pre-filter unfiltered results by the user's own
    // employee IDs before merging so team records never make it in.
    // When employeeIds is empty (lookup failed) we include everything from the
    // unfiltered query as a fallback — original behaviour for users without a
    // linked Employee record.
    const unfilteredToMerge = employeeIds.length > 0
      ? unfilteredResults.filter((ts) => !ts.employee || employeeIds.includes(ts.employee))
      : unfilteredResults

    // Merge and deduplicate — prefer the entry with the latest updatedAt.
    // filteredBuckets (by owner / by employee) are always included; they are
    // precise and guaranteed to belong to this user.
    const seen = new Map<string, Timesheet>()
    ;[...unfilteredToMerge, ...filteredBuckets.flat()].forEach((ts) => {
      const existing = seen.get(ts.id)
      if (!existing || (ts.updatedAt ?? '') > (existing.updatedAt ?? '')) {
        seen.set(ts.id, ts)
      }
    })

    return [...seen.values()].sort(
      (a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''),
    )
  },

  /** Share a timesheet document with a user (Can Read + Write + Submit + Share).
   *  Tries frappe.share.add first; falls back to creating a DocShare record directly. */
  async shareTimesheet(id: string, username: string): Promise<void> {
    // Attempt 1 — official Frappe share method
    try {
      await httpClient.post('/api/method/frappe.share.add', {
        doctype: 'Timesheet',
        name:    id,
        user:    username,
        read:    1,
        write:   1,
        submit:  1,
        share:   1,
      })
      console.log('[timesheetApi] shareTimesheet: shared via frappe.share.add', id, '->', username)
      return
    } catch (err) {
      console.error(
        '[timesheetApi] shareTimesheet: frappe.share.add failed — trying DocShare resource.',
        axios.isAxiosError(err) ? err.response?.data : err,
      )
    }

    // Attempt 2 — create DocShare record directly via REST resource API
    try {
      await httpClient.post('/api/resource/DocShare', {
        share_doctype: 'Timesheet',
        share_name:    id,
        user:          username,
        read:          1,
        write:         1,
        submit:        1,
        share:         1,
      })
      console.log('[timesheetApi] shareTimesheet: shared via DocShare resource', id, '->', username)
    } catch (err) {
      console.error(
        '[timesheetApi] shareTimesheet: DocShare resource also failed.',
        axios.isAxiosError(err) ? err.response?.data : err,
      )
    }
  },

  async getTimesheet(id: string): Promise<Timesheet> {
    const { data } = await httpClient.get<FrappeDocumentResponse<FrappeTimesheetFullRecord>>(
      `/api/resource/Timesheet/${encodeURIComponent(id)}`,
    )
    return toTimesheetFull(data.data)
  },

  /**
   * Create a draft timesheet for the given month range.
   * Resolves the Employee record linked to `username` first — ERPNext requires
   * the `employee` field on Timesheet. A single zero-hour placeholder log is
   * included so Frappe accepts the document without requiring manual entry.
   */
  async createTimesheet(startDate: string, endDate: string, username: string): Promise<Timesheet> {
    // Resolve linked Employee — try all three email fields in parallel
    const createEmployeeLookups = await Promise.all(
      (['user_id', 'company_email', 'personal_email'] as const).map((field) =>
        httpClient
          .get<FrappeListResponse<FrappeEmployeeRecord>>('/api/resource/Employee', {
            params: {
              fields: JSON.stringify(['name', 'company']),
              filters: JSON.stringify([['Employee', field, '=', username]]),
              limit_page_length: 1,
            },
          })
          .then((res) => res.data.data[0] ?? null)
          .catch(() => null),
      ),
    )
    const employeeRecord = createEmployeeLookups.find(Boolean) ?? null
    console.log('[timesheetApi] createTimesheet: resolved employee =', employeeRecord?.name ?? '(none)', 'for username =', username)

    // Derive "Month YYYY" label from startDate (e.g. "2026-05-01" → "May 2026")
    const monthLabel = (() => {
      const d = new Date(startDate + 'T00:00:00')
      return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    })()

    try {
      const { data } = await httpClient.post<FrappeDocumentResponse<FrappeTimesheetFullRecord>>(
        '/api/resource/Timesheet',
        {
          ...(employeeRecord?.name    && { employee: employeeRecord.name }),
          ...(employeeRecord?.company && { company:  employeeRecord.company }),
          custom_month: monthLabel,
          start_date: startDate,
          end_date:   endDate,
          // ERPNext ignores start_date/end_date and recomputes them from
          // min(from_time)/max(from_time) across all time_logs. Send two anchor
          // entries so the computed range matches the full month.
          time_logs: [
            {
              doctype:     'Timesheet Detail',
              from_time:   `${startDate} 00:00:00`,
              to_time:     `${startDate} 00:00:01`,
              hours:       0,
              is_billable: 0,
              description: 'Auto-created placeholder — please replace with actual hours.',
            },
            {
              doctype:     'Timesheet Detail',
              from_time:   `${endDate} 23:59:00`,
              to_time:     `${endDate} 23:59:59`,
              hours:       0,
              is_billable: 0,
              description: 'Auto-created placeholder — please replace with actual hours.',
            },
          ],
        },
      )

      const timesheet = toTimesheetFull(data.data)

      // Share the document with the user so it appears in their list queries
      // even when DocPerm restricts access by employee/role.
      // Permissions: Can Read + Can Write + Can Submit + Can Share.
      await httpClient
        .post('/api/method/frappe.share.add', {
          doctype:  'Timesheet',
          name:     timesheet.id,
          user:     username,
          read:     1,
          write:    1,
          submit:   1,
          share:    1,
        })
        .catch((err) => {
          console.warn(
            '[timesheetApi] createTimesheet: share call failed (non-fatal).',
            axios.isAxiosError(err) ? err.response?.data : err,
          )
        })

      return timesheet
    } catch (err) {
      console.error('[timesheetApi] createTimesheet POST failed.', axios.isAxiosError(err) ? err.response?.data : err)
      throw err
    }
  },

  /** Resolve Employee document IDs linked to the given username/email. */
  async resolveEmployeeIds(username: string): Promise<string[]> {
    const fields: Array<'user_id' | 'company_email' | 'personal_email'> = [
      'user_id',
      'company_email',
      'personal_email',
    ]
    const results = await Promise.all(
      fields.map((field) =>
        httpClient
          .get<FrappeListResponse<FrappeEmployeeRecord>>('/api/resource/Employee', {
            params: {
              fields: JSON.stringify(['name']),
              filters: JSON.stringify([['Employee', field, '=', username]]),
              limit_page_length: 5,
            },
          })
          .then((res) => res.data.data.map((e) => e.name))
          .catch(() => [] as string[]),
      ),
    )
    return getUniqueValues(results.flat())
  },

  /**
   * Fetch timesheets for all employees who report to the given manager employee IDs.
   * Returns the timesheets and a flag indicating whether any subordinates exist.
   */
  async listTeamTimesheets(
    managerEmployeeIds: string[],
  ): Promise<{ timesheets: Timesheet[]; hasSubordinates: boolean }> {
    if (managerEmployeeIds.length === 0) return { timesheets: [], hasSubordinates: false }

    // Fetch subordinates with all three email/user fields so we can share
    // timesheets back with them. ERPNext instances vary in which field is
    // populated — user_id is most common but company_email / personal_email
    // are used in some setups. We pick the first non-empty value, mirroring
    // the same logic used in listUserTimesheets / resolveEmployeeIds.
    const subordinates = await httpClient
      .get<FrappeListResponse<FrappeEmployeeRecord>>('/api/resource/Employee', {
        params: {
          fields: JSON.stringify(['name', 'user_id', 'company_email', 'personal_email']),
          filters: JSON.stringify([['Employee', 'reports_to', 'in', managerEmployeeIds]]),
          limit_page_length: 500,
        },
      })
      .then((res) => res.data.data)
      .catch(() => [] as FrappeEmployeeRecord[])

    if (subordinates.length === 0) return { timesheets: [], hasSubordinates: false }

    // Map empId → Frappe user identifier (first populated email field wins)
    const empUserMap = new Map<string, string>()
    subordinates.forEach((emp) => {
      const userId = [emp.user_id, emp.company_email, emp.personal_email]
        .map((v) => v?.trim())
        .find(Boolean)
      if (userId) empUserMap.set(emp.name, userId)
    })

    const subordinateIds = subordinates.map((e) => e.name)
    console.log('[timesheetApi] listTeamTimesheets: found', subordinateIds.length, 'subordinates')

    const results = await Promise.allSettled(
      subordinateIds.map((empId) =>
        httpClient
          .get<FrappeListResponse<FrappeTimesheetRecord>>('/api/resource/Timesheet', {
            params: {
              fields: JSON.stringify(timesheetListFields),
              filters: JSON.stringify([['Timesheet', 'employee', '=', empId]]),
              order_by: 'modified desc',
              limit_page_length: 100,
            },
          })
          .then((res) => res.data.data.map(toTimesheet))
          .catch(async (err) => {
            if (!isFrappeFieldError(err)) return [] as Timesheet[]
            try {
              const res = await httpClient.get<FrappeListResponse<FrappeTimesheetRecord>>(
                '/api/resource/Timesheet',
                {
                  params: {
                    fields: JSON.stringify(timesheetListFieldsCore),
                    filters: JSON.stringify([['Timesheet', 'employee', '=', empId]]),
                    order_by: 'modified desc',
                    limit_page_length: 100,
                  },
                },
              )
              return res.data.data.map(toTimesheet)
            } catch {
              return [] as Timesheet[]
            }
          }),
      ),
    )

    const allTimesheets = results
      .filter((r): r is PromiseFulfilledResult<Timesheet[]> => r.status === 'fulfilled')
      .flatMap((r) => r.value)

    const seen = new Map<string, Timesheet>()
    allTimesheets.forEach((ts) => {
      const existing = seen.get(ts.id)
      if (!existing || (ts.updatedAt ?? '') > (existing.updatedAt ?? '')) {
        seen.set(ts.id, ts)
      }
    })

    // Share each timesheet with the employee's own user account.
    // The RM has read+write access to these documents (DocPerm), so frappe.share.add
    // succeeds here. This grants each employee a DocShare record so they can see
    // their own timesheets regardless of DocPerm restrictions.
    const sharePromises = [...seen.values()].map(async (ts) => {
      if (!ts.employee) return
      const userId = empUserMap.get(ts.employee)
      if (!userId) return
      await timesheetApi.shareTimesheet(ts.id, userId).catch(() => {
        console.warn('[timesheetApi] listTeamTimesheets: could not share', ts.id, 'with', userId)
      })
    })
    await Promise.allSettled(sharePromises)
    console.log('[timesheetApi] listTeamTimesheets: shared', seen.size, 'timesheets with their employees')

    return {
      timesheets: [...seen.values()].sort(
        (a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''),
      ),
      hasSubordinates: true,
    }
  },

  async updateTimesheet(id: string, input: UpdateTimesheetInput): Promise<Timesheet> {
    const payload: Record<string, unknown> = {}

    if (input.employee !== undefined) payload.employee = input.employee || null
    if (input.designation !== undefined) payload.custom_designation = input.designation || null
    if (input.department !== undefined) payload.department = input.department || null
    if (input.reportingManager !== undefined) payload.custom_reporting_manager = input.reportingManager || null
    if (input.rm !== undefined) payload.custom_rm_id = input.rm || null
    if (input.month !== undefined) payload.custom_month = input.month || null
    if (input.startDate !== undefined) payload.start_date = input.startDate || null
    if (input.endDate !== undefined) payload.end_date = input.endDate || null
    if (input.note !== undefined) payload.note = input.note || null

    // Only persist rows that ERPNext can accept: must have from_time OR hours > 0.
    // Auto-added task rows with no times/hours filled in are kept in the UI
    // but skipped here to avoid Frappe's "hours cannot be 0" validation error.
    const logsToSave = input.timeLogs.filter((log) => {
      const hasTime  = !!(log.fromTime?.trim())
      const hasHours = typeof log.hours === 'number' && log.hours > 0
      return log.id || hasTime || hasHours // always include existing (saved) rows by id
    })

    payload.time_logs = logsToSave.map((log) => {
      const row: Record<string, unknown> = {
        doctype: 'Timesheet Detail',
        activity_type: log.activityType || null,
        task: log.task || null,
        project: log.project || null,
        from_time: log.fromTime || null,
        to_time: log.toTime || null,
        hours: log.hours ?? null,
        description: log.description || null,
        is_billable: log.isBillable ? 1 : 0,
        billing_hours: log.billingHours ?? null,
        billing_rate: log.billingRate ?? null,
      }
      if (log.id) row.name = log.id
      return row
    })

    const { data } = await httpClient.put<FrappeDocumentResponse<FrappeTimesheetFullRecord>>(
      `/api/resource/Timesheet/${encodeURIComponent(id)}`,
      payload,
    )
    return toTimesheetFull(data.data)
  },
}
