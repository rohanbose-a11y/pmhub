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
  owner: string
}

const GCal_FIELDS  = ['name', 'calendar_name', 'enable', 'user']
const EVENT_FIELDS = ['name', 'subject', 'starts_on', 'ends_on', 'description', 'event_type', 'google_calendar', 'owner']

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
  const { data } = await httpClient.get<{ data: ErpEvent[] }>('/api/resource/Event', {
    params: {
      fields: JSON.stringify(EVENT_FIELDS),
      filters: JSON.stringify([
        ['starts_on', '>=', from],
        ['starts_on', '<=', to + ' 23:59:59'],
      ]),
      limit: 500,
      order_by: 'starts_on asc',
    },
  })
  return data.data
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

export async function syncGoogleCalendar(account: string): Promise<void> {
  await httpClient.post(
    '/api/method/frappe.integrations.doctype.google_calendar.google_calendar.sync',
    { account },
  )
}
