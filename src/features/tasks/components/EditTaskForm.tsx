import { useState, useMemo, useRef, type ChangeEvent, type FormEvent } from 'react'

import { FormField } from '../../../shared/components/FormField'
import { formatUserDisplay } from '../../../shared/lib/formatUserDisplay'
import { KraCombobox } from '../../../shared/components/KraCombobox'
import { RichTextEditor } from '../../../shared/components/RichTextEditor'
import { Timeline } from './Timeline'
import { StatusChangeModal } from './StatusChangeModal'
import { useKraOptions } from '../../../hooks/useKraOptions'
import { useAuthStore } from '../../../store/authStore'
import type { Project } from '../../projects/types/project.types'
import type { Task, UpdateTaskInput } from '../types/task.types'

const TASK_STATUSES = ['Open', 'Working', 'Pending Review', 'Completed', 'Cancelled']

const STATUS_STEPS = ['Open', 'Working', 'Pending Review', 'Completed'] as const

/** Maps each status to its derived progress percentage */
const STATUS_PROGRESS: Record<string, number> = {
  Open: 0,
  Working: 33,
  'Pending Review': 66,
  Completed: 100,
  Closed: 100,
}

function StatusStepBar({ status }: { status: string }) {
  const stepIdx = STATUS_STEPS.indexOf(status as typeof STATUS_STEPS[number])
  const current = stepIdx === -1 ? 0 : stepIdx
  const pct = STATUS_PROGRESS[status] ?? 0

  return (
    <div>
      {/* Step nodes + connectors */}
      <div className="flex items-center gap-0">
        {STATUS_STEPS.map((step, i) => {
          const done    = i < current
          const active  = i === current
          const nodeClr = done || active ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300'
          const lineClr = i < current ? 'bg-indigo-600' : 'bg-slate-200'
          return (
            <div key={step} className="flex items-center flex-1 last:flex-none">
              <div className={`w-3 h-3 rounded-full border-2 flex-shrink-0 transition-colors ${nodeClr}`} />
              {i < STATUS_STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 transition-colors ${lineClr}`} />
              )}
            </div>
          )
        })}
      </div>
      {/* Labels */}
      <div className="flex justify-between mt-1.5">
        {STATUS_STEPS.map((step, i) => {
          const active = i === current
          const past   = i < current
          return (
            <span
              key={step}
              className={`text-[10px] font-semibold leading-tight ${
                active ? 'text-indigo-600' : past ? 'text-slate-400' : 'text-slate-300'
              }`}
            >
              {step}
            </span>
          )
        })}
      </div>
      {/* Percentage */}
      <div className="mt-2.5 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-indigo-500 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-right text-xs font-bold text-indigo-600 mt-1">{pct}%</p>
    </div>
  )
}

interface EditTaskFormProps {
  task: Task
  tasks: Task[]
  projects: Project[]
  isSubmitting: boolean
  serverError: string | null
  canEdit?: boolean
  onSubmit: (taskId: string, input: UpdateTaskInput) => Promise<boolean>
  onCancel: () => void
  onSuccess: () => void
}

function SectionDivider({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-3 mt-6 mb-4 first:mt-0">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">
        {children}
      </span>
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

const inputClass =
  'w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all'

const selectClass = `${inputClass} appearance-none pr-9 max-w-full`

/** Returns inclusive calendar-day count between two ISO date strings, or undefined if invalid/reversed. */
function calcEngagementDays(start: string, due: string): number | undefined {
  if (!start || !due) return undefined
  const s = new Date(start)
  const d = new Date(due)
  if (isNaN(s.getTime()) || isNaN(d.getTime()) || d < s) return undefined
  return Math.round((d.getTime() - s.getTime()) / 86_400_000) + 1
}



// ── Main form ────────────────────────────────────────────────────────────────

export function EditTaskForm({
  task,
  tasks,
  projects,
  isSubmitting,
  serverError,
  canEdit = true,
  onSubmit,
  onCancel,
  onSuccess,
}: EditTaskFormProps) {
  const { options: kraOptions, loading: kraLoading } = useKraOptions()
  const currentUser = useAuthStore((s) => s.user)

  const [values, setValues] = useState<UpdateTaskInput>({
    subject: task.subject,
    project: task.project ?? '',
    activityType: task.activityType ?? '',
    status: task.status,
    priority: task.priority,
    isMilestone: task.isMilestone,
    parentTask: task.parentTask ?? '',
    startDate: task.startDate ?? '',
    dueDate: task.dueDate ?? '',
    reviewDate: task.reviewDate ?? '',
    closingDate: task.closingDate ?? '',
    progress: STATUS_PROGRESS[task.status] ?? 0,
    engagementDays: task.engagementDays ?? undefined,
    department: task.department ?? '',
    color: task.color ?? '',
    description: task.description ?? '',
    completedBy: task.completedBy ?? '',
    completedOn: task.completedOn ?? '',
  })
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({})
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false)
  const [depTaskIds, setDepTaskIds] = useState<string[]>(() =>
    task.dependsOnTasks
      ? task.dependsOnTasks.split(',').map((s) => s.trim()).filter(Boolean)
      : []
  )
  const [depPickerValue, setDepPickerValue] = useState('')

  // Snapshot of original values for dirty-state detection
  const initialValuesRef = useRef<UpdateTaskInput>({
    subject: task.subject,
    project: task.project ?? '',
    activityType: task.activityType ?? '',
    status: task.status,
    priority: task.priority,
    isMilestone: task.isMilestone,
    parentTask: task.parentTask ?? '',
    startDate: task.startDate ?? '',
    dueDate: task.dueDate ?? '',
    reviewDate: task.reviewDate ?? '',
    closingDate: task.closingDate ?? '',
    progress: STATUS_PROGRESS[task.status] ?? 0,
    engagementDays: task.engagementDays ?? undefined,
    department: task.department ?? '',
    color: task.color ?? '',
    description: task.description ?? '',
    completedBy: task.completedBy ?? '',
    completedOn: task.completedOn ?? '',
  })
  const initialDepIdsRef = useRef<string[]>(
    task.dependsOnTasks
      ? task.dependsOnTasks.split(',').map((s) => s.trim()).filter(Boolean)
      : []
  )

  const isDirty = useMemo(() => {
    const orig = initialValuesRef.current
    const keys = Object.keys(orig) as (keyof UpdateTaskInput)[]
    for (const key of keys) {
      if ((values as unknown as Record<string, unknown>)[key] !== (orig as unknown as Record<string, unknown>)[key]) return true
    }
    const origDeps = initialDepIdsRef.current
    if (depTaskIds.length !== origDeps.length) return true
    if (depTaskIds.some((id, i) => id !== origDeps[i])) return true
    return false
  }, [values, depTaskIds])

  const isCompletedTask = task.status.toLowerCase().includes('complet')
  // isReadOnly: locks the fieldset and hides footer buttons
  const isReadOnly = isCompletedTask || !canEdit
  // isCompleted: used only for the status-field UI (handles in-progress completion too)
  const isCompleted = values.status.toLowerCase().includes('complet')

  const parentTaskSubject = values.parentTask
    ? (tasks.find((t) => t.id === values.parentTask)?.subject ?? values.parentTask)
    : null

  const set = <K extends keyof UpdateTaskInput>(key: K, val: UpdateTaskInput[K]) =>
    setValues((p) => ({ ...p, [key]: val }))

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value, type } = e.target
    const checked = type === 'checkbox' ? (e.target as HTMLInputElement).checked : undefined
    setValues((prev) => ({ ...prev, [name]: checked !== undefined ? checked : value }))
    setErrors((prev) => ({ ...prev, [name]: undefined }))
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!values.subject.trim()) {
      setErrors({ subject: 'Subject is required.' })
      return
    }
    const ok = await onSubmit(task.id, {
      ...values,
      subject: values.subject.trim(),
      project: (values.project as string)?.trim() || undefined,
      activityType: (values.activityType as string)?.trim() || undefined,
      parentTask: (values.parentTask as string)?.trim() || undefined,
      department: (values.department as string)?.trim() || undefined,
      dependsOnTasks: depTaskIds.join(',') || undefined,
    })
    if (ok) onSuccess()
  }

  return (
    <form onSubmit={handleSubmit} className="pb-2">
      {/* Completed banner */}
      {isCompletedTask && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3.5 py-3 mb-4">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="currentColor" viewBox="0 0 16 16">
              <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/>
            </svg>
            <span className="text-sm font-semibold text-emerald-700">This task is completed — view only</span>
          </div>
          {(task.completedBy || task.completedOn) && (
            <p className="text-xs text-emerald-600 mt-1.5 pl-6">
              {task.completedBy && (
                <><span className="font-semibold">By:</span> {formatUserDisplay(task.completedBy)}</>
              )}
              {task.completedBy && task.completedOn && <span className="mx-1">·</span>}
              {task.completedOn && (
                <><span className="font-semibold">On:</span>{' '}
                {new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(task.completedOn))}</>
              )}
            </p>
          )}
        </div>
      )}

      {/* View-only banner for tasks not owned/assigned to the user */}
      {!canEdit && !isCompletedTask && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-3 mb-4 flex items-center gap-2">
          <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 16 16">
            <ellipse cx="8" cy="8" rx="7" ry="4.5" stroke="currentColor" strokeWidth="1.4"/>
            <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4"/>
          </svg>
          <span className="text-sm font-semibold text-slate-500">View only — not assigned to you</span>
        </div>
      )}

      {/* fieldset[disabled] disables all descendant form controls at once */}
      <fieldset disabled={isReadOnly} className="contents">

      {/* ── Basic info ── */}
      <SectionDivider>Basic info</SectionDivider>
      <div className="space-y-3">

        <div>
          <FieldLabel htmlFor="edit-subject">Subject *</FieldLabel>
          <input
            className={`${inputClass} ${errors.subject ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-200' : ''}`}
            id="edit-subject"
            name="subject"
            onChange={handleChange}
            placeholder="Task subject"
            value={values.subject}
          />
          {errors.subject && <p className="text-xs text-rose-600 font-medium mt-1">{errors.subject}</p>}
        </div>

        {/* Project + KRA — stacked on mobile, side-by-side on desktop */}
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <FieldLabel htmlFor="edit-project">Project</FieldLabel>
            <div className="relative w-full">
              <select
                className={selectClass}
                id="edit-project"
                name="project"
                onChange={handleChange}
                value={values.project ?? ''}
              >
                <option value="">No project — general task</option>
                {/* Preserve current project if user is not a member of it */}
                {values.project && !projects.some((p) => p.name === values.project) && (
                  <option value={values.project}>{values.project}</option>
                )}
                {projects.map((p) => (
                  <option key={p.id} value={p.name}>{p.displayName}</option>
                ))}
              </select>
              <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 16 16">
                <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>

          <div>
            <FieldLabel htmlFor="edit-kra">KRA / Activity Type</FieldLabel>
            <KraCombobox
              id="edit-kra"
              loading={kraLoading}
              onChange={(v) => set('activityType', v)}
              options={kraOptions}
              value={values.activityType as string ?? ''}
            />
          </div>
        </div>

        {/* (Is Milestone) */}
        <label className="flex items-center gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-100 active:bg-slate-100 transition-colors select-none">
          <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${values.isMilestone ? 'bg-violet-600 border-violet-600' : 'border-slate-300 bg-white'}`}>
            {values.isMilestone && (
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12">
                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </div>
          <input
            checked={values.isMilestone ?? false}
            className="sr-only"
            name="isMilestone"
            onChange={handleChange}
            type="checkbox"
          />
          <p className="text-sm font-semibold text-slate-800">Is Milestone</p>
        </label>
      </div>

      {/* ── Status & priority ── */}
      <SectionDivider>Status &amp; priority</SectionDivider>
      <div className="space-y-4">

        {/* Status — hidden for completed tasks (banner at top covers it) */}
        {!isReadOnly && (
          <div>
            <FieldLabel>Status</FieldLabel>
            <div className="grid grid-cols-3 gap-2">
              {TASK_STATUSES.map((s) => {
                const active = values.status === s
                const cls: Record<string, string> = {
                  Open: active ? 'bg-slate-700 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-600',
                  Working: active ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-600',
                  'Pending Review': active ? 'bg-amber-500 border-amber-500 text-white' : 'bg-slate-50 border-slate-200 text-slate-600',
                  Completed: active ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-600',
                  Cancelled: active ? 'bg-rose-600 border-rose-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-600',
                }
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => { if (s !== values.status) setIsStatusModalOpen(true) }}
                    className={`py-2.5 px-1 rounded-lg text-xs font-semibold border transition-all text-center leading-tight ${cls[s]}`}
                  >
                    {s}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Priority */}
        <div>
          <FieldLabel>Priority</FieldLabel>
          <div className="grid grid-cols-4 gap-2">
            {(['Low', 'Medium', 'High', 'Urgent'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => set('priority', p)}
                className={`py-2.5 rounded-lg text-xs font-semibold border transition-all ${
                  values.priority === p
                    ? p === 'Urgent' ? 'bg-rose-600 border-rose-600 text-white shadow-sm'
                    : p === 'High' ? 'bg-orange-500 border-orange-500 text-white shadow-sm'
                    : p === 'Medium' ? 'bg-amber-500 border-amber-500 text-white shadow-sm'
                    : 'bg-slate-500 border-slate-500 text-white shadow-sm'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Progress — driven by status, not manually editable */}
        <div>
          <FieldLabel>Progress</FieldLabel>
          <StatusStepBar status={values.status} />
        </div>

        {/* Completed by / on — shown only while the status is actively set to Completed */}
        {!isReadOnly && isCompleted && (values.completedBy || values.completedOn) && (
          <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-100 rounded-lg p-3.5">
            <svg className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 16 16">
              <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/>
            </svg>
            <div className="min-w-0 flex-1">
              {values.completedBy && (
                <p className="text-xs text-emerald-700">
                  <span className="font-semibold">Completed by:</span> {formatUserDisplay(values.completedBy)}
                </p>
              )}
              {values.completedOn && (
                <p className="text-xs text-emerald-700 mt-0.5">
                  <span className="font-semibold">On:</span>{' '}
                  {new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(values.completedOn))}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Timeline ── */}
      <SectionDivider>Timeline</SectionDivider>
      <div className="space-y-3">
        <Timeline
          startDate={values.startDate ?? ''}
          dueDate={values.dueDate ?? ''}
          onStartDateChange={(v) => {
            set('startDate', v)
            const calc = calcEngagementDays(v, values.dueDate ?? '')
            if (calc !== undefined) set('engagementDays', calc)
          }}
          onDueDateChange={(v) => {
            set('dueDate', v)
            const calc = calcEngagementDays(values.startDate ?? '', v)
            if (calc !== undefined) set('engagementDays', calc)
          }}
        />
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Review date" name="reviewDate" onChange={handleChange} type="date" value={values.reviewDate ?? ''} />
          <FormField label="Closing date" name="closingDate" onChange={handleChange} type="date" value={values.closingDate ?? ''} />
        </div>

        {/* Engagement Days */}
        <div>
          <FieldLabel htmlFor="edit-eng-days">Engagement Days</FieldLabel>
          <input
            className={inputClass}
            id="edit-eng-days"
            min={0}
            onChange={(e) => set('engagementDays', e.target.value === '' ? undefined : Number(e.target.value))}
            placeholder="e.g. 5"
            type="number"
            value={values.engagementDays ?? ''}
          />
          <p className="text-[11px] text-slate-400 mt-1">
            {values.startDate && values.dueDate
              ? 'Auto-calculated from dates — edit to override'
              : 'Auto-calculated when both dates are set'}
          </p>
        </div>
      </div>

      {/* ── Parent task ── */}
      <SectionDivider>Parent task</SectionDivider>
      <div className="space-y-3">
        <div>
          <FieldLabel htmlFor="edit-parent">Link to parent</FieldLabel>
          <div className="relative w-full">
            <select
              className={selectClass}
              id="edit-parent"
              name="parentTask"
              onChange={handleChange}
              value={values.parentTask ?? ''}
            >
              <option value="">None — top-level task</option>
              {tasks.filter((t) => t.id !== task.id).map((t) => (
                <option key={t.id} value={t.id}>{t.subject}</option>
              ))}
            </select>
            <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 16 16">
              <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>

        {parentTaskSubject && values.parentTask && (
          <div className="flex items-start gap-3 bg-indigo-50 border border-indigo-100 rounded-lg p-3.5">
            <svg className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 16 16">
              <path d="M8 2v4l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4"/>
            </svg>
            <div className="min-w-0">
              <p className="text-xs font-bold text-indigo-600 uppercase tracking-wide">Parent task</p>
              <p className="text-sm font-semibold text-indigo-800 mt-0.5 break-words">{parentTaskSubject}</p>
              <p className="text-[11px] text-indigo-400 font-mono mt-0.5 break-all">{values.parentTask}</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Dependent tasks ── */}
      <SectionDivider>Dependent tasks</SectionDivider>
      <div className="space-y-2">
        {depTaskIds.length === 0 ? (
          <div className="flex items-center gap-2.5 bg-slate-50 border border-slate-100 rounded-lg p-3.5">
            <svg className="w-4 h-4 text-slate-300 flex-shrink-0" fill="none" viewBox="0 0 16 16">
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M8 5v3M8 11v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <p className="text-xs text-slate-400">No dependent tasks</p>
          </div>
        ) : (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-2">
            {depTaskIds.map((depId) => {
              const depTask = tasks.find((t) => t.id === depId)
              return (
                <div key={depId} className="flex items-center gap-2.5 min-w-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-400 flex-shrink-0" />
                  <span className="text-sm text-slate-700 font-medium flex-1 min-w-0 truncate">
                    {depTask?.subject ?? depId}
                  </span>
                  <button
                    aria-label="Remove dependent task"
                    className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full hover:bg-rose-100 text-slate-400 hover:text-rose-500 transition-colors"
                    onClick={() => setDepTaskIds((prev) => prev.filter((x) => x !== depId))}
                    type="button"
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

        {/* Add picker */}
        <div className="flex gap-2">
          <div className="relative flex-1 min-w-0">
            <select
              className={selectClass}
              onChange={(e) => setDepPickerValue(e.target.value)}
              value={depPickerValue}
            >
              <option value="">Add a dependent task…</option>
              {tasks
                .filter((t) => t.id !== task.id && !depTaskIds.includes(t.id))
                .map((t) => (
                  <option key={t.id} value={t.id}>{t.subject}</option>
                ))}
            </select>
            <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 16 16">
              <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <button
            className="px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-all disabled:opacity-40 disabled:pointer-events-none flex-shrink-0"
            disabled={!depPickerValue}
            onClick={() => {
              if (depPickerValue) {
                setDepTaskIds((prev) => [...prev, depPickerValue])
                setDepPickerValue('')
              }
            }}
            type="button"
          >
            Add
          </button>
        </div>
      </div>

      {/* ── Description ── */}
      <SectionDivider>Description</SectionDivider>
      <RichTextEditor
        defaultValue={values.description ?? ''}
        onChange={(html) => set('description', html)}
      />

      {serverError && (
        <div aria-live="polite" className="flex items-start gap-2.5 bg-rose-50 border border-rose-100 text-rose-700 p-3.5 rounded-lg mt-4" role="alert">
          <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 16 16">
            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm-.75 3.75a.75.75 0 0 1 1.5 0v3.5a.75.75 0 0 1-1.5 0v-3.5zm.75 7a.875.875 0 1 1 0-1.75.875.875 0 0 1 0 1.75z" />
          </svg>
          <span className="text-sm">{serverError}</span>
        </div>
      )}

      {isStatusModalOpen && (
        <StatusChangeModal
          currentStatus={values.status}
          isSubmitting={false}
          onCancel={() => setIsStatusModalOpen(false)}
          onConfirm={(newStatus, note) => {
            const noteHtml = `<p><strong>→ ${newStatus}:</strong> ${note}</p>`
            set('description', values.description ? `${values.description}${noteHtml}` : noteHtml)
            set('status', newStatus)
            set('progress', STATUS_PROGRESS[newStatus] ?? 0)
            if (newStatus === 'Completed') {
              set('completedBy', currentUser?.username || currentUser?.fullName || '')
              set('completedOn', new Date().toISOString().slice(0, 10))
            }
            setIsStatusModalOpen(false)
          }}
        />
      )}

      </fieldset>{/* end fieldset[disabled] */}

      {/* ── Sticky footer ── */}
      {!isReadOnly && isDirty && (
        <div className="sticky bottom-0 bg-white pt-4 pb-2 mt-5 flex gap-3 border-t border-slate-100">
          <button
            className="flex-1 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-sm font-medium transition-colors"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="flex-[2] py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-all active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Saving…
              </span>
            ) : 'Save changes'}
          </button>
        </div>
      )}
    </form>
  )
}
