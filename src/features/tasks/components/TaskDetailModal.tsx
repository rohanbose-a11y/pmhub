import React, { useEffect, useRef, useState } from 'react'
import DOMPurify from 'dompurify'

import type { Task, TaskComment, UpdateTaskInput } from '../types/task.types'
import { autoRepeatApi } from '../../../api/autoRepeatApi'
import type { AutoRepeat } from '../../../api/autoRepeatApi'
import { getUpcomingRepeatDates } from '../../../shared/lib/getUpcomingRepeatDates'
import { RepeatModal } from './RepeatModal'
import { PRIORITY_CONFIG } from '../config/priorityConfig'
import type { Project } from '../../projects/types/project.types'
import { taskApi, type TaskActivity } from '../../../api/taskApi'
import { httpClient } from '../../../api/httpClient'
import { userApi } from '../../../api/userApi'
import type { UserOption } from '../../../api/userApi'
import { useKraOptions } from '../../../hooks/useKraOptions'
import { useAuthStore } from '../../../store/authStore'
import { RichTextEditor } from '../../../shared/components/RichTextEditor'
import { UserAvatar } from '../../../shared/components/UserAvatar'
import { InlineDatePicker } from '../../../shared/components/Datepicker'
import { formatUserDisplay } from '../../../shared/lib/formatUserDisplay'
import { AddEventModal } from '../../calendar/components/AddEventModal'
import { getEventsByTask, type ErpEvent } from '../../../api/calendarApi'

// ─── Config ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG = [
  { key: 'Open',           dot: 'bg-slate-400',   pill: 'bg-slate-100 text-slate-600'      },
  { key: 'Working',        dot: 'bg-blue-500',    pill: 'bg-blue-50 text-blue-700'         },
  { key: 'Pending Review', dot: 'bg-amber-500',   pill: 'bg-amber-50 text-amber-700'       },
  { key: 'Overdue',        dot: 'bg-orange-500',  pill: 'bg-orange-50 text-orange-700'     },
  { key: 'Completed',      dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-700'   },
  { key: 'Cancelled',      dot: 'bg-rose-400',    pill: 'bg-rose-50 text-rose-600'         },
]


function fmtActivity(d: Date) {
  const diff = Date.now() - d.getTime()
  if (diff < 60_000)    return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return d.toLocaleDateString('en', { month: 'short', day: 'numeric' })
}

function stripHtml(html: string): string {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: [] }).trim()
}

function mapActivityEntry(e: TaskActivity): ActivityEntry {
  const text = stripHtml(e.content)
  const base = ((): Omit<ActivityEntry, 'name'> => {
    switch (e.commentType) {
      case 'Created':
        return { type: 'created', text: 'Task created', sub: e.commentBy || undefined, time: e.creation }
      case 'Assignment':
        return { type: 'user', text: e.commentBy ? `${e.commentBy} was assigned` : text || 'Assignment changed', time: e.creation }
      case 'Workflow':
        return { type: 'status', text: text || 'Status changed', time: e.creation }
      case 'Edit': {
        const by = e.commentBy || undefined
        const lower = text.toLowerCase()
        if (lower.includes('status'))   return { type: 'status',   text, sub: by, time: e.creation }
        if (lower.includes('priority')) return { type: 'priority', text, sub: by, time: e.creation }
        return { type: 'desc', text: text || 'Updated', sub: by, time: e.creation }
      }
      case 'Comment': {
        // PM Hub-tracked edits are stored as Comment type for cross-role visibility.
        // Infer icon from the start of the sentence; always show who made the change.
        const by = e.commentBy || undefined
        const lower = text.toLowerCase()
        if (lower.startsWith('status'))     return { type: 'status',   text, sub: by, time: e.creation }
        if (lower.startsWith('priority'))   return { type: 'priority', text, sub: by, time: e.creation }
        if (lower.startsWith('title'))      return { type: 'title',    text, sub: by, time: e.creation }
        if (lower.startsWith('link'))       return { type: 'link',     text, sub: by, time: e.creation }
        if (lower.includes('was assigned')) return { type: 'user',     text, sub: by, time: e.creation }
        return { type: 'desc', text: text || 'Updated', sub: by, time: e.creation }
      }
      default:
        return { type: 'desc', text: text || e.commentType, time: e.creation }
    }
  })()
  return { ...base, name: e.name }
}

function parseLinks(html: string): { label: string; url: string }[] {
  const re = /<a[^>]+href="([^"]*)"[^>]*>([^<]*)<\/a>/gi
  const out: { label: string; url: string }[] = []
  let m
  while ((m = re.exec(html)) !== null) {
    out.push({ url: m[1], label: m[2].trim() || m[1] })
  }
  return out
}

/** email → local-part slug used as the @mention token (e.g. "john.doe@co.com" → "john.doe") */
function mentionSlug(username: string) {
  return username.split('@')[0]
}

