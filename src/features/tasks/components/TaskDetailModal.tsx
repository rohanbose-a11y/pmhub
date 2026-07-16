import React, { useEffect, useRef, useState } from 'react'

import type { Task, TaskComment, UpdateTaskInput } from '../types/task.types'
import { taskApi } from '../../../api/taskApi'
import { userApi } from '../../../api/userApi'
import type { UserOption } from '../../../api/userApi'
import { useKraOptions } from '../../../hooks/useKraOptions'
import { useAuthStore } from '../../../store/authStore'
import { RichTextEditor } from '../../../shared/components/RichTextEditor'

// ─── Config ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG = [
  { key: 'Open',           dot: 'bg-slate-400',   pill: 'bg-slate-100 text-slate-600'      },
  { key: 'Working',        dot: 'bg-blue-500',    pill: 'bg-blue-50 text-blue-700'         },
  { key: 'Pending Review', dot: 'bg-amber-500',   pill: 'bg-amber-50 text-amber-700'       },
  { key: 'Overdue',        dot: 'bg-orange-500',  pill: 'bg-orange-50 text-orange-700'     },
  { key: 'Completed',      dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-700'   },
  { key: 'Cancelled',      dot: 'bg-rose-400',    pill: 'bg-rose-50 text-rose-600'         },
]

const PRIORITY_CONFIG = [
  { key: 'Urgent', dot: 'bg-red-500',    label: 'Urgent'  },
  { key: 'High',   dot: 'bg-orange-500', label: 'High'    },
  { key: 'Medium', dot: 'bg-blue-400',   label: 'Medium'  },
  { key: 'Low',    dot: 'bg-slate-300',  label: 'Low'     },
]

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

function fmtDate(v: string | null) {
  if (!v) return null
  return new Date(v).toLocaleDateString('en', { month: 'short', day: 'numeric' })
}

