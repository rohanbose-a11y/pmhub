import { useMemo, useState } from 'react'

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

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_MEETINGS: Meeting[] = [
  {
    id: '1',
    title: 'Team Standup',
    date: '2026-08-05',
    startTime: '09:00',
    endTime: '09:30',
    organizer: 'Rohan Bose',
    organizerEmail: 'rohan.bose@sauramandala.org',
    status: 'Completed',
    color: '#6366f1',
    description: 'Daily sync to discuss blockers and progress',
  },
  {
    id: '2',
    title: 'Sprint Planning',
    date: '2026-08-06',
    startTime: '10:00',
    endTime: '11:30',
    organizer: 'Rohan Bose',
    organizerEmail: 'rohan.bose@sauramandala.org',
    status: 'Completed',
    color: '#8b5cf6',
    description: 'Plan tasks and goals for the upcoming sprint',
  },
  {
    id: '3',
    title: 'Design Review',
    date: '2026-08-06',
    startTime: '14:00',
    endTime: '15:00',
    organizer: 'Sarah Chen',
    organizerEmail: 'sarah.chen@sauramandala.org',
    status: 'Ongoing',
    color: '#ec4899',
    description: 'Review new UI mockups with the design team',
  },
  {
    id: '4',
    title: 'Client Presentation',
    date: '2026-08-06',
    startTime: '17:00',
    endTime: '18:00',
    organizer: 'Neil Kumar',
    organizerEmail: 'neil@sauramandala.org',
    status: 'Upcoming',
    color: '#f59e0b',
    description: 'Present Q3 progress to the client stakeholders',
  },
  {
    id: '5',
    title: 'Product Roadmap Discussion',
    date: '2026-08-07',
    startTime: '11:00',
    endTime: '12:30',
    organizer: 'Rohan Bose',
    organizerEmail: 'rohan.bose@sauramandala.org',
    status: 'Upcoming',
    color: '#10b981',
  },
  {
    id: '6',
    title: '1:1 with Manager',
    date: '2026-08-08',
    startTime: '09:00',
    endTime: '09:30',
    organizer: 'Atanu Das',
    organizerEmail: 'atanu@sauramandala.org',
    status: 'Upcoming',
    color: '#6366f1',
  },
  {
    id: '7',
    title: 'Monthly All-Hands',
    date: '2026-08-12',
    startTime: '10:00',
    endTime: '11:30',
    organizer: 'Rohan Bose',
    organizerEmail: 'rohan.bose@sauramandala.org',
    status: 'Upcoming',
    color: '#7B3FF2',
    description: 'Company-wide meeting to share updates and wins',
  },
  {
    id: '8',
    title: 'Team Offsite Planning',
    date: '2026-08-15',
    startTime: '14:00',
    endTime: '16:00',
    organizer: 'Sarah Chen',
    organizerEmail: 'sarah.chen@sauramandala.org',
    status: 'Upcoming',
    color: '#f97316',
  },
  {
    id: '9',
    title: 'Tech Stack Review',
    date: '2026-08-19',
    startTime: '15:00',
    endTime: '16:00',
    organizer: 'Neil Kumar',
    organizerEmail: 'neil@sauramandala.org',
    status: 'Upcoming',
    color: '#14b8a6',
  },
  {
    id: '10',
    title: 'Quarterly Planning',
    date: '2026-08-27',
    startTime: '09:00',
    endTime: '12:00',
    organizer: 'Rohan Bose',
    organizerEmail: 'rohan.bose@sauramandala.org',
    status: 'Upcoming',
    color: '#8b5cf6',
    description: 'Plan goals and OKRs for Q4 2026',
  },
]

// ─── Constants ────────────────────────────────────────────────────────────────

