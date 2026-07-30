import { httpClient } from './httpClient'

export type RepeatFrequency = 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly' | 'Half-yearly' | 'Yearly'

export type Weekday = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'
export const WEEKDAYS: Weekday[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']

export interface AutoRepeat {
  id: string
  frequency: RepeatFrequency
  startDate: string
  endDate: string | null
  repeatOnDay: number | null
  repeatOnWeekdays: Weekday[]
  status: 'Active' | 'Disabled'
}

export interface AutoRepeatInput {
  frequency: RepeatFrequency
  startDate: string
  endDate?: string
  repeatOnDay?: number
  repeatOnWeekdays?: Weekday[]
}

/** One row in the repeat_on_days child table. */
interface FrappeRepeatOnDay {
  day: string  // e.g. "Monday", "Tuesday"
}

interface FrappeAutoRepeat {
  name: string
  frequency: string
  start_date: string
  end_date?: string | null
  repeat_on_day?: number | null
  repeat_on_days?: FrappeRepeatOnDay[]
  status: string
}

interface FrappeDocResponse<T> { data: T }

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const toAutoRepeat = (r: FrappeAutoRepeat): AutoRepeat => ({
  id: r.name,
  frequency: r.frequency as RepeatFrequency,
  startDate: r.start_date,
  endDate: r.end_date || null,
  repeatOnDay: r.repeat_on_day || null,
  repeatOnWeekdays: (r.repeat_on_days ?? [])
    .map((row) => row.day.toLowerCase() as Weekday)
    .filter((d): d is Weekday => WEEKDAYS.includes(d as Weekday)),
  status: r.status as 'Active' | 'Disabled',
})

/** Build the repeat_on_days child-table payload for Weekly frequency. */
function buildRepeatOnDays(weekdays: Weekday[] = []): FrappeRepeatOnDay[] {
  return weekdays.map((d) => ({ day: capitalize(d) }))
}

export const autoRepeatApi = {
  /**
   * Fetch an Auto Repeat by its document name.
   *
   * The Task document's `auto_repeat` field holds the name (Frappe sets it
   * automatically via update_auto_repeat_id). Pass that value here — it avoids
   * the list-API filter restriction on Dynamic Link fields.
   */
  async getById(repeatName: string): Promise<AutoRepeat> {
    const { data } = await httpClient.get<FrappeDocResponse<FrappeAutoRepeat>>(
      `/api/resource/Auto Repeat/${encodeURIComponent(repeatName)}`,
    )
    return toAutoRepeat(data.data)
  },

  async create(taskId: string, input: AutoRepeatInput): Promise<AutoRepeat> {
    try {
      const { data } = await httpClient.post<FrappeDocResponse<FrappeAutoRepeat>>('/api/resource/Auto Repeat', {
        reference_doctype: 'Task',
        reference_document: taskId,
        frequency: input.frequency,
        start_date: input.startDate,
        ...(input.endDate && { end_date: input.endDate }),
        ...(input.repeatOnDay != null && input.repeatOnDay > 0 && { repeat_on_day: input.repeatOnDay }),
        ...(input.frequency === 'Weekly' && { repeat_on_days: buildRepeatOnDays(input.repeatOnWeekdays) }),
        days_in_advance: 0,
        status: 'Active',
      })
      // GET the saved document so child-table rows are fully populated
      return autoRepeatApi.getById(data.data.name)
    } catch (err) {
      // Frappe throws 417 if the task already has an auto repeat.
      // The error message contains the existing record name: "already on auto repeat AUT-AR-XXXXX"
      const match = String(err).match(/auto repeat ([\w-]+)/)
      if (match?.[1]) return autoRepeatApi.update(match[1], input)
      throw err
    }
  },

  async update(repeatId: string, input: AutoRepeatInput): Promise<AutoRepeat> {
    await httpClient.put<FrappeDocResponse<FrappeAutoRepeat>>(
      `/api/resource/Auto Repeat/${encodeURIComponent(repeatId)}`,
      {
        frequency: input.frequency,
        start_date: input.startDate,
        end_date: input.endDate || null,
        repeat_on_day: input.repeatOnDay || null,
        ...(input.frequency === 'Weekly' && { repeat_on_days: buildRepeatOnDays(input.repeatOnWeekdays) }),
      },
    )
    // GET the updated document so child-table rows are accurate
    return autoRepeatApi.getById(repeatId)
  },

  async remove(repeatId: string): Promise<void> {
    await httpClient.delete(`/api/resource/Auto Repeat/${encodeURIComponent(repeatId)}`)
  },
}
