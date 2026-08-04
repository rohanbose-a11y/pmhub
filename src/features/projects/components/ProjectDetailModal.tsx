import React, { useEffect, useMemo, useRef, useState } from 'react'

import { useAuthStore } from '../../../store/authStore'
import { useWorkStore } from '../../../store/workStore'
import { projectApi } from '../../../api/projectApi'
import { userApi, type UserOption } from '../../../api/userApi'
import type { Project, UpdateProjectInput, RawProjectMember } from '../types/project.types'
import { UserAvatar } from '../../../shared/components/UserAvatar'

// ─── Config ───────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = ['Open', 'Completed', 'Cancelled']

const STATUS_CONFIG = [
  { key: 'Open',      dot: 'bg-slate-400',   pill: 'bg-slate-100 text-slate-600'       },
  { key: 'Completed', dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-700'    },
  { key: 'Cancelled', dot: 'bg-rose-400',    pill: 'bg-rose-50 text-rose-600'          },
]

const COVER_GRADIENTS = [
  'from-indigo-500 to-violet-600', 'from-violet-500 to-purple-700',
  'from-emerald-400 to-teal-500',  'from-amber-400 to-orange-500',
  'from-sky-400 to-indigo-500',    'from-rose-400 to-pink-500',
  'from-fuchsia-400 to-violet-500','from-cyan-400 to-sky-500',
]

function coverGradient(id: string) {
  const hash = [...id].reduce((a, c) => a + c.charCodeAt(0), 0)
  return COVER_GRADIENTS[hash % COVER_GRADIENTS.length]
}


function fmtDate(v: string | null | undefined) {
  if (!v) return null
  return new Date(v).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })
}

function toInputDate(v: string | null | undefined) {
  if (!v) return ''
  return new Date(v).toISOString().slice(0, 10)
}

function fmtActivity(d: Date) {
  const diff = Date.now() - d.getTime()
  if (diff < 60_000)     return 'just now'
  if (diff < 3_600_000)  return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return d.toLocaleDateString('en', { month: 'short', day: 'numeric' })
}