const BRAND   = '#7B3FF2'
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS   = ['January','February','March','April','May','June','July','August','September','October','November','December']

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function fmtTime(t: string): string {
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

function avatarColor(name: string): string {
  const COLORS = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6','#f97316','#14b8a6']
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return COLORS[h % COLORS.length]
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
  const ac = avatarColor(meeting.organizer)
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
        <div className="flex items-center gap-1.5 text-[11.5px] text-slate-500">
          <svg fill="none" viewBox="0 0 16 16" width="12" height="12" className="flex-shrink-0 text-slate-400">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M8 5v3.5l2 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          {fmtTime(meeting.startTime)} – {fmtTime(meeting.endTime)}
        </div>

        {/* Organizer */}
        <div className="flex items-center gap-1.5 text-[11.5px] text-slate-500">
          <div
            className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-bold text-white flex-shrink-0"
            style={{ background: ac }}
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
  const today = new Date()
  const todayYMD = toYMD(today)

  const [viewDate, setViewDate]       = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedDay, setSelectedDay] = useState(todayYMD)
  const [search, setSearch]           = useState('')
  const [filter, setFilter]           = useState<FilterKey>('today')

  const year  = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const weeks = useMemo(() => buildCalendarGrid(year, month), [year, month])

  // Meetings on each day of the current view
  const meetingsByDate = useMemo(() => {
    const m = new Map<string, Meeting[]>()
    MOCK_MEETINGS.forEach(mtg => {
      const list = m.get(mtg.date) ?? []
      list.push(mtg)
      m.set(mtg.date, list)
    })
    return m
  }, [])

  // Panel meetings: filtered by filter + search
  const panelMeetings = useMemo(() => {
    const q = search.toLowerCase()
    const todayD = new Date(todayYMD)
    const weekEnd = new Date(todayD); weekEnd.setDate(todayD.getDate() + 6)
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)

    return MOCK_MEETINGS.filter(m => {
      const d = new Date(m.date)
      if (filter === 'today')  { if (m.date !== todayYMD) return false }
      if (filter === 'week')   { if (d < todayD || d > weekEnd) return false }
      if (filter === 'month')  { if (d < todayD || d > monthEnd) return false }
      if (q) {
        if (!m.title.toLowerCase().includes(q) && !m.organizer.toLowerCase().includes(q)) return false
      }
      return true
    }).sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, search, todayYMD])

  // Selected day meetings (for calendar click)
  const dayMeetings = meetingsByDate.get(selectedDay) ?? []

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1))
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1))
  const goToday   = () => { setViewDate(new Date(today.getFullYear(), today.getMonth(), 1)); setSelectedDay(todayYMD) }

  return (
    <main className="flex flex-col h-screen overflow-hidden bg-slate-50 animate-fade-in">

      {/* ══ Header ══ */}
      <div className="flex-shrink-0 bg-white border-b border-slate-100 px-5 py-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">

          {/* Title + Connect button */}
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
              <p className="text-[11px] text-slate-400 leading-none mt-0.5">View and manage your meetings</p>
            </div>
          </div>

          {/* Search */}
          <div className="flex items-center gap-1.5 flex-1 max-w-xs">
            <div className="relative flex-1">
              <svg fill="none" viewBox="0 0 16 16" width="13" height="13" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">
                <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M10.5 10.5L13.5 13.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search meetings…"
                className="w-full h-8 pl-8 pr-3 text-[12.5px] text-slate-700 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:border-transparent placeholder:text-slate-400"
                style={{ '--tw-ring-color': '#c4b5fd' } as React.CSSProperties}
              />
            </div>
          </div>

          {/* Connect Google Calendar button */}
          <button
            type="button"
            className="flex items-center gap-2 h-8 px-3 rounded-lg text-[12.5px] font-semibold text-white flex-shrink-0 transition-opacity hover:opacity-90"
            style={{ background: BRAND }}
          >
            {/* Google "G" icon */}
            <svg viewBox="0 0 18 18" width="14" height="14" fill="none">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#fff" opacity=".9"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#fff" opacity=".8"/>
              <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#fff" opacity=".7"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#fff" opacity=".9"/>
            </svg>
            Connect Google Calendar
          </button>
        </div>

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
                    {/* Day number */}
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

                    {/* Meeting dots / chips */}
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
                {selectedDay === todayYMD ? "Today's Meetings" : `Meetings on ${selectedDay}`}
              </h3>
              <div className="space-y-2">
                {dayMeetings.map(m => <MeetingCard key={m.id} meeting={m} />)}
              </div>
            </div>
          )}
        </div>

        {/* ── Meetings Sidebar ── */}
        <div className="hidden lg:flex flex-col w-80 xl:w-96 flex-shrink-0 bg-slate-50 overflow-hidden">

          {/* Sidebar header */}
          <div className="px-4 pt-4 pb-3 bg-white border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[13px] font-bold text-slate-800">
                  {filter === 'today' ? "Today's Meetings"
                    : filter === 'week' ? 'This Week'
                    : filter === 'month' ? 'This Month'
                    : 'All Meetings'}
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {panelMeetings.length} meeting{panelMeetings.length !== 1 ? 's' : ''}
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

          {/* Meeting list */}
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
                <p className="text-[13.5px] font-semibold text-slate-600 mb-1">No meetings found</p>
                <p className="text-[12px] text-slate-400 leading-relaxed">
                  {search
                    ? `No results for "${search}"`
                    : 'Connect Google Calendar to sync your meetings automatically'}
                </p>
                {!search && (
                  <button
                    type="button"
                    className="mt-4 h-8 px-4 rounded-lg text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
                    style={{ background: BRAND }}
                  >
                    Connect Google Calendar
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

          {/* Sidebar footer — connect nudge */}
          {panelMeetings.length > 0 && (
            <div className="px-3 py-3 border-t border-slate-200 bg-white">
              <div className="flex items-center gap-2.5 p-2.5 rounded-xl" style={{ background: '#f5f3ff' }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: BRAND }}>
                  <svg viewBox="0 0 18 18" width="14" height="14" fill="none">
                    <rect x="2" y="3" width="14" height="13" rx="2" stroke="white" strokeWidth="1.4"/>
                    <path d="M6 1.5v3M12 1.5v3M2 7h14" stroke="white" strokeWidth="1.4" strokeLinecap="round"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11.5px] font-semibold text-slate-700 leading-tight">Sync Google Calendar</p>
                  <p className="text-[10.5px] text-slate-400 mt-0.5 leading-tight">Auto-import your meetings</p>
                </div>
                <button
                  type="button"
                  className="flex-shrink-0 h-6 px-2.5 rounded-full text-[10.5px] font-semibold text-white transition-opacity hover:opacity-90"
                  style={{ background: BRAND }}
                >
                  Connect
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