/** Split comment text on @token patterns and wrap mentions in a styled span */
function renderMentionText(text: string): React.ReactNode {
  const parts = text.split(/((?:^|\s)@[\w.-]+)/g)
  return parts.map((seg, i) => {
    const trimmed = seg.trimStart()
    if (trimmed.startsWith('@') && /^@[\w.-]+$/.test(trimmed)) {
      const leading = seg.length - trimmed.length  // preserve leading space
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

interface ActivityEntry {
  type: 'created' | 'status' | 'user' | 'link' | 'desc' | 'priority' | 'title'
  text: string
  sub?: string
  time: Date
  name?: string  // ERPNext Comment name — present when fetched/persisted
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface TaskDetailModalProps {
  task: Task          // store task — used as initial data and for ID lookup
  allTasks: Task[]
  projects?: Project[]  // user-assigned projects for project picker
  onClose: () => void
  onUpdate: (taskId: string, input: UpdateTaskInput) => Promise<boolean>
  onStatusChange: (task: Task) => void
  onAssign: (task: Task) => void
  onPrev?: () => void  // navigate to previous task in the list; undefined = disabled
  onNext?: () => void  // navigate to next task in the list; undefined = disabled
  drawer?: boolean    // render as right-side drawer instead of centred modal
}

// ─── Skeleton row ─────────────────────────────────────────────────────────────

function SkeletonRow({ w = 60 }: { w?: number }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2.5">
      <div className="w-28 h-3 bg-slate-100 rounded animate-pulse flex-shrink-0"/>
      <div className="h-3 bg-slate-100 rounded animate-pulse" style={{ width: `${w}%`, maxWidth: 120 }}/>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TaskDetailModal({
  task,
  allTasks,
  projects = [],
  onClose,
  onUpdate,
  onStatusChange,
  onAssign,
  onPrev,
  onNext,
  drawer = false,
}: TaskDetailModalProps) {
  // Full task fetched from API (includes custom_kra, all computed fields)
  const [fullTask, setFullTask] = useState<Task | null>(null)
  const [fetchError, setFetchError] = useState(false)

  // Communication panel
  const [commExpanded, setCommExpanded] = useState(true)
  const [commTab, setCommTab] = useState<'repeat' | 'comments' | 'activity' | 'attachments' | 'meet'>('activity')
  const [showAddEvent, setShowAddEvent] = useState(false)
  const [taskMeetings, setTaskMeetings] = useState<ErpEvent[]>([])
  const [meetingsLoading, setMeetingsLoading] = useState(false)

  // Editing state — initialised from store task, updated when fullTask arrives
  const [title, setTitle]                       = useState(task.subject)
  const [isEditingTitle, setIsEditingTitle]     = useState(false)
  const [description, setDescription]           = useState(task.description ?? '')
  const [isEditingDesc, setIsEditingDesc]       = useState(false)
  const [descEditKey, setDescEditKey]           = useState(0)
  const [engDays, setEngDays]                   = useState(String(task.engagementDays ?? ''))
  const [isEditingEngDays, setIsEditingEngDays] = useState(false)
  const [localStartDate, setLocalStartDate]     = useState(task.startDate ?? '')
  const [localDueDate,   setLocalDueDate]       = useState(task.dueDate ?? '')
  const [actType, setActType]                   = useState(task.activityType ?? '')
  const [showActTypeMenu, setShowActTypeMenu]   = useState(false)
  const [localProject,    setLocalProject]      = useState<string>(task.project ?? '')
  const [localParentTask, setLocalParentTask]   = useState<string | null>(task.parentTask ?? null)
  const [kraQuery, setKraQuery]                 = useState('')
  const [showPriorityMenu, setShowPriorityMenu] = useState(false)
  const [linkName, setLinkName]                 = useState('')
  const [linkUrl,  setLinkUrl]                  = useState('')
  const [showAddLink, setShowAddLink]           = useState(false)
  const [depTaskIds,    setDepTaskIds]          = useState<string[]>(() =>
    task.dependsOnTasks ? task.dependsOnTasks.split(',').map((s) => s.trim()).filter(Boolean) : []
  )
  const [depPickerValue,  setDepPickerValue]   = useState('')
  const [showDepPicker,   setShowDepPicker]    = useState(false)
  const [activityLog, setActivityLog]           = useState<ActivityEntry[]>([])

  const addActivity = (entry: Omit<ActivityEntry, 'time'>) => {
    const time = new Date()
    setActivityLog((prev) => [...prev, { ...entry, time }])
    taskApi.postActivityComment(task.id, entry.text)
      .then((name) => {
        setActivityLog((prev) =>
          prev.map((e) => e.time === time && e.text === entry.text ? { ...e, name } : e)
        )
      })
      .catch(() => {/* non-fatal */})
  }

  const deleteActivity = (entry: ActivityEntry) => {
    if (!entry.name) return
    setActivityLog((prev) => prev.filter((e) => e !== entry))
    taskApi.deleteActivityComment(entry.name).catch(() => {/* non-fatal */})
  }

  // Fixed-position dropdown anchoring (escape overflow:hidden on the modal)
  const [priorityDropPos,   setPriorityDropPos]   = useState({ top: 0, left: 0, width: 0 })
  const [actTypeDropPos,    setActTypeDropPos]    = useState({ top: 0, left: 0, width: 0 })
  const [parentTaskDropPos, setParentTaskDropPos] = useState({ top: 0, left: 0, width: 0 })
  const [projectDropPos,    setProjectDropPos]    = useState({ top: 0, left: 0, width: 0 })
  const [showParentTaskMenu, setShowParentTaskMenu] = useState(false)
  const [parentTaskQuery,   setParentTaskQuery]  = useState('')
  const [showProjectMenu,   setShowProjectMenu]  = useState(false)
  const [projectQuery,      setProjectQuery]     = useState('')

  const priorityTriggerRef   = useRef<HTMLDivElement>(null)
  const priorityDropRef      = useRef<HTMLDivElement>(null)
  const actTypeTriggerRef    = useRef<HTMLDivElement>(null)
  const actTypeDropRef       = useRef<HTMLDivElement>(null)
  const parentTaskTriggerRef = useRef<HTMLDivElement>(null)
  const parentTaskDropRef    = useRef<HTMLDivElement>(null)
  const projectTriggerRef    = useRef<HTMLDivElement>(null)
  const projectDropRef       = useRef<HTMLDivElement>(null)

  const { options: kraOptions } = useKraOptions()
  const { user: currentUser } = useAuthStore()

  // Comments
  const [comments, setComments]                 = useState<TaskComment[]>([])
  const [commentText, setCommentText]           = useState('')
  const [isSendingComment, setIsSendingComment] = useState(false)
  const commentsEndRef   = useRef<HTMLDivElement>(null)
  const commentInputRef  = useRef<HTMLTextAreaElement>(null)

  // @mention
  const [mentionQuery,    setMentionQuery]   = useState<string | null>(null)
  const [mentionUsers,    setMentionUsers]   = useState<UserOption[]>([])
  const [mentionIdx,      setMentionIdx]     = useState(0)
  const [mentionDropPos,  setMentionDropPos] = useState({ bottom: 0, left: 0, width: 0 })
  const mentionDropRef = useRef<HTMLDivElement>(null)

  // ── Repeat ────────────────────────────────────────────────────────────────
  const [savedRepeat,     setSavedRepeat]     = useState<AutoRepeat | null>(null)
  const [showRepeatModal, setShowRepeatModal] = useState(false)
  const [holidayDates,    setHolidayDates]    = useState<Set<string>>(new Set())

  // ── Fetch full task detail on open ─────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    setFullTask(null)
    setFetchError(false)
    setSavedRepeat(null)

    taskApi.getTaskWithActivity(task.id)
      .then(({ task: t, activity }) => {
        if (!cancelled) {
          setFullTask(t)
          setTitle(t.subject)
          setDescription(t.description ?? '')
          setEngDays(String(t.engagementDays ?? ''))
          setLocalStartDate(t.startDate ?? '')
          setLocalDueDate(t.dueDate ?? '')
          setActType(t.activityType ?? '')
          setLocalProject(t.project ?? '')
          setLocalParentTask(t.parentTask ?? null)
          setDepTaskIds(t.dependsOnTasks ? t.dependsOnTasks.split(',').map((s) => s.trim()).filter(Boolean) : [])
          setComments(t.comments ?? [])

          const mapped = activity.map(mapActivityEntry)
          // Ensure a "created" entry always shows the task owner.
          const createdIdx = mapped.findIndex((e) => e.type === 'created')
          if (createdIdx >= 0) {
            if (!mapped[createdIdx].sub && t.owner) {
              mapped[createdIdx] = { ...mapped[createdIdx], sub: t.owner }
            }
          } else if (t.owner) {
            const time = mapped[0]?.time ?? new Date()
            mapped.unshift({ type: 'created', text: 'Task created', sub: t.owner, time })
          }
          // Ensure a completion entry shows who completed it.
          if (t.status === 'Completed' && t.completedBy) {
            const idx = mapped.findIndex(
              (e) => e.type === 'status' && e.text.toLowerCase().includes('completed')
            )
            if (idx >= 0) {
              if (!mapped[idx].sub) mapped[idx] = { ...mapped[idx], sub: `Completed by ${t.completedBy}` }
            } else {
              const time = t.completedOn ? new Date(t.completedOn) : new Date()
              mapped.push({ type: 'status', text: 'Status set to Completed', sub: `Completed by ${t.completedBy!}`, time })
            }
          }
          if (mapped.length > 0) setActivityLog(mapped)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFullTask(task)   // fall back to store task
          setFetchError(true)
        }
      })

    // Repeat is loaded after fullTask resolves (see useEffect below)

    return () => { cancelled = true }
  }, [task.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Keep editing states in sync when store task prop updates ──────────────
  useEffect(() => { if (!fullTask) setTitle(task.subject) }, [task.subject, fullTask])
  useEffect(() => { if (!fullTask) setDescription(task.description ?? '') }, [task.description, fullTask])

  // ── Load Auto Repeat once fullTask resolves — use task.auto_repeat field ──
  // Frappe writes the Auto Repeat document name onto the Task itself, so we
  // fetch by name directly and avoid the blocked list-API filter.
  useEffect(() => {
    if (!fullTask) return
    const repeatName = fullTask.autoRepeat
    if (!repeatName) return
    autoRepeatApi.getById(repeatName)
      .then(setSavedRepeat)
      .catch(() => {/* non-blocking */})
  }, [fullTask?.autoRepeat]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch holidays for upcoming-dates skip logic (monthly+ only) ──────────
  useEffect(() => {
    const MONTHLY_FREQS = ['Monthly', 'Quarterly', 'Half-yearly', 'Yearly']
    if (!savedRepeat || !MONTHLY_FREQS.includes(savedRepeat.frequency)) {
      setHolidayDates(new Set())
      return
    }
    httpClient
      .get<{ data: { holiday_list?: string | null } }>('/api/resource/HR Settings')
      .then(({ data }) => {
        const listName = data.data.holiday_list
        if (!listName) return
        return httpClient.get<{ data: { holidays?: { holiday_date: string }[] } }>(
          `/api/resource/Holiday List/${encodeURIComponent(listName)}`,
        )
      })
      .then((res) => {
        if (!res) return
        const dates = new Set((res.data.data.holidays ?? []).map((h) => h.holiday_date.slice(0, 10)))
        setHolidayDates(dates)
      })
      .catch(() => setHolidayDates(new Set()))
  }, [savedRepeat?.id, savedRepeat?.frequency]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load meetings linked to this task when Meet tab is opened ────────────
  useEffect(() => {
    if (commTab !== 'meet') return
    setMeetingsLoading(true)
    getEventsByTask(task.id, task.subject)
      .then(setTaskMeetings)
      .catch(() => setTaskMeetings([]))
      .finally(() => setMeetingsLoading(false))
  }, [commTab, task.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Track status changes from outside (status modal) ──────────────────────
  const prevStatusRef = useRef(task.status)
  useEffect(() => {
    if (task.status !== prevStatusRef.current) {
      addActivity({
        type: 'status',
        text: `Status changed to ${task.status}`,
        sub: task.status === 'Completed' && task.completedBy ? `Completed by ${task.completedBy}` : undefined,
      })
      prevStatusRef.current = task.status
    }
  }, [task.status]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Keyboard navigation: ArrowLeft / ArrowRight to move between tasks ────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      // Don't fire while the user is typing in any input/textarea
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return
      if (e.key === 'ArrowLeft')  { e.preventDefault(); onPrev?.() }
      if (e.key === 'ArrowRight') { e.preventDefault(); onNext?.() }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onPrev, onNext])

  // ── @mention user search ───────────────────────────────────────────────────
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

  // ── Dropdown open helpers (calculate fixed position from trigger element) ──
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

  const openParentTaskMenu = () => {
    const r = parentTaskTriggerRef.current?.getBoundingClientRect()
    if (r) setParentTaskDropPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 240) })
    setShowParentTaskMenu((v) => !v)
    setParentTaskQuery('')
  }

  const openProjectMenu = () => {
    const r = projectTriggerRef.current?.getBoundingClientRect()
    if (r) setProjectDropPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 220) })
    setShowProjectMenu((v) => !v)
    setProjectQuery('')
  }

  const handleProjectChange = async (projectName: string) => {
    setShowProjectMenu(false)
    setProjectQuery('')
    if (projectName === localProject) return
    setLocalProject(projectName)
    const ok = await onUpdate(task.id, { subject: task.subject, status: task.status, priority: task.priority, project: projectName || undefined })
    if (ok) addActivity({ type: 'desc', text: `Project changed to ${projectName || 'none'}` })
  }

  // ── Dropdowns + keyboard ───────────────────────────────────────────────────
  useEffect(() => {
    const h = (e: MouseEvent) => {
      const t = e.target as Node
      if (
        showPriorityMenu &&
        priorityTriggerRef.current && !priorityTriggerRef.current.contains(t) &&
        priorityDropRef.current   && !priorityDropRef.current.contains(t)
      ) setShowPriorityMenu(false)

      if (
        showActTypeMenu &&
        actTypeTriggerRef.current && !actTypeTriggerRef.current.contains(t) &&
        actTypeDropRef.current    && !actTypeDropRef.current.contains(t)
      ) { setShowActTypeMenu(false); setKraQuery('') }

      if (
        showParentTaskMenu &&
        parentTaskTriggerRef.current && !parentTaskTriggerRef.current.contains(t) &&
        parentTaskDropRef.current    && !parentTaskDropRef.current.contains(t)
      ) { setShowParentTaskMenu(false); setParentTaskQuery('') }

      if (
        showProjectMenu &&
        projectTriggerRef.current && !projectTriggerRef.current.contains(t) &&
        projectDropRef.current    && !projectDropRef.current.contains(t)
      ) { setShowProjectMenu(false); setProjectQuery('') }
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [showPriorityMenu, showActTypeMenu, showParentTaskMenu, showProjectMenu])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showPriorityMenu)   { setShowPriorityMenu(false); return }
        if (showActTypeMenu)    { setShowActTypeMenu(false); setKraQuery(''); return }
        if (showParentTaskMenu) { setShowParentTaskMenu(false); setParentTaskQuery(''); return }
        if (showProjectMenu)    { setShowProjectMenu(false); setProjectQuery(''); return }
        onClose()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose, showPriorityMenu, showActTypeMenu, showParentTaskMenu, showProjectMenu])

  // Display task:
  //   • Live fields (status, priority, isMilestone, assignees) → always from store `task` prop
  //     so they stay fresh after status-change / assign operations without re-fetching.
  //   • Rich fields only available on full doc (activityType, description, dates, engDays) → fullTask
  const dt        = fullTask ?? task
  const isLoading = !fullTask

  // Status and priority always from store (updated by store after mutations)
  const sg       = STATUS_CONFIG.find((s) => s.key === task.status) ?? STATUS_CONFIG[0]
  const pg       = PRIORITY_CONFIG.find((p) => p.key === task.priority)
  const shortId  = task.id
  const duePast  = localDueDate && new Date(localDueDate) < new Date()
  const updLabel = task.updatedAt
    ? `Updated ${new Date(task.updatedAt).toLocaleDateString('en', { month: 'short', day: 'numeric' })}`
    : 'Created recently'

  // ── Save helpers ──────────────────────────────────────────────────────────

  // Always use live task (store) for status/priority in payloads — never stale fullTask values
  const liveStatus   = task.status
  const livePriority = task.priority

  const saveTitle = async () => {
    setIsEditingTitle(false)
    const v = title.trim()
    if (v && v !== task.subject) {
      const ok = await onUpdate(task.id, { subject: v, status: liveStatus, priority: livePriority })
      if (!ok) setTitle(task.subject)
      else addActivity({ type: 'title', text: 'Title renamed' })
    } else {
      setTitle(task.subject)
    }
  }

  const saveDesc = async () => {
    setIsEditingDesc(false)
    if (description !== (dt.description ?? '')) {
      const ok = await onUpdate(task.id, { subject: task.subject, status: liveStatus, priority: livePriority, description })
      if (ok) {
        setFullTask((prev) => prev ? { ...prev, description } : null)
        addActivity({ type: 'desc', text: 'Description updated' })
      }
    }
  }

  const cancelDesc = () => {
    setDescription(dt.description ?? '')
    setDescEditKey((k) => k + 1)
    setIsEditingDesc(false)
  }

  const saveLink = async () => {
    const name = linkName.trim()
    const url  = linkUrl.trim()
    if (!url) return
    const label    = name || url
    const linkHtml = `<p><a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a></p>`
    const newDesc  = (description ? description + linkHtml : linkHtml)
    setDescription(newDesc)
    const ok = await onUpdate(task.id, { subject: task.subject, status: liveStatus, priority: livePriority, description: newDesc })
    if (ok) setFullTask((prev) => prev ? { ...prev, description: newDesc } : null)
    addActivity({ type: 'link', text: `Link added: ${label}` })
    setLinkName('')
    setLinkUrl('')
    setShowAddLink(false)
  }

  const saveEngDays = async () => {
    setIsEditingEngDays(false)
    const n = parseFloat(engDays)
    if (!isNaN(n) && n !== (dt.engagementDays ?? null)) {
      const ok = await onUpdate(task.id, { subject: task.subject, status: liveStatus, priority: livePriority, engagementDays: n })
      if (ok) {
        setFullTask((prev) => prev ? { ...prev, engagementDays: n } : null)
        addActivity({ type: 'desc', text: `Engagement days set to ${n}` })
      }
    } else if (isNaN(n)) {
      setEngDays(String(dt.engagementDays ?? ''))
    }
  }

  const saveStartDate = async (v: string) => {
    setLocalStartDate(v)
    if (v !== (dt.startDate ?? '')) {
      const ok = await onUpdate(task.id, { subject: task.subject, status: liveStatus, priority: livePriority, startDate: v || undefined })
      if (ok) {
        setFullTask((prev) => prev ? { ...prev, startDate: v || null } : null)
        addActivity({ type: 'desc', text: v ? `Start date set to ${v}` : 'Start date cleared' })
      }
    }
  }

  const saveDueDate = async (v: string) => {
    setLocalDueDate(v)
    if (v !== (dt.dueDate ?? '')) {
      const ok = await onUpdate(task.id, { subject: task.subject, status: liveStatus, priority: livePriority, dueDate: v || undefined })
      if (ok) {
        setFullTask((prev) => prev ? { ...prev, dueDate: v || null } : null)
        addActivity({ type: 'desc', text: v ? `Due date set to ${v}` : 'Due date cleared' })
      }
    }
  }

  const selectActType = async (val: string) => {
    setShowActTypeMenu(false)
    setKraQuery('')
    setActType(val)
    if (val !== (dt.activityType ?? '')) {
      const ok = await onUpdate(task.id, { subject: task.subject, status: liveStatus, priority: livePriority, activityType: val || undefined })
      if (ok) {
        setFullTask((prev) => prev ? { ...prev, activityType: val || null } : null)
        addActivity({ type: 'desc', text: val ? `Activity type set to ${val}` : 'Activity type cleared' })
      }
    }
  }

  const selectParentTask = async (parentId: string | null) => {
    setShowParentTaskMenu(false)
    setParentTaskQuery('')
    setLocalParentTask(parentId)
    const ok = await onUpdate(task.id, { subject: task.subject, status: liveStatus, priority: livePriority, parentTask: parentId || undefined })
    if (ok) addActivity({ type: 'desc', text: parentId ? `Parent task set to ${parentId}` : 'Parent task removed' })
  }

  const addDep = async (depId: string) => {
    if (!depId || depTaskIds.includes(depId)) return
    const newIds = [...depTaskIds, depId]
    setDepTaskIds(newIds)
    setDepPickerValue('')
    const ok = await onUpdate(task.id, { subject: task.subject, status: liveStatus, priority: livePriority, dependsOnTasks: newIds.join(',') })
    if (ok) addActivity({ type: 'desc', text: `Dependency added: ${depId}` })
  }

  const removeDep = async (depId: string) => {
    const newIds = depTaskIds.filter((id) => id !== depId)
    setDepTaskIds(newIds)
    const ok = await onUpdate(task.id, { subject: task.subject, status: liveStatus, priority: livePriority, dependsOnTasks: newIds.join(',') || undefined })
    if (ok) addActivity({ type: 'desc', text: `Dependency removed: ${depId}` })
  }

  const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCommentText(e.target.value)
    const pos = e.target.selectionStart ?? e.target.value.length
    const textToCursor = e.target.value.slice(0, pos)
    const match = textToCursor.match(/@([^\s@]*)$/)
    if (match) {
      // Calculate fixed position (dropdown floats above the textarea)
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
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void addComment()
  }

  const addComment = async () => {
    const text = commentText.trim()
    if (!text || isSendingComment) return
    setIsSendingComment(true)
    const newComment: TaskComment = {
      user: currentUser?.username ?? 'Unknown',
      fullName: currentUser?.fullName ?? currentUser?.username ?? 'Unknown',
      text,
      timestamp: new Date().toISOString(),
    }
    const updated = [...comments, newComment]
    setComments(updated)
    setCommentText('')
    setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    await onUpdate(task.id, { subject: task.subject, status: liveStatus, priority: livePriority, comments: updated })
    setIsSendingComment(false)
  }

  const handlePriorityChange = async (key: string) => {
    setShowPriorityMenu(false)
    if (key !== livePriority) {
      await onUpdate(task.id, { subject: task.subject, status: liveStatus, priority: key })
      addActivity({ type: 'priority', text: `Priority changed to ${key}` })
    }
  }

// ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className={`fixed inset-0 z-50 animate-fade-in ${
        drawer
          ? 'flex items-stretch justify-end'
          : 'bg-black/40 flex items-center justify-center p-3'
      }`}
      onClick={onClose}
    >
      <div
        className={[
          'relative flex bg-white overflow-hidden shadow-2xl',
          drawer
            ? 'h-full w-full max-w-[580px]'
            : 'w-full h-full rounded-xl',
        ].join(' ')}
        style={drawer ? { borderLeft: '1px solid #E5E7EB' } : undefined}
        onClick={(e) => e.stopPropagation()}
      >

        {/* ══ Main content ══ */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* ── Top bar ── */}
          <div className="flex-shrink-0 flex items-center gap-1 px-3 h-11 border-b border-slate-100 bg-white">

            <div className="flex items-center gap-0">
              <button className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 transition-colors" title="Toggle sidebar">
                <svg fill="none" viewBox="0 0 16 16" width="14" height="14">
                  <rect x="2" y="2" width="4" height="12" rx="1" stroke="currentColor" strokeWidth="1.3"/>
                  <path d="M8 5h6M8 8h6M8 11h6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.3"/>
                </svg>
              </button>
              <button
                type="button"
                onClick={onPrev}
                disabled={!onPrev}
                title="Previous task (←)"
                className="w-7 h-7 flex items-center justify-center rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <svg fill="none" viewBox="0 0 14 14" width="12" height="12">
                  <path d="M9 3.5L5 7l4 3.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4"/>
                </svg>
              </button>
              <button
                type="button"
                onClick={onNext}
                disabled={!onNext}
                title="Next task (→)"
                className="w-7 h-7 flex items-center justify-center rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <svg fill="none" viewBox="0 0 14 14" width="12" height="12">
                  <path d="M5 3.5L9 7l-4 3.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4"/>
                </svg>
              </button>
            </div>

            <div className="flex items-center gap-1 text-[12px] text-slate-400 mx-1.5 min-w-0">
              <span className="hidden sm:inline shrink-0">Team Space</span>
              <span className="hidden sm:inline text-slate-200">/</span>
              <span className="truncate text-slate-600 font-medium">{dt.project ?? 'No Project'}</span>
            </div>

            <button className="w-5 h-5 flex items-center justify-center rounded text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-colors">
              <svg fill="none" viewBox="0 0 12 12" width="10" height="10"><path d="M6 1v10M1 6h10" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5"/></svg>
            </button>
            <button className="w-5 h-5 flex items-center justify-center rounded text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-colors" title="Open in full page">
              <svg fill="none" viewBox="0 0 12 12" width="10" height="10">
                <path d="M5 2H2a1 1 0 00-1 1v7a1 1 0 001 1h7a1 1 0 001-1V8M7 1h4v4M11 1L5.5 6.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.3"/>
              </svg>
            </button>

            <div className="ml-auto flex items-center gap-1 flex-shrink-0">
              <span className="hidden lg:block text-[11px] text-slate-400 mr-0.5 select-none">{updLabel}</span>

              <button className="hidden sm:flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[12px] font-medium text-slate-500 border border-slate-200 bg-white hover:bg-slate-50 transition-colors">
                <svg fill="none" viewBox="0 0 16 16" width="12" height="12">
                  <circle cx="10" cy="5" r="2" stroke="currentColor" strokeWidth="1.3"/>
                  <circle cx="10" cy="11" r="2" stroke="currentColor" strokeWidth="1.3"/>
                  <circle cx="4"  cy="8"  r="2" stroke="currentColor" strokeWidth="1.3"/>
                  <path d="M5.7 8.8l2.7 1.3M8.4 5.9L5.7 7.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
                Share
              </button>

              <button className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-amber-400 hover:bg-slate-100 transition-colors">
                <svg fill="none" viewBox="0 0 14 14" width="13" height="13">
                  <path d="M7 1.5l1.6 3.2 3.5.5-2.5 2.45.6 3.5L7 9.4l-3.2 1.75.6-3.5L1.9 5.2l3.5-.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                </svg>
              </button>

              <button className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 transition-colors">
                <svg fill="none" viewBox="0 0 16 16" width="14" height="14">
                  <rect x="2" y="2" width="5" height="12" rx="1" stroke="currentColor" strokeWidth="1.3"/>
                  <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
                  <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
                </svg>
              </button>

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
            <div className="px-7 pt-5 pb-16">

              {/* Task-type chip + short ID */}
              <div className="flex items-center gap-2 mb-4">
                <button className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-100 text-slate-500 text-[11.5px] font-medium hover:bg-slate-200 transition-colors">
                  Task
                  <svg fill="none" viewBox="0 0 10 10" width="8" height="8">
                    <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.3"/>
                  </svg>
                </button>
                <span className="font-mono text-[11px] text-slate-400 select-all bg-slate-50 px-1.5 py-0.5 rounded">{shortId}</span>
                {task.isMilestone ? (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Milestone</span>
                ) : task.isGroup ? (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">Activity</span>
                ) : (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Task</span>
                )}
                {fetchError && (
                  <span className="text-[11px] text-amber-500 bg-amber-50 px-2 py-0.5 rounded">Some fields may be incomplete</span>
                )}
              </div>

              {/* Title */}
              {isEditingTitle ? (
                <input
                  autoFocus
                  className="w-full text-[24px] font-bold text-slate-900 bg-transparent outline-none leading-snug mb-5 px-1 -mx-1"
                  onBlur={saveTitle}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur()
                    if (e.key === 'Escape') { setTitle(dt.subject); setIsEditingTitle(false) }
                  }}
                  value={title}
                />
              ) : (
                <h1
                  className="text-[24px] font-bold text-slate-900 mb-5 leading-snug cursor-text px-1 -mx-1 rounded-lg hover:bg-slate-50 transition-colors"
                  onClick={() => setIsEditingTitle(true)}
                >
                  {title || <span className="text-slate-300 font-normal">Untitled task</span>}
                </h1>
              )}

              {/* ── Fields 2-column grid ── */}
              {isLoading ? (
                <div className="rounded-xl border border-slate-100 overflow-hidden divide-x divide-slate-100 grid grid-cols-2 mb-5">
                  <div className="divide-y divide-slate-50">
                    {[60, 70, 45, 55, 50].map((w, i) => <SkeletonRow key={i} w={w}/>)}
                  </div>
                  <div className="divide-y divide-slate-50">
                    {[40, 55, 65, 45, 45].map((w, i) => <SkeletonRow key={i} w={w}/>)}
                  </div>
                </div>
              ) : (
                <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 mb-5 rounded-xl border border-slate-100 overflow-hidden sm:divide-x divide-y sm:divide-y-0 divide-slate-100">

                  {/* ── Left column ── */}
                  <div className="divide-y divide-slate-50">

                    {/* Status */}
                    <div
                      className="flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 transition-colors cursor-pointer group"
                      onClick={() => onStatusChange(task)}
                    >
                      <span className="text-[11.5px] text-slate-400 w-28 flex-shrink-0">Status</span>
                      <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] font-medium ${sg.pill}`}>
                        <span className={`w-[5px] h-[5px] rounded-full flex-shrink-0 ${sg.dot}`}/>
                        {task.status}
                        <svg fill="none" viewBox="0 0 10 10" width="8" height="8" className="opacity-50 ml-0.5">
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
                        <InlineDatePicker
                          value={localStartDate}
                          onChange={(v) => void saveStartDate(v)}
                          placeholder="+ Start"
                        />
                        <svg fill="none" viewBox="0 0 14 6" width="12" height="6" className="text-slate-300 flex-shrink-0">
                          <path d="M0 3h12M9 1l3 2-3 2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.2"/>
                        </svg>
                        <InlineDatePicker
                          value={localDueDate}
                          onChange={(v) => void saveDueDate(v)}
                          placeholder="+ Due"
                          overdue={!!duePast}
                        />
                      </div>
                    </div>

                    {/* Engagement Days */}
                    <div
                      className="flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 transition-colors group cursor-pointer"
                      onClick={() => !isEditingEngDays && setIsEditingEngDays(true)}
                    >
                      <span className="text-[11.5px] text-slate-400 w-28 flex-shrink-0">Engagement Days</span>
                      {isEditingEngDays ? (
                        <input
                          autoFocus
                          className="w-20 text-[12.5px] text-slate-700 bg-white border border-slate-300 rounded px-2 py-0.5 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 transition-all"
                          onBlur={saveEngDays}
                          onChange={(e) => setEngDays(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur()
                            if (e.key === 'Escape') { setEngDays(String(dt.engagementDays ?? '')); setIsEditingEngDays(false) }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          placeholder="0"
                          type="number"
                          min="0"
                          step="any"
                          value={engDays}
                        />
                      ) : dt.engagementDays != null ? (
                        <span className="text-[12.5px] text-slate-700">{dt.engagementDays} {dt.engagementDays === 1 ? 'day' : 'days'}</span>
                      ) : (
                        <span className="text-[12.5px] text-slate-300 group-hover:text-slate-400 transition-colors">Empty</span>
                      )}
                    </div>

                    {/* Repeat */}
                    <div
                      className="flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 transition-colors group cursor-pointer"
                      onClick={() => setShowRepeatModal(true)}
                    >
                      <span className="text-[11.5px] text-slate-400 w-28 flex-shrink-0">Repeat</span>
                      <div className="flex items-center gap-1.5">
                        {savedRepeat ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 text-[11px] font-semibold border border-indigo-100">
                            {savedRepeat.frequency}
                          </span>
                        ) : (
                          <span className="text-[12.5px] text-slate-300 group-hover:text-slate-400 transition-colors">None</span>
                        )}
                      </div>
                    </div>

                    {/* Parent Task */}
                    <div
                      ref={parentTaskTriggerRef}
                      className="flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 transition-colors cursor-pointer group"
                      onClick={openParentTaskMenu}
                    >
                      <span className="text-[11.5px] text-slate-400 w-28 flex-shrink-0">Parent Task</span>
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        {localParentTask ? (
                          <span className="text-[12.5px] text-slate-700 truncate">
                            {allTasks.find((t) => t.id === localParentTask)?.subject ?? localParentTask}
                          </span>
                        ) : (
                          <span className="text-[12.5px] text-slate-300 group-hover:text-slate-400 transition-colors">None</span>
                        )}
                        <svg fill="none" viewBox="0 0 10 10" width="8" height="8" className="text-slate-300 ml-auto flex-shrink-0">
                          <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.3"/>
                        </svg>
                      </div>
                    </div>

                  </div>

                  {/* ── Right column ── */}
                  <div className="divide-y divide-slate-50">

                    {/* Assignees — always read from store task (list fetch reliably populates _assign) */}
                    <div
                      className="flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 transition-colors group cursor-pointer"
                      onClick={() => onAssign(task)}
                    >
                      <span className="text-[11.5px] text-slate-400 w-28 flex-shrink-0">Assignees</span>
                      <div className="flex items-center gap-1.5">
                        {task.assignedTo.length > 0 ? (
                          <div className="flex items-center -space-x-1.5">
                            {task.assignedTo.slice(0, 5).map((u) => (
                              <UserAvatar key={u} name={u} size="xs" className="ring-2 ring-white" />
                            ))}
                            {task.assignedTo.length > 5 && (
                              <div className="w-[22px] h-[22px] rounded-full bg-slate-100 text-slate-500 text-[9px] font-bold ring-2 ring-white flex items-center justify-center">
                                +{task.assignedTo.length - 5}
                              </div>
                            )}
                          </div>
                        ) : null}
                        {/* + add button — always visible, becomes primary CTA when no assignees */}
                        <div
                          className={[
                            'flex items-center justify-center rounded-full transition-colors flex-shrink-0',
                            task.assignedTo.length === 0
                              ? 'w-[22px] h-[22px] border-[1.5px] border-dashed border-slate-300 text-slate-400 hover:border-indigo-400 hover:text-indigo-500 hover:bg-indigo-50'
                              : 'w-[22px] h-[22px] border-[1.5px] border-dashed border-slate-200 text-slate-300 hover:border-slate-400 hover:text-slate-500 ring-2 ring-white',
                          ].join(' ')}
                        >
                          <svg fill="none" viewBox="0 0 10 10" width="9" height="9">
                            <path d="M5 2v6M2 5h6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5"/>
                          </svg>
                        </div>
                      </div>
                    </div>

                    {/* Project */}
                    <div
                      ref={projectTriggerRef}
                      className="flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 transition-colors group cursor-pointer"
                      onClick={openProjectMenu}
                    >
                      <span className="text-[11.5px] text-slate-400 w-28 flex-shrink-0">Project</span>
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        {localProject ? (
                          <span className="text-[12.5px] text-slate-700 truncate">
                            {projects.find((p) => p.name === localProject)?.displayName ?? localProject}
                          </span>
                        ) : (
                          <span className="text-[12.5px] text-slate-300 group-hover:text-slate-400 transition-colors">None</span>
                        )}
                        <svg fill="none" viewBox="0 0 10 10" width="8" height="8" className="text-slate-300 ml-auto flex-shrink-0">
                          <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.3"/>
                        </svg>
                      </div>
                    </div>

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
                          <span className="text-[12.5px] text-slate-300 group-hover:text-slate-400 transition-colors">Empty</span>
                        )}
                        <svg fill="none" viewBox="0 0 10 10" width="8" height="8" className="text-slate-300 ml-auto">
                          <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.3"/>
                        </svg>
                      </div>
                    </div>

                    {/* Activity Type / KRA — dropdown from useKraOptions */}
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

                  </div>
                </div>