interface ActivityEntry {
  type: 'created' | 'status' | 'date' | 'member' | 'progress'
  text: string
  time: Date
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  project: Project
  onClose: () => void
  onRefresh: () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProjectDetailModal({ project, onClose, onRefresh }: Props) {
  const tasks    = useWorkStore((s) => s.tasks)
  const username = useAuthStore((s) => s.user?.username)

  const isProjectManager = !!username && (
    project.owner === username ||
    project.owner?.toLowerCase().includes(username.toLowerCase()) ||
    username.toLowerCase().includes((project.owner ?? '').split('@')[0].toLowerCase())
  )

  // ── Editable field state ──────────────────────────────────────────────────
  const [liveStatus,   setLiveStatus]   = useState(project.status)
  const [startDate,    setStartDate]    = useState(toInputDate(project.expectedStartDate))
  const [endDate,      setEndDate]      = useState(toInputDate(project.expectedEndDate))
  const [progress,     setProgress]     = useState(String(Math.round(project.completion ?? 0)))
  const liveNotes = project.notes ?? ''
const [showStatusMenu, setShowStatusMenu] = useState(false)
  const [isEditingStart,    setIsEditingStart]    = useState(false)
  const [isEditingEnd,      setIsEditingEnd]      = useState(false)
  const [isEditingProgress, setIsEditingProgress] = useState(false)

  // ── Members ───────────────────────────────────────────────────────────────
  const [members,       setMembers]       = useState<string[]>(project.members ?? [])
  const [usersRaw,      setUsersRaw]      = useState<RawProjectMember[]>([])
  const [showAddMember, setShowAddMember] = useState(false)
  const [userQuery,     setUserQuery]     = useState('')
  const [allUsers,      setAllUsers]      = useState<UserOption[]>([])
  const [loadingUsers,  setLoadingUsers]  = useState(false)
  const [activeOp,      setActiveOp]      = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // ── Right panel ──────────────────────────────────────────────────────────
  const [commExpanded, setCommExpanded] = useState(true)
  const [commTab, setCommTab]           = useState<'team' | 'activity'>('team')

  // ── Activity log ─────────────────────────────────────────────────────────
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>(() => [
    { type: 'created', text: 'Project created',            time: new Date() },
    { type: 'status',  text: `Status: ${project.status}`,  time: new Date() },
  ])
  const addActivity = (entry: Omit<ActivityEntry, 'time'>) =>
    setActivityLog((prev) => [...prev, { ...entry, time: new Date() }])

  // ── Fetch raw members on open ─────────────────────────────────────────────
  useEffect(() => {
    projectApi.getProjectMembers(project.name)
      .then((raw) => setUsersRaw(raw))
      .catch(() => {/* silently ignore */})
  }, [project.name])

  // ── Load users when picker opens ─────────────────────────────────────────
  useEffect(() => {
    if (!showAddMember) return
    setLoadingUsers(true)
    userApi.searchActiveEmployees('').then(setAllUsers).catch(() => setAllUsers([])).finally(() => setLoadingUsers(false))
    setTimeout(() => searchRef.current?.focus(), 80)
  }, [showAddMember])

  // ── Re-search on query change ─────────────────────────────────────────────
  useEffect(() => {
    if (!showAddMember || !userQuery.trim()) return
    const t = setTimeout(() => {
      userApi.searchActiveEmployees(userQuery.trim()).then(setAllUsers).catch(() => {})
    }, 250)
    return () => clearTimeout(t)
  }, [userQuery, showAddMember])

  // ── ESC to close ─────────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showStatusMenu) { setShowStatusMenu(false); return }
        onClose()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose, showStatusMenu])

  // ── Task counts ──────────────────────────────────────────────────────────
  const projectTasks = useMemo(
    () => tasks.filter((t) => t.project === project.name),
    [tasks, project.name],
  )
  const taskCounts = useMemo(() => {
    const open      = projectTasks.filter((t) => t.status === 'Open').length
    const working   = projectTasks.filter((t) => t.status === 'Working').length
    const pending   = projectTasks.filter((t) => t.status.toLowerCase().includes('pending')).length
    const completed = projectTasks.filter((t) =>
      t.status.toLowerCase().includes('complet') || t.status.toLowerCase() === 'closed',
    ).length
    return { open, working, pending, completed, total: projectTasks.length }
  }, [projectTasks])

  // ── Save helpers ─────────────────────────────────────────────────────────
  const doUpdate = async (input: UpdateProjectInput, actText: string, actType: ActivityEntry['type']) => {
    try {
      await projectApi.updateProject(project.name, input)
      addActivity({ type: actType, text: actText })
      onRefresh()
      return true
    } catch {
      return false
    }
  }

  const saveStatus = async (s: string) => {
    setShowStatusMenu(false)
    if (s === liveStatus) return
    setLiveStatus(s)
    await doUpdate({ status: s }, `Status changed to ${s}`, 'status')
  }

  const saveStartDate = async () => {
    setIsEditingStart(false)
    await doUpdate({ expectedStartDate: startDate || null }, `Start date set to ${fmtDate(startDate) ?? '—'}`, 'date')
  }

  const saveEndDate = async () => {
    setIsEditingEnd(false)
    await doUpdate({ expectedEndDate: endDate || null }, `End date set to ${fmtDate(endDate) ?? '—'}`, 'date')
  }

  const saveProgress = async () => {
    setIsEditingProgress(false)
    const n = parseInt(progress, 10)
    if (isNaN(n)) { setProgress(String(Math.round(project.completion ?? 0))); return }
    const clamped = Math.max(0, Math.min(100, n))
    setProgress(String(clamped))
    await doUpdate({ completion: clamped }, `Progress updated to ${clamped}%`, 'progress')
  }

