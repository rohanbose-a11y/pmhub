import { useEffect, useRef, useState } from 'react'

import { RichTextEditor } from '../../../shared/components/RichTextEditor'
import { useKraOptions } from '../../../hooks/useKraOptions'
import { useAuthStore } from '../../../store/authStore'
import { AssignTaskModal } from './AssignTaskModal'
import type { Project } from '../../projects/types/project.types'
import type { Task, CreateTaskInput } from '../types/task.types'

const AV_COLORS = [
  'bg-violet-500', 'bg-blue-500',   'bg-emerald-500', 'bg-amber-500',
  'bg-rose-500',   'bg-teal-500',   'bg-indigo-500',  'bg-pink-500',
]
function avColor(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h)
  return AV_COLORS[Math.abs(h) % AV_COLORS.length]
}
function initials(s: string) {
  return s.replace(/[@.]/g, ' ').split(/\s+/).filter(Boolean).map((p) => p[0]).join('').toUpperCase().slice(0, 2)
}

// ─── Config ───────────────────────────────────────────────────────────────────

const PRIORITY_CONFIG = [
  { key: 'Urgent', dot: 'bg-red-500',    label: 'Urgent'  },
  { key: 'High',   dot: 'bg-orange-500', label: 'High'    },
  { key: 'Medium', dot: 'bg-blue-400',   label: 'Medium'  },
  { key: 'Low',    dot: 'bg-slate-300',  label: 'Low'     },
]

