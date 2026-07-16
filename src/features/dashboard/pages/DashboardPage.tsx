import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../../store/authStore'
import { useWorkStore } from '../../../store/workStore'
import type { Task } from '../../tasks/types/task.types'
import type { Project } from '../../projects/types/project.types'

// ─── Types ────────────────────────────────────────────────────────────────────

type MyWorkTab = 'all' | 'overdue' | 'today' | 'week'
type HealthStatus = 'on-track' | 'at-risk' | 'delayed'

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

function fmtShort(v: string | null) {
  if (!v) return null
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(v))
}

function fmtRelative(v: string | null) {
  if (!v) return ''
  const d = Date.now() - new Date(v).getTime()
  const m = Math.floor(d / 60_000), h = Math.floor(m / 60), dd = Math.floor(h / 24)
  if (m < 2) return 'just now'
  if (m < 60) return `${m}m ago`
  if (h < 24) return `${h}h ago`
  if (dd < 7) return `${dd}d ago`
  return fmtShort(v) ?? ''
}

const isActive = (s: string) =>
  !s.toLowerCase().includes('complet') &&
  s.toLowerCase() !== 'cancelled' &&
  s.toLowerCase() !== 'closed'

const AV_PALETTE = [
  '#7c3aed','#2563eb','#059669','#d97706','#dc2626','#0891b2','#4f46e5','#db2777',
]
function avBg(s: string) {
  let h = 0; for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h)
  return AV_PALETTE[Math.abs(h) % AV_PALETTE.length]
}
function avInits(s: string) {
  return s.replace(/[@.]/g, ' ').split(/\s+/).filter(Boolean).map((p) => p[0]).join('').toUpperCase().slice(0, 2)
}

const PRIO_COLOR: Record<string, string> = {
  Urgent: '#f43f5e', High: '#f59e0b', Medium: '#60a5fa', Low: '#cbd5e1',
}
const PRIO_ORDER: Record<string, number> = { Urgent: 0, High: 1, Medium: 2, Low: 3 }

// Status chip styling
function sChip(s: string): string {
  const k = s.toLowerCase()
  if (k.includes('complet') || k === 'closed') return 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60'
  if (k === 'working')        return 'bg-blue-50 text-blue-700 ring-1 ring-blue-200/60'
  if (k.includes('pending'))  return 'bg-violet-50 text-violet-700 ring-1 ring-violet-200/60'
  if (k === 'cancelled')      return 'bg-slate-100 text-slate-500'
  return 'bg-slate-100 text-slate-600'
}

// Project health
function computeHealth(p: Project, tasks: Task[], today: Date): HealthStatus {
  const pct = p.completion ?? 0
  if (p.expectedEndDate && new Date(p.expectedEndDate) < today && pct < 100) return 'delayed'
  const overdueN = tasks.filter((t) => (t.project === p.id || t.project === p.name) && t.dueDate && isActive(t.status) && new Date(t.dueDate) < today).length
  if (overdueN >= 3) return 'at-risk'
  if (p.expectedStartDate && p.expectedEndDate) {
    const elapsed = Math.max(0, today.getTime() - new Date(p.expectedStartDate).getTime())
      / Math.max(1, new Date(p.expectedEndDate).getTime() - new Date(p.expectedStartDate).getTime())
    if ((elapsed > 0.6 && pct < 30) || (elapsed > 0.8 && pct < 60)) return 'at-risk'
  }
  return 'on-track'
}

const HEALTH: Record<HealthStatus, { label: string; color: string; bg: string; text: string; bar: string; borderL: string }> = {
  'on-track': { label: 'On Track', color: '#10b981', bg: 'bg-emerald-50', text: 'text-emerald-700', bar: 'bg-emerald-500', borderL: 'border-l-emerald-400' },
  'at-risk':  { label: 'At Risk',  color: '#f59e0b', bg: 'bg-amber-50',   text: 'text-amber-700',  bar: 'bg-amber-400',   borderL: 'border-l-amber-400'   },
  'delayed':  { label: 'Delayed',  color: '#f43f5e', bg: 'bg-rose-50',    text: 'text-rose-600',   bar: 'bg-rose-500',    borderL: 'border-l-rose-400'    },
}