const toggleMember = async (user: UserOption) => {
    if (activeOp) return
    setActiveOp(user.name)
    const isMember = members.includes(user.name)
    try {
      if (isMember) {
        const newRaw = usersRaw.filter((m) => m.user !== user.name)
        await projectApi.saveProjectMembers(project.name, newRaw)
        setUsersRaw(newRaw)
        setMembers((prev) => prev.filter((m) => m !== user.name))
        addActivity({ type: 'member', text: `${user.fullName || user.name} removed from project` })
      } else {
        const newRaw = [...usersRaw, { user: user.name }]
        await projectApi.saveProjectMembers(project.name, newRaw)
        setUsersRaw(newRaw)
        setMembers((prev) => [...prev, user.name])
        addActivity({ type: 'member', text: `${user.fullName || user.name} added to project` })
      }
      onRefresh()
    } catch {/* ignore */}
    setActiveOp(null)
  }

  const removeMember = async (user: string) => {
    if (activeOp) return
    setActiveOp(user)
    const newRaw = usersRaw.filter((m) => m.user !== user)
    try {
      await projectApi.saveProjectMembers(project.name, newRaw)
      setUsersRaw(newRaw)
      setMembers((prev) => prev.filter((m) => m !== user))
      addActivity({ type: 'member', text: `${user} removed from project` })
      onRefresh()
    } catch {/* ignore */}
    setActiveOp(null)
  }

  const sg      = STATUS_CONFIG.find((s) => s.key === liveStatus) ?? STATUS_CONFIG[0]
  const pct     = Math.min(parseInt(progress, 10) || 0, 100)
  const gradient = coverGradient(project.id)

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3"
      onClick={onClose}
    >
      <div
        className="relative flex bg-white overflow-hidden shadow-2xl w-full h-full rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >

        {/* ══ Main content ══ */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* ── Top bar ── */}
          <div className="flex-shrink-0 flex items-center gap-1 px-3 h-11 border-b border-slate-100 bg-white">
            <button
              className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 transition-colors"
              onClick={onClose}
            >
              <svg fill="none" viewBox="0 0 14 14" width="12" height="12">
                <path d="M9 3L5 7l4 4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"/>
              </svg>
            </button>

            {/* Breadcrumb */}
            <div className="flex items-center gap-1 text-[12px]">
              <span className="text-slate-400">Projects</span>
              <span className="text-slate-200">/</span>
              <span className="font-semibold text-slate-700 truncate max-w-[260px]">{project.displayName}</span>
            </div>

            <div className="flex-1"/>

            {isProjectManager && (
              <span className="text-[10px] font-semibold bg-violet-100 text-violet-600 px-2 py-0.5 rounded-full">
                Project Manager
              </span>
            )}

            <button
              className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 transition-colors ml-1"
              onClick={onClose}
            >
              <svg fill="none" viewBox="0 0 12 12" width="11" height="11">
                <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6"/>
              </svg>
            </button>
          </div>

          {/* ── Scrollable body ── */}
          <div className="flex-1 overflow-y-auto scrollbar-none">

            {/* Hero */}
            <div className="px-6 pt-5 pb-4 flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center flex-shrink-0 shadow-md`}>
                <span className="text-lg font-bold text-white leading-none">
                  {project.displayName.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-[18px] font-semibold text-slate-900 leading-tight truncate">
                  {project.displayName}
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5 font-mono">{project.name}</p>
              </div>
            </div>

            <div className="h-px bg-slate-100 mx-6 mb-1"/>

            {/* Field rows */}
            <div className="divide-y divide-slate-50">

              {/* Status */}
              <div
                className={`flex items-center gap-2 px-6 py-2.5 transition-colors ${isProjectManager ? 'hover:bg-slate-50 cursor-pointer' : ''}`}
                onClick={isProjectManager ? () => setShowStatusMenu((v) => !v) : undefined}
              >
                <span className="text-[11.5px] text-slate-400 w-28 flex-shrink-0">Status</span>
                <div className="relative">
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] font-medium ${sg.pill}`}>
                    <span className={`w-[5px] h-[5px] rounded-full flex-shrink-0 ${sg.dot}`}/>
                    {liveStatus}
                    {isProjectManager && (
                      <svg fill="none" viewBox="0 0 10 10" width="8" height="8" className="opacity-50 ml-0.5">
                        <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.3"/>
                      </svg>
                    )}
                  </div>
                  {showStatusMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setShowStatusMenu(false) }}/>
                      <div className="absolute top-8 left-0 z-50 bg-white border border-slate-200 rounded-xl shadow-lg min-w-[160px] py-1 overflow-hidden">
                        {STATUS_OPTIONS.map((s) => {
                          const cfg = STATUS_CONFIG.find((c) => c.key === s) ?? STATUS_CONFIG[0]
                          return (
                            <button
                              key={s}
                              type="button"
                              onClick={(e) => { e.stopPropagation(); void saveStatus(s) }}
                              className={`flex items-center gap-2.5 w-full px-3 py-2 text-[12.5px] hover:bg-slate-50 transition-colors text-left ${liveStatus === s ? 'font-semibold' : 'font-normal'}`}
                            >
                              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`}/>
                              {s}
                              {liveStatus === s && (
                                <svg fill="none" viewBox="0 0 10 10" width="10" height="10" className="ml-auto text-indigo-500">
                                  <path d="M2 5l2.5 2.5 4-4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"/>
                                </svg>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Progress */}
              <div className="flex items-center gap-2 px-6 py-2.5">
                <span className="text-[11.5px] text-slate-400 w-28 flex-shrink-0">Progress</span>
                <div className="flex items-center gap-3 flex-1">
                  <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden" style={{ maxWidth: 140 }}>
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${pct >= 100 ? 'bg-emerald-500' : 'bg-[#7B3FF2]'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {isEditingProgress ? (
                    <input
                      type="number"
                      min={0} max={100}
                      value={progress}
                      onChange={(e) => setProgress(e.target.value)}
                      onBlur={() => void saveProgress()}
                      onKeyDown={(e) => { if (e.key === 'Enter') void saveProgress(); if (e.key === 'Escape') { setIsEditingProgress(false); setProgress(String(Math.round(project.completion ?? 0))) } }}
                      className="w-14 h-7 px-2 text-[12px] rounded-lg border border-indigo-300 focus:outline-none text-center font-semibold"
                      autoFocus
                    />
                  ) : (
                    <span
                      className={`text-[12px] font-semibold text-slate-700 tabular-nums ${isProjectManager ? 'cursor-pointer hover:text-indigo-600' : ''}`}
                      onClick={isProjectManager ? () => setIsEditingProgress(true) : undefined}
                    >
                      {pct}%
                    </span>
                  )}
                </div>
              </div>

              {/* Start date */}
              <div
                className={`flex items-center gap-2 px-6 py-2.5 transition-colors ${isProjectManager ? 'hover:bg-slate-50 cursor-pointer' : ''}`}
                onClick={isProjectManager && !isEditingStart ? () => setIsEditingStart(true) : undefined}
              >
                <span className="text-[11.5px] text-slate-400 w-28 flex-shrink-0">Start Date</span>
                {isEditingStart ? (
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    onBlur={() => void saveStartDate()}
                    onKeyDown={(e) => { if (e.key === 'Enter') void saveStartDate(); if (e.key === 'Escape') { setIsEditingStart(false); setStartDate(toInputDate(project.expectedStartDate)) } }}
                    className="h-7 px-2 text-[12px] rounded-lg border border-indigo-300 focus:outline-none"
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="text-[12.5px] text-slate-700">
                    {fmtDate(project.expectedStartDate) ?? <span className="text-slate-300">Not set</span>}
                  </span>
                )}
              </div>

              {/* End date */}
              <div
                className={`flex items-center gap-2 px-6 py-2.5 transition-colors ${isProjectManager ? 'hover:bg-slate-50 cursor-pointer' : ''}`}
                onClick={isProjectManager && !isEditingEnd ? () => setIsEditingEnd(true) : undefined}
              >
                <span className="text-[11.5px] text-slate-400 w-28 flex-shrink-0">End Date</span>
                {isEditingEnd ? (
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    onBlur={() => void saveEndDate()}
                    onKeyDown={(e) => { if (e.key === 'Enter') void saveEndDate(); if (e.key === 'Escape') { setIsEditingEnd(false); setEndDate(toInputDate(project.expectedEndDate)) } }}
                    className="h-7 px-2 text-[12px] rounded-lg border border-indigo-300 focus:outline-none"
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className={`text-[12.5px] font-medium ${
                    project.expectedEndDate && new Date(project.expectedEndDate) < new Date() && liveStatus !== 'Completed'
                      ? 'text-red-500'
                      : 'text-slate-700'
                  }`}>
                    {fmtDate(project.expectedEndDate) ?? <span className="text-slate-300 font-normal">Not set</span>}
                  </span>
                )}
              </div>

              {/* Owner */}
              <div className="flex items-center gap-2 px-6 py-2.5">
                <span className="text-[11.5px] text-slate-400 w-28 flex-shrink-0">Owner</span>
                {project.owner ? (
                  <div className="flex items-center gap-2">
                    <UserAvatar name={project.owner} size="xs" />
                    <span className="text-[12.5px] text-slate-700">{project.owner}</span>
                  </div>
                ) : (
                  <span className="text-[12px] text-slate-300">Not assigned</span>
                )}
              </div>

              {/* Notes */}
              {liveNotes && (
                <div className="flex items-start gap-2 px-6 py-2.5">
                  <span className="text-[11.5px] text-slate-400 w-28 flex-shrink-0 pt-0.5">About</span>
                  <div className="text-[12.5px] text-slate-700 [&_p]:mb-1 [&_ol]:list-decimal [&_ol]:pl-4 [&_ul]:list-disc [&_ul]:pl-4" dangerouslySetInnerHTML={{ __html: liveNotes }} />
                </div>
              )}
            </div>

            {/* Task breakdown */}
            {taskCounts.total > 0 && (
              <>
                <div className="h-px bg-slate-100 mx-6 my-3"/>
                <div className="px-6 pb-4">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">
                    Tasks · {taskCounts.total} total
                  </p>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {taskCounts.open > 0 && (
                      <span className="text-[11px] font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                        {taskCounts.open} Open
                      </span>
                    )}
                    {taskCounts.working > 0 && (
                      <span className="text-[11px] font-semibold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                        {taskCounts.working} Working
                      </span>
                    )}
                    {taskCounts.pending > 0 && (
                      <span className="text-[11px] font-semibold bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">
                        {taskCounts.pending} Pending
                      </span>
                    )}
                    {taskCounts.completed > 0 && (
                      <span className="text-[11px] font-semibold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">
                        {taskCounts.completed} Completed
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[11px] text-slate-400">Completion</span>
                    <span className="text-[11px] font-bold text-[#7B3FF2]">
                      {Math.round((taskCounts.completed / taskCounts.total) * 100)}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#7B3FF2] rounded-full transition-all"
                      style={{ width: `${(taskCounts.completed / taskCounts.total) * 100}%` }}
                    />
                  </div>
                </div>
              </>
            )}

            <div style={{ height: 40 }}/>
          </div>
        </div>

        {/* ══ Right sidebar ══ */}
        <div
          className={[
            'flex-shrink-0 border-l border-slate-100 flex flex-col transition-all duration-200',
            commExpanded ? 'w-[300px]' : 'w-[52px]',
          ].join(' ')}
        >

          {/* Collapsed strip */}
          {!commExpanded && (
            <div className="flex flex-col items-center w-[52px] py-3 gap-0.5 bg-slate-50/30">
              <button
                type="button"
                onClick={() => setCommExpanded(true)}
                title="Open panel"
                className="flex items-center justify-center w-9 h-9 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-indigo-500 transition-colors mb-1"
              >
                <svg fill="none" viewBox="0 0 16 16" width="14" height="14">
                  <path d="M10 3L6 8l4 5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"/>
                </svg>
              </button>
              <button
                type="button"
                onClick={() => { setCommExpanded(true); setCommTab('team') }}
                title="Team & Activity"
                className="flex flex-col items-center gap-0.5 w-9 py-2.5 rounded-lg bg-white shadow-sm text-violet-600 border border-slate-100/80 transition-colors"
              >
                <svg fill="none" viewBox="0 0 14 14" width="15" height="15">
                  <circle cx="5" cy="5" r="2" stroke="currentColor" strokeWidth="1.3"/>
                  <circle cx="9.5" cy="5" r="2" stroke="currentColor" strokeWidth="1.3"/>
                  <path d="M1 12c0-2 1.8-3.5 4-3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                  <path d="M8 12c0-2 1.3-3.5 4-3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
                <span className="text-[9px] font-medium leading-none">Team</span>
              </button>
            </div>
          )}

          {/* Expanded panel */}
          {commExpanded && (
            <div className="flex flex-col h-full w-[300px]">

              {/* Panel header */}
              <div className="flex-shrink-0 flex items-center gap-2 px-3 h-11 border-b border-slate-100">
                <span className="flex-1 text-[13px] font-semibold text-slate-700">
                  {commTab === 'team' ? 'Team' : 'Activity'}
                </span>
                <button
                  type="button"
                  onClick={() => setCommExpanded(false)}
                  className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 transition-colors"
                >
                  <svg fill="none" viewBox="0 0 16 16" width="14" height="14">
                    <path d="M6 3l4 5-4 5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"/>
                  </svg>
                </button>
              </div>

              {/* Tabs */}
              <div className="flex-shrink-0 flex items-center border-b border-slate-100 px-3">
                {(['team', 'activity'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setCommTab(tab)}
                    className={[
                      'px-3 py-2.5 text-[12px] font-medium capitalize border-b-2 -mb-px transition-colors',
                      commTab === tab
                        ? 'border-indigo-500 text-indigo-600'
                        : 'border-transparent text-slate-400 hover:text-slate-600',
                    ].join(' ')}
                  >
                    {tab === 'team' ? 'Team' : 'Activity'}
                  </button>
                ))}
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto scrollbar-none">

                {/* Team tab */}
                {commTab === 'team' && (
                  <div className="py-3 px-3">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                        Members · {members.length}
                      </p>
                      <button
                        type="button"
                        onClick={() => { setShowAddMember((v) => !v); setUserQuery('') }}
                        title={showAddMember ? 'Cancel' : 'Add member'}
                        className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                      >
                        {showAddMember ? (
                          <svg fill="none" viewBox="0 0 12 12" width="10" height="10">
                            <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5"/>
                          </svg>
                        ) : (
                          <svg fill="none" viewBox="0 0 12 12" width="10" height="10">
                            <path d="M6 1v10M1 6h10" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8"/>
                          </svg>
                        )}
                      </button>
                    </div>

                    {/* User picker (shown when + is clicked) */}
                    {showAddMember && (
                      <div className="mb-3 rounded-xl border border-slate-200 overflow-hidden">
                        {/* Search bar */}
                        <div className="flex items-center gap-2 px-3 border-b border-slate-100">
                          <svg fill="none" viewBox="0 0 16 16" width="12" height="12" className="text-slate-400 flex-shrink-0">
                            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
                            <path d="M10.5 10.5L13.5 13.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                          </svg>
                          <input
                            ref={searchRef}
                            type="text"
                            value={userQuery}
                            onChange={(e) => setUserQuery(e.target.value)}
                            placeholder="Search people…"
                            className="flex-1 h-9 text-[12.5px] text-slate-700 placeholder:text-slate-400 bg-transparent outline-none border-0"
                          />
                          {userQuery && (
                            <button type="button" onClick={() => setUserQuery('')} className="text-slate-400 hover:text-slate-600">
                              <svg fill="none" viewBox="0 0 10 10" width="9" height="9">
                                <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4"/>
                              </svg>
                            </button>
                          )}
                        </div>
                        {/* User list */}
                        <div className="overflow-y-auto scrollbar-none bg-white" style={{ maxHeight: 220 }}>
                          {loadingUsers ? (
                            <div className="py-6 flex items-center justify-center">
                              <svg className="w-4 h-4 text-slate-300 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z"/>
                              </svg>
                            </div>
                          ) : (() => {
                            const lq = userQuery.toLowerCase()
                            const visible = allUsers.filter((u) =>
                              !lq || u.name.toLowerCase().includes(lq) || u.fullName.toLowerCase().includes(lq)
                            )
                            if (visible.length === 0) return (
                              <p className="text-[12px] text-slate-400 text-center py-6">No users found</p>
                            )
                            return visible.map((user) => {
                              const isMember  = members.includes(user.name)
                              const isMe      = user.name === username
                              const isPending = activeOp === user.name
                              return (
                                <button
                                  key={user.name}
                                  type="button"
                                  disabled={!!activeOp && !isPending}
                                  onClick={() => void toggleMember(user)}
                                  className={[
                                    'w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors',
                                    isMember ? 'bg-indigo-50/60' : 'hover:bg-slate-50',
                                    activeOp && !isPending ? 'opacity-50' : '',
                                  ].join(' ')}
                                >
                                  {isPending ? (
                                    <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                                      <svg className="w-3 h-3 animate-spin text-slate-400" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                        <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z"/>
                                      </svg>
                                    </div>
                                  ) : (
                                    <UserAvatar name={user.name} fullName={user.fullName} size="sm" />
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[12.5px] font-medium text-slate-800 truncate leading-tight">
                                      {user.fullName}
                                      {isMe && <span className="ml-1.5 text-[10px] text-indigo-500 font-semibold">(me)</span>}
                                    </p>
                                    {user.fullName !== user.name && (
                                      <p className="text-[11px] text-slate-400 truncate leading-tight">{user.name}</p>
                                    )}
                                  </div>
                                  {isMember ? (
                                    <svg fill="none" viewBox="0 0 14 14" width="14" height="14" className="text-indigo-500 flex-shrink-0">
                                      <circle cx="7" cy="7" r="6" fill="currentColor" fillOpacity="0.12"/>
                                      <path d="M4 7l2 2 4-4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"/>
                                    </svg>
                                  ) : (
                                    <svg fill="none" viewBox="0 0 14 14" width="13" height="13" className="text-slate-300 flex-shrink-0">
                                      <path d="M7 3v8M3 7h8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5"/>
                                    </svg>
                                  )}
                                </button>
                              )
                            })
                          })()}
                        </div>
                        {/* Footer */}
                        <div className="px-3 py-1.5 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
                          <span className="text-[11px] text-slate-400">
                            {members.length > 0 ? `${members.length} member${members.length !== 1 ? 's' : ''}` : 'No members'}
                          </span>
                          <button
                            type="button"
                            onClick={() => { setShowAddMember(false); setUserQuery('') }}
                            className="text-[12px] text-slate-500 hover:text-slate-700 font-medium transition-colors"
                          >
                            Done
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Member list (always visible below the picker) */}
                    {members.length > 0 ? (
                      <div className="space-y-1">
                        {members.map((m) => (
                          <div key={m} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-slate-50 group transition-colors">
                            <UserAvatar name={m} size="sm" />
                            <div className="flex-1 min-w-0">
                              <p className="text-[12.5px] font-medium text-slate-700 truncate">{m}</p>
                              {project.owner === m && (
                                <p className="text-[10px] text-violet-500 font-medium">Owner</p>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => void removeMember(m)}
                              disabled={!!activeOp}
                              title="Remove"
                              className="w-6 h-6 rounded flex items-center justify-center text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors opacity-0 group-hover:opacity-100"
                            >
                              {activeOp === m ? (
                                <svg className="w-3 h-3 animate-spin text-slate-400" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                  <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z"/>
                                </svg>
                              ) : (
                                <svg fill="none" viewBox="0 0 10 10" width="9" height="9">
                                  <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4"/>
                                </svg>
                              )}
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : !showAddMember && (
                      <div className="flex flex-col items-center py-8 gap-2 text-center">
                        <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
                          <svg fill="none" viewBox="0 0 16 16" width="14" height="14" className="text-slate-400">
                            <circle cx="8" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.4"/>
                            <path d="M2 14c1-3 3.5-5 6-5s5 2 6 5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4"/>
                          </svg>
                        </div>
                        <p className="text-[12px] text-slate-500 font-medium">No members yet</p>
                        <p className="text-[11px] text-slate-400">Click + to add a member</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Activity tab */}
                {commTab === 'activity' && (
                  <div className="py-3 px-3 space-y-4">
                    {activityLog.map((entry, i) => {
                      let icon: React.ReactNode
                      if (entry.type === 'created') {
                        icon = (
                          <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                            <svg fill="none" viewBox="0 0 12 12" width="9" height="9" className="text-indigo-500">
                              <path d="M6 1v10M1 6h10" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6"/>
                            </svg>
                          </div>
                        )
                      } else if (entry.type === 'status') {
                        const scfg = STATUS_CONFIG.find((s) => entry.text.includes(s.key)) ?? STATUS_CONFIG[0]
                        icon = (
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${scfg.pill}`}>
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${scfg.dot}`}/>
                          </div>
                        )
                      } else if (entry.type === 'member') {
                        icon = (
                          <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
                            <svg fill="none" viewBox="0 0 12 12" width="9" height="9" className="text-violet-500">
                              <circle cx="5" cy="4" r="2" stroke="currentColor" strokeWidth="1.3"/>
                              <path d="M1 10c0-2 1.8-3 4-3M9 7v4M7 9h4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.3"/>
                            </svg>
                          </div>
                        )
                      } else if (entry.type === 'date') {
                        icon = (
                          <div className="w-6 h-6 rounded-full bg-sky-100 flex items-center justify-center flex-shrink-0">
                            <svg fill="none" viewBox="0 0 12 12" width="9" height="9" className="text-sky-500">
                              <rect x="1" y="2.5" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                              <path d="M4 1.5v2M8 1.5v2M1 5.5h10" stroke="currentColor" strokeLinecap="round" strokeWidth="1.3"/>
                            </svg>
                          </div>
                        )
                      } else {
                        icon = (
                          <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                            <svg fill="none" viewBox="0 0 12 12" width="9" height="9" className="text-slate-400">
                              <path d="M2 4h8M2 7h6M2 10h4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4"/>
                            </svg>
                          </div>
                        )
                      }
                      return (
                        <div key={i} className="flex items-start gap-2.5">
                          <div className="mt-0.5 flex-shrink-0">{icon}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] text-slate-600">{entry.text}</p>
                            <p className="text-[11px] text-slate-400 mt-0.5">{fmtActivity(entry.time)}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
