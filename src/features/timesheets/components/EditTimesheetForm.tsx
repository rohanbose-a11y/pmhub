import { useEffect, useRef, useState, type FormEvent } from 'react'
import { KraCombobox } from '../../../shared/components/KraCombobox'
import { useKraOptions } from '../../../hooks/useKraOptions'
import { useAuthStore } from '../../../store/authStore'
import type { Task } from '../../tasks/types/task.types'
import type { Timesheet, TimesheetLogInput } from '../types/timesheet.types'

interface EditTimesheetFormProps {
  timesheet: Timesheet
  tasks?: Task[]
  isSubmitting: boolean
  serverError: string | null
  onSubmit: (id: string, input: { employee?: string; designation?: string; department?: string; reportingManager?: string; rm?: string; month?: string; startDate?: string; endDate?: string; note?: string; timeLogs: TimesheetLogInput[] }) => Promise<boolean>
  onCancel: () => void
  onSuccess: () => void
}

// ── Month helpers ─────────────────────────────────────────────────────────────
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']

function parseMonthRange(monthStr: string): { start: string; end: string } | null {
  const [name, yearStr] = monthStr.trim().split(' ')
  const monthIdx = MONTH_NAMES.indexOf(name)
  const year = parseInt(yearStr, 10)
  if (monthIdx === -1 || isNaN(year)) return null
  const start = new Date(year, monthIdx, 1)
  const end = new Date(year, monthIdx + 1, 0)
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  }
}

function taskOverlapsMonth(task: Task, range: { start: string; end: string }): boolean {
  const { start, end } = range
  // Task spans the month if it starts before month end AND ends after month start
  const taskStart = task.startDate ?? null
  const taskEnd = task.dueDate ?? null
  if (taskStart && taskEnd) return taskStart <= end && taskEnd >= start
  if (taskStart) return taskStart <= end
  if (taskEnd) return taskEnd >= start
  return true // no dates — always include active assigned tasks
}

// ── Date/time helpers ────────────────────────────────────────────────────────
/** "YYYY-MM-DD HH:MM:SS" → "YYYY-MM-DDTHH:MM" for datetime-local input */
function toInputDt(frappe: string | null): string {
  if (!frappe) return ''
  return frappe.replace(' ', 'T').slice(0, 16)
}
/** "YYYY-MM-DDTHH:MM" → "YYYY-MM-DD HH:MM:00" for Frappe */
function toFrappeDt(input: string): string {
  return input ? input.replace('T', ' ') + ':00' : ''
}

function calcHours(from: string, to: string): number | null {
  if (!from || !to) return null
  const diff = (new Date(to.replace(' ', 'T')).getTime() - new Date(from.replace(' ', 'T')).getTime()) / 3_600_000
  return diff > 0 ? Math.round(diff * 100) / 100 : null
}

// ── Shared UI helpers ────────────────────────────────────────────────────────
function SectionDivider({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-3 mt-6 mb-4 first:mt-0">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">{children}</span>
      <div className="flex-1 h-px bg-slate-100" />
    </div>
  )
}

function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: string }) {
  return (
    <label className="block text-xs font-semibold text-slate-600 mb-1.5" htmlFor={htmlFor}>
      {children}
    </label>
  )
}

const inputClass = 'w-full px-3.5 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 focus:bg-white transition-all'

// ── Empty log factory ────────────────────────────────────────────────────────
function emptyLog(): TimesheetLogInput & { _key: string } {
  return {
    _key: Math.random().toString(36).slice(2),
    activityType: '',
    task: '',
    project: '',
    fromTime: '',
    toTime: '',
    hours: undefined,
    description: '',
    isBillable: false,
    billingHours: undefined,
    billingRate: undefined,
  }
}

type LogRow = TimesheetLogInput & { _key: string }