// ─── Donut chart categories (mutually exclusive) ──────────────────────────────

interface DonutSeg { label: string; color: string; value: number; pct: number; offset: number }

const DONUT_CATS = [
  { key: 'overdue',   label: 'Overdue',     color: '#f43f5e' },
  { key: 'due-today', label: 'Due Today',   color: '#f59e0b' },
  { key: 'working',   label: 'In Progress', color: '#3b82f6' },
  { key: 'pending',   label: 'In Review',   color: '#8b5cf6' },
  { key: 'open',      label: 'Open',        color: '#6366f1' },
  { key: 'completed', label: 'Completed',   color: '#10b981' },
  { key: 'cancelled', label: 'Cancelled',   color: '#94a3b8' },
]

function buildDonut(tasks: Task[], today: Date): { segs: DonutSeg[]; total: number } {
  const bucket = (t: Task): string => {
    const past  = t.dueDate && new Date(t.dueDate) < today
    const todaY = t.dueDate && new Date(t.dueDate).toDateString() === today.toDateString()
    if (t.status.toLowerCase() === 'cancelled') return 'cancelled'
    if (!isActive(t.status)) return 'completed'
    if (past)  return 'overdue'
    if (todaY) return 'due-today'
    if (t.status === 'Working') return 'working'
    if (t.status.toLowerCase().includes('pending')) return 'pending'
    return 'open'
  }
  const counts: Record<string, number> = {}
  tasks.forEach((t) => { const k = bucket(t); counts[k] = (counts[k] ?? 0) + 1 })
  const total = tasks.length
  let cum = 0
  const segs: DonutSeg[] = DONUT_CATS.map((cat) => {
    const value  = counts[cat.key] ?? 0
    const pct    = total > 0 ? (value / total) * 100 : 0
    const offset = 25 - cum
    cum += pct
    return { label: cat.label, color: cat.color, value, pct, offset }
  })
  return { segs, total }
}

// ─── SVG Donut ────────────────────────────────────────────────────────────────

