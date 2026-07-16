import { useMemo, useState } from 'react'
import { useWorkStore } from '../../../store/workStore'
import type { Task } from '../../tasks/types/task.types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const isActiveStatus = (s: string) =>
  !s.toLowerCase().includes('complet') &&
  s.toLowerCase() !== 'cancelled'    &&
  s.toLowerCase() !== 'closed'

function sol(d: Date) { const r = new Date(d); r.setHours(0, 0, 0, 0); return r }

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return d < 7 ? `${d}d ago` : new Date(dateStr).toLocaleDateString('en', { month: 'short', day: 'numeric' })
}

function userInitials(s: string) {
  return s.replace(/[@.]/g, ' ').split(/\s+/).filter(Boolean).map((p) => p[0]).join('').toUpperCase().slice(0, 2)
}

const STATUS_COLOR: Record<string, string> = {
  Completed:       '#22C55E',
  Working:         '#3B82F6',
  'Pending Review':'#7B3FF2',
  Overdue:         '#EF4444',
  Cancelled:       '#9CA3AF',
  Open:            '#6B7280',
}
function statusColor(s: string) { return STATUS_COLOR[s] ?? '#6B7280' }

const AVATAR_PALETTE = ['#7B3FF2','#2563EB','#0891B2','#059669','#D97706','#EC4899','#EF4444','#8B5CF6']
function avatarColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length]
}

// ─── SVG Burnup Chart ────────────────────────────────────────────────────────

interface ChartPoint { label: string; expected: number; actual: number }

