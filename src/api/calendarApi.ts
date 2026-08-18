import { httpClient } from './httpClient'

export interface GoogleCalendarConfig {
  name: string
  calendar_name: string
  enable: number
  user: string
}

export interface ErpEvent {
  name: string
  subject: string
  starts_on: string        // "YYYY-MM-DD HH:MM:SS" or "YYYY-MM-DD"
  ends_on: string | null
  description: string | null
  event_type: string
  google_calendar: string | null
  google_meet_link?: string | null
  owner: string
  repeat_this_event?: number
  repeat_on?: string | null
  repeat_till?: string | null
}

export interface EventParticipant {
  name: string
  reference_doctype: string
  reference_docname: string
  email: string
}

export interface ErpEventDetail extends ErpEvent {
  location?: string | null
  google_meet_link?: string | null
  event_participants?: EventParticipant[]
}

const GCal_FIELDS = ['name', 'calendar_name', 'enable', 'user']

export async function getGoogleCalendars(): Promise<GoogleCalendarConfig[]> {
  const { data } = await httpClient.get<{ data: GoogleCalendarConfig[] }>('/api/resource/Google Calendar', {
    params: {
      fields: JSON.stringify(GCal_FIELDS),
      filters: JSON.stringify([['enable', '=', 1]]),
      limit: 50,
    },
  })
  return data.data
}

export async function getCalendarEvents(from: string, to: string): Promise<ErpEvent[]> {
  // Use the dedicated event API which expands repeat occurrences into virtual
  // instances — unlike /api/resource/Event which only returns base documents
  // filtered by starts_on and misses future repeat instances.
  const { data } = await httpClient.get<{ message: ErpEvent[] }>(
    '/api/method/frappe.desk.doctype.event.event.get_events',
    { params: { start: from, end: to } },
  )
  return data.message ?? []
}

/**
 * Fetch all events linked to a task.
 * Two strategies merged + deduplicated:
 *   1. Event Participants where reference_doctype=Task, reference_docname=taskId (new meetings)
 *   2. Events whose subject exactly matches the task subject (legacy meetings created before linking existed)
 */
export async function getEventsByTask(taskId: string, taskSubject?: string): Promise<ErpEvent[]> {
  const fields = JSON.stringify(['name', 'subject', 'starts_on', 'ends_on', 'google_meet_link', 'owner', 'event_type'])

  const [byParticipant, bySubject] = await Promise.all([
    httpClient.get<{ data: ErpEvent[] }>('/api/resource/Event', {
      params: {
        fields,
        filters: JSON.stringify([
          ['Event Participants', 'reference_doctype', '=', 'Task'],
          ['Event Participants', 'reference_docname', '=', taskId],
        ]),
        limit: 50,
        order_by: 'starts_on asc',
      },
    }).then(r => r.data.data).catch(() => []),

    taskSubject
      ? httpClient.get<{ data: ErpEvent[] }>('/api/resource/Event', {
          params: {
            fields,
            filters: JSON.stringify([['subject', '=', taskSubject]]),
            limit: 50,
            order_by: 'starts_on asc',
          },
        }).then(r => r.data.data).catch(() => [])
      : Promise.resolve<ErpEvent[]>([]),
  ])

  // Merge, deduplicate by name, sort ascending
  const seen = new Set<string>()
  const merged: ErpEvent[] = []
  for (const e of [...byParticipant, ...bySubject]) {
    if (!seen.has(e.name)) { seen.add(e.name); merged.push(e) }
  }
  return merged.sort((a, b) => a.starts_on.localeCompare(b.starts_on))
}

export async function getCalendarEventDetail(name: string): Promise<ErpEventDetail> {
  const { data } = await httpClient.get<{ data: ErpEventDetail }>(
    `/api/resource/Event/${encodeURIComponent(name)}`,
  )
  return data.data
}

export async function updateErpEvent(
  name: string,
  payload: Omit<Parameters<typeof createErpEvent>[0], 'pulled_from_google_calendar'>,
): Promise<ErpEvent> {
  const { data } = await httpClient.put<{ data: ErpEvent }>(
    `/api/resource/Event/${encodeURIComponent(name)}`,
    payload,
  )
  return data.data
}

export async function deleteErpEvent(name: string): Promise<void> {
  await httpClient.delete(`/api/resource/Event/${encodeURIComponent(name)}`)
}

