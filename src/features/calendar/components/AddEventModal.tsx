import { useEffect, useState } from 'react'
import { RichTextEditor } from '../../../shared/components/RichTextEditor'
import { employeeApi } from '../../../api/employeeApi'
import { useAuthStore } from '../../../store/authStore'
import {
  createErpEvent,
  updateErpEvent,
  getGoogleCalendars,
  searchDoctype,
  type DoctypeRecord,
  type ErpEventDetail,
  type GoogleCalendarConfig,
} from '../../../api/calendarApi'
import { formatUserDisplay } from '../../../shared/lib/formatUserDisplay'

// ─── Constants / helpers (local copies — CalendarPage keeps its own) ──────────

const BRAND  = '#7B3FF2'
const COLORS = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6','#f97316','#14b8a6']

function fmtTime(t: string): string {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`
}

function hashColor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return COLORS[h % COLORS.length]
}

function todayYMD(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Participant {
  reference_doctype: string
  reference_docname: string
  display: string
  email?: string
}

export interface AddEventModalProps {
  open:           boolean
  onClose:        () => void
  onCreated?:     () => void
  onUpdated?:     () => void
  /** When provided the modal runs in edit mode */
  event?:          ErpEventDetail
  /** Pre-fill the subject field — useful when opening from a task */
  defaultSubject?: string
  /** Pre-fill the date field (YYYY-MM-DD) — defaults to today */
  defaultDate?:    string
  /** Override the z-index when stacked on top of another modal (default 50) */
  zIndex?:         number
  /** Task assignees to pre-populate as event participants */
  defaultAssignees?: string[]
  /** Pre-fill the description field — useful when opening from a task */
  defaultDescription?: string
  /** When set, silently links the event to this Task so it appears in the task's Meet tab */
  linkedTaskId?: string
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AddEventModal({
  open,
  onClose,
  onCreated,
  onUpdated,
  event,
  defaultSubject = '',
  defaultDate,
  zIndex = 50,
  defaultAssignees,
  defaultDescription,
  linkedTaskId,
}: AddEventModalProps) {
  const isEditMode = Boolean(event)
  const currentUser = useAuthStore(s => s.user)
  const [calendars, setCalendars] = useState<GoogleCalendarConfig[]>([])

  // ── Form state ──────────────────────────────────────────────────────────────
  const [evtSubject,   setEvtSubject]   = useState(defaultSubject)
  const [evtDate,      setEvtDate]      = useState(defaultDate ?? todayYMD())
  const [evtStartTime, setEvtStartTime] = useState('09:00')
  const [evtEndTime,   setEvtEndTime]   = useState('10:00')
  const [evtAllDay,    setEvtAllDay]    = useState(false)
  const [evtCategory,  setEvtCategory]  = useState('Meeting')
  const [evtType,      setEvtType]      = useState('Private')
  const [evtRepeat,    setEvtRepeat]    = useState(false)
  const [evtRepeatOn,   setEvtRepeatOn]   = useState('Daily')
  const [evtRepeatTill, setEvtRepeatTill] = useState('')
  const [evtRepeatDays, setEvtRepeatDays] = useState<string[]>([])
  const [evtLocation,  setEvtLocation]  = useState('')
  const [evtStatus,    setEvtStatus]    = useState('Open')
  const [evtAttending, setEvtAttending] = useState('Yes')
  const [evtSyncGCal,  setEvtSyncGCal]  = useState(false)
  const [evtVideoConf, setEvtVideoConf] = useState(false)
  const [evtGCalLink,  setEvtGCalLink]  = useState('')
  const [evtDesc,      setEvtDesc]      = useState('')
  const [editorKey,    setEditorKey]    = useState(0)
  const [evtSaving,    setEvtSaving]    = useState(false)
  const [evtError,     setEvtError]     = useState('')
  const [evtTab,       setEvtTab]       = useState<'details' | 'participants'>('details')

  // ── Participants sub-form ───────────────────────────────────────────────────
  const [evtParticipants, setEvtParticipants] = useState<Participant[]>([])
  const pDoctype = 'Contact'
  const [pQuery,          setPQuery]          = useState('')
  const [pResults,        setPResults]        = useState<DoctypeRecord[]>([])
  const [pSearching,      setPSearching]      = useState(false)
  const [pSelected,       setPSelected]       = useState<DoctypeRecord | null>(null)

  // ── Fetch connected calendars once ─────────────────────────────────────────
  useEffect(() => {
    getGoogleCalendars()
      .then(setCalendars)
      .catch(() => setCalendars([]))
  }, [])

  // ── Populate form when modal opens ────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    setEvtError(''); setEvtTab('details')
    setPQuery(''); setPResults([]); setPSelected(null)
    setEditorKey(k => k + 1)

    if (event) {
      // ── Edit mode: pre-fill from existing event ──
      const parts = event.starts_on.includes(' ') ? event.starts_on.split(' ') : [event.starts_on, '00:00:00']
      const date  = parts[0]
      const startTime = parts[1].slice(0, 5)
      const endTime   = event.ends_on?.includes(' ') ? event.ends_on.split(' ')[1].slice(0, 5) : startTime
      setEvtSubject(event.subject)
      setEvtDate(date)
      setEvtStartTime(startTime); setEvtEndTime(endTime)
      setEvtAllDay(false); setEvtCategory('Meeting')
      setEvtType(event.event_type || 'Private')
      setEvtRepeat(Boolean(event.repeat_this_event))
      setEvtRepeatOn(event.repeat_on || 'Daily')
      setEvtRepeatTill(event.repeat_till || '')
      setEvtRepeatDays([])
      setEvtLocation(event.location || '')
      setEvtStatus('Open'); setEvtAttending('Yes')
      setEvtDesc(event.description ?? '')
      setEvtParticipants(
        (event.event_participants ?? []).map(p => ({
          reference_doctype: p.reference_doctype,
          reference_docname: p.reference_docname,
          display: p.reference_docname,
          email: p.email ?? '',
        }))
      )
      if (event.google_calendar) {
        setEvtSyncGCal(true); setEvtGCalLink(event.google_calendar)
        setEvtVideoConf(Boolean(event.google_meet_link))
      } else if (calendars.length > 0) {
        setEvtSyncGCal(true); setEvtVideoConf(true); setEvtGCalLink(calendars[0].name)
      } else {
        setEvtSyncGCal(false); setEvtVideoConf(false); setEvtGCalLink('')
      }
    } else {
      // ── Create mode: reset to defaults ──
      setEvtSubject(defaultSubject)
      setEvtDate(defaultDate ?? todayYMD())
      setEvtStartTime('09:00'); setEvtEndTime('10:00')
      setEvtAllDay(false); setEvtCategory('Meeting'); setEvtType('Private')
      setEvtRepeat(false); setEvtRepeatOn('Daily'); setEvtRepeatTill(''); setEvtRepeatDays([]); setEvtLocation('')
      if (currentUser?.username) {
        employeeApi.findByUser(currentUser.username)
          .then(emp => { if (emp?.branch) setEvtLocation(emp.branch) })
          .catch(() => {})
      }
      setEvtStatus('Open'); setEvtAttending('Yes'); setEvtDesc(defaultDescription ?? '')
      setEvtParticipants((defaultAssignees ?? []).map(u => ({
        reference_doctype: 'User',
        reference_docname: u,
        display: formatUserDisplay(u) || u,
        email: u,
      })))
      if (calendars.length > 0) {
        setEvtSyncGCal(true); setEvtVideoConf(true); setEvtGCalLink(calendars[0].name)
      } else {
        setEvtSyncGCal(false); setEvtVideoConf(false); setEvtGCalLink('')
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // ── Auto-enable sync when calendars load for the first time ───────────────
  useEffect(() => {
    if (calendars.length > 0 && open) {
      setEvtSyncGCal(true); setEvtVideoConf(true); setEvtGCalLink(calendars[0].name)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendars])

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!evtSubject.trim()) { setEvtError('Subject is required.'); return }
    if (evtRepeat && !evtRepeatTill) { setEvtError('Please set a "Repeat Till" date — required for repeat events.'); return }
    setEvtSaving(true); setEvtError('')
    try {
      const starts_on = evtAllDay ? `${evtDate} 00:00:00` : `${evtDate} ${evtStartTime}:00`
      const ends_on   = evtAllDay ? `${evtDate} 23:59:59` : `${evtDate} ${evtEndTime}:00`
      const payload = {
        subject:                   evtSubject.trim(),
        starts_on, ends_on,
        all_day:                   evtAllDay    ? 1 : 0 as 0 | 1,
        event_category:            evtCategory,
        event_type:                evtType,
        repeat_this_event:         evtRepeat    ? 1 : 0 as 0 | 1,
        ...(evtRepeat ? {
          repeat_on:  evtRepeatOn,
          repeat_till: evtRepeatTill || undefined,
          ...(evtRepeatOn === 'Weekly' ? {
            monday:    (evtRepeatDays.includes('Monday')    ? 1 : 0) as 0 | 1,
            tuesday:   (evtRepeatDays.includes('Tuesday')   ? 1 : 0) as 0 | 1,
            wednesday: (evtRepeatDays.includes('Wednesday') ? 1 : 0) as 0 | 1,
            thursday:  (evtRepeatDays.includes('Thursday')  ? 1 : 0) as 0 | 1,
            friday:    (evtRepeatDays.includes('Friday')    ? 1 : 0) as 0 | 1,
          } : {}),
        } : {}),
        location:                  evtLocation.trim() || undefined,
        status:                    evtStatus,
        attending:                 evtAttending,
        sync_with_google_calendar: evtSyncGCal  ? 1 : 0 as 0 | 1,
        add_video_conferencing:    evtVideoConf ? 1 : 0 as 0 | 1,
        google_calendar:           evtGCalLink  || undefined,
        event_participants: [
          // Link back to the originating task so it appears in the task's Meet tab
          ...(linkedTaskId ? [{ doctype: 'Event Participants' as const, reference_doctype: 'Task', reference_docname: linkedTaskId }] : []),
          ...evtParticipants.map(p => ({
            doctype:           'Event Participants' as const,
            reference_doctype: p.reference_doctype,
            reference_docname: p.reference_docname,
            ...(p.email ? { email: p.email } : {}),
          })),
        ],
        description: evtDesc.trim() || undefined,
      }
      if (isEditMode && event) {
        await updateErpEvent(event.name, payload)
        onUpdated?.()
      } else {
        await createErpEvent({ ...payload, pulled_from_google_calendar: 0 })
        onCreated?.()
      }
      onClose()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
      setEvtError(msg ?? (isEditMode ? 'Failed to update event.' : 'Failed to create event.'))
    } finally { setEvtSaving(false) }
  }

  // ── Participant helpers ─────────────────────────────────────────────────────
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
    if (evtParticipants.some(p => p.reference_doctype === pDoctype && p.reference_docname === pSelected!.name)) return
    setEvtParticipants(prev => [
      ...prev,
      { reference_doctype: pDoctype, reference_docname: pSelected!.name, display: pSelected!.display, email: pSelected!.email },
    ])
    setPSelected(null); setPQuery(''); setPResults([])
  }

  function removeParticipant(i: number) {
    setEvtParticipants(prev => prev.filter((_, idx) => idx !== i))
  }

  if (!open) return null

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex, background: 'rgba(15,10,30,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={e => { e.stopPropagation(); if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-[1180px] flex overflow-hidden"
        style={{ maxHeight: '94vh', height: '94vh' }}
      >
        {/* ── Left: form ── */}
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
            <button type="button" onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
              <svg fill="none" viewBox="0 0 16 16" width="14" height="14">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          {/* Scrollable form body */}
          <div className="overflow-y-auto flex-1 px-6 py-4 [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: 'none' }}>

            {evtTab === 'details' && (
              <div className="space-y-4">
                {/* Subject */}
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

                {/* Date · Start · End · All Day — single row */}
                <div className="flex items-end gap-2 flex-wrap">
                  <div className="flex-1 min-w-[120px]">
                    <label className="block text-[12px] font-semibold text-slate-600 mb-1.5">Date</label>
                    <input type="date" value={evtDate} onChange={e => setEvtDate(e.target.value)}
                      className="w-full h-9 px-3 text-[13px] text-slate-800 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:border-transparent"
                      style={{ '--tw-ring-color': '#c4b5fd' } as React.CSSProperties}
                    />
                  </div>
                  {!evtAllDay && <>
                    <div className="flex-1 min-w-[90px]">
                      <label className="block text-[12px] font-semibold text-slate-600 mb-1.5">Start</label>
                      <input type="time" value={evtStartTime} onChange={e => {
                        const t = e.target.value
                        setEvtStartTime(t)
                        if (t) {
                          const [h, m] = t.split(':').map(Number)
                          const end = new Date(0, 0, 0, h, m + 60)
                          setEvtEndTime(`${String(end.getHours()).padStart(2,'0')}:${String(end.getMinutes()).padStart(2,'0')}`)
                        }
                      }}
                        className="w-full h-9 px-3 text-[13px] text-slate-800 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:border-transparent"
                        style={{ '--tw-ring-color': '#c4b5fd' } as React.CSSProperties}
                      />
                    </div>
                    <div className="flex-1 min-w-[90px]">
                      <label className="block text-[12px] font-semibold text-slate-600 mb-1.5">End</label>
                      <input type="time" value={evtEndTime} onChange={e => setEvtEndTime(e.target.value)}
                        className="w-full h-9 px-3 text-[13px] text-slate-800 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:border-transparent"
                        style={{ '--tw-ring-color': '#c4b5fd' } as React.CSSProperties}
                      />
                    </div>
                  </>}
                  <div className="flex items-center h-9 flex-shrink-0">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input type="checkbox" checked={evtAllDay} onChange={e => setEvtAllDay(e.target.checked)}
                        className="w-4 h-4 rounded accent-violet-600" />
                      <span className="text-[12.5px] text-slate-700">All Day</span>
                    </label>
                  </div>
                </div>

                {/* Category · Status · Type */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[12px] font-semibold text-slate-600 mb-1.5">Category</label>
                    <select value={evtCategory} onChange={e => setEvtCategory(e.target.value)}
                      className="w-full h-9 px-3 text-[13px] text-slate-800 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:border-transparent bg-white"
                      style={{ '--tw-ring-color': '#c4b5fd' } as React.CSSProperties}>
                      {['Event','Meeting','Call','Email','Other'].map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[12px] font-semibold text-slate-600 mb-1.5">Status</label>
                    <select value={evtStatus} onChange={e => setEvtStatus(e.target.value)}
                      className="w-full h-9 px-3 text-[13px] text-slate-800 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:border-transparent bg-white"
                      style={{ '--tw-ring-color': '#c4b5fd' } as React.CSSProperties}>
                      {['Open','Closed','Cancelled'].map(o => <option key={o}>{o}</option>)}
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

                {/* Attending · Location */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[12px] font-semibold text-slate-600 mb-1.5">Attending</label>
                    <select value={evtAttending} onChange={e => setEvtAttending(e.target.value)}
                      className="w-full h-9 px-3 text-[13px] text-slate-800 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:border-transparent bg-white"
                      style={{ '--tw-ring-color': '#c4b5fd' } as React.CSSProperties}>
                      {['Yes','No','Maybe'].map(o => <option key={o}>{o}</option>)}
                    </select>
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

                {/* ── Row 1: Repeat (hidden — RRULE UNTIL not supported by this ERPNext version) ── */}
                {false && <div className="flex items-stretch p-1 bg-slate-50 border border-slate-200 rounded-xl">
                  {/* Repeat toggle */}
                  <label className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer select-none transition-all flex-shrink-0 ${evtRepeat ? 'bg-white shadow-sm border border-slate-200' : 'hover:bg-slate-100'}`}>
                    <span className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border-2 transition-all ${evtRepeat ? 'bg-violet-600 border-violet-600' : 'border-slate-300 bg-white'}`}>
                      {evtRepeat && <svg fill="none" viewBox="0 0 10 10" width="8" height="8"><path d="M1.5 5l2.5 2.5 4.5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </span>
                    <input type="checkbox" checked={evtRepeat} onChange={e => setEvtRepeat(e.target.checked)} className="sr-only" />
                    <svg fill="none" viewBox="0 0 14 14" width="12" height="12" className="text-slate-400 flex-shrink-0">
                      <path d="M11 3.5l2 2-2 2M3 3.5H13M3 10.5l-2-2 2-2M11 10.5H1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span className="text-[12px] font-medium text-slate-700 whitespace-nowrap">Repeat</span>
                  </label>

                  {/* Repeat On + Repeat Till — inline when repeat is on */}
                  {evtRepeat && <>
                    <div className="w-px bg-slate-200 self-stretch my-1 mx-1 flex-shrink-0" />
                    <div className="flex items-center gap-1.5 px-3 flex-shrink-0">
                      <span className="text-[11px] text-slate-400 whitespace-nowrap">every</span>
                      <select value={evtRepeatOn} onChange={e => setEvtRepeatOn(e.target.value)}
                        className="h-7 pl-2 pr-6 text-[12px] font-medium text-slate-700 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 appearance-none cursor-pointer"
                        style={{ '--tw-ring-color': '#c4b5fd', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'%3E%3Cpath d='M2 3.5l3 3 3-3' stroke='%2394a3b8' stroke-width='1.2' stroke-linecap='round' stroke-linejoin='round' fill='none'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 4px center', paddingRight: '20px' } as React.CSSProperties}>
                        <option value="Daily">Daily</option>
                        <option value="Weekly">Weekly (Mon–Fri)</option>
                        <option value="Monthly">Monthly</option>
                        <option value="Yearly">Yearly</option>
                      </select>
                    </div>
                    {/* Day toggles — Weekly only */}
                    {evtRepeatOn === 'Weekly' && <>
                      <div className="w-px bg-slate-200 self-stretch my-1 mx-1 flex-shrink-0" />
                      <div className="flex items-center gap-1 px-3 flex-shrink-0">
                        {(['Mon','Tue','Wed','Thu','Fri'] as const).map((short, i) => {
                          const full = ['Monday','Tuesday','Wednesday','Thursday','Friday'][i]
                          const on   = evtRepeatDays.includes(full)
                          return (
                            <button key={full} type="button"
                              onClick={() => setEvtRepeatDays(prev => on ? prev.filter(d => d !== full) : [...prev, full])}
                              className={`w-7 h-7 rounded-lg text-[10.5px] font-bold transition-all flex-shrink-0 ${on ? 'text-white shadow-sm' : 'text-slate-400 bg-slate-200 hover:bg-slate-300'}`}
                              style={on ? { background: '#2563eb' } : {}}>
                              {short}
                            </button>
                          )
                        })}
                      </div>
                    </>}
                    <div className="w-px bg-slate-200 self-stretch my-1 mx-1 flex-shrink-0" />
                    <div className="flex items-center gap-1.5 px-3 flex-shrink-0">
                      <span className="text-[11px] text-slate-400 whitespace-nowrap">until</span>
                      <input type="date" value={evtRepeatTill} onChange={e => setEvtRepeatTill(e.target.value)}
                        className={`h-7 px-2 text-[12px] font-medium text-slate-700 bg-white border rounded-lg outline-none focus:ring-2 cursor-pointer ${!evtRepeatTill ? 'border-red-300 focus:ring-red-100' : 'border-slate-200'}`}
                        style={{ '--tw-ring-color': '#c4b5fd' } as React.CSSProperties}
                      />
                    </div>
                  </>}
                </div>}

                {/* ── Row 2: Google Calendar ── */}
                <div className="flex items-stretch p-1 bg-slate-50 border border-slate-200 rounded-xl">
                  {/* Sync */}
                  <label className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer select-none transition-all flex-shrink-0 ${evtSyncGCal ? 'bg-white shadow-sm border border-slate-200' : 'hover:bg-slate-100'}`}>
                    <span className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border-2 transition-all ${evtSyncGCal ? 'bg-violet-600 border-violet-600' : 'border-slate-300 bg-white'}`}>
                      {evtSyncGCal && <svg fill="none" viewBox="0 0 10 10" width="8" height="8"><path d="M1.5 5l2.5 2.5 4.5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </span>
                    <input type="checkbox" checked={evtSyncGCal}
                      onChange={e => { setEvtSyncGCal(e.target.checked); if (!e.target.checked) setEvtVideoConf(false) }}
                      className="sr-only" />
                    <svg viewBox="0 0 14 14" width="12" height="12" fill="none" className="flex-shrink-0">
                      <rect x="1" y="2" width="12" height="11" rx="2" stroke="#4285F4" strokeWidth="1.2"/>
                      <path d="M1 5h12" stroke="#4285F4" strokeWidth="1.2"/>
                      <path d="M4 1v2M10 1v2" stroke="#4285F4" strokeWidth="1.2" strokeLinecap="round"/>
                      <rect x="4" y="7" width="2" height="2" rx="0.4" fill="#EA4335"/>
                      <rect x="8" y="7" width="2" height="2" rx="0.4" fill="#34A853"/>
                    </svg>
                    <span className="text-[12px] font-medium text-slate-700 whitespace-nowrap">Sync with Google Calendar</span>
                  </label>

                  {evtSyncGCal && <>
                    <div className="w-px bg-slate-200 self-stretch my-1 mx-1 flex-shrink-0" />
                    {/* Video Conference */}
                    <label className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer select-none transition-all flex-shrink-0 ${evtVideoConf ? 'bg-white shadow-sm border border-slate-200' : 'hover:bg-slate-100'}`}>
                      <span className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border-2 transition-all ${evtVideoConf ? 'bg-violet-600 border-violet-600' : 'border-slate-300 bg-white'}`}>
                        {evtVideoConf && <svg fill="none" viewBox="0 0 10 10" width="8" height="8"><path d="M1.5 5l2.5 2.5 4.5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </span>
                      <input type="checkbox" checked={evtVideoConf} onChange={e => setEvtVideoConf(e.target.checked)} className="sr-only" />
                      <span className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0" style={{ background: '#00897B' }}>
                        <svg viewBox="0 0 12 12" width="9" height="9" fill="none">
                          <rect x="1" y="3" width="7" height="6" rx="1" fill="white"/>
                          <path d="M8 5.5l3-2v5l-3-2V5.5z" fill="white"/>
                        </svg>
                      </span>
                      <span className="text-[12px] font-medium text-slate-700 whitespace-nowrap">Video Conference</span>
                    </label>

                    <div className="w-px bg-slate-200 self-stretch my-1 mx-1 flex-shrink-0" />

                    {/* Calendar picker */}
                    <div className="flex items-center gap-1.5 px-3 flex-shrink-0">
                      <svg fill="none" viewBox="0 0 12 12" width="11" height="11" className="text-slate-400 flex-shrink-0">
                        <rect x="0.5" y="1.5" width="11" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.1"/>
                        <path d="M0.5 4.5h11M3.5 0.5v2M8.5 0.5v2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
                      </svg>
                      <select value={evtGCalLink} onChange={e => setEvtGCalLink(e.target.value)}
                        className="h-7 pl-1 pr-6 text-[11.5px] font-medium text-slate-700 bg-transparent border-none outline-none cursor-pointer appearance-none"
                        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'%3E%3Cpath d='M2 3.5l3 3 3-3' stroke='%2394a3b8' stroke-width='1.2' stroke-linecap='round' stroke-linejoin='round' fill='none'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 2px center', paddingRight: '18px' }}>
                        <option value="">— Calendar —</option>
                        {calendars.map(c => <option key={c.name} value={c.name}>{c.calendar_name}</option>)}
                      </select>
                    </div>
                  </>}
                </div>

                {/* Description */}
                <div>
                  <label className="block text-[12px] font-semibold text-slate-600 mb-1.5">Description</label>
                  <RichTextEditor
                    key={editorKey}
                    defaultValue={evtDesc}
                    onChange={setEvtDesc}
                    placeholder="Optional notes…"
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
                  <div className="flex-1 relative">
                    <label className="block text-[12px] font-semibold text-slate-600 mb-1.5">Reference Name</label>
                    <input type="text"
                      value={pSelected ? pSelected.display : pQuery}
                      onChange={e => { setPSelected(null); void handleParticipantSearch(e.target.value) }}
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
              <button type="button" onClick={onClose}
                className="h-9 px-4 rounded-lg text-[13px] font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button type="button" onClick={() => void handleSave()} disabled={evtSaving}
                className="h-9 px-5 rounded-lg text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)' }}>
                {evtSaving ? 'Saving…' : isEditMode ? 'Update Event' : 'Save Event'}
              </button>
            </div>
          </div>
        </div>

        {/* ── Right: live preview ── */}
        <div className="w-64 flex-shrink-0 flex flex-col overflow-y-auto [&::-webkit-scrollbar]:hidden relative"
          style={{ background: 'linear-gradient(170deg, #4c1d95 0%, #6d28d9 45%, #7c3aed 100%)', scrollbarWidth: 'none' }}>
          <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full pointer-events-none" style={{ background: 'rgba(255,255,255,0.07)' }} />
          <div className="absolute top-1/3 -left-10 w-32 h-32 rounded-full pointer-events-none" style={{ background: 'rgba(255,255,255,0.05)' }} />
          <div className="absolute -bottom-8 right-4 w-36 h-36 rounded-full pointer-events-none" style={{ background: 'rgba(255,255,255,0.06)' }} />

          {/* Header */}
          <div className="px-5 pt-5 pb-4 flex-shrink-0 relative z-10">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.18)' }}>
                <svg fill="none" viewBox="0 0 20 20" width="15" height="15">
                  <rect x="2.5" y="3.5" width="15" height="14" rx="2.5" stroke="white" strokeWidth="1.5"/>
                  <path d="M6.5 2v3M13.5 2v3M2.5 8h15M10 11v4M8 13h4" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.4)' }}>{isEditMode ? 'Editing' : 'Live Preview'}</p>
                <p className="text-[13px] font-bold text-white leading-none mt-0.5">{isEditMode ? 'Update Event' : 'Event Details'}</p>
              </div>
            </div>
          </div>

          {/* Preview content */}
          <div className="px-4 pb-6 relative z-10 space-y-2.5">

            {/* Title card */}
            <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.12)' }}>
              <div className="h-1 w-full" style={{ background: 'rgba(255,255,255,0.35)' }} />
              <div className="p-3">
                {evtSubject ? (
                  <p className="text-[13.5px] font-bold text-white leading-snug">{evtSubject}</p>
                ) : (
                  <p className="text-[13px] italic" style={{ color: 'rgba(255,255,255,0.3)' }}>Untitled event…</p>
                )}
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.9)' }}>
                    {evtCategory}
                  </span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.65)' }}>
                    {evtType}
                  </span>
                </div>
              </div>
            </div>

            {/* Schedule */}
            <div className="rounded-xl p-3 space-y-2" style={{ background: 'rgba(255,255,255,0.1)' }}>
              <div className="flex items-start gap-2">
                <svg fill="none" viewBox="0 0 14 14" width="12" height="12" className="mt-0.5 flex-shrink-0"
                  style={{ color: 'rgba(255,255,255,0.5)' }}>
                  <rect x="1.5" y="2" width="11" height="10.5" rx="2" stroke="currentColor" strokeWidth="1.2"/>
                  <path d="M4.5 1v2M9.5 1v2M1.5 5.5h11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
                <div>
                  <p className="text-[12.5px] font-bold text-white leading-snug">
                    {evtDate
                      ? new Date(evtDate + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
                      : <span style={{ color: 'rgba(255,255,255,0.35)' }}>No date set</span>}
                  </p>
                  {evtDate && (
                    <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>
                      {new Date(evtDate + 'T12:00:00').getFullYear()}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <svg fill="none" viewBox="0 0 14 14" width="12" height="12" className="flex-shrink-0"
                  style={{ color: 'rgba(255,255,255,0.5)' }}>
                  <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2"/>
                  <path d="M7 4v3l2 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
                <p className="text-[12px] font-semibold text-white">
                  {evtAllDay ? 'All day' : evtStartTime
                    ? `${fmtTime(evtStartTime)}${evtEndTime && evtEndTime !== evtStartTime ? ` – ${fmtTime(evtEndTime)}` : ''}`
                    : <span style={{ color: 'rgba(255,255,255,0.35)' }}>—</span>}
                </p>
              </div>
            </div>

            {/* Status + Attending */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg p-2.5" style={{ background: 'rgba(255,255,255,0.1)' }}>
                <p className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'rgba(255,255,255,0.4)' }}>Status</p>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{
                    background: evtStatus === 'Open' ? '#34d399' : evtStatus === 'Closed' ? '#94a3b8' : '#f87171'
                  }} />
                  <span className="text-[11.5px] font-semibold text-white">{evtStatus}</span>
                </div>
              </div>
              <div className="rounded-lg p-2.5" style={{ background: 'rgba(255,255,255,0.1)' }}>
                <p className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'rgba(255,255,255,0.4)' }}>Attending</p>
                <p className="text-[11.5px] font-semibold text-white">{evtAttending}</p>
              </div>
            </div>

            {/* Location */}
            {evtLocation && (
              <div className="flex items-start gap-2 rounded-lg px-2.5 py-2"
                style={{ background: 'rgba(255,255,255,0.08)' }}>
                <svg fill="none" viewBox="0 0 14 14" width="11" height="11" className="mt-0.5 flex-shrink-0"
                  style={{ color: 'rgba(255,255,255,0.5)' }}>
                  <path d="M7 1C4.79 1 3 2.79 3 5c0 3.25 4 8 4 8s4-4.75 4-8c0-2.21-1.79-4-4-4z" stroke="currentColor" strokeWidth="1.2"/>
                  <circle cx="7" cy="5" r="1.5" stroke="currentColor" strokeWidth="1.2"/>
                </svg>
                <p className="text-[11.5px] leading-snug line-clamp-2" style={{ color: 'rgba(255,255,255,0.7)' }}>{evtLocation}</p>
              </div>
            )}

            {/* Flags */}
            {(evtSyncGCal || evtVideoConf) && (
              <div className="rounded-lg px-2.5 py-2 space-y-2" style={{ background: 'rgba(255,255,255,0.08)' }}>
                {evtSyncGCal && (
                  <div className="flex items-start gap-2">
                    <svg fill="none" viewBox="0 0 14 14" width="11" height="11" className="mt-0.5 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.5)' }}>
                      <rect x="1.5" y="2" width="11" height="10.5" rx="2" stroke="currentColor" strokeWidth="1.2"/>
                      <path d="M1.5 5.5h11M5 1v2M9 1v2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                      <circle cx="7" cy="9" r="1.5" fill="currentColor"/>
                    </svg>
                    <span className="text-[11px] leading-snug" style={{ color: 'rgba(255,255,255,0.65)' }}>
                      {evtGCalLink
                        ? `Synced · ${calendars.find(c => c.name === evtGCalLink)?.calendar_name ?? evtGCalLink}`
                        : 'Sync with Google Calendar'}
                    </span>
                  </div>
                )}
                {evtVideoConf && (
                  <div className="flex items-center gap-2">
                    <svg fill="none" viewBox="0 0 14 14" width="11" height="11" className="flex-shrink-0" style={{ color: 'rgba(255,255,255,0.5)' }}>
                      <rect x="1" y="3.5" width="8.5" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
                      <path d="M9.5 6l3.5-2v6L9.5 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.65)' }}>Video conferencing</span>
                  </div>
                )}
              </div>
            )}

            {/* Description */}
            {evtDesc && (
              <div className="rounded-lg px-2.5 py-2.5" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <p className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'rgba(255,255,255,0.4)' }}>Notes</p>
                <p className="text-[11.5px] leading-relaxed line-clamp-5" style={{ color: 'rgba(255,255,255,0.65)' }}>{evtDesc.replace(/<[^>]*>/g, '')}</p>
              </div>
            )}

            {/* Participants */}
            {evtParticipants.length > 0 && (
              <div className="rounded-lg px-2.5 py-2.5" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <p className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  Participants · {evtParticipants.length}
                </p>
                <div className="space-y-2">
                  {evtParticipants.slice(0, 5).map((p, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[8px] font-bold text-white"
                        style={{ background: hashColor(p.display) }}>
                        {p.display.slice(0, 2).toUpperCase()}
                      </div>
                      <span className="text-[11px] truncate flex-1" style={{ color: 'rgba(255,255,255,0.8)' }}>{p.display}</span>
                      <span className="text-[9px] flex-shrink-0" style={{ color: 'rgba(255,255,255,0.3)' }}>
                        {p.reference_doctype.slice(0, 3)}
                      </span>
                    </div>
                  ))}
                  {evtParticipants.length > 5 && (
                    <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      +{evtParticipants.length - 5} more
                    </p>
                  )}
                </div>
              </div>
            )}

            {!evtSubject && !evtLocation && !evtDesc && evtParticipants.length === 0 && (
              <div className="text-center pt-2">
                <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.28)' }}>
                  Fill in the form to see your event preview here
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
