import { useEffect, useMemo, useState } from 'react'
import {
  prepareForFullSync,
  createErpEvent,
  createGoogleCalendar,
  getCalendarEvents,
  getGoogleCalendars,
  getGoogleCalendarAuthUrl,
  searchDoctype,
  syncGoogleCalendar,
  CRM_DOCTYPES,
  type DoctypeRecord,
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
  date: string
  startTime: string
  endTime: string
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

function fmtTimeShort(t: string): string {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const suffix = h >= 12 ? 'p' : 'a'
  const h12 = h % 12 || 12
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2,'0')}${suffix}`
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

function formatOwner(email: string): string {
  const local = email.split('@')[0]
  return local.split(/[._-]/).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
}

function deriveStatus(startsOn: string, endsOn: string | null): MeetingStatus {
  const now   = new Date()
  const start = new Date(startsOn)
  const end   = endsOn ? new Date(endsOn) : new Date(start.getTime() + 30 * 60_000)
  if (now > end)    return 'Completed'
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

// ─── Calendar Grid Builder ────────────────────────────────────────────────────

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

function MeetingCard({ meeting, compact = false }: { meeting: Meeting; compact?: boolean }) {
  const sc = statusCfg(meeting.status)
  return (
    <div
      className="rounded-xl bg-white border border-slate-100 hover:shadow-sm transition-shadow cursor-pointer"
      style={{ borderLeft: `3px solid ${meeting.color}`, padding: compact ? '9px 12px' : '12px 14px' }}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <h4 className="font-semibold text-slate-800 leading-snug line-clamp-2"
          style={{ fontSize: compact ? '12px' : '13px' }}>
          {meeting.title}
        </h4>
        <span
          className="flex-shrink-0 flex items-center gap-1 font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap"
          style={{ background: sc.bg, color: sc.text, fontSize: '9.5px' }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: sc.dot }} />
          {sc.label}
        </span>
      </div>
      <div className="flex items-center gap-3 flex-wrap" style={{ fontSize: '11px', color: '#64748b' }}>
        {meeting.startTime && (
          <span className="flex items-center gap-1">
            <svg fill="none" viewBox="0 0 12 12" width="10" height="10">
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M6 3.5V6l1.5 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            {fmtTime(meeting.startTime)}
            {meeting.endTime && meeting.endTime !== meeting.startTime ? ` – ${fmtTime(meeting.endTime)}` : ''}
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded-full flex items-center justify-center font-bold text-white flex-shrink-0"
            style={{ background: hashColor(meeting.organizer), fontSize: '7px' }}>
            {initials(meeting.organizer)}
          </span>
          {meeting.organizer}
        </span>
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
  const [filter,      setFilter]      = useState<FilterKey>('all')

  const [events,     setEvents]     = useState<Meeting[]>([])
  const [loading,    setLoading]    = useState(false)
  const [syncing,    setSyncing]    = useState(false)
  const [syncError,  setSyncError]  = useState('')
  const [needsReAuth,  setNeedsReAuth]  = useState(false)
  const [calendars,  setCalendars]  = useState<GoogleCalendarConfig[]>([])

  // Add Calendar modal
  const [showAdd,       setShowAdd]       = useState(false)
  const [addStep,       setAddStep]       = useState<'form' | 'authorize'>('form')
  const [addName,       setAddName]       = useState('')
  const [addUser,       setAddUser]       = useState('')
  const [addPull,       setAddPull]       = useState(true)
  const [addPublic,     setAddPublic]     = useState(true)
  const [addPush,       setAddPush]       = useState(true)
  const [addSaving,     setAddSaving]     = useState(false)
  const [addError,      setAddError]      = useState('')
  const [addedCalName,  setAddedCalName]  = useState('')
  const [authorizing,   setAuthorizing]   = useState(false)

  // Add Event modal
  const [showEvent,    setShowEvent]    = useState(false)
  const [evtSubject,   setEvtSubject]   = useState('')
  const [evtDate,      setEvtDate]      = useState('')
  const [evtStartTime, setEvtStartTime] = useState('09:00')
  const [evtEndTime,   setEvtEndTime]   = useState('10:00')
  const [evtAllDay,    setEvtAllDay]    = useState(false)
  const [evtCategory,  setEvtCategory]  = useState('Event')
  const [evtType,      setEvtType]      = useState('Private')
  const [evtColor,     setEvtColor]     = useState('')
  const [evtRepeat,    setEvtRepeat]    = useState(false)
  const [evtLocation,  setEvtLocation]  = useState('')
  const [evtStatus,    setEvtStatus]    = useState('Open')
  const [evtAttending, setEvtAttending] = useState('Yes')
  const [evtSyncGCal,  setEvtSyncGCal]  = useState(false)
  const [evtVideoConf, setEvtVideoConf] = useState(false)
  const [evtGCalLink,  setEvtGCalLink]  = useState('')
  const [evtPulled,    setEvtPulled]    = useState(false)
  const [evtDesc,      setEvtDesc]      = useState('')
  const [evtSaving,    setEvtSaving]    = useState(false)
  const [evtError,     setEvtError]     = useState('')
  const [evtTab,       setEvtTab]       = useState<'details' | 'participants'>('details')

  // Participants tab
  interface Participant { reference_doctype: string; reference_docname: string; display: string }
  const [evtParticipants, setEvtParticipants] = useState<Participant[]>([])
  const [pDoctype,        setPDoctype]        = useState(CRM_DOCTYPES[0])
  const [pQuery,          setPQuery]          = useState('')
  const [pResults,        setPResults]        = useState<DoctypeRecord[]>([])
  const [pSearching,      setPSearching]      = useState(false)
  const [pSelected,       setPSelected]       = useState<DoctypeRecord | null>(null)

  const year  = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const weeks = useMemo(() => buildCalendarGrid(year, month), [year, month])

  useEffect(() => {
    getGoogleCalendars().then(setCalendars).catch(() => setCalendars([]))
  }, [])

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

  async function handleReAuthorize() {
    if (!calendars[0]) return
    try {
      const url = await getGoogleCalendarAuthUrl(calendars[0].name)
      window.open(url, '_blank')
    } catch {
      setSyncError('Could not get authorization URL. Re-authorize from ERPNext desk.')
    }
  }

  async function handleSync() {
    if (syncing) return
    setSyncing(true)
    setSyncError('')
    setNeedsReAuth(false)
    try {
      await Promise.allSettled(calendars.map(c => prepareForFullSync(c.name)))
      const syncResults = await Promise.all(calendars.map(c => syncGoogleCalendar(c.name)))
      console.log('[Sync] messages from ERPNext:', syncResults.flat())

      const now = new Date()
      const from = `${now.getFullYear() - 1}-${String(now.getMonth() + 1).padStart(2,'0')}-01`
      const farYear = now.getFullYear() + 1
      const farMonth = now.getMonth() + 1
      const farLast = new Date(farYear, farMonth, 0).getDate()
      const to = `${farYear}-${String(farMonth).padStart(2,'0')}-${String(farLast).padStart(2,'0')}`
      const erp = await getCalendarEvents(from, to)
      setEvents(erp.map(erpToMeeting))
    } catch (e: unknown) {
      const raw = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? ''
      const isAuthErr = /no google|credential|authoriz|oauth|token/i.test(raw)
      setSyncError(isAuthErr ? 'Google Calendar not authorized for pull. Re-authorize below.' : (raw || 'Sync failed. Try again.'))
      setNeedsReAuth(isAuthErr)
    } finally {
      setSyncing(false)
    }
  }

  function openAddModal() {
    setAddStep('form')
    setAddName(currentUser?.fullName ?? '')
    setAddUser(currentUser?.username ?? '')
    setAddPull(true); setAddPublic(true); setAddPush(true)
    setAddError(''); setAddedCalName('')
    setShowAdd(true)
  }

  async function handleAddCalendar() {
    if (!addName.trim()) { setAddError('Calendar name is required.'); return }
    if (!addUser.trim()) { setAddError('User is required.'); return }
    setAddSaving(true); setAddError('')
    try {
      const created = await createGoogleCalendar({
        calendar_name:             addName.trim(),
        user:                      addUser.trim(),
        pull_from_google_calendar: addPull   ? 1 : 0,
        sync_as_public:            addPublic ? 1 : 0,
        push_to_google_calendar:   addPush   ? 1 : 0,
      })
      const fresh = await getGoogleCalendars()
      setCalendars(fresh)
      setAddedCalName(created.name)
      setAddStep('authorize')
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
      setAddError(msg ?? 'Failed to add calendar.')
    } finally { setAddSaving(false) }
  }

  async function handleAuthorize() {
    if (!addedCalName || authorizing) return
    setAuthorizing(true)
    try {
      const url = await getGoogleCalendarAuthUrl(addedCalName)
      window.open(url, '_blank')
      setShowAdd(false)
    } catch { setAddError('Could not get authorization URL. Try again.') }
    finally { setAuthorizing(false) }
  }

  function openEventModal() {
    setEvtSubject(''); setEvtDate(selectedDay)
    setEvtStartTime('09:00'); setEvtEndTime('10:00')
    setEvtAllDay(false); setEvtCategory('Event'); setEvtType('Private')
    setEvtColor(''); setEvtRepeat(false); setEvtLocation('')
    setEvtStatus('Open'); setEvtAttending('Yes')
    setEvtSyncGCal(false); setEvtVideoConf(false); setEvtGCalLink('')
    setEvtPulled(false); setEvtDesc(''); setEvtError('')
    setEvtTab('details'); setEvtParticipants([])
    setPDoctype(CRM_DOCTYPES[0]); setPQuery(''); setPResults([]); setPSelected(null)
    setShowEvent(true)
  }

  async function handleAddEvent() {
    if (!evtSubject.trim()) { setEvtError('Subject is required.'); return }
    setEvtSaving(true); setEvtError('')
    try {
      const starts_on = evtAllDay ? `${evtDate} 00:00:00` : `${evtDate} ${evtStartTime}:00`
      const ends_on   = evtAllDay ? `${evtDate} 23:59:59` : `${evtDate} ${evtEndTime}:00`
      await createErpEvent({
        subject:                     evtSubject.trim(),
        starts_on, ends_on,
        all_day:                     evtAllDay     ? 1 : 0,
        event_category:              evtCategory,
        event_type:                  evtType,
        color:                       evtColor      || undefined,
        repeat_this_event:           evtRepeat     ? 1 : 0,
        location:                    evtLocation.trim() || undefined,
        status:                      evtStatus,
        attending:                   evtAttending,
        sync_with_google_calendar:   evtSyncGCal   ? 1 : 0,
        add_video_conferencing:      evtVideoConf  ? 1 : 0,
        google_calendar:             evtGCalLink   || undefined,
        pulled_from_google_calendar: evtPulled     ? 1 : 0,
        event_participants: evtParticipants.map(p => ({
          doctype:           'Event Participants' as const,
          reference_doctype: p.reference_doctype,
          reference_docname: p.reference_docname,
        })),
        description: evtDesc.trim() || undefined,
      })
      const { from, to } = monthRange(year, month)
      const erp = await getCalendarEvents(from, to)
      setEvents(erp.map(erpToMeeting))
      setShowEvent(false)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
      setEvtError(msg ?? 'Failed to create event.')
    } finally { setEvtSaving(false) }
  }

  async function handleParticipantSearch(q: string) {
    setPQuery(q); setPSelected(null)
    if (!q.trim()) { setPResults([]); return }
    setPSearching(true)
    try { setPResults(await searchDoctype(pDoctype, q)) }
    catch { setPResults([]) }
    finally { setPSearching(false) }
  }

  function addParticipant() {
    if (!pSelected) return
    if (evtParticipants.some(p => p.reference_doctype === pDoctype && p.reference_docname === pSelected.name)) return
    setEvtParticipants(prev => [...prev, { reference_doctype: pDoctype, reference_docname: pSelected.name, display: pSelected.display }])
    setPSelected(null); setPQuery(''); setPResults([])
  }

  function removeParticipant(i: number) {
    setEvtParticipants(prev => prev.filter((_, idx) => idx !== i))
  }

  const meetingsByDate = useMemo(() => {
    const m = new Map<string, Meeting[]>()
    events.forEach(mtg => {
      const list = m.get(mtg.date) ?? []
      list.push(mtg)
      m.set(mtg.date, list)
    })
    return m
  }, [events])

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

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <main className="flex flex-col overflow-hidden bg-white animate-fade-in h-screen md:h-[calc(100vh-48px)]">

      {/* ══ Header ══ */}
      <header className="flex-shrink-0 bg-white" style={{ borderBottom: '1px solid #f1f5f9' }}>
        <div className="flex items-center gap-3 px-5 h-[54px]">

          {/* Brand */}
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: '#ede9fe' }}>
              <svg fill="none" viewBox="0 0 20 20" width="15" height="15">
                <rect x="2.5" y="3.5" width="15" height="14" rx="2.5" stroke={BRAND} strokeWidth="1.5"/>
                <path d="M6.5 2v3M13.5 2v3M2.5 8h15" stroke={BRAND} strokeWidth="1.5" strokeLinecap="round"/>
                <rect x="6" y="10.5" width="3" height="3" rx="0.75" fill={BRAND} opacity=".5"/>
                <rect x="11" y="10.5" width="3" height="3" rx="0.75" fill={BRAND}/>
              </svg>
            </div>
            <span className="text-[14px] font-bold text-slate-900 hidden sm:block">Calendar</span>
          </div>

          {/* Month nav */}
          <div className="flex items-center gap-0.5 ml-1">
            <button type="button" onClick={prevMonth}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
              <svg fill="none" viewBox="0 0 16 16" width="14" height="14">
                <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <h2 className="text-[14px] font-bold text-slate-900 w-40 text-center select-none">
              {MONTHS[month]} <span style={{ color: BRAND }}>{year}</span>
            </h2>
            <button type="button" onClick={nextMonth}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
              <svg fill="none" viewBox="0 0 16 16" width="14" height="14">
                <path d="M6 12l4-4-4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <button type="button" onClick={goToday}
              className="ml-1 h-7 px-2.5 text-[11px] font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
              Today
            </button>
            {loading && (
              <svg fill="none" viewBox="0 0 16 16" width="13" height="13" className="animate-spin text-slate-400 ml-1">
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="10"/>
              </svg>
            )}
          </div>

          <div className="flex-1" />

          {/* Search */}
          <div className="relative hidden md:block">
            <svg fill="none" viewBox="0 0 16 16" width="12" height="12"
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
              <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M10.5 10.5L13.5 13.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search events…"
              className="w-44 h-8 pl-7 pr-3 text-[12px] bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 text-slate-700 placeholder:text-slate-400"
              style={{ '--tw-ring-color': '#c4b5fd' } as React.CSSProperties}
            />
          </div>

          {/* Add Event */}
          <button type="button" onClick={openEventModal}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-semibold border transition-colors hover:bg-violet-50 flex-shrink-0"
            style={{ color: BRAND, borderColor: '#ddd6fe' }}>
            <svg fill="none" viewBox="0 0 14 14" width="11" height="11">
              <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M7 4.5v5M4.5 7h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            Add Event
          </button>

          {/* Calendar connect / Sync */}
          {!hasCalendars ? (
            <div className="flex items-center gap-1 flex-shrink-0">
              <button type="button" onClick={openAddModal}
                className="h-8 px-3 rounded-lg text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
                style={{ background: BRAND }}>
                Add Calendar
              </button>
              <span className="text-slate-300 text-[10px] select-none">›</span>
              <button disabled className="h-8 px-3 rounded-lg text-[12px] font-semibold border border-slate-200 text-slate-400 cursor-not-allowed">Authorize</button>
              <span className="text-slate-300 text-[10px] select-none">›</span>
              <button disabled className="h-8 px-3 rounded-lg text-[12px] font-semibold border border-slate-200 text-slate-400 cursor-not-allowed">Sync</button>
            </div>
          ) : (
            <button type="button" onClick={handleSync} disabled={syncing}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-semibold text-white flex-shrink-0 transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: BRAND }}>
              <svg fill="none" viewBox="0 0 16 16" width="12" height="12" className={syncing ? 'animate-spin' : ''}>
                <path d="M13.5 8a5.5 5.5 0 1 1-1.1-3.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M12 2.5l.5 2.5-2.5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {syncing ? 'Syncing…' : 'Sync'}
            </button>
          )}
        </div>

        {/* Sync error banner */}
        {syncError && (
          <div className="flex items-center gap-2 px-5 py-2 border-t border-red-100" style={{ background: '#fff5f5' }}>
            <svg fill="none" viewBox="0 0 16 16" width="13" height="13" className="text-red-400 flex-shrink-0">
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M8 5v3.5M8 10v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <p className="text-[11.5px] text-red-600 flex-1">{syncError}</p>
            {needsReAuth && calendars[0] && (
              <button type="button" onClick={handleReAuthorize}
                className="flex-shrink-0 h-6 px-3 rounded-lg text-[11px] font-semibold text-white"
                style={{ background: '#ea4335' }}>
                Re-authorize Google
              </button>
            )}
          </div>
        )}
      </header>

      {/* ══ Body ══ */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── Calendar Grid ── */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden" style={{ borderRight: '1px solid #f1f5f9' }}>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 flex-shrink-0" style={{ borderBottom: '1px solid #f1f5f9' }}>
            {WEEKDAYS.map((d, i) => (
              <div key={d} className="py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: i === 0 || i === 6 ? '#c4b5fd' : '#94a3b8' }}>
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="flex-1 overflow-hidden" style={{ borderLeft: '1px solid #f1f5f9' }}>
            <div className="grid grid-cols-7 h-full" style={{ gridTemplateRows: `repeat(${weeks.length}, 1fr)` }}>
              {weeks.map((week, wi) =>
                week.map((day, di) => {
                  if (!day) return (
                    <div key={`${wi}-${di}`}
                      style={{ borderRight: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9', background: '#fafafa' }} />
                  )
                  const ymd = `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
                  const isToday    = ymd === todayYMD
                  const isSelected = ymd === selectedDay
                  const dayMtgs    = meetingsByDate.get(ymd) ?? []
                  const isPast     = ymd < todayYMD
                  const isWeekend  = di === 0 || di === 6

                  return (
                    <div
                      key={ymd}
                      onClick={() => setSelectedDay(ymd)}
                      className="p-2 cursor-pointer flex flex-col transition-colors overflow-hidden"
                      style={{
                        borderRight: '1px solid #f1f5f9',
                        borderBottom: '1px solid #f1f5f9',
                        background: isSelected ? '#faf5ff' : isWeekend ? '#fdfcff' : 'white',
                      }}
                    >
                      {/* Date number row */}
                      <div className="flex items-start justify-between mb-1.5">
                        <span
                          className="w-7 h-7 flex items-center justify-center rounded-full text-[12.5px] font-bold leading-none transition-all"
                          style={isToday
                            ? { background: BRAND, color: 'white' }
                            : isSelected
                              ? { background: '#ede9fe', color: BRAND }
                              : { color: isPast ? '#c4b5fd' : isWeekend ? '#a78bfa' : '#1e293b' }}
                        >
                          {day}
                        </span>
                        {dayMtgs.length > 0 && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none"
                            style={{
                              background: isSelected || isToday ? '#ede9fe' : '#f1f5f9',
                              color: isSelected || isToday ? BRAND : '#94a3b8',
                            }}>
                            {dayMtgs.length}
                          </span>
                        )}
                      </div>

                      {/* Event chips */}
                      <div className="flex flex-col gap-[3px] flex-1 overflow-hidden">
                        {dayMtgs.slice(0, 3).map(m => (
                          <div key={m.id}
                            className="flex items-center gap-1 pl-1.5 pr-1 py-[3px] rounded-md text-[10px] font-medium leading-tight"
                            style={{
                              background: `${m.color}12`,
                              borderLeft: `2px solid ${m.color}`,
                              color: m.color,
                            }}
                          >
                            {m.startTime && (
                              <span className="flex-shrink-0 text-[9px] opacity-60 font-normal hidden sm:block">
                                {fmtTimeShort(m.startTime)}
                              </span>
                            )}
                            <span className="truncate">{m.title}</span>
                          </div>
                        ))}
                        {dayMtgs.length > 3 && (
                          <span className="text-[9.5px] pl-1.5 mt-0.5 font-medium" style={{ color: '#a78bfa' }}>
                            +{dayMtgs.length - 3} more
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>

        {/* ── Events Sidebar ── */}
        <div className="hidden lg:flex w-[300px] xl:w-[320px] flex-shrink-0 flex-col bg-white overflow-hidden">

          {/* Selected day panel */}
          <div className="flex-shrink-0" style={{ borderBottom: '1px solid #f1f5f9' }}>
            <div className="flex items-start justify-between px-4 pt-4 pb-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-0.5"
                  style={{ color: selectedDay === todayYMD ? BRAND : '#94a3b8' }}>
                  {selectedDay === todayYMD
                    ? '● Today'
                    : new Date(selectedDay + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long' })}
                </p>
                <h3 className="text-[15px] font-bold text-slate-900">
                  {new Date(selectedDay + 'T12:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
                </h3>
              </div>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-[13px] font-bold flex-shrink-0 mt-0.5"
                style={{ background: '#ede9fe', color: BRAND }}>
                {dayMeetings.length}
              </div>
            </div>

            <div className="px-3 pb-3 max-h-[200px] overflow-y-auto space-y-1.5">
              {dayMeetings.length === 0 ? (
                <p className="text-[11.5px] text-slate-400 px-1 pb-1">
                  No events — click any date in the grid
                </p>
              ) : (
                dayMeetings.map(m => <MeetingCard key={m.id} meeting={m} compact />)
              )}
            </div>
          </div>

          {/* All events section */}
          <div className="flex flex-col flex-1 min-h-0">

            {/* Filter tabs */}
            <div className="flex gap-0.5 px-3 py-2 flex-shrink-0" style={{ borderBottom: '1px solid #f1f5f9' }}>
              {(['today','week','month','all'] as FilterKey[]).map(f => (
                <button key={f} type="button" onClick={() => setFilter(f)}
                  className="flex-1 h-7 rounded-lg text-[11px] font-semibold transition-colors"
                  style={filter === f
                    ? { background: '#ede9fe', color: BRAND }
                    : { color: '#94a3b8' }}>
                  {f === 'today' ? 'Today' : f === 'week' ? 'Week' : f === 'month' ? 'Month' : 'All'}
                </button>
              ))}
            </div>

            {/* Event list */}
            <div className="flex-1 overflow-y-auto px-3 py-2">
              {panelMeetings.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-12 text-center">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3" style={{ background: '#f5f3ff' }}>
                    <svg fill="none" viewBox="0 0 24 24" width="20" height="20">
                      <rect x="3" y="4" width="18" height="17" rx="3" stroke={BRAND} strokeWidth="1.5"/>
                      <path d="M8 2v4M16 2v4M3 9h18" stroke={BRAND} strokeWidth="1.5" strokeLinecap="round"/>
                      <path d="M8 14h4M8 17.5h6" stroke={BRAND} strokeWidth="1.5" strokeLinecap="round" opacity=".5"/>
                    </svg>
                  </div>
                  <p className="text-[12.5px] font-semibold text-slate-600 mb-1">No events</p>
                  <p className="text-[11px] text-slate-400 leading-relaxed px-2">
                    {search
                      ? `No results for "${search}"`
                      : hasCalendars
                        ? 'Sync to pull latest from Google Calendar'
                        : 'Add a calendar to get started'}
                  </p>
                  {!search && hasCalendars && (
                    <button type="button" onClick={handleSync} disabled={syncing}
                      className="mt-3 h-7 px-3 rounded-lg text-[11.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                      style={{ background: BRAND }}>
                      {syncing ? 'Syncing…' : 'Sync Now'}
                    </button>
                  )}
                </div>
              ) : (
                (() => {
                  const groups = new Map<string, Meeting[]>()
                  panelMeetings.forEach(m => {
                    const g = groups.get(m.date) ?? []
                    g.push(m)
                    groups.set(m.date, g)
                  })
                  return [...groups.entries()].map(([date, meetings]) => {
                    const d = new Date(date + 'T12:00:00')
                    const label = date === todayYMD ? 'Today'
                      : date === toYMD(new Date(today.getTime() + 86400000)) ? 'Tomorrow'
                      : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
                    return (
                      <div key={date} className="mb-4">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: '#94a3b8' }}>{label}</span>
                          <div className="flex-1 h-px" style={{ background: '#f1f5f9' }} />
                          <span className="text-[10px]" style={{ color: '#cbd5e1' }}>{meetings.length}</span>
                        </div>
                        <div className="space-y-1.5">
                          {meetings.map(m => <MeetingCard key={m.id} meeting={m} compact />)}
                        </div>
                      </div>
                    )
                  })
                })()
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ══ Add Event Modal ══ */}
      {showEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15,10,30,0.55)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowEvent(false) }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex overflow-hidden"
            style={{ maxHeight: '82vh', height: '82vh' }}>

            {/* ── Left panel: form ── */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

              {/* Tabs + close */}
              <div className="flex items-center justify-between px-6 pt-4 pb-3 flex-shrink-0"
                style={{ borderBottom: '1px solid #f1f5f9' }}>
                <div className="flex gap-1 p-1 rounded-xl" style={{ background: '#f5f3ff' }}>
                  {(['details', 'participants'] as const).map(t => (
                    <button key={t} type="button" onClick={() => setEvtTab(t)}
                      className="h-8 px-5 rounded-lg text-[12px] font-semibold capitalize transition-all"
                      style={evtTab === t
                        ? { background: 'white', color: BRAND, boxShadow: '0 1px 3px rgba(123,63,242,0.15)' }
                        : { color: '#a78bfa', background: 'transparent' }}>
                      {t}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => setShowEvent(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
                  <svg fill="none" viewBox="0 0 16 16" width="14" height="14">
                    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>

              {/* Scrollable form body */}
              <div className="overflow-y-auto flex-1 px-6 py-4">
                {evtTab === 'details' && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[12px] font-semibold text-slate-600 mb-1.5">
                        Subject <span className="text-red-400">*</span>
                      </label>
                      <input type="text" value={evtSubject} onChange={e => setEvtSubject(e.target.value)}
                        placeholder="Event title…" autoFocus
                        className="w-full h-9 px-3 text-[13px] text-slate-800 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:border-transparent placeholder:text-slate-400"
                        style={{ '--tw-ring-color': '#c4b5fd' } as React.CSSProperties}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[12px] font-semibold text-slate-600 mb-1.5">Date</label>
                        <input type="date" value={evtDate} onChange={e => setEvtDate(e.target.value)}
                          className="w-full h-9 px-3 text-[13px] text-slate-800 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:border-transparent"
                          style={{ '--tw-ring-color': '#c4b5fd' } as React.CSSProperties}
                        />
                      </div>
                      <div className="flex items-end pb-2">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input type="checkbox" checked={evtAllDay} onChange={e => setEvtAllDay(e.target.checked)}
                            className="w-4 h-4 rounded accent-violet-600" />
                          <span className="text-[12.5px] text-slate-700">All Day</span>
                        </label>
                      </div>
                    </div>

                    {!evtAllDay && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[12px] font-semibold text-slate-600 mb-1.5">Start Time</label>
                          <input type="time" value={evtStartTime} onChange={e => setEvtStartTime(e.target.value)}
                            className="w-full h-9 px-3 text-[13px] text-slate-800 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:border-transparent"
                            style={{ '--tw-ring-color': '#c4b5fd' } as React.CSSProperties}
                          />
                        </div>
                        <div>
                          <label className="block text-[12px] font-semibold text-slate-600 mb-1.5">End Time</label>
                          <input type="time" value={evtEndTime} onChange={e => setEvtEndTime(e.target.value)}
                            className="w-full h-9 px-3 text-[13px] text-slate-800 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:border-transparent"
                            style={{ '--tw-ring-color': '#c4b5fd' } as React.CSSProperties}
                          />
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[12px] font-semibold text-slate-600 mb-1.5">Category</label>
                        <select value={evtCategory} onChange={e => setEvtCategory(e.target.value)}
                          className="w-full h-9 px-3 text-[13px] text-slate-800 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:border-transparent bg-white"
                          style={{ '--tw-ring-color': '#c4b5fd' } as React.CSSProperties}>
                          {['Event','Meeting','Call','Email','Other'].map(o => <option key={o}>{o}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[12px] font-semibold text-slate-600 mb-1.5">Type</label>
                        <select value={evtType} onChange={e => setEvtType(e.target.value)}
                          className="w-full h-9 px-3 text-[13px] text-slate-800 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:border-transparent bg-white"
                          style={{ '--tw-ring-color': '#c4b5fd' } as React.CSSProperties}>
                          {['Public','Private','Confidential'].map(o => <option key={o}>{o}</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[12px] font-semibold text-slate-600 mb-1.5">Status</label>
                        <select value={evtStatus} onChange={e => setEvtStatus(e.target.value)}
                          className="w-full h-9 px-3 text-[13px] text-slate-800 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:border-transparent bg-white"
                          style={{ '--tw-ring-color': '#c4b5fd' } as React.CSSProperties}>
                          {['Open','Closed','Cancelled'].map(o => <option key={o}>{o}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[12px] font-semibold text-slate-600 mb-1.5">Attending</label>
                        <select value={evtAttending} onChange={e => setEvtAttending(e.target.value)}
                          className="w-full h-9 px-3 text-[13px] text-slate-800 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:border-transparent bg-white"
                          style={{ '--tw-ring-color': '#c4b5fd' } as React.CSSProperties}>
                          {['Yes','No','Maybe'].map(o => <option key={o}>{o}</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[12px] font-semibold text-slate-600 mb-1.5">Color</label>
                        <div className="flex items-center gap-2">
                          <input type="color" value={evtColor || '#7B3FF2'} onChange={e => setEvtColor(e.target.value)}
                            className="w-9 h-9 rounded-lg border border-slate-200 cursor-pointer p-0.5 bg-white" />
                          <span className="text-[12px] text-slate-500 truncate">{evtColor || 'Pick a color'}</span>
                        </div>
                      </div>
                      <div>
                        <label className="block text-[12px] font-semibold text-slate-600 mb-1.5">Location</label>
                        <input type="text" value={evtLocation} onChange={e => setEvtLocation(e.target.value)}
                          placeholder="Optional…"
                          className="w-full h-9 px-3 text-[13px] text-slate-800 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:border-transparent placeholder:text-slate-400"
                          style={{ '--tw-ring-color': '#c4b5fd' } as React.CSSProperties}
                        />
                      </div>
                    </div>

                    <div className="space-y-2 pt-0.5">
                      <label className="flex items-center gap-2.5 cursor-pointer select-none">
                        <input type="checkbox" checked={evtRepeat} onChange={e => setEvtRepeat(e.target.checked)}
                          className="w-4 h-4 rounded accent-violet-600" />
                        <span className="text-[12.5px] text-slate-700">Repeat this Event</span>
                      </label>
                      <label className="flex items-center gap-2.5 cursor-pointer select-none">
                        <input type="checkbox" checked={evtSyncGCal}
                          onChange={e => { setEvtSyncGCal(e.target.checked); if (!e.target.checked) setEvtVideoConf(false) }}
                          className="w-4 h-4 rounded accent-violet-600" />
                        <span className="text-[12.5px] text-slate-700">Sync with Google Calendar</span>
                      </label>

                      {evtSyncGCal && (
                        <div className="ml-6 pl-3 border-l-2 border-slate-100 space-y-3">
                          <label className="flex items-center gap-2.5 cursor-pointer select-none">
                            <input type="checkbox" checked={evtVideoConf} onChange={e => setEvtVideoConf(e.target.checked)}
                              className="w-4 h-4 rounded accent-violet-600" />
                            <span className="text-[12.5px] text-slate-700">Add Video Conferencing</span>
                            <span className="text-[11px] text-slate-400">via Google Meet</span>
                          </label>
                          <div>
                            <label className="block text-[12px] font-semibold text-slate-600 mb-1.5">Google Calendar</label>
                            <select value={evtGCalLink} onChange={e => setEvtGCalLink(e.target.value)}
                              className="w-full h-9 px-3 text-[13px] text-slate-800 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:border-transparent bg-white"
                              style={{ '--tw-ring-color': '#c4b5fd' } as React.CSSProperties}>
                              <option value="">— None —</option>
                              {calendars.map(c => <option key={c.name} value={c.name}>{c.calendar_name}</option>)}
                            </select>
                          </div>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-[12px] font-semibold text-slate-600 mb-1.5">Description</label>
                      <textarea value={evtDesc} onChange={e => setEvtDesc(e.target.value)}
                        rows={3} placeholder="Optional notes…"
                        className="w-full px-3 py-2 text-[13px] text-slate-800 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:border-transparent placeholder:text-slate-400 resize-none"
                        style={{ '--tw-ring-color': '#c4b5fd' } as React.CSSProperties}
                      />
                    </div>

                    {evtError && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: '#fff5f5' }}>
                        <svg fill="none" viewBox="0 0 14 14" width="12" height="12" className="text-red-400 flex-shrink-0">
                          <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3"/>
                          <path d="M7 4.5v3M7 8.5v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                        </svg>
                        <p className="text-[11.5px] text-red-500">{evtError}</p>
                      </div>
                    )}
                  </div>
                )}

                {evtTab === 'participants' && (
                  <div className="space-y-4">
                    <div className="flex items-end gap-2">
                      <div className="w-36 flex-shrink-0">
                        <label className="block text-[12px] font-semibold text-slate-600 mb-1.5">Reference Type</label>
                        <select value={pDoctype} onChange={e => { setPDoctype(e.target.value); setPQuery(''); setPResults([]); setPSelected(null) }}
                          className="w-full h-9 px-2 text-[12.5px] text-slate-800 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:border-transparent bg-white"
                          style={{ '--tw-ring-color': '#c4b5fd' } as React.CSSProperties}>
                          {CRM_DOCTYPES.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                      </div>
                      <div className="flex-1 relative">
                        <label className="block text-[12px] font-semibold text-slate-600 mb-1.5">Reference Name</label>
                        <input type="text"
                          value={pSelected ? pSelected.display : pQuery}
                          onChange={e => { setPSelected(null); handleParticipantSearch(e.target.value) }}
                          placeholder={`Search ${pDoctype}…`}
                          className="w-full h-9 px-3 text-[13px] text-slate-800 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:border-transparent placeholder:text-slate-400"
                          style={{ '--tw-ring-color': '#c4b5fd' } as React.CSSProperties}
                        />
                        {pResults.length > 0 && !pSelected && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-10 overflow-hidden max-h-48 overflow-y-auto">
                            {pSearching && <div className="px-3 py-2 text-[12px] text-slate-400">Searching…</div>}
                            {pResults.map(r => (
                              <button key={r.name} type="button"
                                onClick={() => { setPSelected(r); setPResults([]) }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 transition-colors">
                                <span className="text-[12.5px] font-medium text-slate-800">{r.display}</span>
                                <span className="text-[11px] text-slate-400 ml-auto">{r.name}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <button type="button" onClick={addParticipant} disabled={!pSelected}
                        className="h-9 px-3 rounded-lg text-[12.5px] font-semibold text-white flex-shrink-0 transition-opacity hover:opacity-90 disabled:opacity-40"
                        style={{ background: BRAND }}>
                        Add
                      </button>
                    </div>

                    {evtParticipants.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3" style={{ background: '#f5f3ff' }}>
                          <svg fill="none" viewBox="0 0 24 24" width="20" height="20">
                            <circle cx="9" cy="7" r="4" stroke={BRAND} strokeWidth="1.5"/>
                            <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" stroke={BRAND} strokeWidth="1.5" strokeLinecap="round"/>
                            <path d="M19 8v6M16 11h6" stroke={BRAND} strokeWidth="1.5" strokeLinecap="round"/>
                          </svg>
                        </div>
                        <p className="text-[13px] font-semibold text-slate-600">No participants yet</p>
                        <p className="text-[12px] text-slate-400 mt-1">Search and add participants above</p>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-slate-100 overflow-hidden divide-y divide-slate-100">
                        {evtParticipants.map((p, i) => (
                          <div key={i} className="flex items-center gap-3 px-4 py-3">
                            <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                              style={{ background: '#f5f3ff', color: BRAND }}>
                              {p.reference_doctype}
                            </span>
                            <span className="text-[13px] font-medium text-slate-800 flex-1 truncate">{p.display}</span>
                            <span className="text-[11px] text-slate-400 truncate max-w-[120px]">{p.reference_docname}</span>
                            <button type="button" onClick={() => removeParticipant(i)}
                              className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-400 transition-colors flex-shrink-0">
                              <svg fill="none" viewBox="0 0 16 16" width="12" height="12">
                                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-6 py-4 flex-shrink-0"
                style={{ borderTop: '1px solid #f1f5f9' }}>
                <span className="text-[12px] text-slate-400">
                  {evtParticipants.length > 0
                    ? `${evtParticipants.length} participant${evtParticipants.length !== 1 ? 's' : ''}`
                    : ''}
                </span>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setShowEvent(false)}
                    className="h-9 px-4 rounded-lg text-[13px] font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors">
                    Cancel
                  </button>
                  <button type="button" onClick={handleAddEvent} disabled={evtSaving}
                    className="h-9 px-5 rounded-lg text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)' }}>
                    {evtSaving ? 'Saving…' : 'Save Event'}
                  </button>
                </div>
              </div>
            </div>

            {/* ── Right panel: preview sidebar ── */}
            <div className="w-52 flex-shrink-0 flex flex-col p-5 relative overflow-hidden"
              style={{ background: 'linear-gradient(160deg, #5b21b6 0%, #7c3aed 55%, #8b5cf6 100%)' }}>
              <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-10" style={{ background: 'white' }} />
              <div className="absolute -bottom-6 -left-8 w-28 h-28 rounded-full opacity-10" style={{ background: 'white' }} />

              {/* Icon + title */}
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center mb-4 relative z-10"
                style={{ background: 'rgba(255,255,255,0.18)' }}>
                <svg fill="none" viewBox="0 0 20 20" width="17" height="17">
                  <rect x="2.5" y="3.5" width="15" height="14" rx="2.5" stroke="white" strokeWidth="1.5"/>
                  <path d="M6.5 2v3M13.5 2v3M2.5 8h15M10 11v4M8 13h4" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <h2 className="text-[17px] font-bold text-white mb-0.5 relative z-10">New Event</h2>
              <p className="text-[11.5px] mb-5 relative z-10" style={{ color: 'rgba(255,255,255,0.55)' }}>Add to your calendar</p>

              {/* Date preview */}
              <div className="rounded-xl p-3 mb-3 relative z-10"
                style={{ background: 'rgba(255,255,255,0.14)' }}>
                <p className="text-[9.5px] font-bold uppercase tracking-widest mb-1"
                  style={{ color: 'rgba(255,255,255,0.5)' }}>Date</p>
                <p className="text-[13.5px] font-bold text-white leading-snug">
                  {evtDate
                    ? new Date(evtDate + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
                    : '—'}
                </p>
                {evtAllDay
                  ? <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.6)' }}>All day</p>
                  : evtStartTime
                    ? <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.6)' }}>
                        {fmtTime(evtStartTime)}{evtEndTime && evtEndTime !== evtStartTime ? ` – ${fmtTime(evtEndTime)}` : ''}
                      </p>
                    : null}
              </div>

              {/* Subject preview */}
              {evtSubject ? (
                <div className="rounded-xl p-3 mb-3 relative z-10" style={{ background: 'rgba(255,255,255,0.1)' }}>
                  <p className="text-[9.5px] font-bold uppercase tracking-widest mb-1"
                    style={{ color: 'rgba(255,255,255,0.5)' }}>Event</p>
                  <p className="text-[13px] font-semibold text-white leading-snug line-clamp-3">{evtSubject}</p>
                </div>
              ) : (
                <div className="rounded-xl p-3 mb-3 relative z-10"
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1px dashed rgba(255,255,255,0.2)' }}>
                  <p className="text-[12px]" style={{ color: 'rgba(255,255,255,0.38)' }}>Start typing a title…</p>
                </div>
              )}

              {/* Location preview */}
              {evtLocation && (
                <div className="flex items-start gap-1.5 relative z-10 mb-2">
                  <svg fill="none" viewBox="0 0 14 14" width="11" height="11" className="mt-0.5 flex-shrink-0"
                    style={{ color: 'rgba(255,255,255,0.5)' }}>
                    <path d="M7 1C4.79 1 3 2.79 3 5c0 3.25 4 8 4 8s4-4.75 4-8c0-2.21-1.79-4-4-4z" stroke="currentColor" strokeWidth="1.2"/>
                    <circle cx="7" cy="5" r="1.5" stroke="currentColor" strokeWidth="1.2"/>
                  </svg>
                  <p className="text-[11.5px] leading-snug line-clamp-2" style={{ color: 'rgba(255,255,255,0.6)' }}>{evtLocation}</p>
                </div>
              )}

              <div className="flex-1" />

              {/* Participant count */}
              {evtParticipants.length > 0 && (
                <div className="flex items-center gap-2 relative z-10">
                  <svg fill="none" viewBox="0 0 14 14" width="12" height="12" style={{ color: 'rgba(255,255,255,0.6)' }}>
                    <circle cx="5.5" cy="4" r="2.5" stroke="currentColor" strokeWidth="1.1"/>
                    <path d="M1 12v-1a4.5 4.5 0 0 1 9 0v1" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
                  </svg>
                  <span className="text-[11.5px]" style={{ color: 'rgba(255,255,255,0.65)' }}>
                    {evtParticipants.length} participant{evtParticipants.length !== 1 ? 's' : ''}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ Add Calendar Modal ══ */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={e => { if (e.target === e.currentTarget) setShowAdd(false) }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">

            {addStep === 'form' && <>
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: '#f5f3ff' }}>
                    <svg fill="none" viewBox="0 0 20 20" width="15" height="15">
                      <rect x="2.5" y="3.5" width="15" height="14" rx="2.5" stroke={BRAND} strokeWidth="1.5"/>
                      <path d="M6.5 2v3M13.5 2v3M2.5 8h15M10 11v4M8 13h4" stroke={BRAND} strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <h2 className="text-[15px] font-bold text-slate-900">Add Google Calendar</h2>
                </div>
                <button type="button" onClick={() => setShowAdd(false)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 transition-colors">
                  <svg fill="none" viewBox="0 0 16 16" width="14" height="14">
                    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-[12px] font-semibold text-slate-600 mb-1.5">Calendar Name <span className="text-red-400">*</span></label>
                  <input type="text" value={addName} onChange={e => setAddName(e.target.value)}
                    placeholder="e.g. Team Calendar" autoFocus
                    className="w-full h-9 px-3 text-[13px] text-slate-800 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:border-transparent placeholder:text-slate-400"
                    style={{ '--tw-ring-color': '#c4b5fd' } as React.CSSProperties}
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-slate-600 mb-1.5">User <span className="text-red-400">*</span></label>
                  <input type="text" value={addUser} onChange={e => setAddUser(e.target.value)}
                    placeholder="user@example.com"
                    className="w-full h-9 px-3 text-[13px] text-slate-800 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:border-transparent placeholder:text-slate-400"
                    style={{ '--tw-ring-color': '#c4b5fd' } as React.CSSProperties}
                  />
                </div>
                <div className="space-y-2.5 pt-1">
                  {[
                    { label: 'Pull from Google Calendar',          val: addPull,   set: setAddPull   },
                    { label: 'Sync events from Google as public',  val: addPublic, set: setAddPublic },
                    { label: 'Push to Google Calendar',            val: addPush,   set: setAddPush   },
                  ].map(({ label, val, set }) => (
                    <label key={label} className="flex items-center gap-2.5 cursor-pointer select-none">
                      <input type="checkbox" checked={val} onChange={e => set(e.target.checked)}
                        className="w-4 h-4 rounded accent-violet-600" />
                      <span className="text-[12.5px] text-slate-700">{label}</span>
                    </label>
                  ))}
                </div>
                {addError && <p className="text-[11.5px] text-red-500">{addError}</p>}
              </div>

              <div className="flex items-center justify-end gap-2 mt-6">
                <button type="button" onClick={() => setShowAdd(false)}
                  className="h-9 px-4 rounded-lg text-[13px] font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
                <button type="button" onClick={handleAddCalendar} disabled={addSaving}
                  className="h-9 px-4 rounded-lg text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ background: BRAND }}>
                  {addSaving ? 'Adding…' : 'Add Calendar'}
                </button>
              </div>
            </>}

            {addStep === 'authorize' && <>
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: '#f0fdf4' }}>
                    <svg fill="none" viewBox="0 0 20 20" width="15" height="15">
                      <path d="M4 10l4 4 8-8" stroke="#16a34a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <h2 className="text-[15px] font-bold text-slate-900">Calendar Added</h2>
                </div>
                <button type="button" onClick={() => setShowAdd(false)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 transition-colors">
                  <svg fill="none" viewBox="0 0 16 16" width="14" height="14">
                    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>

              <div className="rounded-xl p-4 mb-5" style={{ background: '#f5f3ff' }}>
                <p className="text-[13px] font-semibold text-slate-800 mb-1">Authorize Google Calendar Access</p>
                <p className="text-[12px] text-slate-500 leading-relaxed">
                  Your calendar was created. Now authorize it so ERPNext can sync events with your Google account.
                  You'll be redirected to Google — come back and click Sync when done.
                </p>
              </div>

              {addError && <p className="text-[11.5px] text-red-500 mb-3">{addError}</p>}

              <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={() => setShowAdd(false)}
                  className="h-9 px-4 rounded-lg text-[13px] font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors">
                  Skip for now
                </button>
                <button type="button" onClick={handleAuthorize} disabled={authorizing}
                  className="flex items-center gap-2 h-9 px-4 rounded-lg text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ background: BRAND }}>
                  <svg viewBox="0 0 18 18" width="13" height="13" fill="none">
                    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908C16.658 14.075 17.64 11.767 17.64 9.2z" fill="white" opacity=".9"/>
                    <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="white" opacity=".8"/>
                    <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="white" opacity=".7"/>
                    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="white" opacity=".9"/>
                  </svg>
                  {authorizing ? 'Opening…' : 'Authorize Google Calendar'}
                </button>
              </div>
            </>}
          </div>
        </div>
      )}
    </main>
  )
}