function fmtDate(v: string) {
  if (!v) return null
  return new Date(v).toLocaleDateString('en', { month: 'short', day: 'numeric' })
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface CreateTaskModalProps {
  projects: Project[]
  tasks: Task[]
  isSubmitting: boolean
  serverError: string | null
  onSubmit: (input: CreateTaskInput) => Promise<boolean>
  onClose: () => void
  onSuccess: () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CreateTaskModal({
  projects,
  tasks,
  isSubmitting,
  serverError,
  onSubmit,
  onClose,
  onSuccess,
}: CreateTaskModalProps) {
  // ── Form fields ────────────────────────────────────────────────────────────
  const [subject,     setSubject]     = useState('')
  const [project,     setProject]     = useState(projects[0]?.name ?? '')
  const [priority,    setPriority]    = useState('Medium')
  const [actType,     setActType]     = useState('')
  const [startDate,   setStartDate]   = useState('')
  const [dueDate,     setDueDate]     = useState('')
  const [engDays,     setEngDays]     = useState('')
  const [parentTask,  setParentTask]  = useState('')
  const [isMilestone, setIsMilestone] = useState(false)
  const [isGroup,     setIsGroup]     = useState(false)
  const [description, setDescription] = useState('')
  const [depTaskIds,  setDepTaskIds]  = useState<string[]>([])
  const [kraQuery,    setKraQuery]    = useState('')
  const [parentQuery, setParentQuery] = useState('')
  const [titleError,   setTitleError]   = useState(false)
  const [projectError, setProjectError] = useState(false)
  const [editorKey,    setEditorKey]    = useState(0)

  // ── Right panel ───────────────────────────────────────────────────────────
  const [commExpanded, setCommExpanded] = useState(false)
  const [commTab, setCommTab] = useState<'comments' | 'activity' | 'attachments'>('attachments')
  const [comingSoon, setComingSoon] = useState<string | null>(null)
  const triggerComingSoon = (msg: string) => {
    setComingSoon(msg)
    setTimeout(() => setComingSoon(null), 2800)
  }

  // ── Dropdown open states ───────────────────────────────────────────────────
  const [showPriorityMenu, setShowPriorityMenu] = useState(false)
  const [showActTypeMenu,  setShowActTypeMenu]  = useState(false)
  const [showProjectMenu,  setShowProjectMenu]  = useState(false)
  const [showParentMenu,   setShowParentMenu]   = useState(false)

  // ── Fixed-position coords ──────────────────────────────────────────────────
  const [priorityDropPos, setPriorityDropPos] = useState({ top: 0, left: 0, width: 0 })
  const [actTypeDropPos,  setActTypeDropPos]  = useState({ top: 0, left: 0, width: 0 })
  const [projectDropPos,  setProjectDropPos]  = useState({ top: 0, left: 0, width: 0 })
  const [parentDropPos,   setParentDropPos]   = useState({ top: 0, left: 0, width: 0 })

  const priorityTriggerRef = useRef<HTMLDivElement>(null)
  const priorityDropRef    = useRef<HTMLDivElement>(null)
  const actTypeTriggerRef  = useRef<HTMLDivElement>(null)
  const actTypeDropRef     = useRef<HTMLDivElement>(null)
  const projectTriggerRef  = useRef<HTMLDivElement>(null)
  const projectDropRef     = useRef<HTMLDivElement>(null)
  const parentTriggerRef   = useRef<HTMLDivElement>(null)
  const parentDropRef      = useRef<HTMLDivElement>(null)
  const startDateRef       = useRef<HTMLInputElement>(null)
  const dueDateRef         = useRef<HTMLInputElement>(null)
  const titleInputRef      = useRef<HTMLInputElement>(null)

  const { options: kraOptions } = useKraOptions()
  const currentUser = useAuthStore((s) => s.user)

  // Assignees selected before creation — passed to taskApi.createTask as assignedTo
  const [pendingAssignees,  setPendingAssignees]  = useState<string[]>([])
  const [showAssignPicker,  setShowAssignPicker]  = useState(false)

  // Focus title on mount
  useEffect(() => {
    const t = setTimeout(() => titleInputRef.current?.focus(), 60)
    return () => clearTimeout(t)
  }, [])

  // ── Open helpers ──────────────────────────────────────────────────────────
  const openPriorityMenu = () => {
    const r = priorityTriggerRef.current?.getBoundingClientRect()
    if (r) setPriorityDropPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 144) })
    setShowPriorityMenu((v) => !v)
  }
  const openActTypeMenu = () => {
    const r = actTypeTriggerRef.current?.getBoundingClientRect()
    if (r) setActTypeDropPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 200) })
    setShowActTypeMenu((v) => !v)
    setKraQuery('')
  }
  const openProjectMenu = () => {
    const r = projectTriggerRef.current?.getBoundingClientRect()
    if (r) setProjectDropPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 180) })
    setShowProjectMenu((v) => !v)
  }
  const openParentMenu = () => {
    const r = parentTriggerRef.current?.getBoundingClientRect()
    if (r) setParentDropPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 220) })
    setShowParentMenu((v) => !v)
    setParentQuery('')
  }

  // ── Outside-click to close menus ──────────────────────────────────────────
  useEffect(() => {
    const h = (e: MouseEvent) => {
      const t = e.target as Node
      if (showPriorityMenu && priorityTriggerRef.current && !priorityTriggerRef.current.contains(t) && priorityDropRef.current && !priorityDropRef.current.contains(t)) setShowPriorityMenu(false)
      if (showActTypeMenu  && actTypeTriggerRef.current  && !actTypeTriggerRef.current.contains(t)  && actTypeDropRef.current  && !actTypeDropRef.current.contains(t))  { setShowActTypeMenu(false); setKraQuery('') }
      if (showProjectMenu  && projectTriggerRef.current  && !projectTriggerRef.current.contains(t)  && projectDropRef.current  && !projectDropRef.current.contains(t))  setShowProjectMenu(false)
      if (showParentMenu   && parentTriggerRef.current   && !parentTriggerRef.current.contains(t)   && parentDropRef.current   && !parentDropRef.current.contains(t))   { setShowParentMenu(false); setParentQuery('') }
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [showPriorityMenu, showActTypeMenu, showProjectMenu, showParentMenu])

  // ── Escape: close menus first, then modal ─────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (showPriorityMenu) { setShowPriorityMenu(false); return }
      if (showActTypeMenu)  { setShowActTypeMenu(false); setKraQuery(''); return }
      if (showProjectMenu)  { setShowProjectMenu(false); return }
      if (showParentMenu)   { setShowParentMenu(false); setParentQuery(''); return }
      onClose()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose, showPriorityMenu, showActTypeMenu, showProjectMenu, showParentMenu])

  // ── Submit ────────────────────────────────────────────────────────────────
  const doSubmit = async (andAnother = false) => {
    if (!subject.trim()) { setTitleError(true); titleInputRef.current?.focus(); return }
    if (projects.length > 0 && !project) { setProjectError(true); return }
    const engDaysNum = engDays !== '' ? Number(engDays) : undefined
    const ok = await onSubmit({
      subject:        subject.trim(),
      project:        project     || undefined,
      activityType:   actType     || undefined,
      priority,
      isMilestone,
      parentTask:     parentTask  || undefined,
      dependsOnTasks: depTaskIds.join(',') || undefined,
      startDate:      startDate   || undefined,
      dueDate:        dueDate     || undefined,
      engagementDays: engDaysNum,
      description:    description || undefined,
      assignedTo:     pendingAssignees.length > 0 ? pendingAssignees : undefined,
    })
    if (ok) {
      if (andAnother) {
        // Reset form for another entry
        setSubject(''); setActType(''); setStartDate(''); setDueDate('')
        setEngDays(''); setParentTask(''); setIsMilestone(false); setIsGroup(false)
        setDescription(''); setDepTaskIds([]); setPendingAssignees([]); setEditorKey((k) => k + 1); setProjectError(false)
        setTimeout(() => titleInputRef.current?.focus(), 60)
      } else {
        onSuccess()
      }
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const pg              = PRIORITY_CONFIG.find((p) => p.key === priority)
  const selectedProject = projects.find((p) => p.name === project)
  const selectedParent  = tasks.find((t) => t.id === parentTask)
  const filteredParents = tasks.filter((t) =>
    !parentQuery || t.subject.toLowerCase().includes(parentQuery.toLowerCase()),
  )

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center animate-fade-in p-3"
      onClick={onClose}
    >
      <div
        className="relative flex bg-white w-full h-full rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >

        {/* ══ Main content ══ */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* ── Top bar ── */}
          <div className="flex-shrink-0 flex items-center gap-2 px-3 h-11 border-b border-slate-100 bg-white">
            <div className="flex items-center gap-1.5 text-[12px] min-w-0">
              <span className="hidden sm:inline text-slate-400 shrink-0">Team Space</span>
              <span className="hidden sm:inline text-slate-200">/</span>
              <span className="text-slate-600 font-medium truncate">
                {selectedProject?.displayName ?? 'New Task'}
              </span>
            </div>
            <div className="ml-auto flex items-center gap-1 flex-shrink-0">
              <button
                onClick={onClose}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              >
                <svg fill="none" viewBox="0 0 14 14" width="13" height="13">
                  <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5"/>
                </svg>
              </button>
            </div>
          </div>

          {/* ── Scrollable body ── */}
          <div className="flex-1 overflow-y-auto scrollbar-none">
            <div className="px-7 pt-5 pb-24">

              {/* Chip */}
              <div className="flex items-center gap-2 mb-4">
                <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-indigo-50 text-indigo-600 text-[11.5px] font-semibold">
                  <svg fill="none" viewBox="0 0 12 12" width="10" height="10">
                    <rect x="1" y="1" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.3"/>
                    <path d="M4 6h4M4 4h4M4 8h2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.1"/>
                  </svg>
                  New Task
                </span>
              </div>

              {/* Title */}
              <div className="mb-5">
                <input
                  ref={titleInputRef}
                  className={[
                    'w-full text-[24px] font-bold text-slate-900 bg-transparent outline-none leading-snug px-1 -mx-1 rounded-lg transition-colors placeholder:font-normal',
                    titleError ? 'placeholder:text-rose-300' : 'placeholder:text-slate-200',
                  ].join(' ')}
                  onChange={(e) => { setSubject(e.target.value); if (e.target.value.trim()) setTitleError(false) }}
                  placeholder="Task name *"
                  value={subject}
                />
                {titleError && (
                  <p className="text-[11px] text-rose-500 mt-1 px-1">Task name is required</p>
                )}
              </div>

              {/* ── Fields 2-column grid ── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 mb-5 rounded-xl border border-slate-100 overflow-hidden sm:divide-x divide-y sm:divide-y-0 divide-slate-100">

                {/* Left column */}
                <div className="divide-y divide-slate-50">

                  {/* Project */}
                  <div
                    ref={projectTriggerRef}
                    className={[
                      'flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 transition-colors cursor-pointer group',
                      projectError ? 'ring-1 ring-inset ring-rose-300 bg-rose-50/40' : '',
                    ].join(' ')}
                    onClick={openProjectMenu}
                  >
                    <span className={['text-[11.5px] w-28 flex-shrink-0', projectError ? 'text-rose-500' : 'text-slate-400'].join(' ')}>
                      Project{projectError ? ' *' : ''}
                    </span>
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      {selectedProject ? (
                        <span className="text-[12.5px] text-slate-700 truncate">{selectedProject.displayName}</span>
                      ) : (
                        <span className={['text-[12.5px] transition-colors', projectError ? 'text-rose-400' : 'text-slate-300 group-hover:text-slate-400'].join(' ')}>
                          {projectError ? 'Required — select a project' : 'None'}
                        </span>
                      )}
                      <svg fill="none" viewBox="0 0 10 10" width="8" height="8" className="text-slate-300 ml-auto flex-shrink-0">
                        <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.3"/>
                      </svg>
                    </div>
                  </div>

                  {/* Dates */}
                  <div className="flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 transition-colors group">
                    <span className="text-[11.5px] text-slate-400 w-28 flex-shrink-0">Dates</span>
                    <div className="flex items-center gap-1.5 text-[12.5px]">
                      <svg fill="none" viewBox="0 0 14 14" width="12" height="12" className="text-slate-400 flex-shrink-0">
                        <rect x="1" y="2.5" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                        <path d="M1 6h12M4.5 1v3M9.5 1v3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.3"/>
                      </svg>
                      <button
                        type="button"
                        className={startDate ? 'text-slate-700 hover:text-indigo-600 transition-colors' : 'text-slate-300 hover:text-slate-400 transition-colors'}
                        onClick={() => startDateRef.current?.showPicker?.() ?? startDateRef.current?.click()}
                      >
                        {startDate ? fmtDate(startDate) : 'Start'}
                      </button>
                      <input ref={startDateRef} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="sr-only"/>
                      <svg fill="none" viewBox="0 0 14 6" width="12" height="6" className="text-slate-300 flex-shrink-0">
                        <path d="M0 3h12M9 1l3 2-3 2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.2"/>
                      </svg>
                      <button
                        type="button"
                        className={dueDate ? 'text-slate-700 hover:text-indigo-600 transition-colors' : 'text-slate-300 hover:text-slate-400 transition-colors'}
                        onClick={() => dueDateRef.current?.showPicker?.() ?? dueDateRef.current?.click()}
                      >
                        {dueDate ? fmtDate(dueDate) : 'Due'}
                      </button>
                      <input ref={dueDateRef} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="sr-only"/>
                    </div>
                  </div>

                  {/* Engagement Days */}
                  <div className="flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 transition-colors group">
                    <span className="text-[11.5px] text-slate-400 w-28 flex-shrink-0">Engagement Days</span>
                    <input
                      type="number"
                      min="0"
                      placeholder="—"
                      value={engDays}
                      onChange={(e) => setEngDays(e.target.value)}
                      className="w-20 text-[12.5px] text-slate-700 bg-transparent outline-none border-0 placeholder:text-slate-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>

                  {/* Parent Task */}
                  <div
                    ref={parentTriggerRef}
                    className="flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 transition-colors cursor-pointer group"
                    onClick={openParentMenu}
                  >
                    <span className="text-[11.5px] text-slate-400 w-28 flex-shrink-0">Parent Task</span>
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      {selectedParent ? (
                        <span className="text-[12.5px] text-slate-700 truncate">{selectedParent.subject}</span>
                      ) : (
                        <span className="text-[12.5px] text-slate-300 group-hover:text-slate-400 transition-colors">None</span>
                      )}
                      <svg fill="none" viewBox="0 0 10 10" width="8" height="8" className="text-slate-300 ml-auto flex-shrink-0">
                        <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.3"/>
                      </svg>
                    </div>
                  </div>

                </div>

                {/* Right column */}
                <div className="divide-y divide-slate-50">

                  {/* Priority */}
                  <div
                    ref={priorityTriggerRef}
                    className="flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 transition-colors group cursor-pointer"
                    onClick={openPriorityMenu}
                  >
                    <span className="text-[11.5px] text-slate-400 w-28 flex-shrink-0">Priority</span>
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      {pg ? (
                        <>
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${pg.dot}`}/>
                          <span className="text-[12.5px] text-slate-700">{pg.label}</span>
                        </>
                      ) : (
                        <span className="text-[12.5px] text-slate-300">None</span>
                      )}
                      <svg fill="none" viewBox="0 0 10 10" width="8" height="8" className="text-slate-300 ml-auto">
                        <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.3"/>
                      </svg>
                    </div>
                  </div>

                  {/* Activity Type */}
                  <div
                    ref={actTypeTriggerRef}
                    className="flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 transition-colors group cursor-pointer"
                    onClick={openActTypeMenu}
                  >
                    <span className="text-[11.5px] text-slate-400 w-28 flex-shrink-0">Activity Type</span>
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      {actType ? (
                        <span className="text-[12.5px] text-slate-700 truncate">{actType}</span>
                      ) : (
                        <span className="text-[12.5px] text-slate-300 group-hover:text-slate-400 transition-colors">Empty</span>
                      )}
                      <svg fill="none" viewBox="0 0 10 10" width="8" height="8" className="text-slate-300 ml-auto flex-shrink-0">
                        <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.3"/>
                      </svg>
                    </div>
                  </div>

                  {/* Is Milestone */}
                  <div
                    className="flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 transition-colors group cursor-pointer"
                    onClick={() => setIsMilestone((v) => !v)}
                  >
                    <span className="text-[11.5px] text-slate-400 w-28 flex-shrink-0">Is Milestone</span>
                    <div className="flex items-center gap-2">
                      <div className={[
                        'relative inline-flex h-4 w-7 rounded-full border-2 border-transparent transition-colors',
                        isMilestone ? 'bg-amber-400' : 'bg-slate-200',
                      ].join(' ')}>
                        <span className={['inline-block h-3 w-3 rounded-full bg-white shadow transition-transform', isMilestone ? 'translate-x-3' : 'translate-x-0'].join(' ')}/>
                      </div>
                      <span className="text-[12.5px] text-slate-600">{isMilestone ? 'Yes' : 'No'}</span>
                    </div>
                  </div>

                  {/* Is Group */}
                  <div
                    className="flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 transition-colors group cursor-pointer"
                    onClick={() => setIsGroup((v) => !v)}
                  >
                    <span className="text-[11.5px] text-slate-400 w-28 flex-shrink-0">Is Group</span>
                    <div className="flex items-center gap-2">
                      <div className={[
                        'relative inline-flex h-4 w-7 rounded-full border-2 border-transparent transition-colors',
                        isGroup ? 'bg-indigo-500' : 'bg-slate-200',
                      ].join(' ')}>
                        <span className={['inline-block h-3 w-3 rounded-full bg-white shadow transition-transform', isGroup ? 'translate-x-3' : 'translate-x-0'].join(' ')}/>
                      </div>
                      <span className="text-[12.5px] text-slate-600">{isGroup ? 'Yes' : 'No'}</span>
                    </div>
                  </div>

                  {/* Assignees */}
                  <div
                    className="flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 transition-colors group cursor-pointer"
                    onClick={() => setShowAssignPicker(true)}
                  >
                    <span className="text-[11.5px] text-slate-400 w-28 flex-shrink-0">Assignees</span>
                    <div className="flex items-center gap-1.5">
                      {pendingAssignees.length > 0 && (
                        <div className="flex items-center -space-x-1.5">
                          {pendingAssignees.slice(0, 5).map((u) => (
                            <div
                              key={u}
                              className={`w-[22px] h-[22px] rounded-full flex items-center justify-center text-white text-[9px] font-bold ring-2 ring-white flex-shrink-0 ${avColor(u)}`}
                              title={u}
                            >
                              {initials(u)}
                            </div>
                          ))}
                          {pendingAssignees.length > 5 && (
                            <div className="w-[22px] h-[22px] rounded-full bg-slate-100 text-slate-500 text-[9px] font-bold ring-2 ring-white flex items-center justify-center">
                              +{pendingAssignees.length - 5}
                            </div>
                          )}
                        </div>
                      )}
                      <div className={[
                        'flex items-center justify-center rounded-full transition-colors flex-shrink-0',
                        pendingAssignees.length === 0
                          ? 'w-[22px] h-[22px] border-[1.5px] border-dashed border-slate-300 text-slate-400 hover:border-indigo-400 hover:text-indigo-500 hover:bg-indigo-50'
                          : 'w-[22px] h-[22px] border-[1.5px] border-dashed border-slate-200 text-slate-300 hover:border-slate-400 hover:text-slate-500 ring-2 ring-white',
                      ].join(' ')}>
                        <svg fill="none" viewBox="0 0 10 10" width="9" height="9">
                          <path d="M5 2v6M2 5h6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5"/>
                        </svg>
                      </div>
                    </div>
                  </div>

                </div>
              </div>

              {/* ── Description ── */}
              <div className="h-px bg-slate-100 mb-4"/>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Description</p>
              <RichTextEditor
                key={editorKey}
                onChange={(html) => setDescription(html)}
                placeholder="Add a description…"
              />

              {/* ── Dependent tasks (shown once at least one is added) ── */}
              {depTaskIds.length > 0 && (
                <>
                  <div className="h-px bg-slate-100 mt-5 mb-4"/>
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Dependent Tasks
                    <span className="ml-1.5 font-normal normal-case tracking-normal text-slate-300">({depTaskIds.length})</span>
                  </p>
                  <div className="rounded-lg border border-slate-100 divide-y divide-slate-50 overflow-hidden mb-3">
                    {depTaskIds.map((depId) => {
                      const depTask = tasks.find((t) => t.id === depId)
                      return (
                        <div key={depId} className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-300 flex-shrink-0"/>
                          <span className="flex-1 text-[12.5px] text-slate-700 truncate">{depTask?.subject ?? depId}</span>
                          <button
                            type="button"
                            onClick={() => setDepTaskIds((p) => p.filter((x) => x !== depId))}
                            className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-rose-100 text-slate-400 hover:text-rose-500 transition-colors"
                          >
                            <svg fill="none" viewBox="0 0 12 12" width="10" height="10">
                              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.3"/>
                            </svg>
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}

              {/* Add dependency link */}
              <div className="mt-4">
                <select
                  className="text-[12px] text-slate-400 bg-transparent border-0 outline-none cursor-pointer hover:text-slate-600 transition-colors"
                  onChange={(e) => {
                    if (e.target.value) {
                      setDepTaskIds((p) => [...p, e.target.value])
                      e.target.value = ''
                    }
                  }}
                  value=""
                >
                  <option value="">+ Add dependency…</option>
                  {tasks.filter((t) => !depTaskIds.includes(t.id)).map((t) => (
                    <option key={t.id} value={t.id}>{t.subject}</option>
                  ))}
                </select>
              </div>

              {/* Error */}
              {serverError && (
                <div className="flex items-start gap-2.5 bg-rose-50 border border-rose-100 text-rose-700 p-3.5 rounded-lg mt-5">
                  <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm-.75 3.75a.75.75 0 0 1 1.5 0v3.5a.75.75 0 0 1-1.5 0v-3.5zm.75 7a.875.875 0 1 1 0-1.75.875.875 0 0 1 0 1.75z"/>
                  </svg>
                  <span className="text-sm">{serverError}</span>
                </div>
              )}

            </div>
          </div>

          {/* ── Footer ── */}
          <div className="flex-shrink-0 border-t border-slate-100 px-7 py-3 flex items-center justify-between gap-3 bg-white">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-[13px] font-medium text-slate-500 hover:text-slate-700 transition-colors rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => void doSubmit(true)}
                className="px-3 py-2 rounded-lg text-[12.5px] text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Save &amp; add another
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => void doSubmit(false)}
                className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[13px] font-medium transition-all active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none"
              >
                {isSubmitting ? (
                  <>
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    Creating…
                  </>
                ) : 'Create Task'}
              </button>
            </div>
          </div>

        </div>

        {/* ══ Right communication panel (collapsible) ══ */}
        <div
          className={[
            'hidden md:flex flex-col border-l border-slate-100 bg-white flex-shrink-0 overflow-hidden',
            'transition-[width] duration-300 ease-in-out',
            commExpanded ? 'w-[320px]' : 'w-[52px]',
          ].join(' ')}
        >
          {/* Collapsed icon strip */}
          {!commExpanded && (
            <div className="flex flex-col items-center w-[52px] py-3 gap-0.5 bg-slate-50/30">
              <button
                type="button"
                onClick={() => { setCommTab('attachments'); setCommExpanded(true) }}
                title="Open activity panel"
                className="flex items-center justify-center w-9 h-9 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-indigo-500 transition-colors mb-1"
              >
                <svg fill="none" viewBox="0 0 16 16" width="14" height="14">
                  <path d="M10 3L6 8l4 5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"/>
                </svg>
              </button>
              <button
                type="button"
                onClick={() => { setCommTab('attachments'); setCommExpanded(true) }}
                title="Activity"
                className="flex flex-col items-center gap-0.5 w-9 py-2.5 rounded-lg bg-white shadow-sm text-violet-600 border border-slate-100/80 transition-colors"
              >
                <svg fill="none" viewBox="0 0 14 14" width="15" height="15">
                  <path d="M11 2H3a1 1 0 00-1 1v6a1 1 0 001 1h1l2 2 2-2h3a1 1 0 001-1V3a1 1 0 00-1-1z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                </svg>
                <span className="text-[9px] font-medium leading-none">Activity</span>
              </button>
            </div>
          )}

          {/* Expanded panel */}
          {commExpanded && (
            <div className="flex flex-col h-full w-[320px]">
              {/* Panel header */}
              <div className="flex-shrink-0 flex items-center gap-2 px-3 h-11 border-b border-slate-100">
                <span className="flex-1 text-[13px] font-semibold text-slate-700">Activity</span>
                <button
                  type="button"
                  onClick={() => setCommExpanded(false)}
                  title="Collapse panel"
                  className="flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                >
                  <svg fill="none" viewBox="0 0 16 16" width="14" height="14">
                    <path d="M6 3l4 5-4 5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"/>
                  </svg>
                </button>
              </div>

              {/* Tabs */}
              <div className="flex-shrink-0 flex items-center border-b border-slate-100 px-3">
                {(['attachments', 'activity', 'comments'] as const).map((tab) => (
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
                    {tab === 'comments' ? 'Comments' : tab === 'activity' ? 'Activity' : 'Files'}
                  </button>
                ))}
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto scrollbar-none">
                {commTab === 'comments' && (
                  <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-10 px-5">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-100 flex items-center justify-center shadow-sm">
                      <svg fill="none" viewBox="0 0 20 20" width="20" height="20" className="text-violet-500">
                        <path d="M16 2H4a1 1 0 00-1 1v9a1 1 0 001 1h2l3 3 3-3h4a1 1 0 001-1V3a1 1 0 00-1-1z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                        <path d="M7 7h6M7 10h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                      </svg>
                    </div>
                    <div>
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-violet-50 text-violet-600 text-[10px] font-bold uppercase tracking-wider">
                        ✦ Coming Soon
                      </span>
                      <p className="text-[13px] font-semibold text-slate-700 mt-2">Team Conversations</p>
                      <p className="text-[11.5px] text-slate-400 mt-1.5 leading-relaxed max-w-[210px] mx-auto">
                        Threaded replies, @mentions, emoji reactions, and smart notifications — all in context, right where the work happens.
                      </p>
                    </div>
                  </div>
                )}
                {commTab === 'activity' && (
                  <div className="flex flex-col items-center justify-center h-full gap-2 text-center py-10 px-4">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                      <svg fill="none" viewBox="0 0 20 20" width="18" height="18" className="text-slate-400">
                        <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.4"/>
                        <path d="M10 6v4l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                      </svg>
                    </div>
                    <p className="text-[12.5px] font-medium text-slate-600">No activity yet</p>
                    <p className="text-[11.5px] text-slate-400">Activity will appear after saving</p>
                  </div>
                )}
                {commTab === 'attachments' && (
                  <div className="flex flex-col items-center justify-center h-full gap-2 text-center py-10 px-4">
                    <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
                      <svg fill="none" viewBox="0 0 16 16" width="14" height="14" className="text-slate-400">
                        <path d="M7 9a4 4 0 0 0 5.66.01l1.9-1.88a4 4 0 0 0-5.66-5.66L7.8 3.58" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4"/>
                        <path d="M9 7a4 4 0 0 0-5.66-.01L1.44 8.87a4 4 0 0 0 5.66 5.66l1.1-1.1" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4"/>
                      </svg>
                    </div>
                    <p className="text-[12px] text-slate-500 font-medium">No links yet</p>
                    <p className="text-[11px] text-slate-400">Links will appear after saving</p>
                  </div>
                )}
              </div>

              {/* Composer — only for comments */}
              {commTab === 'comments' && (
                <div className="flex-shrink-0 border-t border-slate-100 p-3">
                  {comingSoon && (
                    <div className="mb-2 px-3 py-2 rounded-lg bg-violet-50 border border-violet-100 text-[11.5px] text-violet-700 flex items-start gap-1.5">
                      <span className="flex-shrink-0 mt-px">✦</span>
                      <span>{comingSoon}</span>
                    </div>
                  )}
                  <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                    <textarea
                      readOnly
                      className="w-full px-3 pt-2.5 pb-1 text-[12.5px] text-slate-700 placeholder:text-slate-400 bg-transparent outline-none resize-none scrollbar-none cursor-not-allowed"
                      placeholder="Add a comment… (@ to mention)"
                      rows={3}
                      onClick={() => triggerComingSoon('Real-time comments with @mentions, file attachments, and threaded replies — coming soon.')}
                    />
                    <div className="flex items-center justify-between px-2 pb-2 pt-1 border-t border-slate-100">
                      <div className="flex items-center gap-0.5">
                        <button type="button" title="Bold" onClick={() => triggerComingSoon('Rich text formatting — bold, italic, inline code, lists, and more.')} className="w-6 h-6 flex items-center justify-center rounded text-slate-300 hover:text-violet-500 hover:bg-violet-50 transition-colors">
                          <svg fill="none" viewBox="0 0 12 12" width="11" height="11">
                            <path d="M3 2h4a2 2 0 010 4H3zM3 6h4.5a2 2 0 010 4H3z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                          </svg>
                        </button>
                        <button type="button" title="Attach file" onClick={() => triggerComingSoon('Drag-and-drop files, image previews, and document storage directly on tasks.')} className="w-6 h-6 flex items-center justify-center rounded text-slate-300 hover:text-violet-500 hover:bg-violet-50 transition-colors">
                          <svg fill="none" viewBox="0 0 12 12" width="11" height="11">
                            <path d="M10 5.5L6 9.5a3 3 0 01-4.2-4.2l5-5a1.7 1.7 0 012.4 2.4L4 7.9A1 1 0 012.6 6.5L7 2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.2"/>
                          </svg>
                        </button>
                        <button type="button" title="Mention" onClick={() => triggerComingSoon('@mention teammates to notify them instantly and loop them into the conversation.')} className="w-6 h-6 flex items-center justify-center rounded text-slate-300 hover:text-violet-500 hover:bg-violet-50 transition-colors">
                          <svg fill="none" viewBox="0 0 12 12" width="11" height="11">
                            <circle cx="6" cy="5.5" r="1.8" stroke="currentColor" strokeWidth="1.2"/>
                            <path d="M9.5 6A3.5 3.5 0 116 2.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.2"/>
                            <path d="M9.5 6v1.2a1.3 1.3 0 002.5 0V6a6 6 0 10-2.5 4.8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.2"/>
                          </svg>
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => triggerComingSoon('Send comments, updates, and questions — keep the whole conversation on the task.')}
                        className="h-6 px-2.5 bg-violet-100 hover:bg-violet-200 text-violet-600 text-[11.5px] font-medium rounded-lg transition-colors flex items-center gap-1"
                      >
                        Send
                        <svg fill="none" viewBox="0 0 10 10" width="9" height="9">
                          <path d="M2 5h6M5.5 2.5L8 5l-2.5 2.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.3"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ══ Fixed-position dropdowns ══ */}

        {showPriorityMenu && (
          <div
            ref={priorityDropRef}
            style={{ position: 'fixed', top: priorityDropPos.top, left: priorityDropPos.left, width: priorityDropPos.width, zIndex: 9999 }}
            className="bg-white border border-slate-200 rounded-lg shadow-lg py-1"
          >
            {PRIORITY_CONFIG.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => { setPriority(p.key); setShowPriorityMenu(false) }}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12.5px] text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${p.dot}`}/>
                {p.label}
                {priority === p.key && (
                  <svg className="ml-auto" fill="none" viewBox="0 0 12 12" width="11" height="11">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"/>
                  </svg>
                )}
              </button>
            ))}
          </div>
        )}

        {showActTypeMenu && (
          <div
            ref={actTypeDropRef}
            style={{ position: 'fixed', top: actTypeDropPos.top, left: actTypeDropPos.left, width: actTypeDropPos.width, zIndex: 9999 }}
            className="bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden"
          >
            <div className="flex items-center gap-1.5 px-2.5 border-b border-slate-100">
              <svg fill="none" viewBox="0 0 12 12" width="11" height="11" className="text-slate-400 flex-shrink-0">
                <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M8 8l2.5 2.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.3"/>
              </svg>
              <input
                autoFocus
                type="text"
                value={kraQuery}
                onChange={(e) => setKraQuery(e.target.value)}
                placeholder="Search..."
                className="w-full h-8 text-[12px] text-slate-700 placeholder:text-slate-400 bg-transparent outline-none border-0"
              />
            </div>
            <div className="max-h-44 overflow-y-auto scrollbar-none py-1">
              {actType && (
                <button
                  type="button"
                  onClick={() => { setActType(''); setShowActTypeMenu(false); setKraQuery('') }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors"
                >
                  <svg fill="none" viewBox="0 0 12 12" width="10" height="10">
                    <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.3"/>
                  </svg>
                  Clear
                </button>
              )}
              {kraOptions
                .filter((o) => !kraQuery || o.toLowerCase().includes(kraQuery.toLowerCase()))
                .map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => { setActType(opt); setShowActTypeMenu(false); setKraQuery('') }}
                    className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-[12.5px] text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <span className="truncate">{opt}</span>
                    {actType === opt && (
                      <svg fill="none" viewBox="0 0 12 12" width="11" height="11" className="text-indigo-500 flex-shrink-0">
                        <path d="M2 6l3 3 5-5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"/>
                      </svg>
                    )}
                  </button>
                ))}
              {kraOptions.filter((o) => !kraQuery || o.toLowerCase().includes(kraQuery.toLowerCase())).length === 0 && (
                <p className="text-[12px] text-slate-400 text-center py-3">No options found</p>
              )}
            </div>
          </div>
        )}

        {showProjectMenu && (
          <div
            ref={projectDropRef}
            style={{ position: 'fixed', top: projectDropPos.top, left: projectDropPos.left, width: projectDropPos.width, zIndex: 9999 }}
            className="bg-white border border-slate-200 rounded-lg shadow-lg py-1 max-h-56 overflow-y-auto scrollbar-none"
          >
            <button
              type="button"
              onClick={() => { setProject(''); setShowProjectMenu(false); setProjectError(false) }}
              className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-[12.5px] text-slate-400 hover:bg-slate-50 transition-colors"
            >
              <span>No project</span>
              {!project && (
                <svg fill="none" viewBox="0 0 12 12" width="11" height="11" className="text-indigo-500 flex-shrink-0">
                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"/>
                </svg>
              )}
            </button>
            {projects.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => { setProject(p.name); setShowProjectMenu(false); setProjectError(false) }}
                className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-[12.5px] text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <span className="truncate">{p.displayName}</span>
                {project === p.name && (
                  <svg fill="none" viewBox="0 0 12 12" width="11" height="11" className="text-indigo-500 flex-shrink-0">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"/>
                  </svg>
                )}
              </button>
            ))}
          </div>
        )}

        {showParentMenu && (
          <div
            ref={parentDropRef}
            style={{ position: 'fixed', top: parentDropPos.top, left: parentDropPos.left, width: parentDropPos.width, zIndex: 9999 }}
            className="bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden"
          >
            <div className="flex items-center gap-1.5 px-2.5 border-b border-slate-100">
              <svg fill="none" viewBox="0 0 12 12" width="11" height="11" className="text-slate-400 flex-shrink-0">
                <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M8 8l2.5 2.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.3"/>
              </svg>
              <input
                autoFocus
                type="text"
                value={parentQuery}
                onChange={(e) => setParentQuery(e.target.value)}
                placeholder="Search tasks..."
                className="w-full h-8 text-[12px] text-slate-700 placeholder:text-slate-400 bg-transparent outline-none border-0"
              />
            </div>
            <div className="max-h-52 overflow-y-auto scrollbar-none py-1">
              <button
                type="button"
                onClick={() => { setParentTask(''); setShowParentMenu(false); setParentQuery('') }}
                className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-[12.5px] text-slate-400 hover:bg-slate-50 transition-colors"
              >
                <span>None — top-level task</span>
                {!parentTask && (
                  <svg fill="none" viewBox="0 0 12 12" width="11" height="11" className="text-indigo-500 flex-shrink-0">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"/>
                  </svg>
                )}
              </button>
              {filteredParents.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => { setParentTask(t.id); setShowParentMenu(false); setParentQuery('') }}
                  className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-[12.5px] text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <span className="truncate">{t.subject}</span>
                  {parentTask === t.id && (
                    <svg fill="none" viewBox="0 0 12 12" width="11" height="11" className="text-indigo-500 flex-shrink-0">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"/>
                    </svg>
                  )}
                </button>
              ))}
              {filteredParents.length === 0 && (
                <p className="text-[12px] text-slate-400 text-center py-3">No tasks found</p>
              )}
            </div>
          </div>
        )}

      </div>
    </div>

    {/* Assign picker — local only, no API calls; selected users are passed to createTask */}
    {showAssignPicker && (
      <AssignTaskModal
        task={{
          id: '__new__',
          subject: subject.trim() || 'New Task',
          project: project || null,
          status: 'Open',
          priority,
          type: null,
          activityType: null,
          isMilestone,
          parentTask: parentTask || null,
          dependsOnTasks: null,
          startDate: startDate || null,
          dueDate: dueDate || null,
          reviewDate: null,
          closingDate: null,
          progress: 0,
          engagementDays: null,
          department: null,
          color: null,
          description: description || null,
          owner: currentUser?.username ?? null,
          updatedAt: null,
          assignedTo: pendingAssignees,
          completedBy: null,
          completedOn: null,
          comments: [],
        }}
        currentUser={currentUser?.username ?? ''}
        onAssign={async (userId) => {
          setPendingAssignees((prev) => prev.includes(userId) ? prev : [...prev, userId])
          return true
        }}
        onUnassign={async (userId) => {
          setPendingAssignees((prev) => prev.filter((u) => u !== userId))
          return true
        }}
        onClose={() => setShowAssignPicker(false)}
      />
    )}
    </>
  )
}