// ── Time Log Row ─────────────────────────────────────────────────────────────
function TimeLogRow({
  row,
  index,
  kraOptions,
  kraLoading,
  expanded,
  onToggle,
  onDelete,
  onChange,
}: {
  row: LogRow
  index: number
  kraOptions: string[]
  kraLoading: boolean
  expanded: boolean
  onToggle: () => void
  onDelete: () => void
  onChange: (patch: Partial<LogRow>) => void
}) {
  const handleFromTime = (v: string) => {
    const fromTime = toFrappeDt(v)
    const hours = calcHours(fromTime, row.toTime || '') ?? row.hours
    onChange({ fromTime, hours })
  }

  const handleToTime = (v: string) => {
    const toTime = toFrappeDt(v)
    const hours = calcHours(row.fromTime || '', toTime) ?? row.hours
    onChange({ toTime, hours })
  }

  const summary = row.activityType
    ? row.activityType
    : row.fromTime
      ? new Date(row.fromTime.replace(' ', 'T')).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      : `Log ${index + 1}`

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
      {/* Row header — always visible */}
      <div className="flex items-center gap-3 px-3.5 py-3">
        <div className="w-6 h-6 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
          <svg className="w-3 h-3 text-violet-600" fill="none" viewBox="0 0 12 12">
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M6 3.5v2.5l1.5 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-700 truncate">{summary}</p>
          {row.hours != null && (
            <p className="text-xs text-slate-400">{row.hours}h</p>
          )}
        </div>
        <button
          className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition-colors flex-shrink-0"
          onClick={onToggle}
          title={expanded ? 'Collapse' : 'Edit'}
          type="button"
        >
          {expanded ? (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 12 12">
              <path d="M2 8l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 14 14">
              <path d="M10.586 2.414a2 2 0 0 1 2.83 2.829L5.243 13.414H2v-3.243L10.586 2.414z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
            </svg>
          )}
        </button>
        <button
          className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-500 transition-colors flex-shrink-0"
          onClick={onDelete}
          title="Remove"
          type="button"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 14 14">
            <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* Expanded edit fields */}
      {expanded && (
        <div className="px-3.5 pb-4 space-y-3 border-t border-slate-200">
          <div className="pt-3">
            <FieldLabel>KRA / Activity Type</FieldLabel>
            <KraCombobox
              loading={kraLoading}
              onChange={(v) => onChange({ activityType: v })}
              options={kraOptions}
              value={row.activityType || ''}
            />
          </div>

          <div>
            <FieldLabel htmlFor={`log-task-${row._key}`}>Task</FieldLabel>
            <input
              className={inputClass}
              id={`log-task-${row._key}`}
              onChange={(e) => onChange({ task: e.target.value })}
              placeholder="Task name or ID"
              value={row.task || ''}
            />
          </div>

          <div>
            <FieldLabel htmlFor={`log-project-${row._key}`}>Project</FieldLabel>
            <input
              className={inputClass}
              id={`log-project-${row._key}`}
              onChange={(e) => onChange({ project: e.target.value })}
              placeholder="Project name"
              value={row.project || ''}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel htmlFor={`log-from-${row._key}`}>From</FieldLabel>
              <input
                className={inputClass}
                id={`log-from-${row._key}`}
                onChange={(e) => handleFromTime(e.target.value)}
                type="datetime-local"
                value={toInputDt(row.fromTime || null)}
              />
            </div>
            <div>
              <FieldLabel htmlFor={`log-to-${row._key}`}>To</FieldLabel>
              <input
                className={inputClass}
                id={`log-to-${row._key}`}
                onChange={(e) => handleToTime(e.target.value)}
                type="datetime-local"
                value={toInputDt(row.toTime || null)}
              />
            </div>
          </div>

          <div>
            <FieldLabel htmlFor={`log-hours-${row._key}`}>Hours</FieldLabel>
            <input
              className={inputClass}
              id={`log-hours-${row._key}`}
              min={0}
              onChange={(e) => onChange({ hours: e.target.value === '' ? undefined : Number(e.target.value) })}
              placeholder="Auto-calculated or enter manually"
              step={0.25}
              type="number"
              value={row.hours ?? ''}
            />
          </div>

          <div>
            <FieldLabel htmlFor={`log-desc-${row._key}`}>Description</FieldLabel>
            <textarea
              className={`${inputClass} resize-none`}
              id={`log-desc-${row._key}`}
              onChange={(e) => onChange({ description: e.target.value })}
              placeholder="What did you work on?"
              rows={2}
              value={row.description || ''}
            />
          </div>

          {/* Billable toggle */}
          <label className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 select-none">
            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${row.isBillable ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 bg-white'}`}>
              {row.isBillable && (
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12">
                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            <input
              checked={!!row.isBillable}
              className="sr-only"
              onChange={(e) => onChange({ isBillable: e.target.checked })}
              type="checkbox"
            />
            <span className="text-sm font-medium text-slate-800">Billable</span>
          </label>

          {row.isBillable && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel htmlFor={`log-bhours-${row._key}`}>Billing hours</FieldLabel>
                <input
                  className={inputClass}
                  id={`log-bhours-${row._key}`}
                  min={0}
                  onChange={(e) => onChange({ billingHours: e.target.value === '' ? undefined : Number(e.target.value) })}
                  placeholder="0"
                  step={0.25}
                  type="number"
                  value={row.billingHours ?? ''}
                />
              </div>
              <div>
                <FieldLabel htmlFor={`log-brate-${row._key}`}>Rate</FieldLabel>
                <input
                  className={inputClass}
                  id={`log-brate-${row._key}`}
                  min={0}
                  onChange={(e) => onChange({ billingRate: e.target.value === '' ? undefined : Number(e.target.value) })}
                  placeholder="0.00"
                  step={0.01}
                  type="number"
                  value={row.billingRate ?? ''}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main form ────────────────────────────────────────────────────────────────
export function EditTimesheetForm({
  timesheet,
  tasks = [],
  isSubmitting,
  serverError,
  onSubmit,
  onCancel,
  onSuccess,
}: EditTimesheetFormProps) {
  const { options: kraOptions, loading: kraLoading } = useKraOptions()
  const currentUser = useAuthStore((s) => s.user?.username)

  const [employee] = useState(timesheet.employee ?? '')
  const [designation] = useState(timesheet.designation ?? '')
  const [department] = useState(timesheet.department ?? '')
  const [reportingManager] = useState(timesheet.reportingManager ?? '')
  const [rm] = useState(timesheet.rm ?? '')
  const [month] = useState(timesheet.month ?? '')
  const [startDate, setStartDate] = useState(timesheet.startDate ?? '')
  const [endDate, setEndDate] = useState(timesheet.endDate ?? '')
  const [note, setNote] = useState(timesheet.note ?? '')
  const [autoAddedCount, setAutoAddedCount] = useState(0)

  const [logs, setLogs] = useState<LogRow[]>(() =>
    (timesheet.timeLogs ?? []).map((l) => ({
      _key: l.id ?? Math.random().toString(36).slice(2),
      id: l.id ?? undefined,
      activityType: l.activityType ?? '',
      task: l.task ?? '',
      project: l.project ?? '',
      fromTime: l.fromTime ?? '',
      toTime: l.toTime ?? '',
      hours: l.hours ?? undefined,
      description: l.description ?? '',
      isBillable: l.isBillable,
      billingHours: l.billingHours ?? undefined,
      billingRate: l.billingRate ?? undefined,
    })),
  )

  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())

  // ── Auto-populate assigned tasks for the selected month ───────────────────
  const hasAutoPopulated = useRef(false)

  useEffect(() => {
    if (hasAutoPopulated.current) return
    if (!month || !currentUser || tasks.length === 0) return

    const range = parseMonthRange(month)
    if (!range) return

    const isActive = (s: string) =>
      !s.toLowerCase().includes('complet') &&
      s.toLowerCase() !== 'cancelled' &&
      s.toLowerCase() !== 'closed'

    const eligible = tasks.filter((t) => {
      const assigned = t.assignedTo.includes(currentUser) || t.owner === currentUser
      return assigned && isActive(t.status) && taskOverlapsMonth(t, range)
    })

    if (eligible.length === 0) return

    setLogs((prev) => {
      const existingTaskIds = new Set(prev.map((l) => l.task).filter(Boolean))
      const newRows: LogRow[] = eligible
        .filter((t) => !existingTaskIds.has(t.id))
        .map((t) => ({
          _key: `auto-${t.id}`,
          id: undefined,
          activityType: t.activityType ?? '',
          task: t.id,
          project: t.project ?? '',
          fromTime: '',
          toTime: '',
          hours: undefined,
          description: t.subject,
          isBillable: false,
          billingHours: undefined,
          billingRate: undefined,
        }))
      if (newRows.length === 0) return prev
      setAutoAddedCount(newRows.length)
      return [...prev, ...newRows]
    })

    hasAutoPopulated.current = true
  }, [month, tasks, currentUser])

  const toggleExpanded = (key: string) =>
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  const addLog = () => {
    const row = emptyLog()
    setLogs((prev) => [...prev, row])
    setExpandedKeys((prev) => new Set([...prev, row._key]))
  }

  const removeLog = (key: string) => {
    setLogs((prev) => prev.filter((r) => r._key !== key))
    setExpandedKeys((prev) => { const n = new Set(prev); n.delete(key); return n })
  }

  const patchLog = (key: string, patch: Partial<LogRow>) =>
    setLogs((prev) => prev.map((r) => r._key === key ? { ...r, ...patch } : r))

  const isReadOnly = timesheet.status.toLowerCase() === 'submitted' || timesheet.status.toLowerCase() === 'cancelled'

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (isReadOnly) return

    const ok = await onSubmit(timesheet.id, {
      employee: employee.trim() || undefined,
      designation: designation.trim() || undefined,
      department: department.trim() || undefined,
      reportingManager: reportingManager.trim() || undefined,
      rm: rm.trim() || undefined,
      month: month || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      note: note.trim() || undefined,
      timeLogs: logs.map((r) => ({
        id: r.id,
        activityType: r.activityType || undefined,
        task: r.task || undefined,
        project: r.project || undefined,
        fromTime: r.fromTime || undefined,
        toTime: r.toTime || undefined,
        hours: r.hours,
        description: r.description || undefined,
        isBillable: r.isBillable,
        billingHours: r.billingHours,
        billingRate: r.billingRate,
      })),
    })
    if (ok) onSuccess()
  }

  return (
    <form onSubmit={handleSubmit} className="pb-2">

      {/* Auto-added tasks banner */}
      {autoAddedCount > 0 && (
        <div className="flex items-start gap-3 bg-indigo-50 border border-indigo-100 rounded-xl px-3.5 py-3 mb-4">
          <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0 mt-0.5">
            <svg className="w-3.5 h-3.5 text-indigo-600" fill="none" viewBox="0 0 16 16">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-indigo-800">
              {autoAddedCount} assigned task{autoAddedCount !== 1 ? 's' : ''} added
            </p>
            <p className="text-xs text-indigo-500 mt-0.5">
              Your active tasks for {month} were inserted as time log entries. Fill in the hours for each.
            </p>
          </div>
          <button
            aria-label="Dismiss"
            className="text-indigo-300 hover:text-indigo-500 transition-colors flex-shrink-0 mt-0.5"
            onClick={() => setAutoAddedCount(0)}
            type="button"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      )}

      {/* Read-only warning */}
      {isReadOnly && (
        <div className="flex items-center gap-2.5 bg-amber-50 border border-amber-200 rounded-xl p-3.5 mb-4">
          <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="currentColor" viewBox="0 0 16 16">
            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm-.75 3.75a.75.75 0 0 1 1.5 0v3.5a.75.75 0 0 1-1.5 0v-3.5zm.75 7a.875.875 0 1 1 0-1.75.875.875 0 0 1 0 1.75z"/>
          </svg>
          <p className="text-sm font-medium text-amber-700">
            {timesheet.status} timesheets are read-only. Amend in ERPNext to edit.
          </p>
        </div>
      )}

      {/* ── Consultant info card ── */}
      <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-2xl p-4 shadow-brand mb-4">

        {/* Avatar + name row */}
        <div className="flex items-center gap-3 mb-3.5">
          <div className="w-11 h-11 rounded-xl bg-white/20 border border-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-white/80" fill="none" viewBox="0 0 24 24">
              <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.8"/>
              <path d="M5 19c1.4-3.2 4-5 7-5s5.6 1.8 7 5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8"/>
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-white font-bold text-base leading-tight truncate">
              {timesheet.employeeName || employee || '—'}
            </p>
            {timesheet.employee && (
              <p className="text-indigo-200 text-xs font-mono mt-0.5">{timesheet.employee}</p>
            )}
          </div>
          <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border flex-shrink-0 ${
            timesheet.status.toLowerCase() === 'submitted'
              ? 'bg-emerald-400/20 border-emerald-300/30 text-emerald-100'
              : timesheet.status.toLowerCase() === 'cancelled'
                ? 'bg-slate-400/20 border-slate-300/30 text-slate-200'
                : 'bg-white/15 border-white/20 text-white'
          }`}>
            {timesheet.status}
          </span>
        </div>

        {/* Info chips grid */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white/10 rounded-xl px-3 py-2.5">
            <p className="text-[10px] text-indigo-200 uppercase tracking-widest font-semibold">Designation</p>
            <p className="text-sm font-semibold text-white mt-0.5 truncate">{designation || '—'}</p>
          </div>
          <div className="bg-white/10 rounded-xl px-3 py-2.5">
            <p className="text-[10px] text-indigo-200 uppercase tracking-widest font-semibold">Department</p>
            <p className="text-sm font-semibold text-white mt-0.5 truncate">{department || '—'}</p>
          </div>
          <div className="bg-white/10 rounded-xl px-3 py-2.5">
            <p className="text-[10px] text-indigo-200 uppercase tracking-widest font-semibold">Reporting Manager</p>
            <p className="text-sm font-semibold text-white mt-0.5 truncate">{reportingManager || '—'}</p>
          </div>
          <div className="bg-white/10 rounded-xl px-3 py-2.5">
            <p className="text-[10px] text-indigo-200 uppercase tracking-widest font-semibold">Month</p>
            <p className="text-sm font-semibold text-white mt-0.5 truncate">{month || '—'}</p>
          </div>
        </div>
      </div>

      {/* ── Remaining editable fields ── */}
      <SectionDivider>Timesheet details</SectionDivider>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel htmlFor="ts-start">Start date</FieldLabel>
            <input
              className={inputClass}
              disabled={isReadOnly}
              id="ts-start"
              onChange={(e) => setStartDate(e.target.value)}
              type="date"
              value={startDate}
            />
          </div>
          <div>
            <FieldLabel htmlFor="ts-end">End date</FieldLabel>
            <input
              className={inputClass}
              disabled={isReadOnly}
              id="ts-end"
              onChange={(e) => setEndDate(e.target.value)}
              type="date"
              value={endDate}
            />
          </div>
        </div>

        <div>
          <FieldLabel htmlFor="ts-note">Note / Remarks</FieldLabel>
          <textarea
            className={`${inputClass} resize-none`}
            disabled={isReadOnly}
            id="ts-note"
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional remarks…"
            rows={2}
            value={note}
          />
        </div>
      </div>

      {/* ── Summary ── */}
      <SectionDivider>Summary</SectionDivider>
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Total Engagement Days', value: timesheet.totalEngagementDays != null ? String(timesheet.totalEngagementDays) : '—' },
          { label: 'Time logs', value: String(logs.length) },
          { label: 'Status', value: timesheet.status },
        ].map(({ label, value }) => (
          <div key={label} className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center">
            <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold">{label}</p>
            <p className="text-sm font-bold text-slate-800 mt-1">{value}</p>
          </div>
        ))}
      </div>

      {/* ── Time logs ── */}
      <SectionDivider>Time logs</SectionDivider>

      {logs.length === 0 ? (
        <div className="flex items-center gap-2.5 bg-slate-50 border border-slate-100 rounded-xl p-4 mb-3">
          <svg className="w-4 h-4 text-slate-300 flex-shrink-0" fill="none" viewBox="0 0 16 16">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M8 5v3M8 11v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <p className="text-xs text-slate-400">No time logs yet. Add one below.</p>
        </div>
      ) : (
        <div className="space-y-2 mb-3">
          {logs.map((row, i) => (
            <TimeLogRow
              key={row._key}
              row={row}
              index={i}
              kraOptions={kraOptions}
              kraLoading={kraLoading}
              expanded={expandedKeys.has(row._key)}
              onToggle={() => toggleExpanded(row._key)}
              onDelete={() => removeLog(row._key)}
              onChange={(patch) => patchLog(row._key, patch)}
            />
          ))}
        </div>
      )}

      {!isReadOnly && (
        <button
          className="w-full py-2.5 border-2 border-dashed border-slate-200 rounded-xl text-sm font-semibold text-slate-500 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50 transition-all flex items-center justify-center gap-2"
          onClick={addLog}
          type="button"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          Add time log
        </button>
      )}

      {serverError && (
        <div aria-live="polite" className="flex items-start gap-2.5 bg-rose-50 border border-rose-100 text-rose-700 p-3.5 rounded-xl mt-4" role="alert">
          <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 16 16">
            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm-.75 3.75a.75.75 0 0 1 1.5 0v3.5a.75.75 0 0 1-1.5 0v-3.5zm.75 7a.875.875 0 1 1 0-1.75.875.875 0 0 1 0 1.75z"/>
          </svg>
          <span className="text-sm">{serverError}</span>
        </div>
      )}

      {/* ── Sticky footer ── */}
      <div className="sticky bottom-0 bg-white pt-4 pb-2 mt-5 flex gap-3 border-t border-slate-100">
        <button
          className="flex-1 py-3 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-sm font-semibold transition-colors"
          onClick={onCancel}
          type="button"
        >
          {isReadOnly ? 'Close' : 'Cancel'}
        </button>
        {!isReadOnly && (
          <button
            className="flex-[2] py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none shadow-sm"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Saving…
              </span>
            ) : 'Save timesheet'}
          </button>
        )}
      </div>
    </form>
  )
}
