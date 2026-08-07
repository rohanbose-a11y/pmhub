import { useEffect, useMemo, useState } from 'react'
import {
  createGoogleCalendar,
  getCalendarEvents,
  getGoogleCalendars,
  syncGoogleCalendar,
  type ErpEvent,
  type GoogleCalendarConfig,
} from '../../../api/calendarApi'
import { useAuthStore } from '../../../store/authStore'

// ─── Types ────────────────────────────────────────────────────────────────────

type MeetingStatus = 'Upcoming' | 'Ongoing' | 'Completed'
type FilterKey = 'today' | 'week' | 'month' | 'all'

interface Meeting {
  id: string
  title: string
  date: string        // YYYY-MM-DD
  startTime: string   // HH:MM
  endTime: string     // HH:MM
  organizer: string
  organizerEmail: string
  status: MeetingStatus
  color: string
  description?: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BRAND    = '#7B3FF2'
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS   = ['January','February','March','April','May','June','July','August','September','October','November','December']
const COLORS   = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6','#f97316','#14b8a6']

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function fmtTime(t: string): string {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${ampm}`
}

function statusCfg(s: MeetingStatus) {
  if (s === 'Upcoming')  return { bg: '#eff6ff', text: '#1d4ed8', dot: '#3b82f6', label: 'Upcoming'  }
  if (s === 'Ongoing')   return { bg: '#f0fdf4', text: '#15803d', dot: '#10b981', label: 'Ongoing'   }
  return                        { bg: '#f9fafb', text: '#6b7280', dot: '#9ca3af', label: 'Completed' }
}

function initials(name: string): string {
  return name.split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase()
}

function hashColor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return COLORS[h % COLORS.length]
}

/** "john.doe@example.com" → "John Doe" */
function formatOwner(email: string): string {
  const local = email.split('@')[0]
  return local.split(/[._-]/).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
}

function deriveStatus(startsOn: string, endsOn: string | null): MeetingStatus {
  const now   = new Date()
  const start = new Date(startsOn)
  const end   = endsOn ? new Date(endsOn) : new Date(start.getTime() + 30 * 60_000)
  if (now > end)   return 'Completed'
  if (now >= start) return 'Ongoing'
  return 'Upcoming'
}

function parseDT(dt: string): { date: string; time: string } {
  const [date, time = '00:00:00'] = dt.includes(' ') ? dt.split(' ') : [dt, '00:00:00']
  return { date, time: time.slice(0, 5) }
}

function erpToMeeting(e: ErpEvent): Meeting {
  const { date, time: startTime } = parseDT(e.starts_on)
  const endTime = e.ends_on ? parseDT(e.ends_on).time : startTime
  return {
    id:             e.name,
    title:          e.subject,
    date,
    startTime,
    endTime,
    organizer:      formatOwner(e.owner),
    organizerEmail: e.owner,
    status:         deriveStatus(e.starts_on, e.ends_on),
    color:          hashColor(e.google_calendar ?? e.name),
    description:    e.description ?? undefined,
  }
}

function monthRange(year: number, month: number) {
  const y = String(year)
  const m = String(month + 1).padStart(2, '0')
  const last = new Date(year, month + 1, 0).getDate()
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${String(last).padStart(2, '0')}` }
}

// ─── Calendar Grid ────────────────────────────────────────────────────────────