function BurnupChart({ points }: { points: ChartPoint[] }) {
  if (points.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 180, color: '#9CA3AF', fontSize: 13 }}>
        No dated tasks in this project yet
      </div>
    )
  }

  const VW = 560, VH = 180
  const M  = { top: 16, right: 16, bottom: 36, left: 44 }
  const pw = VW - M.left - M.right
  const ph = VH - M.top  - M.bottom
  const maxY = Math.max(...points.map((p) => Math.max(p.expected, p.actual)), 1)

  const xOf  = (i: number) => M.left + (i / Math.max(points.length - 1, 1)) * pw
  const eyOf = (v: number) => M.top  + ph - (v / maxY) * ph
  const ayOf = (v: number) => M.top  + ph - (v / maxY) * ph

  const eLine = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${eyOf(p.expected).toFixed(1)}`).join(' ')
  const aLine = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${ayOf(p.actual).toFixed(1)}`).join(' ')

  // Purple gradient fill under actual line
  const aArea = [
    `M${xOf(0).toFixed(1)},${(M.top + ph).toFixed(1)}`,
    ...points.map((p, i) => `L${xOf(i).toFixed(1)},${ayOf(p.actual).toFixed(1)}`),
    `L${xOf(points.length - 1).toFixed(1)},${(M.top + ph).toFixed(1)} Z`,
  ].join(' ')

  // Red gap area where actual < expected
  const gapArea = [
    ...points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${eyOf(p.expected).toFixed(1)}`),
    ...[...points].reverse().map((p, i) => `L${xOf(points.length - 1 - i).toFixed(1)},${ayOf(p.actual).toFixed(1)}`),
    'Z',
  ].join(' ')

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    y: M.top + ph * (1 - f),
    label: String(Math.round(f * maxY)),
  }))

  const step = Math.max(1, Math.ceil(points.length / 6))

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} style={{ width: '100%', height: 180 }}>
      <defs>
        <linearGradient id="pd-ag" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#7B3FF2" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#7B3FF2" stopOpacity="0"    />
        </linearGradient>
        <linearGradient id="pd-rg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#EF4444" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#EF4444" stopOpacity="0"    />
        </linearGradient>
        <clipPath id="pd-clip">
          <rect x={M.left} y={M.top} width={pw} height={ph} />
        </clipPath>
      </defs>

      {/* Grid */}
      {yTicks.map((t, i) => (
        <line key={i} x1={M.left} y1={t.y} x2={VW - M.right} y2={t.y} stroke="#F3F4F6" strokeWidth="1" />
      ))}

      {/* Y-axis labels */}
      {yTicks.map((t, i) => (
        <text key={i} x={M.left - 6} y={t.y + 4} textAnchor="end" style={{ fontSize: 9, fill: '#9CA3AF', fontFamily: 'inherit' }}>
          {t.label}
        </text>
      ))}

      {/* X-axis labels */}
      {points.map((p, i) => i % step === 0 && (
        <text key={i} x={xOf(i)} y={VH - 6} textAnchor="middle" style={{ fontSize: 9, fill: '#9CA3AF', fontFamily: 'inherit' }}>
          {p.label}
        </text>
      ))}

      {/* Red gap fill (expected > actual = lagging) */}
      <path d={gapArea} fill="url(#pd-rg)" clipPath="url(#pd-clip)" />

      {/* Purple area fill */}
      <path d={aArea} fill="url(#pd-ag)" clipPath="url(#pd-clip)" />

      {/* Expected line (gray dashed = plan) */}
      <path d={eLine} fill="none" stroke="#CBD5E1" strokeWidth="1.5" strokeDasharray="5 3" clipPath="url(#pd-clip)" />

      {/* Actual line (purple solid = reality) */}
      <path d={aLine} fill="none" stroke="#7B3FF2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" clipPath="url(#pd-clip)" />

      {/* Latest actual dot */}
      {points.length > 0 && (
        <circle
          cx={xOf(points.length - 1)}
          cy={ayOf(points[points.length - 1].actual)}
          r="4" fill="#7B3FF2"
          style={{ filter: 'drop-shadow(0 0 4px rgba(123,63,242,0.4))' }}
        />
      )}
    </svg>
  )
}

// ─── Mini Avatar ─────────────────────────────────────────────────────────────

function Avatar({ name, size = 24 }: { name: string; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: avatarColor(name),
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.36, fontWeight: 700, color: 'white', flexShrink: 0,
    }}>
      {userInitials(name)}
    </div>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, accent, icon,
}: { label: string; value: string | number; sub?: string; accent: string; icon: React.ReactNode }) {
  return (
    <div style={{ background: 'white', border: '1px solid #F3F4F6', borderRadius: 12, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9CA3AF' }}>{label}</span>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: `${accent}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: accent, flexShrink: 0 }}>
          {icon}
        </div>
      </div>
      <div>
        <span style={{ fontSize: 28, fontWeight: 700, color: '#111827', lineHeight: 1 }}>{value}</span>
        {sub && <span style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 6 }}>{sub}</span>}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ProjectDashboardPage() {
  const tasks    = useWorkStore((s) => s.tasks)
  const projects = useWorkStore((s) => s.projects)

  const today = useMemo(() => sol(new Date()), [])
  const [selectedProject, setSelectedProject] = useState<string>('all')

  const projTasks = useMemo(
    () => selectedProject === 'all' ? tasks : tasks.filter((t) => t.project === selectedProject),
    [tasks, selectedProject],
  )

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const total      = projTasks.length
    const done       = projTasks.filter((t) => !isActiveStatus(t.status)).length
    const overdue    = projTasks.filter((t) => t.dueDate && isActiveStatus(t.status) && sol(new Date(t.dueDate)) < today).length
    const inProgress = projTasks.filter((t) => t.status === 'Working').length
    const members    = new Set(projTasks.flatMap((t) => [...t.assignedTo, ...(t.owner ? [t.owner] : [])]).filter(Boolean)).size
    const pct        = total ? Math.round((done / total) * 100) : 0
    return { total, done, overdue, inProgress, members, pct }
  }, [projTasks, today])

  // ── Burnup chart data (last 45 days) ──────────────────────────────────────
  const chartPoints = useMemo((): ChartPoint[] => {
    const pts: ChartPoint[] = []
    for (let i = 44; i >= 0; i--) {
      const day = sol(new Date())
      day.setDate(day.getDate() - i)

      const expected = projTasks.filter((t) => {
        if (!t.dueDate) return false
        return sol(new Date(t.dueDate)) <= day
      }).length

      const actual = projTasks.filter((t) => {
        if (isActiveStatus(t.status)) return false
        const at = t.completedOn
          ? sol(new Date(t.completedOn))
          : t.updatedAt
          ? sol(new Date(t.updatedAt))
          : null
        return at ? at <= day : false
      }).length

      pts.push({
        label: i % 7 === 0
          ? day.toLocaleDateString('en', { month: 'short', day: 'numeric' })
          : '',
        expected,
        actual,
      })
    }
    // Re-label with evenly spaced labels regardless
    const step = Math.ceil(pts.length / 6)
    pts.forEach((p, i) => {
      if (i % step !== 0) p.label = ''
      else {
        const day = sol(new Date())
        day.setDate(day.getDate() - (44 - i))
        p.label = day.toLocaleDateString('en', { month: 'short', day: 'numeric' })
      }
    })
    return pts
  }, [projTasks])

  // Gap % at latest point
  const latestGap = useMemo(() => {
    if (!chartPoints.length) return 0
    const last = chartPoints[chartPoints.length - 1]
    return last.expected > 0 ? Math.round(((last.expected - last.actual) / last.expected) * 100) : 0
  }, [chartPoints])

  // ── Lagging tasks (overdue + active) ──────────────────────────────────────
  type LaggingTask = Task & { daysLate: number }
  const laggingTasks = useMemo((): LaggingTask[] =>
    projTasks
      .filter((t) => t.dueDate && isActiveStatus(t.status) && sol(new Date(t.dueDate)) < today)
      .map((t) => ({
        ...t,
        daysLate: Math.floor((today.getTime() - sol(new Date(t.dueDate!)).getTime()) / 86_400_000),
      }))
      .sort((a, b) => b.daysLate - a.daysLate),
    [projTasks, today],
  )

  // Group lagging tasks by responsible person
  const laggingByPerson = useMemo(() => {
    const map = new Map<string, { name: string; tasks: LaggingTask[] }>()
    laggingTasks.forEach((t) => {
      const persons = t.assignedTo.length > 0 ? t.assignedTo : (t.owner ? [t.owner] : ['Unassigned'])
      persons.forEach((name) => {
        if (!map.has(name)) map.set(name, { name, tasks: [] })
        map.get(name)!.tasks.push(t)
      })
    })
    return [...map.values()].sort((a, b) => b.tasks.length - a.tasks.length)
  }, [laggingTasks])

  // ── Member workload ────────────────────────────────────────────────────────
  const workload = useMemo(() => {
    const map = new Map<string, { name: string; total: number; done: number; overdue: number }>()
    projTasks.forEach((t) => {
      const persons = t.assignedTo.length > 0 ? t.assignedTo : (t.owner ? [t.owner] : [])
      persons.forEach((name) => {
        if (!map.has(name)) map.set(name, { name, total: 0, done: 0, overdue: 0 })
        const e = map.get(name)!
        e.total++
        if (!isActiveStatus(t.status)) e.done++
        if (t.dueDate && isActiveStatus(t.status) && sol(new Date(t.dueDate)) < today) e.overdue++
      })
    })
    return [...map.values()].filter((m) => m.total > 0).sort((a, b) => b.total - a.total).slice(0, 8)
  }, [projTasks, today])

  // ── Status distribution ────────────────────────────────────────────────────
  const statusDist = useMemo(() => {
    const counts: Record<string, number> = {}
    projTasks.forEach((t) => { counts[t.status] = (counts[t.status] ?? 0) + 1 })
    return Object.entries(counts)
      .map(([status, count]) => ({ status, count, color: statusColor(status) }))
      .sort((a, b) => b.count - a.count)
  }, [projTasks])

  // ── Live activity feed ────────────────────────────────────────────────────
  const activity = useMemo(() =>
    [...tasks]
      .filter((t) => t.updatedAt && (selectedProject === 'all' || t.project === selectedProject))
      .sort((a, b) => new Date(b.updatedAt!).getTime() - new Date(a.updatedAt!).getTime())
      .slice(0, 20),
    [tasks, selectedProject],
  )

  // ── Panel card wrapper ────────────────────────────────────────────────────
  const card = (children: React.ReactNode, style?: React.CSSProperties) => (
    <div style={{ background: 'white', border: '1px solid #F3F4F6', borderRadius: 12, overflow: 'hidden', ...style }}>
      {children}
    </div>
  )

  const panelHead = (title: string, badge?: string | number) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 18px', borderBottom: '1px solid #F9FAFB' }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: '#111827', flex: 1 }}>{title}</span>
      {badge !== undefined && (
        <span style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', background: '#F3F4F6', borderRadius: 999, padding: '2px 8px' }}>{badge}</span>
      )}
    </div>
  )

  return (
    <main className="animate-fade-in" style={{ flex: 1, overflowY: 'auto', background: '#FAFAFA', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: 0 }}>Project Dashboard</h1>
          <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>Expected vs actual • Blockers • Team workload • Live activity</p>
        </div>

        {/* Project selector */}
        <select
          value={selectedProject}
          onChange={(e) => setSelectedProject(e.target.value)}
          style={{
            height: 34, padding: '0 10px', fontSize: 12.5, fontWeight: 500,
            border: '1px solid #E5E7EB', borderRadius: 8, background: 'white',
            color: '#374151', cursor: 'pointer', minWidth: 160,
          }}
        >
          <option value="all">All Projects</option>
          {projects.map((p) => (
            <option key={p.name} value={p.name}>{p.displayName || p.name}</option>
          ))}
        </select>
      </div>

      {/* ── KPI row ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <KpiCard
          label="Total Tasks" value={kpis.total} accent="#7B3FF2"
          sub={`${kpis.pct}% done`}
          icon={<svg fill="none" viewBox="0 0 16 16" width={14} height={14}><path d="M4 5h8M4 8h8M4 11h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>}
        />
        <KpiCard
          label="Completed" value={kpis.done} accent="#22C55E"
          sub={`of ${kpis.total}`}
          icon={<svg fill="none" viewBox="0 0 16 16" width={14} height={14}><path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        />
        <KpiCard
          label="Overdue" value={kpis.overdue} accent="#EF4444"
          sub={kpis.overdue > 0 ? 'need attention' : 'all on track'}
          icon={<svg fill="none" viewBox="0 0 16 16" width={14} height={14}><circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5"/><path d="M8 5v4M8 11v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>}
        />
        <KpiCard
          label="Active Members" value={kpis.members} accent="#3B82F6"
          sub={`${kpis.inProgress} in progress`}
          icon={<svg fill="none" viewBox="0 0 16 16" width={14} height={14}><circle cx="6" cy="5.5" r="2" stroke="currentColor" strokeWidth="1.5"/><path d="M2 13c0-2.21 1.79-4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><circle cx="11.5" cy="5.5" r="2" stroke="currentColor" strokeWidth="1.5"/><path d="M10 13c0-1.1.45-2.1 1.18-2.82" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>}
        />
      </div>

      {/* ── Main grid ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 14, alignItems: 'start' }}>

        {/* LEFT COLUMN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Expected vs Actual chart */}
          {card(
            <>
              {panelHead('Progress vs Plan')}
              <div style={{ padding: '14px 18px 8px' }}>

                {/* Legend row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <svg width="20" height="4"><line x1="0" y1="2" x2="20" y2="2" stroke="#7B3FF2" strokeWidth="2.5" strokeLinecap="round"/></svg>
                    <span style={{ fontSize: 11, color: '#6B7280' }}>Actual completed</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <svg width="20" height="4"><line x1="0" y1="2" x2="20" y2="2" stroke="#CBD5E1" strokeWidth="2" strokeDasharray="4 3"/></svg>
                    <span style={{ fontSize: 11, color: '#6B7280' }}>Expected (plan)</span>
                  </div>
                  {latestGap > 0 && (
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#EF4444', flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: '#EF4444', fontWeight: 600 }}>{latestGap}% behind plan</span>
                    </div>
                  )}
                  {latestGap === 0 && chartPoints.length > 0 && (
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22C55E', flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: '#22C55E', fontWeight: 600 }}>On track</span>
                    </div>
                  )}
                </div>

                <BurnupChart points={chartPoints} />
              </div>
            </>,
          )}

          {/* Lagging tasks by person */}
          {card(
            <>
              {panelHead('Lagging Behind — Who\'s Affected?', laggingTasks.length)}
              {laggingTasks.length === 0 ? (
                <div style={{ padding: '28px 18px', textAlign: 'center', color: '#9CA3AF', fontSize: 12.5 }}>
                  No overdue tasks — project is on track
                </div>
              ) : (
                <div style={{ padding: '8px 0' }}>
                  {laggingByPerson.map(({ name, tasks: pt }) => (
                    <div key={name} style={{ padding: '10px 18px', borderBottom: '1px solid #F9FAFB' }}>

                      {/* Person header */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <Avatar name={name} size={28} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#111827' }}>{name}</div>
                          <div style={{ fontSize: 11, color: '#9CA3AF' }}>{pt.length} overdue task{pt.length > 1 ? 's' : ''}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#FEF2F2', borderRadius: 6, padding: '3px 8px' }}>
                          <svg fill="none" viewBox="0 0 12 12" width={10} height={10} style={{ color: '#EF4444' }}>
                            <path d="M6 2v4M6 8.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                            <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.3"/>
                          </svg>
                          <span style={{ fontSize: 10.5, fontWeight: 700, color: '#EF4444' }}>
                            {pt.reduce((s, t) => s + (t as LaggingTask).daysLate, 0)} days total
                          </span>
                        </div>
                      </div>

                      {/* Task list */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 38 }}>
                        {pt.slice(0, 3).map((t) => (
                          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 12, color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {t.subject}
                            </span>
                            <span style={{ fontSize: 10.5, fontWeight: 600, color: '#EF4444', flexShrink: 0 }}>
                              {(t as LaggingTask).daysLate}d late
                            </span>
                          </div>
                        ))}
                        {pt.length > 3 && (
                          <span style={{ fontSize: 11, color: '#9CA3AF' }}>+{pt.length - 3} more</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>,
          )}
        </div>

        {/* RIGHT COLUMN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Status distribution */}
          {card(
            <>
              {panelHead('Task Status')}
              <div style={{ padding: '10px 18px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {statusDist.length === 0
                  ? <span style={{ fontSize: 12, color: '#9CA3AF' }}>No tasks</span>
                  : statusDist.map(({ status, count, color }) => {
                    const pct = kpis.total ? Math.round((count / kpis.total) * 100) : 0
                    return (
                      <div key={status}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
                          <span style={{ fontSize: 11.5, color: '#374151', flex: 1 }}>{status}</span>
                          <span style={{ fontSize: 11, color: '#9CA3AF' }}>{count}</span>
                          <span style={{ fontSize: 10.5, color: '#9CA3AF', width: 28, textAlign: 'right' }}>{pct}%</span>
                        </div>
                        <div style={{ height: 4, background: '#F3F4F6', borderRadius: 99, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99, transition: 'width 400ms' }} />
                        </div>
                      </div>
                    )
                  })
                }
              </div>
            </>,
          )}

          {/* Member workload */}
          {card(
            <>
              {panelHead('Member Workload')}
              <div style={{ padding: '8px 0 4px', display: 'flex', flexDirection: 'column' }}>
                {workload.length === 0 ? (
                  <span style={{ fontSize: 12, color: '#9CA3AF', padding: '8px 18px' }}>No members assigned</span>
                ) : workload.map((m) => {
                  const donePct  = m.total ? Math.round((m.done   / m.total) * 100) : 0
                  return (
                    <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 18px', borderBottom: '1px solid #F9FAFB' }}>
                      <Avatar name={m.name} size={26} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <span style={{ fontSize: 11.5, fontWeight: 500, color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {m.name}
                          </span>
                          {m.overdue > 0 && (
                            <span style={{ fontSize: 9.5, fontWeight: 700, color: '#EF4444', background: '#FEF2F2', borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>
                              {m.overdue} late
                            </span>
                          )}
                          <span style={{ fontSize: 10, color: '#9CA3AF', flexShrink: 0 }}>{m.done}/{m.total}</span>
                        </div>
                        <div style={{ height: 4, background: '#F3F4F6', borderRadius: 99, overflow: 'hidden' }}>
                          <div style={{ height: '100%', display: 'flex' }}>
                            <div style={{ width: `${donePct}%`, background: '#22C55E', transition: 'width 400ms' }} />
                            {m.overdue > 0 && (
                              <div style={{ width: `${Math.round((m.overdue / m.total) * 100)}%`, background: '#EF4444', transition: 'width 400ms' }} />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>,
          )}

          {/* Live activity feed */}
          {card(
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 18px', borderBottom: '1px solid #F9FAFB' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#111827', flex: 1 }}>Live Activity</span>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22C55E', flexShrink: 0 }} />
                <span style={{ fontSize: 10.5, color: '#22C55E', fontWeight: 600 }}>Live</span>
              </div>
              <div style={{ maxHeight: 320, overflowY: 'auto' }} className="scrollbar-none">
                {activity.length === 0 ? (
                  <div style={{ padding: '20px 18px', fontSize: 12, color: '#9CA3AF' }}>No recent activity</div>
                ) : activity.map((t) => {
                  const actor = t.assignedTo[0] ?? t.owner ?? 'Unknown'
                  const sColor = statusColor(t.status)
                  return (
                    <div key={t.id + t.updatedAt} style={{ display: 'flex', gap: 10, padding: '9px 18px', borderBottom: '1px solid #F9FAFB', alignItems: 'flex-start' }}>
                      <Avatar name={actor} size={22} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11.5, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <span style={{ fontWeight: 600 }}>{actor.split('.')[0]}</span>
                          {' · '}
                          <span style={{ color: '#6B7280' }}>{t.subject}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                          <span style={{ fontSize: 10, fontWeight: 600, color: sColor, background: `${sColor}14`, borderRadius: 4, padding: '1px 5px' }}>
                            {t.status}
                          </span>
                          <span style={{ fontSize: 10, color: '#9CA3AF' }}>
                            {t.updatedAt ? timeAgo(t.updatedAt) : ''}
                          </span>
                          {t.project && (
                            <span style={{ fontSize: 10, color: '#9CA3AF', marginLeft: 'auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 80 }}>
                              {t.project}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>,
          )}

        </div>
      </div>

      <div style={{ height: 24 }} />
    </main>
  )
}