</>
              )}

              {/* ── Description ── */}
              <div className="h-px bg-slate-100 mb-3"/>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Description</p>
              {isEditingDesc ? (
                <div className="mb-4">
                  <RichTextEditor
                    key={descEditKey}
                    defaultValue={description}
                    onChange={(html) => setDescription(html)}
                    placeholder="Add a description…"
                  />
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => void saveDesc()}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[12px] font-medium rounded-lg transition-colors"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={cancelDesc}
                      className="px-3 py-1.5 text-[12px] text-slate-500 hover:text-slate-700 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : description ? (
                <div
                  className="text-[13.5px] text-slate-700 leading-relaxed cursor-text rounded-lg px-2 py-1.5 -mx-2 hover:bg-slate-50 transition-colors mb-4 rich-text-display"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(description) }}
                  onClick={() => setIsEditingDesc(true)}
                />
              ) : (
                <div
                  className="flex items-center gap-2 cursor-text text-slate-400 hover:text-slate-500 transition-colors mb-4"
                  onClick={() => setIsEditingDesc(true)}
                >
                  <svg fill="none" viewBox="0 0 14 14" width="13" height="13" className="flex-shrink-0">
                    <path d="M2 4h10M2 7h7M2 10h5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.3"/>
                  </svg>
                  <span className="text-[13px]">Add description</span>
                </div>
              )}

              {/* ── Subtasks (dependency tasks) ── */}
              <div className="h-px bg-slate-100 mb-4"/>
              <div className="mb-5">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Subtasks {depTaskIds.length > 0 && <span className="ml-1 font-normal text-slate-300 normal-case tracking-normal">({depTaskIds.length})</span>}
                </p>

                {/* Linked dep tasks */}
                {depTaskIds.length > 0 && (
                  <div className="mb-2.5 rounded-lg border border-slate-100 divide-y divide-slate-50 overflow-hidden">
                    {depTaskIds.map((depId) => {
                      const depTask = allTasks.find((t) => t.id === depId)
                      return (
                        <div key={depId} className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 transition-colors">
                          <div className="w-1.5 h-1.5 rounded-full bg-slate-400 flex-shrink-0"/>
                          <span className="flex-1 text-[12.5px] text-slate-700 truncate">{depTask?.subject ?? depId}</span>
                          <button
                            type="button"
                            aria-label="Remove"
                            onClick={() => void removeDep(depId)}
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

                {/* Picker — shown after clicking Add Task */}
                {showDepPicker && (
                  <div className="flex gap-2 mb-2">
                    <div className="relative flex-1 min-w-0">
                      <select
                        className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 appearance-none pr-9 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all"
                        onChange={(e) => setDepPickerValue(e.target.value)}
                        value={depPickerValue}
                      >
                        <option value="">Select a task…</option>
                        {allTasks
                          .filter((t) => t.id !== task.id && !depTaskIds.includes(t.id) && (!localProject || t.project === localProject))
                          .map((t) => (
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
                      onClick={() => { void addDep(depPickerValue); setShowDepPicker(false) }}
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
                  <svg fill="none" viewBox="0 0 12 12" width="11" height="11"><path d="M6 1v10M1 6h10" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5"/></svg>
                  Add Task
                </button>
              </div>

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

          {/* ── Collapsed icon strip ── */}
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
                  tab: 'repeat' as const,
                  label: 'Repeat',
                  badge: !!savedRepeat ? <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-indigo-500"/> : null,
                  icon: <svg fill="none" viewBox="0 0 14 14" width="15" height="15"><path d="M2 7a5 5 0 0 1 9-3M12 7a5 5 0 0 1-9 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M11 4l1-1.5 1.5 1.5M3 10l-1 1.5-1.5-1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>,
                },
                {
                  tab: 'comments' as const,
                  label: 'Comments',
                  badge: comments.length > 0
                    ? <span className="absolute top-0.5 right-0.5 min-w-[14px] h-3.5 px-0.5 rounded-full bg-indigo-500 text-white text-[8px] font-bold flex items-center justify-center">{comments.length}</span>
                    : null,
                  icon: <svg fill="none" viewBox="0 0 14 14" width="15" height="15"><path d="M11 2H3a1 1 0 00-1 1v6a1 1 0 001 1h1l2 2 2-2h3a1 1 0 001-1V3a1 1 0 00-1-1z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>,
                },
                {
                  tab: 'attachments' as const,
                  label: 'Links',
                  badge: null,
                  icon: <svg fill="none" viewBox="0 0 14 14" width="15" height="15"><path d="M6 8a3 3 0 0 0 4.24.01l1.42-1.41a3 3 0 0 0-4.24-4.24L6.35 3.4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.3"/><path d="M8 6a3 3 0 0 0-4.24-.01L2.34 7.4a3 3 0 0 0 4.24 4.24l1.05-1.05" stroke="currentColor" strokeLinecap="round" strokeWidth="1.3"/></svg>,
                },
                {
                  tab: 'activity' as const,
                  label: 'Activity',
                  badge: null,
                  icon: <svg fill="none" viewBox="0 0 14 14" width="15" height="15"><circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.3"/><path d="M7 4.5v3l2 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
                },
                {
                  tab: 'meet' as const,
                  label: 'Meet',
                  badge: taskMeetings.length > 0
                    ? <span className="absolute top-0.5 right-0.5 min-w-[14px] h-3.5 px-0.5 rounded-full bg-indigo-500 text-white text-[8px] font-bold flex items-center justify-center">{taskMeetings.length}</span>
                    : null,
                  icon: <svg fill="none" viewBox="0 0 14 14" width="15" height="15"><rect x="1" y="3.5" width="8.5" height="7" rx="1.2" stroke="currentColor" strokeWidth="1.3"/><path d="M9.5 6.2l3-1.7v5l-3-1.7V6.2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>,
                },
              ]).map(({ tab, label, icon, badge }) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => { setCommTab(tab); setCommExpanded(true) }}
                  title={label}
                  className={[
                    'relative flex items-center justify-center w-10 h-10 rounded-xl transition-all',
                    tab === 'repeat' && !!savedRepeat
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

          {/* ── Expanded communication panel ── */}
          {commExpanded && (
            <div className="flex flex-col h-full w-[320px]">

              {/* Panel header */}
              <div className="flex-shrink-0 flex items-center gap-2 px-3 h-11 border-b border-slate-100">
                <span className="flex-1 text-[13px] font-semibold text-slate-700">
                  {commTab === 'repeat' ? 'Repeat' : commTab === 'comments' ? 'Comments' : commTab === 'attachments' ? 'Links' : commTab === 'meet' ? 'Meet' : 'Activity'}
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

              {/* Tabs */}
              <div className="flex-shrink-0 flex items-center border-b border-slate-100 px-1">
                {(['repeat', 'comments', 'attachments', 'activity', 'meet'] as const).map((tab) => (
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
                    {tab === 'repeat' ? 'Repeat' : tab === 'comments' ? 'Comments' : tab === 'attachments' ? 'Links' : tab === 'meet' ? 'Meet' : 'Activity'}
                    {tab === 'repeat' && !!savedRepeat && (
                      <span className="ml-1 inline-flex w-1.5 h-1.5 rounded-full bg-indigo-500 align-middle -mt-0.5"/>
                    )}
                    {tab === 'comments' && comments.length > 0 && (
                      <span className="ml-1 inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-indigo-100 text-indigo-600 text-[9px] font-bold align-middle -mt-0.5">{comments.length}</span>
                    )}
                    {tab === 'meet' && taskMeetings.length > 0 && (
                      <span className="ml-1 inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-indigo-100 text-indigo-600 text-[9px] font-bold align-middle -mt-0.5">{taskMeetings.length}</span>
                    )}
                  </button>
                ))}
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto scrollbar-none">

                {/* Repeat tab — upcoming dates only */}
                {commTab === 'repeat' && (() => {
                  if (!savedRepeat) return (
                    <div className="flex flex-col items-center justify-center py-10 gap-3 text-center px-4">
                      <div className="w-11 h-11 rounded-full bg-slate-100 flex items-center justify-center">
                        <svg fill="none" viewBox="0 0 20 20" width="18" height="18" className="text-slate-400">
                          <path d="M3 10a7 7 0 0 1 13-3.5M17 10a7 7 0 0 1-13 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                          <path d="M16 6.5l1-2 2 1.5M4 13.5l-1 2-2-1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <div>
                        <p className="text-[13px] font-semibold text-slate-600">No repeat configured</p>
                        <p className="text-[11.5px] text-slate-400 mt-0.5">Click Repeat in the properties panel to set up a schedule</p>
                      </div>
                    </div>
                  )
                  const upcoming = getUpcomingRepeatDates(savedRepeat, 5, holidayDates)
                  const t = new Date()
                  const todayStr = t.getFullYear() + '-' + String(t.getMonth()+1).padStart(2,'0') + '-' + String(t.getDate()).padStart(2,'0')
                  return (
                    <div className="p-4">
                      {upcoming.length === 0 ? (
                        <p className="text-[12px] text-slate-400 text-center py-6">No upcoming dates</p>
                      ) : (
                        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                          <div className="px-3.5 py-2 border-b border-slate-100 flex items-center gap-1.5">
                            <svg fill="none" viewBox="0 0 14 14" width="12" height="12" className="text-slate-400">
                              <rect x="1" y="2" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.3"/>
                              <path d="M4 1v2M10 1v2M1 6h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                            </svg>
                            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Upcoming</span>
                          </div>
                          <div className="relative px-3.5 py-2">
                            <div className="absolute left-[22px] top-4 bottom-4 w-px bg-slate-100"/>
                            <div className="space-y-0">
                              {upcoming.map((dateStr, i) => {
                                const isToday = dateStr === todayStr
                                const [yr, mo, dy] = dateStr.split('-').map(Number)
                                const d = new Date(yr, mo - 1, dy)
                                const label = d.toLocaleDateString('en', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
                                return (
                                  <div key={dateStr} className="flex items-center gap-2.5 py-1.5 relative">
                                    <div className={['relative z-10 w-2.5 h-2.5 rounded-full border-2 flex-shrink-0 ml-0.5', i === 0 ? 'border-indigo-500 bg-indigo-500' : 'border-slate-300 bg-white'].join(' ')}/>
                                    <span className={['text-[12px]', i === 0 ? 'font-semibold text-indigo-700' : 'text-slate-600'].join(' ')}>{label}</span>
                                    {isToday && <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-600">Today</span>}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* Comments tab */}
                {commTab === 'comments' && (
                  <div className="py-3 px-3 space-y-4">
                    {comments.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
                        <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
                          <svg fill="none" viewBox="0 0 16 16" width="14" height="14" className="text-slate-400">
                            <path d="M13 2H3a1 1 0 00-1 1v7a1 1 0 001 1h1.5l2.5 2.5L9.5 11H13a1 1 0 001-1V3a1 1 0 00-1-1z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                          </svg>
                        </div>
                        <p className="text-[12px] text-slate-500 font-medium">No comments yet</p>
                        <p className="text-[11px] text-slate-400">Be the first to add one below</p>
                      </div>
                    ) : (
                      comments.map((c, i) => {
                        const displayName = c.fullName ?? c.user
                        return (
                          <div key={i} className="flex items-start gap-2.5">
                            <UserAvatar name={c.user} fullName={displayName} size="xs" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span className="text-[11.5px] font-semibold text-slate-700 truncate">{displayName}</span>
                                <span className="text-[11px] text-slate-400 flex-shrink-0">{fmtActivity(new Date(c.timestamp))}</span>
                              </div>
                              <p className="text-[12.5px] text-slate-600 leading-relaxed whitespace-pre-wrap break-words">
                                {renderMentionText(c.text)}
                              </p>
                            </div>
                          </div>
                        )
                      })
                    )}
                    <div ref={commentsEndRef}/>
                  </div>
                )}

                {/* Activity tab */}
                {commTab === 'activity' && (() => {
                  const isAdmin =
                    currentUser?.username === 'Administrator' ||
                    currentUser?.roles?.includes('Administrator') ||
                    currentUser?.roles?.includes('System Manager')

                  if (activityLog.length === 0) return (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-300">
                      <svg fill="none" viewBox="0 0 24 24" width="32" height="32" className="mb-2">
                        <path d="M12 8v4l3 3M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                      </svg>
                      <p className="text-[12px]">No activity yet</p>
                    </div>
                  )

                  return (
                    <div className="py-2 px-3 relative">
                      {/* Vertical connector line */}
                      <div className="absolute left-[23px] top-5 bottom-5 w-px bg-slate-100 pointer-events-none" />

                      {activityLog.map((entry, i) => {
                        // Icon
                        let icon: React.ReactNode
                        if (entry.type === 'created') {
                          icon = (
                            <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 ring-2 ring-white">
                              <svg fill="none" viewBox="0 0 12 12" width="9" height="9" className="text-indigo-500">
                                <path d="M6 1v10M1 6h10" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6"/>
                              </svg>
                            </div>
                          )
                        } else if (entry.type === 'status') {
                          const scfg = STATUS_CONFIG.find((s) => entry.text.includes(s.key)) ?? STATUS_CONFIG[0]
                          icon = (
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ring-2 ring-white ${scfg.pill}`}>
                              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${scfg.dot}`}/>
                            </div>
                          )
                        } else if (entry.type === 'user') {
                          const name = entry.text.split(' was')[0]
                          icon = <div className="ring-2 ring-white rounded-full flex-shrink-0"><UserAvatar name={name} size="xs" /></div>
                        } else if (entry.type === 'link') {
                          icon = (
                            <div className="w-6 h-6 rounded-full bg-sky-100 flex items-center justify-center flex-shrink-0 ring-2 ring-white">
                              <svg fill="none" viewBox="0 0 12 12" width="9" height="9" className="text-sky-500">
                                <path d="M5 7a3 3 0 0 0 4.24.01l1.42-1.41a3 3 0 0 0-4.24-4.24L5.35 2.4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.3"/>
                                <path d="M7 5a3 3 0 0 0-4.24-.01L1.34 6.4a3 3 0 0 0 4.24 4.24l1.05-1.05" stroke="currentColor" strokeLinecap="round" strokeWidth="1.3"/>
                              </svg>
                            </div>
                          )
                        } else if (entry.type === 'priority') {
                          icon = (
                            <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0 ring-2 ring-white">
                              <svg fill="none" viewBox="0 0 12 12" width="9" height="9" className="text-orange-500">
                                <path d="M6 1v6M6 9.5v1" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6"/>
                              </svg>
                            </div>
                          )
                        } else if (entry.type === 'title') {
                          icon = (
                            <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0 ring-2 ring-white">
                              <svg fill="none" viewBox="0 0 12 12" width="9" height="9" className="text-violet-500">
                                <path d="M2 3h8M5 3v6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5"/>
                              </svg>
                            </div>
                          )
                        } else {
                          icon = (
                            <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 ring-2 ring-white">
                              <svg fill="none" viewBox="0 0 12 12" width="9" height="9" className="text-slate-400">
                                <path d="M2 3h8M2 6h6M2 9h4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4"/>
                              </svg>
                            </div>
                          )
                        }

                        return (
                          <div key={i} className="flex items-start gap-2.5 group py-2">
                            <div className="flex-shrink-0 z-10">{icon}</div>
                            <div className="flex-1 min-w-0 pt-0.5">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-[12px] text-slate-700 font-medium leading-snug">{entry.text}</p>
                                <div className="flex items-center gap-1.5 flex-shrink-0 mt-px">
                                  <span className="text-[10.5px] text-slate-400 whitespace-nowrap">{fmtActivity(entry.time)}</span>
                                  {isAdmin && entry.name && (
                                    <button
                                      onClick={() => deleteActivity(entry)}
                                      className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition-opacity"
                                      title="Delete"
                                    >
                                      <svg fill="none" viewBox="0 0 10 10" width="10" height="10">
                                        <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5"/>
                                      </svg>
                                    </button>
                                  )}
                                </div>
                              </div>
                              {entry.sub && (
                                <div className="flex items-center gap-1 mt-1">
                                  <UserAvatar name={entry.sub} fullName={formatUserDisplay(entry.sub)} size="xs" />
                                  <span className="text-[11px] text-slate-400">{formatUserDisplay(entry.sub)}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}

                {/* Meet tab */}
                {commTab === 'meet' && (() => {
                  const now = new Date()
                  const upcoming = taskMeetings.filter(e => new Date(e.starts_on) >= now)
                  const past     = [...taskMeetings.filter(e => new Date(e.starts_on) < now)].reverse()
                  const fmtEvtDate = (s: string) => {
                    const d = new Date(s)
                    const date = d.toLocaleDateString('en', { month: 'short', day: 'numeric' })
                    const time = d.toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' })
                    return `${date} · ${time}`
                  }
                  const MeetCard = ({ evt, done }: { evt: ErpEvent; done: boolean }) => (
                    <div className={`rounded-xl border p-3 space-y-1.5 ${done ? 'border-slate-100 bg-slate-50' : 'border-blue-100 bg-blue-50'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-[12.5px] font-semibold leading-snug flex-1 ${done ? 'text-slate-500' : 'text-slate-800'}`}>{evt.subject}</p>
                        {done && (
                          <span className="flex-shrink-0 text-[9.5px] font-bold uppercase tracking-wide text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">Done</span>
                        )}
                        {!done && (
                          <span className="flex-shrink-0 text-[9.5px] font-bold uppercase tracking-wide text-blue-600 bg-blue-100 rounded-full px-2 py-0.5">Upcoming</span>
                        )}
                      </div>
                      <p className={`text-[11px] ${done ? 'text-slate-400' : 'text-blue-500'}`}>{fmtEvtDate(evt.starts_on)}</p>
                      {evt.google_meet_link && (
                        <a
                          href={evt.google_meet_link}
                          target="_blank"
                          rel="noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold rounded-lg px-2.5 py-1 transition-opacity hover:opacity-80"
                          style={{ background: '#00897B', color: 'white' }}
                        >
                          <svg viewBox="0 0 20 20" fill="none" width="11" height="11">
                            <rect x="1" y="5" width="11" height="10" rx="1.5" fill="white"/>
                            <path d="M12 9l7-4v10l-7-4V9z" fill="white"/>
                          </svg>
                          Join Meet
                        </a>
                      )}
                    </div>
                  )
                  return (
                    <div className="p-3 space-y-3">
                      <button
                        type="button"
                        onClick={() => setShowAddEvent(true)}
                        className="flex items-center justify-center gap-2 w-full h-9 rounded-lg text-[12.5px] font-medium transition-colors"
                        style={{ background: '#f0f4ff', color: '#1a73e8', border: '1px solid #c5d8ff' }}
                      >
                        <svg fill="none" viewBox="0 0 16 16" width="12" height="12">
                          <path d="M8 2v12M2 8h12" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6"/>
                        </svg>
                        Schedule Meeting
                      </button>
                      {meetingsLoading ? (
                        <div className="space-y-2">
                          {[1, 2].map(i => <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />)}
                        </div>
                      ) : taskMeetings.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 text-center">
                          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mb-2">
                            <svg fill="none" viewBox="0 0 20 20" width="16" height="16" className="text-slate-400">
                              <rect x="1" y="5" width="13" height="10" rx="2" stroke="currentColor" strokeWidth="1.4"/>
                              <path d="M14 8.5l5-3v9l-5-3V8.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                            </svg>
                          </div>
                          <p className="text-[12px] text-slate-400">No meetings scheduled yet</p>
                        </div>
                      ) : (
                        <>
                          {upcoming.length > 0 && (
                            <div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Upcoming</p>
                              <div className="space-y-2">
                                {upcoming.map(e => <MeetCard key={e.name} evt={e} done={false} />)}
                              </div>
                            </div>
                          )}
                          {past.length > 0 && (
                            <div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Past</p>
                              <div className="space-y-2">
                                {past.map(e => <MeetCard key={e.name} evt={e} done={true} />)}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )
                })()}

                {/* Links tab */}
                {commTab === 'attachments' && (() => {
                  const savedLinks = parseLinks(description)
                  return (
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
                              onClick={() => void saveLink()}
                              disabled={!linkUrl.trim()}
                              className="h-7 px-3 text-[12px] font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                              Save
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

                      {/* Saved links list */}
                      {savedLinks.length > 0 ? (
                        <div className="space-y-1">
                          {savedLinks.map((lk, i) => (
                            <a
                              key={i}
                              href={lk.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-slate-50 transition-colors group"
                            >
                              <div className="w-6 h-6 rounded-md bg-sky-100 flex items-center justify-center flex-shrink-0">
                                <svg fill="none" viewBox="0 0 12 12" width="9" height="9" className="text-sky-500">
                                  <path d="M5 7a3 3 0 0 0 4.24.01l1.42-1.41a3 3 0 0 0-4.24-4.24L5.35 2.4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.3"/>
                                  <path d="M7 5a3 3 0 0 0-4.24-.01L1.34 6.4a3 3 0 0 0 4.24 4.24l1.05-1.05" stroke="currentColor" strokeLinecap="round" strokeWidth="1.3"/>
                                </svg>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[12.5px] font-medium text-slate-700 truncate group-hover:text-indigo-600 transition-colors">{lk.label}</p>
                                <p className="text-[11px] text-slate-400 truncate">{lk.url}</p>
                              </div>
                              <svg fill="none" viewBox="0 0 12 12" width="10" height="10" className="text-slate-300 flex-shrink-0 group-hover:text-indigo-400 transition-colors">
                                <path d="M9 6.5V10H2V3h3.5M7 2h3v3M6 6l4-4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.2"/>
                              </svg>
                            </a>
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
                  )
                })()}
              </div>

              {/* Composer — comments */}
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
                        onClick={() => void addComment()}
                        disabled={!commentText.trim() || isSendingComment}
                        className="h-6 px-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[11.5px] font-medium rounded-lg transition-colors flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {isSendingComment ? 'Saving…' : 'Send'}
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

      </div>

      {/* ══ Fixed-position dropdowns (escape overflow:hidden on modal) ══ */}

      {/* @mention dropdown — floats above the comment composer */}
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
                  <UserAvatar name={u.name} fullName={u.fullName} size="sm" />
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

      {showProjectMenu && (
        <div
          ref={projectDropRef}
          style={{ position: 'fixed', top: projectDropPos.top, left: projectDropPos.left, width: projectDropPos.width, zIndex: 9999 }}
          className="bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden"
        >
          {/* Search */}
          <div className="flex items-center gap-1.5 px-2.5 border-b border-slate-100">
            <svg fill="none" viewBox="0 0 12 12" width="11" height="11" className="text-slate-400 flex-shrink-0">
              <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M8 8l2.5 2.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.3"/>
            </svg>
            <input
              autoFocus
              type="text"
              value={projectQuery}
              onChange={(e) => setProjectQuery(e.target.value)}
              placeholder="Search projects…"
              className="w-full h-8 text-[12px] text-slate-700 placeholder:text-slate-400 bg-transparent outline-none border-0"
            />
          </div>
          {/* Options */}
          <div className="max-h-48 overflow-y-auto scrollbar-none py-1">
            {localProject && (
              <button
                type="button"
                onClick={() => void handleProjectChange('')}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors"
              >
                <svg fill="none" viewBox="0 0 12 12" width="10" height="10">
                  <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.3"/>
                </svg>
                No project
              </button>
            )}
            {projects
              .filter((p) => !projectQuery || p.displayName.toLowerCase().includes(projectQuery.toLowerCase()))
              .map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => void handleProjectChange(p.name)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-[12.5px] text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <span className="truncate">{p.displayName}</span>
                  {localProject === p.name && (
                    <svg fill="none" viewBox="0 0 12 12" width="11" height="11" className="text-indigo-500 flex-shrink-0">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"/>
                    </svg>
                  )}
                </button>
              ))}
            {projects.filter((p) => !projectQuery || p.displayName.toLowerCase().includes(projectQuery.toLowerCase())).length === 0 && (
              <p className="px-3 py-2 text-[12px] text-slate-400">No projects found</p>
            )}
          </div>
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
              onClick={() => void handlePriorityChange(p.key)}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12.5px] text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${p.dot}`}/>
              {p.label}
              {task.priority === p.key && (
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
          {/* Search */}
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
          {/* Options list */}
          <div className="max-h-44 overflow-y-auto scrollbar-none py-1">
            {actType && (
              <button
                type="button"
                onClick={() => void selectActType('')}
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
                  onClick={() => void selectActType(opt)}
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

      <AddEventModal
        open={showAddEvent}
        onClose={() => setShowAddEvent(false)}
        onCreated={() => {
          getEventsByTask(task.id, task.subject).then(setTaskMeetings).catch(() => {})
        }}
        defaultSubject={title}
        defaultDescription={description || undefined}
        defaultAssignees={task.assignedTo}
        linkedTaskId={task.id}
        zIndex={60}
      />

      {showParentTaskMenu && (
        <div
          ref={parentTaskDropRef}
          style={{ position: 'fixed', top: parentTaskDropPos.top, left: parentTaskDropPos.left, width: parentTaskDropPos.width, zIndex: 9999 }}
          className="bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden"
        >
          {/* Search */}
          <div className="flex items-center gap-1.5 px-2.5 border-b border-slate-100">
            <svg fill="none" viewBox="0 0 12 12" width="11" height="11" className="text-slate-400 flex-shrink-0">
              <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M8 8l2.5 2.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.3"/>
            </svg>
            <input
              autoFocus
              type="text"
              value={parentTaskQuery}
              onChange={(e) => setParentTaskQuery(e.target.value)}
              placeholder="Search tasks…"
              className="w-full h-8 text-[12px] text-slate-700 placeholder:text-slate-400 bg-transparent outline-none border-0"
            />
          </div>
          <div className="max-h-52 overflow-y-auto scrollbar-none py-1">
            {/* Clear option */}
            {localParentTask && (
              <button
                type="button"
                onClick={() => void selectParentTask(null)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors"
              >
                <svg fill="none" viewBox="0 0 12 12" width="10" height="10">
                  <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.3"/>
                </svg>
                Clear parent
              </button>
            )}
            {allTasks
              .filter((t) =>
                t.id !== task.id &&
                (!localProject || t.project === localProject) &&
                (!parentTaskQuery || t.subject.toLowerCase().includes(parentTaskQuery.toLowerCase()))
              )
              .map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => void selectParentTask(t.id)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-[12.5px] text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <span className="truncate">{t.subject}</span>
                  {localParentTask === t.id && (
                    <svg fill="none" viewBox="0 0 12 12" width="11" height="11" className="text-indigo-500 flex-shrink-0">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"/>
                    </svg>
                  )}
                </button>
              ))}
            {allTasks.filter((t) => t.id !== task.id && (!parentTaskQuery || t.subject.toLowerCase().includes(parentTaskQuery.toLowerCase()))).length === 0 && (
              <p className="text-[12px] text-slate-400 text-center py-3">No tasks found</p>
            )}
          </div>
        </div>
      )}

      <RepeatModal
        open={showRepeatModal}
        onClose={() => setShowRepeatModal(false)}
        savedRepeat={savedRepeat}
        defaultStartDate={task.startDate ?? ''}
        onSave={async (input) => {
          const result = savedRepeat
            ? await autoRepeatApi.update(savedRepeat.id, input)
            : await autoRepeatApi.create(task.id, input)
          setSavedRepeat(result)
        }}
        onRemove={savedRepeat ? async () => {
          await autoRepeatApi.remove(savedRepeat.id)
          setSavedRepeat(null)
        } : undefined}
      />
    </div>
  )
}