function DonutChart({ segs, total }: { segs: DonutSeg[]; total: number }) {
  return (
    <div className="relative flex-shrink-0" style={{ width: 128, height: 128 }}>
      <svg viewBox="0 0 42 42" width={128} height={128} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="21" cy="21" r="15.9155" fill="none" stroke="#f1f5f9" strokeWidth="4.5"/>
        {segs.map((seg) => seg.value > 0 && (
          <circle
            key={seg.label}
            cx="21" cy="21" r="15.9155" fill="none"
            stroke={seg.color}
            strokeWidth="4.5"
            strokeDasharray={`${seg.pct} ${100 - seg.pct}`}
            strokeDashoffset={seg.offset}
            strokeLinecap="butt"
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[26px] font-bold text-slate-900 leading-none tabular-nums">{total}</span>
        <span className="text-[10px] font-medium text-slate-400 mt-0.5">total</span>
      </div>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkRow() {
  return (
    <div className="flex items-center gap-3 px-5 py-3.5 animate-pulse">
      <div className="w-1 h-8 rounded-full bg-slate-100 flex-shrink-0"/>
      <div className="flex-1 space-y-2">
        <div className="h-2.5 bg-slate-100 rounded-full w-2/3"/>
        <div className="h-2 bg-slate-100 rounded-full w-1/3"/>
      </div>
      <div className="w-14 h-5 bg-slate-100 rounded-full flex-shrink-0"/>
    </div>
  )
}

function Blank({ icon, title, sub }: { icon: React.ReactNode; title: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center py-12 gap-3 text-center px-6">
      <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">{icon}</div>
      <div>
        <p className="text-[13px] font-semibold text-slate-700">{title}</p>
        {sub && <p className="text-[12px] text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ─── Reusable card ────────────────────────────────────────────────────────────

function Section({
  title, badge, to, icon, children, noPad = false,
}: {
  title: string; badge?: number; to?: string
  icon?: React.ReactNode; children: React.ReactNode; noPad?: boolean
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-5 pt-4 pb-3.5">
        {icon && <span className="text-slate-400 flex-shrink-0">{icon}</span>}
        <span className="text-[13.5px] font-semibold text-slate-900 flex-1">{title}</span>
        {badge !== undefined && badge > 0 && (
          <span className="text-[10.5px] font-semibold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-md tabular-nums">{badge}</span>
        )}
        {to && (
          <Link to={to} className="text-[11.5px] text-indigo-500 hover:text-indigo-700 font-semibold transition-colors ml-1">
            View all
          </Link>
        )}
      </div>
      <div className="h-px bg-slate-100"/>
      {noPad ? children : <div>{children}</div>}
    </div>
  )
}

// ─── Task list row ────────────────────────────────────────────────────────────

function TRow({ task, today, onClick }: { task: Task; today: Date; onClick: () => void }) {
  const overdue  = !!(task.dueDate && new Date(task.dueDate) < today && isActive(task.status))
  const dueToday = !!(task.dueDate && new Date(task.dueDate).toDateString() === today.toDateString() && !overdue)
  const prioColor = PRIO_COLOR[task.priority] ?? '#cbd5e1'

  return (
    <div onClick={onClick} className="flex items-center gap-0 group hover:bg-slate-50/80 transition-colors cursor-pointer">
      {/* Priority stripe */}
      <div className="w-[3px] self-stretch flex-shrink-0" style={{ backgroundColor: overdue ? '#f43f5e' : prioColor }}/>
      <div className="flex items-center gap-3 flex-1 min-w-0 px-4 py-3">
        {/* Checkbox circle */}
        <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 transition-colors ${
          overdue ? 'border-rose-400' : 'border-slate-300 group-hover:border-indigo-400'
        }`}/>
        <div className="flex-1 min-w-0">
          <p className={`text-[12.5px] font-medium truncate leading-snug transition-colors group-hover:text-indigo-700 ${
            overdue ? 'text-rose-700' : 'text-slate-800'
          }`}>
            {task.subject}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {task.project && (
              <span className="text-[10.5px] text-slate-400 truncate max-w-[110px]">{task.project}</span>
            )}
            {task.project && task.dueDate && <span className="text-slate-200 text-[9px]">●</span>}
            {task.dueDate && (
              <span className={`text-[10.5px] font-medium flex-shrink-0 ${
                overdue ? 'text-rose-500' : dueToday ? 'text-amber-600' : 'text-slate-400'
              }`}>
                {overdue ? `Overdue · ${fmtShort(task.dueDate)}` : dueToday ? 'Due today' : `Due ${fmtShort(task.dueDate)}`}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {task.assignedTo[0] && (
            <div
              className="w-[22px] h-[22px] rounded-full flex items-center justify-center text-white text-[8px] font-bold ring-2 ring-white flex-shrink-0"
              style={{ backgroundColor: avBg(task.assignedTo[0]) }}
            >
              {avInits(task.assignedTo[0])}
            </div>
          )}
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap ${sChip(task.status)}`}>
            {task.status}
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function DashboardPage() {
  const navigate = useNavigate()
  const user     = useAuthStore((s) => s.user)
  const projects = useWorkStore((s) => s.projects)
  const tasks    = useWorkStore((s) => s.tasks)
  const wsStatus = useWorkStore((s) => s.status)

  const [tab, setTab] = useState<MyWorkTab>('all')

  const openTask = (taskId: string) => navigate('/tasks', { state: { taskId } })

  const loading  = wsStatus === 'loading'
  const username = user?.username ?? ''
  const fullName = user?.fullName ?? username
  const initials = fullName.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase() || '?'

  const today   = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d }, [])
  const weekEnd = useMemo(() => new Date(today.getTime() + 7  * 86_400_000), [today])
  const weekAgo = useMemo(() => new Date(today.getTime() - 7  * 86_400_000), [today])

  const dateLine = useMemo(() =>
    new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()),
  [])

  // ── My tasks ─────────────────────────────────────────────────────────────────
  const myAll     = useMemo(() => tasks.filter((t) => t.assignedTo.includes(username) || t.owner === username), [tasks, username])
  const myActive  = useMemo(() => myAll.filter((t) => isActive(t.status)), [myAll])
  const myOverdue = useMemo(() => myActive.filter((t) => t.dueDate && new Date(t.dueDate) < today), [myActive, today])
  const myToday   = useMemo(() => myActive.filter((t) => t.dueDate && new Date(t.dueDate).toDateString() === today.toDateString()), [myActive, today])
  const myWeek    = useMemo(() => myActive.filter((t) => { if (!t.dueDate) return false; const d = new Date(t.dueDate); return d >= today && d <= weekEnd }), [myActive, today, weekEnd])


  // ── Donut (user's tasks only) ─────────────────────────────────────────────────
  const { segs: donutSegs, total: donutTotal } = useMemo(() => buildDonut(myAll, today), [myAll, today])

  const displayed = useMemo(() => {
    const base = tab === 'overdue' ? myOverdue : tab === 'today' ? myToday : tab === 'week' ? myWeek : myActive
    return [...base].sort((a, b) => {
      const ao = a.dueDate && new Date(a.dueDate) < today
      const bo = b.dueDate && new Date(b.dueDate) < today
      if (ao && !bo) return -1; if (!ao && bo) return 1
      if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
      if (a.dueDate) return -1; if (b.dueDate) return 1
      return (PRIO_ORDER[a.priority] ?? 9) - (PRIO_ORDER[b.priority] ?? 9)
    })
  }, [tab, myActive, myOverdue, myToday, myWeek, today])

  // ── KPIs (all scoped to logged-in user) ──────────────────────────────────────
  const kpi = useMemo(() => {
    const doneWeek = myAll.filter((t) => t.completedOn && new Date(t.completedOn) >= weekAgo).length
    // projects store is already pre-filtered to user's projects by getAssignedProjects
    const atRisk = projects.filter((p) => computeHealth(p, tasks, today) !== 'on-track').length
    return {
      myActive:  myActive.length,
      myOverdue: myOverdue.length,
      doneWeek,
      dueToday:  myToday.length,
      dueWeek:   myWeek.length,
      doneAll:   doneWeek,
      atRisk,
    }
  }, [myAll, myActive, myOverdue, myToday, myWeek, projects, tasks, today, weekAgo])

  // ── Project health (projects store is already user-scoped) ───────────────────
  const projHealth = useMemo(() =>
    [...projects]
      .map((p) => ({ p, h: computeHealth(p, tasks, today) }))
      .sort((a, b) => ({ delayed: 0, 'at-risk': 1, 'on-track': 2 }[a.h] - { delayed: 0, 'at-risk': 1, 'on-track': 2 }[b.h])),
  [projects, tasks, today])

  // ── Blocked (user's tasks only) ───────────────────────────────────────────────
  const blocked = useMemo(() => myAll.filter((t) => t.dependsOnTasks && isActive(t.status)).slice(0, 5), [myAll])

  // ── Activity (logged-in user only) ───────────────────────────────────────────
  const feed = useMemo(() =>
    tasks
      .filter((t) => {
        if (!t.updatedAt || new Date(t.updatedAt) < weekAgo) return false
        const actor = t.completedBy ?? t.assignedTo[0] ?? t.owner ?? ''
        return actor === username
      })
      .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
      .slice(0, 10)
      .map((t) => {
        const actor = t.completedBy ?? t.assignedTo[0] ?? t.owner ?? '?'
        const s = t.status.toLowerCase()
        const verb = s.includes('complet') ? 'completed' : s === 'working' ? 'started' : s.includes('pending') ? 'sent for review' : 'updated'
        return { id: t.id, actor, verb, task: t.subject, when: t.updatedAt, bg: avBg(actor) }
      }),
  [tasks, username, weekAgo])

  const TABS: { id: MyWorkTab; label: string; count: number }[] = [
    { id: 'all',     label: 'All',       count: myActive.length   },
    { id: 'overdue', label: 'Overdue',   count: myOverdue.length  },
    { id: 'today',   label: 'Due Today', count: myToday.length    },
    { id: 'week',    label: 'This Week', count: myWeek.length     },
  ]

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="px-5 pt-6 pb-12 md:px-8 max-w-[1440px] animate-fade-in">

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-7">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"/>
              <span className="text-[11.5px] text-slate-400 font-medium">{dateLine}</span>
            </div>
            <h1 className="text-[22px] font-bold text-slate-900 tracking-tight leading-none">
              {greeting()}, {fullName.split(' ')[0] || 'there'} 👋
            </h1>
            {!loading && (
              <p className="text-[12px] text-slate-400 mt-1.5">
                {myActive.length} active task{myActive.length !== 1 ? 's' : ''} · {projects.length} project{projects.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-[13px] leading-none shadow-sm flex-shrink-0"
            style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
          >
            {initials}
          </div>
        </div>

        {/* ── KPI row ──────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3.5 mb-7">

          {[
            {
              label: 'My Active Tasks', num: kpi.myActive,
              sub: kpi.myOverdue > 0
                ? <span className="text-rose-500 font-semibold">{kpi.myOverdue} overdue</span>
                : <span className="text-emerald-600 font-medium">All on track</span>,
              icon: (
                <svg fill="none" viewBox="0 0 16 16" width="15" height="15" className="text-indigo-600">
                  <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M5 7.5h6M5 10h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              ),
              accent: 'bg-indigo-50', alert: false,
            },
            {
              label: 'Due Today', num: kpi.dueToday,
              sub: <span>{kpi.dueWeek} more this week</span>,
              icon: (
                <svg fill="none" viewBox="0 0 16 16" width="15" height="15" className={kpi.dueToday > 0 ? 'text-amber-500' : 'text-slate-400'}>
                  <rect x="2" y="2.5" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M2 6.5h12M5.5 1v3M10.5 1v3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5"/>
                </svg>
              ),
              accent: kpi.dueToday > 0 ? 'bg-amber-50' : 'bg-slate-50', alert: kpi.dueToday > 0,
            },
            {
              label: 'Overdue', num: kpi.myOverdue,
              sub: kpi.atRisk > 0
                ? <span className="text-amber-500 font-semibold">{kpi.atRisk} projects at risk</span>
                : <span>No projects at risk</span>,
              icon: (
                <svg fill="none" viewBox="0 0 16 16" width="15" height="15" className={kpi.myOverdue > 0 ? 'text-rose-500' : 'text-slate-400'}>
                  <path d="M8 2L14 13H2L8 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                  <path d="M8 6.5v3M8 11.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              ),
              accent: kpi.myOverdue > 0 ? 'bg-rose-50' : 'bg-slate-50', alert: kpi.myOverdue > 0,
            },
            {
              label: 'Done This Week', num: kpi.doneWeek,
              sub: <span>{kpi.doneAll} total completed</span>,
              icon: (
                <svg fill="none" viewBox="0 0 16 16" width="15" height="15" className="text-emerald-600">
                  <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M5.5 8.5l2 2 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ),
              accent: 'bg-emerald-50', alert: false,
            },
          ].map((c) => (
            <div
              key={c.label}
              className={`bg-white rounded-2xl border shadow-card p-4 transition-shadow hover:shadow-elevated ${
                c.alert ? 'border-rose-200' : 'border-slate-200/70'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11.5px] font-medium text-slate-500">{c.label}</span>
                <div className={`w-7 h-7 rounded-xl ${c.accent} flex items-center justify-center flex-shrink-0`}>
                  {c.icon}
                </div>
              </div>
              <p className={`text-[30px] font-bold leading-none tabular-nums ${
                loading ? 'text-slate-200' : c.alert && (c.num as number) > 0 ? 'text-rose-600' : 'text-slate-900'
              }`}>
                {loading ? '—' : c.num as number}
              </p>
              <p className="text-[11px] text-slate-400 mt-2">{loading ? '—' : c.sub}</p>
            </div>
          ))}
        </div>

        {/* ── Two-column layout ─────────────────────────────────────────────── */}
        <div className="flex flex-col xl:flex-row gap-5 items-start">

          {/* LEFT (wider) */}
          <div className="flex-1 min-w-0 space-y-5">

            {/* My Work */}
            <Section
              title="My Work"
              badge={myActive.length}
              to="/tasks"
              noPad
              icon={<svg fill="none" viewBox="0 0 14 14" width="13" height="13"><path d="M2 4h10M2 7.5h7M2 11h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>}
            >
              {/* Tabs */}
              <div className="flex items-center border-b border-slate-100 px-5 overflow-x-auto scrollbar-none">
                {TABS.map((t) => (
                  <button
                    key={t.id} type="button" onClick={() => setTab(t.id)}
                    className={[
                      'flex items-center gap-1.5 px-3 py-3 text-[12px] font-semibold border-b-[2px] -mb-px transition-colors whitespace-nowrap flex-shrink-0',
                      tab === t.id ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600',
                    ].join(' ')}
                  >
                    {t.label}
                    {t.count > 0 && (
                      <span className={[
                        'min-w-[17px] h-[17px] px-1 rounded-full text-[9px] font-bold flex items-center justify-center leading-none',
                        t.id === 'overdue' && t.count > 0 ? 'bg-rose-500 text-white'
                          : tab === t.id ? 'bg-indigo-100 text-indigo-700'
                          : 'bg-slate-100 text-slate-500',
                      ].join(' ')}>
                        {t.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {loading
                ? <div>{Array.from({ length: 5 }).map((_, i) => <SkRow key={i}/>)}</div>
                : displayed.length === 0
                  ? <Blank
                      icon={<svg fill="none" viewBox="0 0 20 20" width="20" height="20"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>}
                      title={tab === 'overdue' ? 'No overdue tasks!' : tab === 'today' ? 'Nothing due today' : tab === 'week' ? 'All clear this week!' : 'No active tasks'}
                      sub={tab === 'all' ? 'Tasks assigned to you will appear here' : undefined}
                    />
                  : (
                    <div className="divide-y divide-slate-100">
                      {displayed.slice(0, 12).map((t) => <TRow key={t.id} task={t} today={today} onClick={() => openTask(t.id)}/>)}
                      {displayed.length > 12 && (
                        <div className="px-5 py-3">
                          <Link to="/tasks" className="text-[12px] text-indigo-500 hover:text-indigo-700 font-semibold">
                            +{displayed.length - 12} more tasks →
                          </Link>
                        </div>
                      )}
                    </div>
                  )
              }
            </Section>

            {/* Project Health */}
            <Section
              title="Project Health"
              badge={projects.length}
              to="/projects"
              noPad
              icon={<svg fill="none" viewBox="0 0 14 14" width="13" height="13"><rect x="1" y="7" width="3" height="6" rx="0.5" fill="currentColor" opacity=".5"/><rect x="5.5" y="4" width="3" height="9" rx="0.5" fill="currentColor" opacity=".7"/><rect x="10" y="1" width="3" height="12" rx="0.5" fill="currentColor"/></svg>}
            >
              {loading ? (
                <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 bg-slate-100 rounded-xl animate-pulse"/>)}
                </div>
              ) : projects.length === 0 ? (
                <Blank icon={<svg fill="none" viewBox="0 0 20 20" width="20" height="20"><rect x="3" y="4" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.4"/><path d="M7 4V2m6 2V2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>} title="No projects yet"/>
              ) : (
                <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {projHealth.map(({ p, h }) => {
                    const cfg  = HEALTH[h]
                    const pct  = Math.min(p.completion ?? 0, 100)
                    const open = tasks.filter((t) => (t.project === p.id || t.project === p.name) && isActive(t.status)).length
                    return (
                      <div key={p.id} className={`border-l-4 ${cfg.borderL} bg-white border border-slate-100 rounded-xl p-4 hover:shadow-sm transition-shadow`}>
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className="min-w-0">
                            <p className="text-[12.5px] font-semibold text-slate-800 truncate">{p.displayName}</p>
                            {p.expectedEndDate && (
                              <p className="text-[10.5px] text-slate-400 mt-0.5">Due {fmtShort(p.expectedEndDate)}</p>
                            )}
                          </div>
                          <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${cfg.bg} ${cfg.text}`}>
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.color }}/>
                            {cfg.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full ${cfg.bar} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }}/>
                          </div>
                          <span className="text-[11px] font-bold text-slate-600 w-8 text-right tabular-nums">{pct}%</span>
                          <span className="text-[10px] text-slate-400">{open} open</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Section>

            {/* Blocked */}
            {!loading && blocked.length > 0 && (
              <Section
                title="Blocked Work"
                badge={blocked.length}
                noPad
                icon={<svg fill="none" viewBox="0 0 14 14" width="13" height="13"><path d="M7 1.5L12 11H2L7 1.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><path d="M7 5.5v2.5M7 9.5v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>}
              >
                <div className="divide-y divide-slate-100">
                  {blocked.map((t) => (
                    <div key={t.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/80 transition-colors">
                      <div className="w-5 h-5 rounded-lg bg-rose-50 flex items-center justify-center flex-shrink-0">
                        <svg fill="none" viewBox="0 0 10 10" width="9" height="9" className="text-rose-500">
                          <path d="M5 1.5L9.5 9H.5L5 1.5z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round"/>
                          <path d="M5 4v2M5 7.5v.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12.5px] font-medium text-slate-800 truncate">{t.subject}</p>
                        <p className="text-[10.5px] text-slate-400 mt-0.5 truncate">Waiting on: {t.dependsOnTasks}</p>
                      </div>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${sChip(t.status)}`}>{t.status}</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

          </div>{/* end left */}

          {/* RIGHT sidebar */}
          <div className="w-full xl:w-[308px] flex-shrink-0 space-y-4">

            {/* Task Overview — donut */}
            <Section
              title="Task Overview"
              noPad
              icon={<svg fill="none" viewBox="0 0 14 14" width="13" height="13"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3"/><path d="M7 1.5A5.5 5.5 0 0112.5 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>}
            >
              {loading ? (
                <div className="flex items-center gap-5 p-5 animate-pulse">
                  <div className="w-32 h-32 rounded-full bg-slate-100 flex-shrink-0"/>
                  <div className="flex-1 space-y-2.5">
                    {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-3 bg-slate-100 rounded-full"/>)}
                  </div>
                </div>
              ) : donutTotal === 0 ? (
                <Blank icon={<svg fill="none" viewBox="0 0 20 20" width="18" height="18"><circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.4"/></svg>} title="No tasks yet"/>
              ) : (
                <div className="p-5">
                  {/* Chart + legend row */}
                  <div className="flex items-center gap-5">
                    <DonutChart segs={donutSegs} total={donutTotal}/>
                    <div className="flex-1 space-y-2 min-w-0">
                      {donutSegs.filter((s) => s.value > 0).map((seg) => (
                        <div key={seg.label} className="flex items-center gap-2 min-w-0">
                          <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: seg.color }}/>
                          <span className="text-[11px] text-slate-600 flex-1 truncate">{seg.label}</span>
                          <span className="text-[11.5px] font-bold text-slate-800 tabular-nums">{seg.value}</span>
                          <span className="text-[10px] text-slate-400 w-7 text-right tabular-nums">{Math.round(seg.pct)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Stacked bar */}
                  <div className="mt-4 flex h-2 rounded-full overflow-hidden gap-px">
                    {donutSegs.filter((s) => s.value > 0).map((seg) => (
                      <div key={seg.label} className="h-full transition-all duration-700 first:rounded-l-full last:rounded-r-full"
                        style={{ width: `${seg.pct}%`, backgroundColor: seg.color }}/>
                    ))}
                  </div>
                </div>
              )}
            </Section>

            {/* Snapshot */}
            <Section
              title="This Week"
              noPad
              icon={<svg fill="none" viewBox="0 0 14 14" width="13" height="13"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3"/><path d="M7 4v3.5l2 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            >
              <div className="divide-y divide-slate-50">
                {[
                  { label: 'Due today',      value: kpi.dueToday, highlight: kpi.dueToday > 0 ? 'text-amber-600 font-bold' : '',   dot: '#f59e0b' },
                  { label: 'Due this week',  value: kpi.dueWeek,  highlight: '',                                                      dot: '#6366f1' },
                  { label: 'Completed',      value: kpi.doneAll,  highlight: kpi.doneAll > 0 ? 'text-emerald-600 font-bold' : '',   dot: '#10b981' },
                ].map((row) => (
                  <div key={row.label} className="flex items-center gap-3 px-5 py-3.5">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: row.dot }}/>
                    <span className="flex-1 text-[12.5px] text-slate-500">{row.label}</span>
                    <span className={`text-[14px] tabular-nums text-slate-800 ${row.highlight}`}>{loading ? '—' : row.value}</span>
                  </div>
                ))}
              </div>
            </Section>

            {/* Activity feed */}
            <Section
              title="Recent Activity"
              noPad
              icon={<svg fill="none" viewBox="0 0 14 14" width="13" height="13"><path d="M1 7h2l2-4 3 8 2-4h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            >
              {loading ? (
                <div className="px-5 py-4 space-y-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex gap-3 animate-pulse">
                      <div className="w-7 h-7 rounded-full bg-slate-100 flex-shrink-0"/>
                      <div className="flex-1 space-y-2 pt-1"><div className="h-2.5 bg-slate-100 rounded-full"/><div className="h-2 bg-slate-100 rounded-full w-1/2"/></div>
                    </div>
                  ))}
                </div>
              ) : feed.length === 0 ? (
                <Blank icon={<svg fill="none" viewBox="0 0 20 20" width="18" height="18"><path d="M3 5h14M3 10h14M3 15h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>} title="No recent activity"/>
              ) : (
                <div className="px-5 py-4 space-y-4 max-h-[340px] overflow-y-auto scrollbar-none">
                  {feed.map((ev, i) => {
                    const name = ev.actor.split('@')[0].replace('.', ' ').split(' ').map((w) => w[0]?.toUpperCase() + w.slice(1)).join(' ')
                    return (
                      <div key={`${ev.id}-${i}`} className="flex gap-3">
                        <div className="flex flex-col items-center flex-shrink-0">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[9px] font-bold"
                            style={{ backgroundColor: ev.bg }}>
                            {avInits(ev.actor)}
                          </div>
                          {i < feed.length - 1 && <div className="w-px flex-1 bg-slate-100 mt-1.5"/>}
                        </div>
                        <div className="flex-1 min-w-0 pb-1">
                          <p className="text-[12px] text-slate-700 leading-snug">
                            <span className="font-semibold text-slate-900">{name}</span>
                            {' '}<span className="text-slate-500">{ev.verb}</span>
                          </p>
                          <p className="text-[11px] text-slate-500 truncate mt-0.5 font-medium">{ev.task}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{fmtRelative(ev.when)}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Section>

          </div>{/* end right */}
        </div>
      </div>
    </div>
  )
}