function fmtActivity(d: Date) {
  const diff = Date.now() - d.getTime()
  if (diff < 60_000)    return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return d.toLocaleDateString('en', { month: 'short', day: 'numeric' })
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
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface TaskDetailModalProps {
  task: Task          // store task — used as initial data and for ID lookup
  allTasks: Task[]
  onClose: () => void
  onUpdate: (taskId: string, input: UpdateTaskInput) => Promise<boolean>
  onStatusChange: (task: Task) => void
  onAssign: (task: Task) => void
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
  onClose,
  onUpdate,
  onStatusChange,
  onAssign,
  drawer = false,
}: TaskDetailModalProps) {
  // Full task fetched from API (includes custom_kra, all computed fields)
  const [fullTask, setFullTask] = useState<Task | null>(null)
  const [fetchError, setFetchError] = useState(false)

  // Communication panel
  const [commExpanded, setCommExpanded] = useState(true)
  const [commTab, setCommTab] = useState<'comments' | 'activity' | 'attachments'>('comments')
  const [showTimeSoon, setShowTimeSoon] = useState(false)

  // Editing state — initialised from store task, updated when fullTask arrives
  const [title, setTitle]                       = useState(task.subject)
  const [isEditingTitle, setIsEditingTitle]     = useState(false)
  const [description, setDescription]           = useState(task.description ?? '')
  const [isEditingDesc, setIsEditingDesc]       = useState(false)
  const [descEditKey, setDescEditKey]           = useState(0)
  const [engDays, setEngDays]                   = useState(String(task.engagementDays ?? ''))
  const [isEditingEngDays, setIsEditingEngDays] = useState(false)
  const [actType, setActType]                   = useState(task.activityType ?? '')
  const [showActTypeMenu, setShowActTypeMenu]   = useState(false)
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
  const [activityLog, setActivityLog]           = useState<ActivityEntry[]>(() => {
    const now = new Date()
    const log: ActivityEntry[] = [
      { type: 'created', text: 'Task created', time: now },
      { type: 'status',  text: `Status set to ${task.status}`,
        sub: task.status === 'Completed' && task.completedBy ? `Completed by ${task.completedBy}` : undefined,
        time: now },
    ]
    if (task.assignedTo.length > 0) {
      task.assignedTo.forEach((a) => log.push({ type: 'user', text: `${a} was assigned`, time: now }))
    }
    return log
  })

  const addActivity = (entry: Omit<ActivityEntry, 'time'>) =>
    setActivityLog((prev) => [...prev, { ...entry, time: new Date() }])

  const triggerTimeSoon = () => {
    setShowTimeSoon(true)
    setTimeout(() => setShowTimeSoon(false), 2800)
  }

  // Fixed-position dropdown anchoring (escape overflow:hidden on the modal)
  const [priorityDropPos,  setPriorityDropPos]  = useState({ top: 0, left: 0, width: 0 })
  const [actTypeDropPos,   setActTypeDropPos]   = useState({ top: 0, left: 0, width: 0 })
  const [parentTaskDropPos, setParentTaskDropPos] = useState({ top: 0, left: 0, width: 0 })
  const [showParentTaskMenu, setShowParentTaskMenu] = useState(false)
  const [parentTaskQuery,   setParentTaskQuery]  = useState('')

  const priorityTriggerRef   = useRef<HTMLDivElement>(null)
  const priorityDropRef      = useRef<HTMLDivElement>(null)
  const actTypeTriggerRef    = useRef<HTMLDivElement>(null)
  const actTypeDropRef       = useRef<HTMLDivElement>(null)
  const parentTaskTriggerRef = useRef<HTMLDivElement>(null)
  const parentTaskDropRef    = useRef<HTMLDivElement>(null)

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

  // ── Fetch full task detail on open ─────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    setFullTask(null)
    setFetchError(false)
    taskApi.getTask(task.id)
      .then((t) => {
        if (!cancelled) {
          setFullTask(t)
          setTitle(t.subject)
          setDescription(t.description ?? '')
          setEngDays(String(t.engagementDays ?? ''))
          setActType(t.activityType ?? '')
          setLocalParentTask(t.parentTask ?? null)
          setDepTaskIds(t.dependsOnTasks ? t.dependsOnTasks.split(',').map((s) => s.trim()).filter(Boolean) : [])
          setComments(t.comments ?? [])
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFullTask(task)   // fall back to store task
          setFetchError(true)
        }
      })
    return () => { cancelled = true }
  }, [task.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Keep editing states in sync when store task prop updates ──────────────
  useEffect(() => { if (!fullTask) setTitle(task.subject) }, [task.subject, fullTask])
  useEffect(() => { if (!fullTask) setDescription(task.description ?? '') }, [task.description, fullTask])

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

  // ── @mention user search ───────────────────────────────────────────────────
  useEffect(() => {
    if (mentionQuery === null) { setMentionUsers([]); return }
    const timer = setTimeout(() => {
      userApi.searchUsers(mentionQuery)
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
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [showPriorityMenu, showActTypeMenu, showParentTaskMenu])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showPriorityMenu)   { setShowPriorityMenu(false); return }
        if (showActTypeMenu)    { setShowActTypeMenu(false); setKraQuery(''); return }
        if (showParentTaskMenu) { setShowParentTaskMenu(false); setParentTaskQuery(''); return }
        onClose()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose, showPriorityMenu, showActTypeMenu, showParentTaskMenu])

  // Display task:
  //   • Live fields (status, priority, isMilestone, assignees) → always from store `task` prop
  //     so they stay fresh after status-change / assign operations without re-fetching.
  //   • Rich fields only available on full doc (activityType, description, dates, engDays) → fullTask
  const dt        = fullTask ?? task
  const isLoading = !fullTask

  // Status and priority always from store (updated by store after mutations)
  const sg       = STATUS_CONFIG.find((s) => s.key === task.status) ?? STATUS_CONFIG[0]
  const pg       = PRIORITY_CONFIG.find((p) => p.key === task.priority)
  const subtasks = allTasks.filter((t) => t.parentTask === task.id)
  const shortId  = task.id
  const duePast  = dt.dueDate && new Date(dt.dueDate) < new Date()
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
      if (ok) setFullTask((prev) => prev ? { ...prev, engagementDays: n } : null)
    } else if (isNaN(n)) {
      setEngDays(String(dt.engagementDays ?? ''))
    }
  }

  const selectActType = async (val: string) => {
    setShowActTypeMenu(false)
    setKraQuery('')
    setActType(val)
    if (val !== (dt.activityType ?? '')) {
      const ok = await onUpdate(task.id, { subject: task.subject, status: liveStatus, priority: livePriority, activityType: val || undefined })
      if (ok) setFullTask((prev) => prev ? { ...prev, activityType: val || null } : null)
    }
  }

  const toggleMilestone = async () => {
    await onUpdate(task.id, { subject: task.subject, status: liveStatus, priority: livePriority, isMilestone: !task.isMilestone })
  }

  const selectParentTask = async (parentId: string | null) => {
    setShowParentTaskMenu(false)
    setParentTaskQuery('')
    setLocalParentTask(parentId)
    await onUpdate(task.id, { subject: task.subject, status: liveStatus, priority: livePriority, parentTask: parentId || undefined })
  }

  const addDep = async (depId: string) => {
    if (!depId || depTaskIds.includes(depId)) return
    const newIds = [...depTaskIds, depId]
    setDepTaskIds(newIds)
    setDepPickerValue('')
    await onUpdate(task.id, { subject: task.subject, status: liveStatus, priority: livePriority, dependsOnTasks: newIds.join(',') })
  }

  const removeDep = async (depId: string) => {
    const newIds = depTaskIds.filter((id) => id !== depId)
    setDepTaskIds(newIds)
    await onUpdate(task.id, { subject: task.subject, status: liveStatus, priority: livePriority, dependsOnTasks: newIds.join(',') || undefined })
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
    addActivity({ type: 'desc', text: 'Comment added' })
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
              <button className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 transition-colors">
                <svg fill="none" viewBox="0 0 14 14" width="12" height="12">
                  <path d="M9 3.5L5 7l4 3.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4"/>
                </svg>
              </button>
              <button className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 transition-colors">
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
                        {dt.startDate
                          ? <span className="text-slate-700">{fmtDate(dt.startDate)}</span>
                          : <span className="text-slate-300">Start</span>}
                        <svg fill="none" viewBox="0 0 14 6" width="12" height="6" className="text-slate-300 flex-shrink-0">
                          <path d="M0 3h12M9 1l3 2-3 2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.2"/>
                        </svg>
                        {dt.dueDate
                          ? <span className={duePast ? 'text-red-500 font-medium' : 'text-slate-700'}>{fmtDate(dt.dueDate)}</span>
                          : <span className="text-slate-300">Due</span>}
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

                    {/* Track Time */}
                    <div
                      className="flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 transition-colors group cursor-pointer"
                      onClick={triggerTimeSoon}
                    >
                      <span className="text-[11.5px] text-slate-400 w-28 flex-shrink-0">Track Time</span>
                      <div className="flex items-center gap-1.5">
                        {showTimeSoon ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-50 text-violet-500 text-[11px] font-semibold">
                            <svg fill="none" viewBox="0 0 10 10" width="8" height="8"><path d="M5 1v4l2.5 1.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4"/><circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.2"/></svg>
                            Coming soon
                          </span>
                        ) : (
                          <>
                            <svg fill="none" viewBox="0 0 14 14" width="12" height="12" className="text-slate-400">
                              <circle cx="7" cy="8" r="5" stroke="currentColor" strokeWidth="1.3"/>
                              <path d="M7 5.5V8l1.5 1.5M9.5 2h-5M7 2v1.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.3"/>
                            </svg>
                            <span className="text-[12.5px] text-slate-300 group-hover:text-slate-400 transition-colors">Add time</span>
                          </>
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
                              <div
                                key={u}
                                className={`w-[22px] h-[22px] rounded-full flex items-center justify-center text-white text-[9px] font-bold ring-2 ring-white flex-shrink-0 ${avColor(u)}`}
                                title={u}
                              >
                                {initials(u)}
                              </div>
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

                    {/* Is Milestone */}
                    <div
                      className="flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 transition-colors group cursor-pointer"
                      onClick={toggleMilestone}
                    >
                      <span className="text-[11.5px] text-slate-400 w-28 flex-shrink-0">Is Milestone</span>
                      <div className="flex items-center gap-2">
                        <div className={[
                          'relative inline-flex h-4 w-7 rounded-full border-2 border-transparent transition-colors',
                          task.isMilestone ? 'bg-amber-400' : 'bg-slate-200',
                        ].join(' ')}>
                          <span className={[
                            'inline-block h-3 w-3 rounded-full bg-white shadow transition-transform',
                            task.isMilestone ? 'translate-x-3' : 'translate-x-0',
                          ].join(' ')}/>
                        </div>
                        <span className="text-[12.5px] text-slate-600">{task.isMilestone ? 'Yes' : 'No'}</span>
                      </div>
                    </div>

                    {/* Is Group */}
                    <div className="flex items-center gap-2 px-4 py-2.5 group">
                      <span className="text-[11.5px] text-slate-400 w-28 flex-shrink-0">Is Group</span>
                      <div className="flex items-center gap-2">
                        <div className={[
                          'relative inline-flex h-4 w-7 rounded-full border-2 border-transparent transition-colors',
                          subtasks.length > 0 ? 'bg-indigo-500' : 'bg-slate-200',
                        ].join(' ')}>
                          <span className={[
                            'inline-block h-3 w-3 rounded-full bg-white shadow transition-transform',
                            subtasks.length > 0 ? 'translate-x-3' : 'translate-x-0',
                          ].join(' ')}/>
                        </div>
                        <span className="text-[12.5px] text-slate-600">{subtasks.length > 0 ? 'Yes' : 'No'}</span>
                      </div>
                    </div>

                  </div>
                </div>
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
                  dangerouslySetInnerHTML={{ __html: description }}
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
                          .filter((t) => t.id !== task.id && !depTaskIds.includes(t.id))
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
            <div className="flex flex-col items-center w-[52px] py-3 gap-0.5 bg-slate-50/30">

              {/* Expand toggle */}
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

              {/* Activity button — opens to Links tab */}
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

          {/* ── Expanded communication panel ── */}
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
                {(['attachments', 'comments', 'activity'] as const).map((tab) => (
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
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0 ${avColor(displayName)}`}>
                              {initials(displayName)}
                            </div>
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
                {commTab === 'activity' && (
                  <div className="py-3 px-3 space-y-4">
                    {activityLog.map((entry, i) => {
                      // Icon
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
                      } else if (entry.type === 'user') {
                        const name = entry.text.split(' was')[0]
                        icon = (
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0 ${avColor(name)}`}>
                            {initials(name)}
                          </div>
                        )
                      } else if (entry.type === 'link') {
                        icon = (
                          <div className="w-6 h-6 rounded-full bg-sky-100 flex items-center justify-center flex-shrink-0">
                            <svg fill="none" viewBox="0 0 12 12" width="9" height="9" className="text-sky-500">
                              <path d="M5 7a3 3 0 0 0 4.24.01l1.42-1.41a3 3 0 0 0-4.24-4.24L5.35 2.4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.3"/>
                              <path d="M7 5a3 3 0 0 0-4.24-.01L1.34 6.4a3 3 0 0 0 4.24 4.24l1.05-1.05" stroke="currentColor" strokeLinecap="round" strokeWidth="1.3"/>
                            </svg>
                          </div>
                        )
                      } else if (entry.type === 'desc') {
                        icon = (
                          <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                            <svg fill="none" viewBox="0 0 12 12" width="9" height="9" className="text-slate-500">
                              <path d="M2 3h8M2 6h6M2 9h4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4"/>
                            </svg>
                          </div>
                        )
                      } else if (entry.type === 'priority') {
                        icon = (
                          <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                            <svg fill="none" viewBox="0 0 12 12" width="9" height="9" className="text-orange-500">
                              <path d="M6 1v6M6 9.5v1" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6"/>
                            </svg>
                          </div>
                        )
                      } else {
                        icon = (
                          <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                            <svg fill="none" viewBox="0 0 12 12" width="9" height="9" className="text-slate-400">
                              <path d="M2 4h5M2 7h8M2 10h11" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4"/>
                            </svg>
                          </div>
                        )
                      }
                      return (
                        <div key={i} className="flex items-start gap-2.5">
                          <div className="mt-0.5 flex-shrink-0">{icon}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] text-slate-600">{entry.text}</p>
                            {entry.sub && <p className="text-[11.5px] text-slate-500 mt-0.5">{entry.sub}</p>}
                            <p className="text-[11px] text-slate-400 mt-0.5">{fmtActivity(entry.time)}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

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

    </div>
  )
}