export async function createGoogleCalendar(payload: {
  calendar_name: string
  user: string
  pull_from_google_calendar: 0 | 1
  sync_as_public: 0 | 1
  push_to_google_calendar: 0 | 1
}): Promise<GoogleCalendarConfig> {
  const { data } = await httpClient.post<{ data: GoogleCalendarConfig }>('/api/resource/Google Calendar', {
    doctype: 'Google Calendar',
    enable: 1,
    ...payload,
  })
  return data.data
}

export async function getGoogleCalendarAuthUrl(calendarName: string): Promise<string> {
  const { data } = await httpClient.get<{ message: string | { url: string } }>(
    '/api/method/frappe.integrations.doctype.google_calendar.google_calendar.authorize_access',
    { params: { g_calendar: calendarName, reauthorize: 0 } },
  )
  const msg = data.message
  return typeof msg === 'string' ? msg : msg.url
}

// CRM doctype → field used as the human-readable display name
const CRM_DISPLAY_FIELD: Record<string, string> = {
  Lead:        'lead_name',
  Contact:     'full_name',
  Customer:    'customer_name',
  Prospect:    'company_name',
  Opportunity: 'name',
}

export const CRM_DOCTYPES = Object.keys(CRM_DISPLAY_FIELD)

export interface DoctypeRecord { name: string; display: string; email?: string }

export async function searchDoctype(doctype: string, query: string): Promise<DoctypeRecord[]> {
  const displayField = CRM_DISPLAY_FIELD[doctype] ?? 'name'
  const fields = ['name', displayField, 'email_id'].filter((f, i, a) => a.indexOf(f) === i)
  const filters = query
    ? JSON.stringify([[displayField, 'like', `%${query}%`]])
    : undefined
  const { data, status } = await httpClient.get<{ data: Record<string, string>[] }>(
    `/api/resource/${encodeURIComponent(doctype)}`,
    { params: { fields: JSON.stringify(fields), ...(filters ? { filters } : {}), limit: 20 }, validateStatus: (s) => s < 500 },
  )
  if (status !== 200) return []
  return data.data.map(r => ({ name: r.name, display: r[displayField] || r.name, email: r.email_id || undefined }))
}

export async function createErpEvent(payload: {
  subject: string
  starts_on: string          // "YYYY-MM-DD HH:MM:SS"
  ends_on?: string
  all_day?: 0 | 1
  event_category?: string
  event_type?: string
  color?: string
  repeat_this_event?: 0 | 1
  repeat_on?: string         // "Daily" | "Weekly" | "Monthly" | "Yearly"
  repeat_till?: string       // "YYYY-MM-DD" — required when repeat_this_event=1
  monday?: 0 | 1
  tuesday?: 0 | 1
  wednesday?: 0 | 1
  thursday?: 0 | 1
  friday?: 0 | 1
  location?: string
  status?: string
  attending?: string
  sync_with_google_calendar?: 0 | 1
  add_video_conferencing?: 0 | 1
  google_calendar?: string
  pulled_from_google_calendar?: 0 | 1
  event_participants?: { doctype: 'Event Participants'; reference_doctype: string; reference_docname: string; email?: string }[]
  description?: string
}): Promise<ErpEvent> {
  const { data } = await httpClient.post<{ data: ErpEvent }>('/api/resource/Event', {
    doctype: 'Event',
    ...payload,
  })
  return data.data
}

/**
 * Before syncing: enable pull direction and clear the incremental sync token
 * so ERPNext does a full re-fetch from Google Calendar instead of only pulling
 * changes since the last sync (which misses historical and externally-created events).
 * Non-throwing — callers should proceed with sync even if this PUT is rejected.
 */
export async function prepareForFullSync(calendarName: string): Promise<void> {
  await httpClient.put(`/api/resource/Google Calendar/${encodeURIComponent(calendarName)}`, {
    pull_from_google_calendar: 1,
    sync_as_public: 1,
    next_sync_token: '',
  })
}

export async function syncGoogleCalendar(account: string): Promise<string[]> {
  const { data } = await httpClient.post<{ message: string[] }>(
    '/api/method/frappe.integrations.doctype.google_calendar.google_calendar.sync',
    { account },
  )
  return data.message ?? []
}
