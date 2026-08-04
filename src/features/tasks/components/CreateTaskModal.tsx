import { useEffect, useRef, useState } from 'react'
import React from 'react'

import { RichTextEditor } from '../../../shared/components/RichTextEditor'
import { useKraOptions } from '../../../hooks/useKraOptions'
import { useAuthStore } from '../../../store/authStore'
import { AssignTaskModal } from './AssignTaskModal'
import type { Project } from '../../projects/types/project.types'
import type { Task, TaskComment, CreateTaskInput } from '../types/task.types'
import { autoRepeatApi, WEEKDAYS } from '../../../api/autoRepeatApi'
import type { RepeatFrequency, Weekday } from '../../../api/autoRepeatApi'
import { userApi } from '../../../api/userApi'
import type { UserOption } from '../../../api/userApi'

function mentionSlug(username: string) {
  return username.split('@')[0]
}

function renderMentionText(text: string): React.ReactNode {
  const parts = text.split(/((?:^|\s)@[\w.-]+)/g)
  return parts.map((seg, i) => {
    const trimmed = seg.trimStart()
    if (trimmed.startsWith('@') && /^@[\w.-]+$/.test(trimmed)) {
      const leading = seg.length - trimmed.length
      return (
        <React.Fragment key={i}>
          {seg.slice(0, leading)}
          <span className="text-indigo-600 font-medium bg-indigo-50 rounded px-0.5">{trimmed}</span>
        </React.Fragment>
      )
    }
    return seg
  })
}

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Inclusive calendar-day count between two ISO date strings (start → due + 1). */
function calcEngagementDays(start: string, due: string): number | undefined {
  if (!start || !due) return undefined
  const s = new Date(start)
  const d = new Date(due)
  if (isNaN(s.getTime()) || isNaN(d.getTime()) || d < s) return undefined
  return Math.round((d.getTime() - s.getTime()) / 86_400_000) + 1
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
  initialProject?: string
  onSubmit: (input: CreateTaskInput) => Promise<Task | null>
  onClose: () => void
  onSuccess: () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CreateTaskModal({
  projects,
  tasks,
  isSubmitting,
  serverError,
  initialProject,
  onSubmit,
  onClose,
  onSuccess,
}: CreateTaskModalProps) {
  // ── Form fields ────────────────────────────────────────────────────────────
  const [subject,     setSubject]     = useState('')
  const [project,     setProject]     = useState(initialProject ?? projects[0]?.name ?? '')
  const [priority,    setPriority]    = useState('Medium')
  const [actType,     setActType]     = useState('')
  const [startDate,   setStartDate]   = useState('')
  const [dueDate,     setDueDate]     = useState('')
  const [engDays,     setEngDays]     = useState('')
  const [parentTask,  setParentTask]  = useState('')
  const [isMilestone, setIsMilestone] = useState(false)
  const [isGroup,     setIsGroup]     = useState(false)
  const [description, setDescription] = useState('')
  const [depTaskIds,    setDepTaskIds]    = useState<string[]>([])
  const [showDepPicker, setShowDepPicker] = useState(false)
  const [depPickerValue, setDepPickerValue] = useState('')
  const [kraQuery,    setKraQuery]    = useState('')
  const [parentQuery, setParentQuery] = useState('')
  const [titleError,   setTitleError]   = useState(false)
  const [projectError, setProjectError] = useState(false)
  const [editorKey,    setEditorKey]    = useState(0)

  // ── Repeat ────────────────────────────────────────────────────────────────
  const [repeatEnabled,     setRepeatEnabled]     = useState(false)
  const [repeatFreq,        setRepeatFreq]        = useState<RepeatFrequency>('Weekly')
  const [repeatStart,       setRepeatStart]       = useState('')
  const [repeatEnd,         setRepeatEnd]         = useState('')
  const [repeatOnDay,       setRepeatOnDay]       = useState('')
  const [repeatOnWeekdays,  setRepeatOnWeekdays]  = useState<Weekday[]>([])
  const [repeatError,       setRepeatError]       = useState<string | null>(null)

  // ── Comments + @mention ───────────────────────────────────────────────────
  const [pendingComments, setPendingComments] = useState<TaskComment[]>([])
  const [commentText,     setCommentText]     = useState('')
  const commentInputRef = useRef<HTMLTextAreaElement>(null)
  const [mentionQuery,   setMentionQuery]   = useState<string | null>(null)
  const [mentionUsers,   setMentionUsers]   = useState<UserOption[]>([])
  const [mentionIdx,     setMentionIdx]     = useState(0)
  const [mentionDropPos, setMentionDropPos] = useState({ bottom: 0, left: 0, width: 0 })
  const mentionDropRef = useRef<HTMLDivElement>(null)

  // ── Links ─────────────────────────────────────────────────────────────────
  const [pendingLinks, setPendingLinks] = useState<{ label: string; url: string }[]>([])
  const [showAddLink,  setShowAddLink]  = useState(false)
  const [linkName,     setLinkName]     = useState('')
  const [linkUrl,      setLinkUrl]      = useState('')

  // ── Right panel ───────────────────────────────────────────────────────────
  const [commExpanded, setCommExpanded] = useState(false)
  const [commTab, setCommTab] = useState<'repeat' | 'comments' | 'links' | 'activity'>('comments')
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
  const engDaysInputRef    = useRef<HTMLInputElement>(null)
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

  // @mention user search
  useEffect(() => {
    if (mentionQuery === null) { setMentionUsers([]); return }
    const timer = setTimeout(() => {
      userApi.searchActiveEmployees(mentionQuery)
        .then((users) => { setMentionUsers(users); setMentionIdx(0) })
        .catch(() => setMentionUsers([]))
    }, 150)
    return () => clearTimeout(timer)
  }, [mentionQuery])

  // Close mention dropdown on outside click
  useEffect(() => {
    if (mentionQuery === null) return
    const h = (e: MouseEvent) => {
      const t = e.target as Node
      if (
        mentionDropRef.current && !mentionDropRef.current.contains(t) &&
        commentInputRef.current && !commentInputRef.current.contains(t)
      ) setMentionQuery(null)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [mentionQuery])

  const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCommentText(e.target.value)
    const pos = e.target.selectionStart ?? e.target.value.length
    const textToCursor = e.target.value.slice(0, pos)
    const match = textToCursor.match(/@([^\s@]*)$/)
    if (match) {
      if (mentionQuery === null) {
        const rect = commentInputRef.current?.getBoundingClientRect()
        if (rect) setMentionDropPos({ bottom: window.innerHeight - rect.top + 4, left: rect.left, width: rect.width })
      }
      setMentionQuery(match[1])
    } else {
      setMentionQuery(null)
    }
  }

  const insertMention = (user: UserOption) => {
    const el = commentInputRef.current
    if (!el) return
    const pos = el.selectionStart ?? commentText.length
    const before = commentText.slice(0, pos)
    const after  = commentText.slice(pos)
    const atIdx  = before.lastIndexOf('@')
    const token  = `@${mentionSlug(user.name)} `
    const newText = before.slice(0, atIdx) + token + after
    setCommentText(newText)
    setMentionQuery(null)
    setMentionUsers([])
    setTimeout(() => {
      el.focus()
      const newPos = atIdx + token.length
      el.setSelectionRange(newPos, newPos)
    }, 0)
  }

  const handleCommentKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQuery !== null && mentionUsers.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIdx((i) => Math.min(i + 1, mentionUsers.length - 1)); return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setMentionIdx((i) => Math.max(i - 1, 0)); return }
      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); insertMention(mentionUsers[mentionIdx]); return }
      if (e.key === 'Escape') { setMentionQuery(null); setMentionUsers([]); return }
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      const text = commentText.trim()
      if (!text) return
      setPendingComments((prev) => [...prev, {
        user: currentUser?.username ?? 'Unknown',
        fullName: currentUser?.fullName ?? currentUser?.username ?? 'Unknown',
        text,
        timestamp: new Date().toISOString(),
      }])
      setCommentText('')
    }
  }

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
    // Validate repeat: must have a start date if enabled
    if (repeatEnabled && !repeatStart) {
      setRepeatError('A start date is required to enable repeat.')
      setCommExpanded(true); setCommTab('repeat')
      return
    }
    setRepeatError(null)
    const engDaysNum = engDays !== '' ? Number(engDays) : undefined
    // Serialize pending links as <a> HTML appended to description
    const linksHtml = pendingLinks.map((l) =>
      `<p><a href="${l.url}" target="_blank" rel="noopener noreferrer">${l.label}</a></p>`
    ).join('')
    const fullDesc = (description || '') + linksHtml || undefined
    const created = await onSubmit({
      subject:        subject.trim(),
      project:        project     || undefined,
      activityType:   actType     || undefined,
      priority,
      isMilestone,
      isGroup,
      parentTask:     parentTask  || undefined,
      dependsOnTasks: depTaskIds.join(',') || undefined,
      startDate:      startDate   || undefined,
      dueDate:        dueDate     || undefined,
      engagementDays: engDaysNum,
      description:    fullDesc,
      assignedTo:     pendingAssignees.length > 0 ? pendingAssignees : undefined,
      comments:       pendingComments.length > 0 ? pendingComments : undefined,
    })
    if (created) {
      if (repeatEnabled && repeatStart) {
        try {
          await autoRepeatApi.create(created.id, {
            frequency:        repeatFreq,
            startDate:        repeatStart,
            endDate:          repeatEnd || undefined,
            repeatOnDay:      repeatOnDay ? Number(repeatOnDay) : undefined,
            repeatOnWeekdays: repeatFreq === 'Weekly' ? repeatOnWeekdays : undefined,
          })
        } catch {
          // Task was created — only the repeat schedule failed. Show inline error.
          setRepeatError('Task created, but the repeat schedule could not be saved. You can set it from the task detail view.')
          setCommExpanded(true); setCommTab('repeat')
          console.warn('[CreateTaskModal] Auto Repeat creation failed')
        }
      }
      if (andAnother) {
        // Reset form for another entry
        setSubject(''); setActType(''); setStartDate(''); setDueDate('')
        setEngDays(''); setParentTask(''); setIsMilestone(false); setIsGroup(false)
        setDescription(''); setDepTaskIds([]); setShowDepPicker(false); setDepPickerValue(''); setPendingAssignees([]); setEditorKey((k) => k + 1); setProjectError(false)
        setRepeatEnabled(false); setRepeatStart(''); setRepeatEnd(''); setRepeatOnDay(''); setRepeatOnWeekdays([]); setRepeatError(null)
        setPendingComments([]); setCommentText(''); setPendingLinks([]); setLinkName(''); setLinkUrl('')
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
    (!project || t.project === project) &&
    (!parentQuery || t.subject.toLowerCase().includes(parentQuery.toLowerCase())),
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
                      <input ref={startDateRef} type="date" value={startDate} onChange={(e) => {
                        const v = e.target.value
                        setStartDate(v)
                        const calc = calcEngagementDays(v, dueDate)
                        if (calc !== undefined) setEngDays(String(calc))
                      }} className="sr-only"/>
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
                      <input ref={dueDateRef} type="date" value={dueDate} onChange={(e) => {
                        const v = e.target.value
                        setDueDate(v)
                        const calc = calcEngagementDays(startDate, v)
                        if (calc !== undefined) setEngDays(String(calc))
                      }} className="sr-only"/>
                    </div>
                  </div>

                  {/* Engagement Days */}
                  <div
                    className="flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 transition-colors group cursor-text"
                    onClick={() => engDaysInputRef.current?.focus()}
                  >
                    <span className="text-[11.5px] text-slate-400 w-28 flex-shrink-0">Engagement Days</span>
                    <input
                      ref={engDaysInputRef}
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

              {/* ── Subtasks ── */}
              <div className="h-px bg-slate-100 mt-5 mb-4"/>
              <div className="mb-5">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Subtasks{depTaskIds.length > 0 && <span className="ml-1.5 font-normal normal-case tracking-normal text-slate-300">({depTaskIds.length})</span>}
                </p>

                {depTaskIds.length > 0 && (
                  <div className="mb-2.5 rounded-lg border border-slate-100 divide-y divide-slate-50 overflow-hidden">
                    {depTaskIds.map((depId) => {
                      const depTask = tasks.find((t) => t.id === depId)
                      return (
                        <div key={depId} className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 transition-colors">
                          <div className="w-1.5 h-1.5 rounded-full bg-slate-400 flex-shrink-0"/>
                          <span className="flex-1 text-[12.5px] text-slate-700 truncate">{depTask?.subject ?? depId}</span>
                          <button
                            type="button"
                            aria-label="Remove"
                            onClick={() => setDepTaskIds((p) => p.filter((x) => x !== depId))}
                            className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full hover:bg-rose-100 text-slate-300 hover:text-rose-500 transition-colors"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 12 12">
                              <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                            </svg>
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}

                {showDepPicker && (
                  <div className="flex gap-2 mb-2">
                    <div className="relative flex-1 min-w-0">
                      <select
                        className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 appearance-none pr-9 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all"
                        onChange={(e) => setDepPickerValue(e.target.value)}
                        value={depPickerValue}
                      >
                        <option value="">Select a task…</option>
                        {tasks.filter((t) => (!project || t.project === project) && !depTaskIds.includes(t.id)).map((t) => (
                          <option key={t.id} value={t.id}>{t.subject}</option>
                        ))}
                      </select>
                      <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 16 16">
                        <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <button
                      type="button"
                      disabled={!depPickerValue}
                      onClick={() => {
                        setDepTaskIds((p) => [...p, depPickerValue])
                        setShowDepPicker(false)
                        setDepPickerValue('')
                      }}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-all disabled:opacity-40 disabled:pointer-events-none flex-shrink-0"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowDepPicker(false); setDepPickerValue('') }}
                      className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700 transition-colors flex-shrink-0"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => { setShowDepPicker(true); setDepPickerValue('') }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] text-slate-500 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors"
                >
                  <svg fill="none" viewBox="0 0 12 12" width="11" height="11">
                    <path d="M6 1v10M1 6h10" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5"/>
                  </svg>
                  Add Task
                </button>
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

        {/* ══ Right panel (collapsible) ══ */}
        <div
          className={[
            'hidden md:flex flex-col border-l border-slate-100 bg-white flex-shrink-0 overflow-hidden',
            'transition-[width] duration-300 ease-in-out',
            commExpanded ? 'w-[320px]' : 'w-[52px]',
          ].join(' ')}
        >
          {/* Collapsed icon strip */}
          {!commExpanded && (
            <div className="flex flex-col items-center w-[52px] pt-2 pb-3 gap-0.5 bg-slate-50 border-r border-slate-100">
              {/* Expand arrow */}
              <button
                type="button"
                onClick={() => setCommExpanded(true)}
                title="Expand panel"
                className="flex items-center justify-center w-9 h-8 rounded-lg text-slate-300 hover:text-indigo-400 hover:bg-indigo-50 transition-colors mb-2"
              >
                <svg fill="none" viewBox="0 0 16 16" width="13" height="13">
                  <path d="M10 3L6 8l4 5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6"/>
                </svg>
              </button>

              {([
                {
                  tab: 'repeat',
                  label: 'Repeat',
                  badge: repeatError ? <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-rose-500"/> : repeatEnabled ? <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-indigo-500"/> : null,
                  icon: <svg fill="none" viewBox="0 0 14 14" width="15" height="15"><path d="M2 7a5 5 0 0 1 9-3M12 7a5 5 0 0 1-9 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M11 4l1-1.5 1.5 1.5M3 10l-1 1.5-1.5-1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>,
                },
                {
                  tab: 'comments',
                  label: 'Comments',
                  badge: pendingComments.length > 0 ? <span className="absolute top-0.5 right-0.5 min-w-[14px] h-3.5 px-0.5 rounded-full bg-indigo-500 text-white text-[8px] font-bold flex items-center justify-center">{pendingComments.length}</span> : null,
                  icon: <svg fill="none" viewBox="0 0 14 14" width="15" height="15"><path d="M11 2H3a1 1 0 00-1 1v6a1 1 0 001 1h1l2 2 2-2h3a1 1 0 001-1V3a1 1 0 00-1-1z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>,
                },
                {
                  tab: 'links',
                  label: 'Links',
                  badge: pendingLinks.length > 0 ? <span className="absolute top-0.5 right-0.5 min-w-[14px] h-3.5 px-0.5 rounded-full bg-indigo-500 text-white text-[8px] font-bold flex items-center justify-center">{pendingLinks.length}</span> : null,
                  icon: <svg fill="none" viewBox="0 0 14 14" width="15" height="15"><path d="M6 8a3 3 0 0 0 4.24.01l1.42-1.41a3 3 0 0 0-4.24-4.24L6.35 3.4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.3"/><path d="M8 6a3 3 0 0 0-4.24-.01L2.34 7.4a3 3 0 0 0 4.24 4.24l1.05-1.05" stroke="currentColor" strokeLinecap="round" strokeWidth="1.3"/></svg>,
                },
                {
                  tab: 'activity',
                  label: 'Activity',
                  badge: null,
                  icon: <svg fill="none" viewBox="0 0 14 14" width="15" height="15"><circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.3"/><path d="M7 4.5v3l2 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
                },
              ] as const).map(({ tab, label, icon, badge }) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => { setCommTab(tab); setCommExpanded(true) }}
                  title={label}
                  className={[
                    'relative flex flex-col items-center justify-center gap-1 w-10 h-10 rounded-xl transition-all',
                    tab === 'repeat' && repeatEnabled
                      ? 'bg-indigo-50 text-indigo-500'
                      : 'text-slate-400 hover:bg-white hover:text-slate-600 hover:shadow-sm',
                  ].join(' ')}
                >
                  {icon}
                  {badge}
                </button>
              ))}
            </div>
          )}

          {/* Expanded panel */}
          {commExpanded && (
            <div className="flex flex-col h-full w-[320px]">
              {/* Header */}
              <div className="flex-shrink-0 flex items-center gap-2 px-3 h-11 border-b border-slate-100">
                <span className="flex-1 text-[13px] font-semibold text-slate-700">
                  {commTab === 'repeat' ? 'Repeat' : commTab === 'comments' ? 'Comments' : commTab === 'links' ? 'Links' : 'Activity'}
                </span>
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

              {/* Tab bar — all 4 always visible */}
              <div className="flex-shrink-0 flex items-center border-b border-slate-100 px-1">
                {(['repeat', 'comments', 'links', 'activity'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setCommTab(tab)}
                    className={[
                      'px-2.5 py-2.5 text-[11.5px] font-medium border-b-2 -mb-px transition-colors',
                      commTab === tab
                        ? 'border-indigo-500 text-indigo-600'
                        : 'border-transparent text-slate-400 hover:text-slate-600',
                    ].join(' ')}
                  >
                    {tab === 'repeat' ? 'Repeat' : tab === 'comments' ? 'Comments' : tab === 'links' ? 'Links' : 'Activity'}
                    {tab === 'repeat' && repeatError && (
                      <span className="ml-1 inline-flex w-1.5 h-1.5 rounded-full bg-rose-500 align-middle -mt-0.5"/>
                    )}
                    {tab === 'repeat' && !repeatError && repeatEnabled && (
                      <span className="ml-1 inline-flex w-1.5 h-1.5 rounded-full bg-indigo-500 align-middle -mt-0.5"/>
                    )}
                    {tab === 'comments' && pendingComments.length > 0 && (
                      <span className="ml-1 inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-indigo-100 text-indigo-600 text-[9px] font-bold align-middle -mt-0.5">{pendingComments.length}</span>
                    )}
                    {tab === 'links' && pendingLinks.length > 0 && (
                      <span className="ml-1 inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-indigo-100 text-indigo-600 text-[9px] font-bold align-middle -mt-0.5">{pendingLinks.length}</span>
                    )}
                  </button>
                ))}
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto scrollbar-none">

                {/* ── Repeat tab ── */}
                {commTab === 'repeat' && (
                  <div className="p-4 space-y-3">
                    {/* Repeat error */}
                    {repeatError && (
                      <div className="flex items-start gap-2 bg-rose-50 border border-rose-100 text-rose-700 px-3 py-2.5 rounded-lg text-[12px]">
                        <svg className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 16 16">
                          <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm-.75 3.75a.75.75 0 0 1 1.5 0v3.5a.75.75 0 0 1-1.5 0v-3.5zm.75 7a.875.875 0 1 1 0-1.75.875.875 0 0 1 0 1.75z"/>
                        </svg>
                        <span>{repeatError}</span>
                      </div>
                    )}
                    {/* Enable toggle */}
                    <div
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                      onClick={() => {
                        const next = !repeatEnabled
                        setRepeatEnabled(next)
                        if (next && !repeatStart) setRepeatStart(startDate || '')
                      }}
                    >
                      <div className={[
                        'relative inline-flex h-4 w-7 rounded-full border-2 border-transparent transition-colors flex-shrink-0',
                        repeatEnabled ? 'bg-indigo-500' : 'bg-slate-200',
                      ].join(' ')}>
                        <span className={['inline-block h-3 w-3 rounded-full bg-white shadow transition-transform', repeatEnabled ? 'translate-x-3' : 'translate-x-0'].join(' ')}/>
                      </div>
                      <span className="text-[13px] font-semibold text-slate-700">Enable repeat</span>
                      {repeatEnabled && <span className="ml-auto text-xs text-indigo-600 font-medium">{repeatFreq}</span>}
                    </div>
                    {repeatEnabled && (
                      <div className="rounded-lg border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                        {/* Frequency */}
                        <div className="flex items-center gap-3 px-3.5 py-2.5">
                          <span className="text-xs font-semibold text-slate-500 w-24 flex-shrink-0">Frequency</span>
                          <div className="relative flex-1 min-w-0">
                            <select
                              value={repeatFreq}
                              onChange={(e) => setRepeatFreq(e.target.value as RepeatFrequency)}
                              className="w-full text-[12.5px] text-slate-700 bg-transparent outline-none border border-slate-200 rounded-lg px-2.5 py-1.5 appearance-none"
                            >
                              {(['Daily','Weekly','Monthly','Quarterly','Half-yearly','Yearly'] as RepeatFrequency[]).map((f) => (
                                <option key={f} value={f}>{f}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        {/* Start date */}
                        <div className="flex items-center gap-3 px-3.5 py-2.5">
                          <span className="text-xs font-semibold text-slate-500 w-24 flex-shrink-0">Start date</span>
                          <input
                            type="date"
                            value={repeatStart}
                            onChange={(e) => setRepeatStart(e.target.value)}
                            className="flex-1 text-[12.5px] text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-indigo-300"
                          />
                        </div>
                        {/* End date */}
                        <div className="flex items-center gap-3 px-3.5 py-2.5">
                          <span className="text-xs font-semibold text-slate-500 w-24 flex-shrink-0">End date</span>
                          <input
                            type="date"
                            value={repeatEnd}
                            onChange={(e) => setRepeatEnd(e.target.value)}
                            className="flex-1 text-[12.5px] text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-indigo-300"
                          />
                        </div>
                        {/* Repeat on days — weekly only */}
                        {repeatFreq === 'Weekly' && (
                          <div className="px-3.5 py-2.5">
                            <span className="text-xs font-semibold text-slate-500 block mb-2">Repeat on days</span>
                            <div className="flex gap-1.5 flex-wrap">
                              {WEEKDAYS.map((day) => {
                                const label = day.slice(0, 2).toUpperCase()
                                const active = repeatOnWeekdays.includes(day)
                                return (
                                  <button
                                    key={day}
                                    type="button"
                                    onClick={() => setRepeatOnWeekdays((prev) =>
                                      active ? prev.filter((d) => d !== day) : [...prev, day]
                                    )}
                                    className={[
                                      'w-8 h-8 rounded-full text-[11px] font-bold border transition-all',
                                      active
                                        ? 'bg-indigo-600 border-indigo-600 text-white'
                                        : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-300 hover:text-indigo-500',
                                    ].join(' ')}
                                  >
                                    {label}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )}
                        {/* Day of month — monthly+ only */}
                        {['Monthly','Quarterly','Half-yearly','Yearly'].includes(repeatFreq) && (
                          <div className="flex items-center gap-3 px-3.5 py-2.5">
                            <span className="text-xs font-semibold text-slate-500 w-24 flex-shrink-0">Day of month</span>
                            <input
                              type="number"
                              min={1}
                              max={28}
                              value={repeatOnDay}
                              onChange={(e) => setRepeatOnDay(e.target.value)}
                              placeholder="1–28"
                              className="w-20 text-[12.5px] text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-indigo-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Activity tabs ── */}
                {commTab === 'comments' && (
                  <div className="py-3 px-3 space-y-4">
                    {pendingComments.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
                        <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
                          <svg fill="none" viewBox="0 0 16 16" width="14" height="14" className="text-slate-400">
                            <path d="M13 2H3a1 1 0 00-1 1v7a1 1 0 001 1h1.5l2.5 2.5L9.5 11H13a1 1 0 001-1V3a1 1 0 00-1-1z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                          </svg>
                        </div>
                        <p className="text-[12px] text-slate-500 font-medium">No comments yet</p>
                        <p className="text-[11px] text-slate-400">Add one below before saving</p>
                      </div>
                    ) : (
                      pendingComments.map((c, i) => {
                        const displayName = c.fullName ?? c.user
                        return (
                          <div key={i} className="flex items-start gap-2.5">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0 ${avColor(displayName)}`}>
                              {initials(displayName)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span className="text-[11.5px] font-semibold text-slate-700 truncate">{displayName}</span>
                                <span className="text-[11px] text-slate-400 flex-shrink-0">just now</span>
                              </div>
                              <p className="text-[12.5px] text-slate-600 leading-relaxed whitespace-pre-wrap break-words">{renderMentionText(c.text)}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setPendingComments((prev) => prev.filter((_, j) => j !== i))}
                              className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-rose-100 text-slate-300 hover:text-rose-500 transition-colors"
                            >
                              <svg fill="none" viewBox="0 0 12 12" width="9" height="9">
                                <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                              </svg>
                            </button>
                          </div>
                        )
                      })
                    )}
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
                {commTab === 'links' && (
                  <div className="py-3 px-3">
                    {/* Header row */}
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Links</p>
                      <button
                        type="button"
                        onClick={() => { setShowAddLink((v) => !v); setLinkName(''); setLinkUrl('') }}
                        title={showAddLink ? 'Cancel' : 'Add link'}
                        className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                      >
                        {showAddLink ? (
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
                    {/* Add link form */}
                    {showAddLink && (
                      <div className="mb-4 p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                        <div>
                          <label className="block text-[10.5px] text-slate-400 mb-1 font-medium uppercase tracking-wide">Document name</label>
                          <input
                            type="text"
                            value={linkName}
                            onChange={(e) => setLinkName(e.target.value)}
                            placeholder="e.g. Design Spec"
                            className="w-full h-8 px-2.5 text-[12.5px] rounded-lg border border-slate-200 bg-white focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-100 placeholder:text-slate-300"
                          />
                        </div>
                        <div>
                          <label className="block text-[10.5px] text-slate-400 mb-1 font-medium uppercase tracking-wide">URL</label>
                          <input
                            type="url"
                            value={linkUrl}
                            onChange={(e) => setLinkUrl(e.target.value)}
                            placeholder="https://"
                            className="w-full h-8 px-2.5 text-[12.5px] rounded-lg border border-slate-200 bg-white focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-100 placeholder:text-slate-300"
                          />
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            disabled={!linkUrl.trim()}
                            onClick={() => {
                              const url = linkUrl.trim()
                              if (!url) return
                              setPendingLinks((prev) => [...prev, { label: linkName.trim() || url, url }])
                              setLinkName(''); setLinkUrl(''); setShowAddLink(false)
                            }}
                            className="h-7 px-3 text-[12px] font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            Add
                          </button>
                          <button
                            type="button"
                            onClick={() => { setShowAddLink(false); setLinkName(''); setLinkUrl('') }}
                            className="h-7 px-3 text-[12px] text-slate-500 hover:text-slate-700 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                    {/* Links list */}
                    {pendingLinks.length > 0 ? (
                      <div className="space-y-1">
                        {pendingLinks.map((lk, i) => (
                          <div key={i} className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-slate-50 transition-colors group">
                            <div className="w-6 h-6 rounded-md bg-sky-100 flex items-center justify-center flex-shrink-0">
                              <svg fill="none" viewBox="0 0 12 12" width="9" height="9" className="text-sky-500">
                                <path d="M5 7a3 3 0 0 0 4.24.01l1.42-1.41a3 3 0 0 0-4.24-4.24L5.35 2.4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.3"/>
                                <path d="M7 5a3 3 0 0 0-4.24-.01L1.34 6.4a3 3 0 0 0 4.24 4.24l1.05-1.05" stroke="currentColor" strokeLinecap="round" strokeWidth="1.3"/>
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[12.5px] font-medium text-slate-700 truncate">{lk.label}</p>
                              <p className="text-[11px] text-slate-400 truncate">{lk.url}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setPendingLinks((prev) => prev.filter((_, j) => j !== i))}
                              className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-rose-100 text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
                            >
                              <svg fill="none" viewBox="0 0 12 12" width="9" height="9">
                                <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : !showAddLink && (
                      <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
                        <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
                          <svg fill="none" viewBox="0 0 16 16" width="14" height="14" className="text-slate-400">
                            <path d="M7 9a4 4 0 0 0 5.66.01l1.9-1.88a4 4 0 0 0-5.66-5.66L7.8 3.58" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4"/>
                            <path d="M9 7a4 4 0 0 0-5.66-.01L1.44 8.87a4 4 0 0 0 5.66 5.66l1.1-1.1" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4"/>
                          </svg>
                        </div>
                        <p className="text-[12px] text-slate-500 font-medium">No links yet</p>
                        <p className="text-[11px] text-slate-400">Click + to add a link</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Composer — only for comments */}
              {commTab === 'comments' && (
                <div className="flex-shrink-0 border-t border-slate-100 p-3">
                  <div className="rounded-xl border border-slate-200 bg-white overflow-hidden focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
                    <textarea
                      ref={commentInputRef}
                      value={commentText}
                      onChange={handleCommentChange}
                      onKeyDown={handleCommentKeyDown}
                      className="w-full px-3 pt-2.5 pb-1 text-[12.5px] text-slate-700 placeholder:text-slate-400 bg-transparent outline-none resize-none scrollbar-none"
                      placeholder="Add a comment… (type @ to mention, Ctrl+Enter to send)"
                      rows={3}
                    />
                    <div className="flex items-center justify-end px-2 pb-2 pt-1 border-t border-slate-100">
                      <button
                        type="button"
                        disabled={!commentText.trim()}
                        onClick={() => {
                          const text = commentText.trim()
                          if (!text) return
                          setPendingComments((prev) => [...prev, {
                            user: currentUser?.username ?? 'Unknown',
                            fullName: currentUser?.fullName ?? currentUser?.username ?? 'Unknown',
                            text,
                            timestamp: new Date().toISOString(),
                          }])
                          setCommentText('')
                        }}
                        className="h-6 px-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[11.5px] font-medium rounded-lg transition-colors flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
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

        {/* @mention dropdown */}
        {mentionQuery !== null && (
          <div
            ref={mentionDropRef}
            style={{
              position: 'fixed',
              bottom: mentionDropPos.bottom,
              left: mentionDropPos.left,
              width: mentionDropPos.width,
              zIndex: 9999,
            }}
            className="bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden"
          >
            {mentionUsers.length === 0 ? (
              <p className="text-[12px] text-slate-400 text-center py-3 px-3">
                {mentionQuery === '' ? 'Type to search users…' : 'No users found'}
              </p>
            ) : (
              <div className="py-1 max-h-52 overflow-y-auto scrollbar-none">
                {mentionUsers.map((u, i) => (
                  <button
                    key={u.name}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); insertMention(u) }}
                    className={[
                      'w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors',
                      i === mentionIdx ? 'bg-indigo-50' : 'hover:bg-slate-50',
                    ].join(' ')}
                  >
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 ${avColor(u.fullName)}`}>
                      {initials(u.fullName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] font-medium text-slate-800 truncate">{u.fullName}</p>
                      <p className="text-[11px] text-slate-400 truncate">@{mentionSlug(u.name)}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

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
          isGroup,
          autoRepeat: null,
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