function buildCalendarGrid(year: number, month: number): (number | null)[][] {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [...Array(firstDay).fill(null)]
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks: (number | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

// ─── Meeting Card ─────────────────────────────────────────────────────────────

function MeetingCard({ meeting }: { meeting: Meeting }) {
  const sc = statusCfg(meeting.status)
  return (
    <div
      className="rounded-xl border border-slate-100 bg-white p-3.5 hover:shadow-sm transition-shadow cursor-pointer"
      style={{ borderLeft: `3px solid ${meeting.color}` }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="text-[13px] font-semibold text-slate-800 leading-snug line-clamp-2">{meeting.title}</h4>
        <span
          className="flex-shrink-0 flex items-center gap-1 text-[10.5px] font-medium px-2 py-0.5 rounded-full"
          style={{ background: sc.bg, color: sc.text }}
        >
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: sc.dot }} />
          {sc.label}
        </span>
      </div>

      <div className="space-y-1.5">
        {/* Time */}
        {meeting.startTime && (
          <div className="flex items-center gap-1.5 text-[11.5px] text-slate-500">
            <svg fill="none" viewBox="0 0 16 16" width="12" height="12" className="flex-shrink-0 text-slate-400">
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M8 5v3.5l2 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            {fmtTime(meeting.startTime)}{meeting.endTime && meeting.endTime !== meeting.startTime ? ` – ${fmtTime(meeting.endTime)}` : ''}
          </div>
        )}

        {/* Organizer */}
        <div className="flex items-center gap-1.5 text-[11.5px] text-slate-500">
          <div
            className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-bold text-white flex-shrink-0"
            style={{ background: hashColor(meeting.organizer) }}
          >
            {initials(meeting.organizer)}
          </div>
          {meeting.organizer}
        </div>

        {meeting.description && (
          <p className="text-[11px] text-slate-400 leading-relaxed line-clamp-2 mt-1">{meeting.description}</p>
        )}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function CalendarPage() {
  const today    = new Date()
  const todayYMD = toYMD(today)
  const currentUser = useAuthStore(s => s.user)

  const [viewDate,    setViewDate]    = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedDay, setSelectedDay] = useState(todayYMD)
  const [search,      setSearch]      = useState('')
  const [filter,      setFilter]      = useState<FilterKey>('today')

  const [events,     setEvents]     = useState<Meeting[]>([])
  const [loading,    setLoading]    = useState(false)
  const [syncing,    setSyncing]    = useState(false)
  const [syncError,  setSyncError]  = useState('')
  const [calendars,  setCalendars]  = useState<GoogleCalendarConfig[]>([])

  // Add Calendar modal
  const [showAdd,       setShowAdd]       = useState(false)
  const [addName,       setAddName]       = useState('')
  const [addUser,       setAddUser]       = useState('')
  const [addPull,       setAddPull]       = useState(true)
  const [addPublic,     setAddPublic]     = useState(false)
  const [addPush,       setAddPush]       = useState(false)
  const [addSaving,     setAddSaving]     = useState(false)
  const [addError,      setAddError]      = useState('')

  const year  = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const weeks = useMemo(() => buildCalendarGrid(year, month), [year, month])

  // Fetch configured Google Calendars once on mount
  useEffect(() => {
    getGoogleCalendars()
      .then(setCalendars)
      .catch(() => setCalendars([]))
  }, [])

  // Fetch events whenever the view month changes
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const { from, to } = monthRange(year, month)
    getCalendarEvents(from, to)
      .then(erp => { if (!cancelled) setEvents(erp.map(erpToMeeting)) })
      .catch(() => { if (!cancelled) setEvents([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [year, month])

  // Sync all enabled Google Calendars then re-fetch
  async function handleSync() {
    if (syncing) return
    setSyncing(true)
    setSyncError('')
    try {
      await Promise.all(calendars.map(c => syncGoogleCalendar(c.name)))
      const { from, to } = monthRange(year, month)
      const erp = await getCalendarEvents(from, to)
      setEvents(erp.map(erpToMeeting))
    } catch {
      setSyncError('Sync failed. Try again.')
    } finally {
      setSyncing(false)
    }
  }

  function openAddModal() {
    setAddName('')
    setAddUser(currentUser?.username ?? '')
    setAddPull(true)
    setAddPublic(false)
    setAddPush(false)
    setAddError('')
    setShowAdd(true)
  }

  async function handleAddCalendar() {
    if (!addName.trim()) { setAddError('Calendar name is required.'); return }
    if (!addUser.trim()) { setAddError('User is required.'); return }
    setAddSaving(true)
    setAddError('')
    try {
      await createGoogleCalendar({
        calendar_name:             addName.trim(),
        user:                      addUser.trim(),
        pull_from_google_calendar: addPull   ? 1 : 0,
        sync_as_public:            addPublic ? 1 : 0,
        push_to_google_calendar:   addPush   ? 1 : 0,
      })
      const fresh = await getGoogleCalendars()
      setCalendars(fresh)
      setShowAdd(false)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
      setAddError(msg ?? 'Failed to add calendar.')
    } finally {
      setAddSaving(false)
    }
  }

  // Meetings indexed by date for the calendar grid dots
  const meetingsByDate = useMemo(() => {
    const m = new Map<string, Meeting[]>()
    events.forEach(mtg => {
      const list = m.get(mtg.date) ?? []
      list.push(mtg)
      m.set(mtg.date, list)
    })
    return m
  }, [events])

  // Sidebar panel list — filtered by tab + search
  const panelMeetings = useMemo(() => {
    const q = search.toLowerCase()
    const todayD   = new Date(todayYMD)
    const weekEnd  = new Date(todayD); weekEnd.setDate(todayD.getDate() + 6)
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)

    return events.filter(m => {
      const d = new Date(m.date)
      if (filter === 'today' && m.date !== todayYMD) return false
      if (filter === 'week'  && (d < todayD || d > weekEnd))  return false
      if (filter === 'month' && (d < todayD || d > monthEnd)) return false
      if (q && !m.title.toLowerCase().includes(q) && !m.organizer.toLowerCase().includes(q)) return false
      return true
    }).sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, filter, search, todayYMD])

  const dayMeetings = meetingsByDate.get(selectedDay) ?? []

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1))
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1))
  const goToday   = () => { setViewDate(new Date(today.getFullYear(), today.getMonth(), 1)); setSelectedDay(todayYMD) }

  const hasCalendars = calendars.length > 0

  return (
    <main className="flex flex-col h-screen overflow-hidden bg-slate-50 animate-fade-in">

      {/* ══ Header ══ */}
      <div className="flex-shrink-0 bg-white border-b border-slate-100 px-5 py-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">

          {/* Title */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#f5f3ff' }}>
              <svg fill="none" viewBox="0 0 20 20" width="16" height="16">
                <rect x="2.5" y="3.5" width="15" height="14" rx="2.5" stroke={BRAND} strokeWidth="1.5"/>
                <path d="M6.5 2v3M13.5 2v3M2.5 8h15" stroke={BRAND} strokeWidth="1.5" strokeLinecap="round"/>
                <rect x="6" y="10.5" width="3" height="3" rx="0.75" fill={BRAND} opacity=".5"/>
                <rect x="11" y="10.5" width="3" height="3" rx="0.75" fill={BRAND}/>
              </svg>
            </div>
            <div>
              <h1 className="text-[15px] font-bold text-slate-900 leading-tight">Calendar</h1>
              <p className="text-[11px] text-slate-400 leading-none mt-0.5">
                {hasCalendars
                  ? `${calendars.length} Google Calendar${calendars.length > 1 ? 's' : ''} connected`
                  : 'No Google Calendar connected — set up in ERPNext'}
              </p>
            </div>
          </div>

          {/* Search */}
          <div className="relative flex-1 max-w-xs">
            <svg fill="none" viewBox="0 0 16 16" width="13" height="13" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">
              <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M10.5 10.5L13.5 13.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search events…"
              className="w-full h-8 pl-8 pr-3 text-[12.5px] text-slate-700 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:border-transparent placeholder:text-slate-400"
              style={{ '--tw-ring-color': '#c4b5fd' } as React.CSSProperties}
            />
          </div>

          {/* Add Calendar button */}
          <button
            type="button"
            onClick={openAddModal}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12.5px] font-semibold flex-shrink-0 border transition-colors hover:bg-slate-50"
            style={{ color: BRAND, borderColor: '#ddd6fe' }}
          >
            <svg fill="none" viewBox="0 0 16 16" width="13" height="13">
              <rect x="2" y="3" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M5 1.5v3M11 1.5v3M2 7h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              <path d="M8 10v3M6.5 11.5h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            Add Calendar
          </button>

          {/* Sync button */}
          <button
            type="button"
            onClick={handleSync}
            disabled={!hasCalendars || syncing}
            className="flex items-center gap-2 h-8 px-3 rounded-lg text-[12.5px] font-semibold text-white flex-shrink-0 transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: BRAND }}
          >
            <svg
              fill="none" viewBox="0 0 16 16" width="13" height="13"
              className={syncing ? 'animate-spin' : ''}
            >
              <path d="M13.5 8a5.5 5.5 0 1 1-1.1-3.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M12 2.5l.5 2.5-2.5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {syncing ? 'Syncing…' : 'Sync'}
          </button>
        </div>

        {/* Error message */}
        {syncError && (
          <p className="mt-2 text-[11.5px] text-red-500">{syncError}</p>
        )}

        {/* Filter tabs */}
        <div className="flex items-center gap-1 mt-3">
          {(['today','week','month','all'] as FilterKey[]).map(f => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className="h-7 px-3 rounded-full text-[11.5px] font-medium transition-colors capitalize"
              style={filter === f
                ? { background: '#f5f3ff', color: BRAND, border: `1px solid #ddd6fe` }
                : { color: '#6b7280', border: '1px solid transparent' }}
            >
              {f === 'today' ? 'Today' : f === 'week' ? 'This Week' : f === 'month' ? 'This Month' : 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* ══ Body ══ */}
      <div className="flex flex-1 min-h-0 overflow-hidden flex-col lg:flex-row">

        {/* ── Calendar Grid ── */}
        <div className="flex-1 min-w-0 overflow-y-auto bg-white border-r border-slate-100 p-4">

          {/* Month nav */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-[15px] font-bold text-slate-900">
                {MONTHS[month]} <span style={{ color: BRAND }}>{year}</span>
              </h2>
              <button
                type="button"
                onClick={goToday}
                className="h-6 px-2.5 text-[11px] font-semibold rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors ml-1"
              >
                Today
              </button>
              {loading && (
                <svg fill="none" viewBox="0 0 16 16" width="13" height="13" className="animate-spin text-slate-400 ml-1">
                  <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="10"/>
                </svg>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={prevMonth}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 transition-colors">
                <svg fill="none" viewBox="0 0 16 16" width="14" height="14">
                  <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              <button type="button" onClick={nextMonth}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 transition-colors">
                <svg fill="none" viewBox="0 0 16 16" width="14" height="14">
                  <path d="M6 12l4-4-4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 mb-1">
            {WEEKDAYS.map(d => (
              <div key={d} className="text-center text-[11px] font-semibold text-slate-400 uppercase tracking-wide py-1.5">
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-px bg-slate-100 rounded-xl overflow-hidden border border-slate-100">
            {weeks.map((week, wi) =>
              week.map((day, di) => {
                if (!day) return (
                  <div key={`${wi}-${di}`} className="bg-slate-50/50 h-20 sm:h-24" />
                )
                const ymd = `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
                const isToday    = ymd === todayYMD
                const isSelected = ymd === selectedDay
                const dayMtgs    = meetingsByDate.get(ymd) ?? []

                return (
                  <div
                    key={ymd}
                    onClick={() => setSelectedDay(ymd)}
                    className="bg-white h-20 sm:h-24 p-1.5 cursor-pointer transition-colors hover:bg-slate-50 flex flex-col"
                    style={isSelected && !isToday ? { background: '#faf5ff' } : undefined}
                  >
                    <div className="flex justify-end mb-1">
                      <span
                        className="w-6 h-6 flex items-center justify-center rounded-full text-[12px] font-semibold leading-none"
                        style={isToday
                          ? { background: BRAND, color: 'white' }
                          : { color: isSelected ? BRAND : '#374151' }}
                      >
                        {day}
                      </span>
                    </div>

                    <div className="flex flex-col gap-0.5 overflow-hidden">
                      {dayMtgs.slice(0, 2).map(m => (
                        <div
                          key={m.id}
                          className="flex items-center gap-1 px-1 py-px rounded text-[9.5px] font-medium leading-tight truncate"
                          style={{ background: `${m.color}18`, color: m.color }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: m.color }} />
                          <span className="truncate hidden sm:block">{m.title}</span>
                        </div>
                      ))}
                      {dayMtgs.length > 2 && (
                        <span className="text-[9.5px] text-slate-400 pl-1">+{dayMtgs.length - 2} more</span>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Selected day detail (mobile / below calendar) */}
          {dayMeetings.length > 0 && (
            <div className="mt-4 lg:hidden">
              <h3 className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
                {selectedDay === todayYMD ? "Today's Events" : `Events on ${selectedDay}`}
              </h3>
              <div className="space-y-2">
                {dayMeetings.map(m => <MeetingCard key={m.id} meeting={m} />)}
              </div>
            </div>
          )}
        </div>

        {/* ── Events Sidebar ── */}
        <div className="hidden lg:flex flex-col w-80 xl:w-96 flex-shrink-0 bg-slate-50 overflow-hidden">

          {/* Sidebar header */}
          <div className="px-4 pt-4 pb-3 bg-white border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[13px] font-bold text-slate-800">
                  {filter === 'today' ? "Today's Events"
                    : filter === 'week' ? 'This Week'
                    : filter === 'month' ? 'This Month'
                    : 'All Events'}
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {panelMeetings.length} event{panelMeetings.length !== 1 ? 's' : ''}
                </p>
              </div>
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold"
                style={{ background: '#f5f3ff', color: BRAND }}
              >
                {panelMeetings.length}
              </div>
            </div>
          </div>

          {/* Event list */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 scrollbar-none">
            {panelMeetings.length === 0 ? (

              /* Empty state */
              <div className="flex flex-col items-center justify-center h-full text-center py-16 px-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: '#f5f3ff' }}>
                  <svg fill="none" viewBox="0 0 24 24" width="24" height="24">
                    <rect x="3" y="4" width="18" height="17" rx="3" stroke={BRAND} strokeWidth="1.6"/>
                    <path d="M8 2v4M16 2v4M3 9h18" stroke={BRAND} strokeWidth="1.6" strokeLinecap="round"/>
                    <path d="M8 14h4M8 17.5h6" stroke={BRAND} strokeWidth="1.5" strokeLinecap="round" opacity=".5"/>
                  </svg>
                </div>
                <p className="text-[13.5px] font-semibold text-slate-600 mb-1">No events found</p>
                <p className="text-[12px] text-slate-400 leading-relaxed">
                  {search
                    ? `No results for "${search}"`
                    : hasCalendars
                      ? 'Click Sync to pull latest events from Google Calendar'
                      : 'Set up Google Calendar in ERPNext, then sync here'}
                </p>
                {!search && hasCalendars && (
                  <button
                    type="button"
                    onClick={handleSync}
                    disabled={syncing}
                    className="mt-4 h-8 px-4 rounded-lg text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                    style={{ background: BRAND }}
                  >
                    {syncing ? 'Syncing…' : 'Sync Now'}
                  </button>
                )}
              </div>

            ) : (

              /* Group by date */
              (() => {
                const groups = new Map<string, Meeting[]>()
                panelMeetings.forEach(m => {
                  const g = groups.get(m.date) ?? []
                  g.push(m)
                  groups.set(m.date, g)
                })
                return [...groups.entries()].map(([date, meetings]) => {
                  const d = new Date(date + 'T00:00:00')
                  const label = date === todayYMD ? 'Today'
                    : date === toYMD(new Date(today.getTime() + 86400000)) ? 'Tomorrow'
                    : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
                  return (
                    <div key={date}>
                      <div className="flex items-center gap-2 mb-1.5 px-0.5">
                        <span className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wide">{label}</span>
                        <div className="flex-1 h-px bg-slate-200" />
                        <span className="text-[10px] text-slate-400">{meetings.length}</span>
                      </div>
                      <div className="space-y-2 mb-3">
                        {meetings.map(m => <MeetingCard key={m.id} meeting={m} />)}
                      </div>
                    </div>
                  )
                })
              })()

            )}
          </div>

          {/* Sidebar footer */}
          {hasCalendars && (
            <div className="px-3 py-3 border-t border-slate-200 bg-white">
              <div className="flex items-center gap-2.5 p-2.5 rounded-xl" style={{ background: '#f5f3ff' }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: BRAND }}>
                  <svg viewBox="0 0 18 18" width="14" height="14" fill="none">
                    <rect x="2" y="3" width="14" height="13" rx="2" stroke="white" strokeWidth="1.4"/>
                    <path d="M6 1.5v3M12 1.5v3M2 7h14" stroke="white" strokeWidth="1.4" strokeLinecap="round"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11.5px] font-semibold text-slate-700 leading-tight">
                    {calendars.map(c => c.calendar_name).join(', ')}
                  </p>
                  <p className="text-[10.5px] text-slate-400 mt-0.5 leading-tight">Google Calendar synced</p>
                </div>
                <button
                  type="button"
                  onClick={handleSync}
                  disabled={syncing}
                  className="flex-shrink-0 h-6 px-2.5 rounded-full text-[10.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ background: BRAND }}
                >
                  {syncing ? '…' : 'Sync'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ══ Add Calendar Modal ══ */}
      {showAdd && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.4)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowAdd(false) }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            {/* Modal header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: '#f5f3ff' }}>
                  <svg fill="none" viewBox="0 0 20 20" width="15" height="15">
                    <rect x="2.5" y="3.5" width="15" height="14" rx="2.5" stroke={BRAND} strokeWidth="1.5"/>
                    <path d="M6.5 2v3M13.5 2v3M2.5 8h15" stroke={BRAND} strokeWidth="1.5" strokeLinecap="round"/>
                    <path d="M10 11v4M8 13h4" stroke={BRAND} strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
                <h2 className="text-[15px] font-bold text-slate-900">Add Google Calendar</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 transition-colors"
              >
                <svg fill="none" viewBox="0 0 16 16" width="14" height="14">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              {/* Calendar Name */}
              <div>
                <label className="block text-[12px] font-semibold text-slate-600 mb-1.5">
                  Calendar Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={addName}
                  onChange={e => setAddName(e.target.value)}
                  placeholder="e.g. Team Calendar"
                  autoFocus
                  className="w-full h-9 px-3 text-[13px] text-slate-800 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:border-transparent placeholder:text-slate-400"
                  style={{ '--tw-ring-color': '#c4b5fd' } as React.CSSProperties}
                />
              </div>

              {/* User */}
              <div>
                <label className="block text-[12px] font-semibold text-slate-600 mb-1.5">
                  User <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={addUser}
                  onChange={e => setAddUser(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full h-9 px-3 text-[13px] text-slate-800 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:border-transparent placeholder:text-slate-400"
                  style={{ '--tw-ring-color': '#c4b5fd' } as React.CSSProperties}
                />
              </div>

              {/* Checkboxes */}
              <div className="space-y-2.5 pt-1">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={addPull}
                    onChange={e => setAddPull(e.target.checked)}
                    className="w-4 h-4 rounded accent-violet-600"
                  />
                  <span className="text-[12.5px] text-slate-700">Pull from Google Calendar</span>
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={addPublic}
                    onChange={e => setAddPublic(e.target.checked)}
                    className="w-4 h-4 rounded accent-violet-600"
                  />
                  <span className="text-[12.5px] text-slate-700">Sync events from Google as public</span>
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={addPush}
                    onChange={e => setAddPush(e.target.checked)}
                    className="w-4 h-4 rounded accent-violet-600"
                  />
                  <span className="text-[12.5px] text-slate-700">Push to Google Calendar</span>
                </label>
              </div>

              {addError && (
                <p className="text-[11.5px] text-red-500">{addError}</p>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="h-9 px-4 rounded-lg text-[13px] font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddCalendar}
                disabled={addSaving}
                className="h-9 px-4 rounded-lg text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: BRAND }}
              >
                {addSaving ? 'Adding…' : 'Add Calendar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
