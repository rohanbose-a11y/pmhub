import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'

import { KraCombobox } from '../../../shared/components/KraCombobox'
import { RichTextEditor } from '../../../shared/components/RichTextEditor'
import { Timeline } from './Timeline'
import { useKraOptions } from '../../../hooks/useKraOptions'
import type { Project } from '../../projects/types/project.types'
import type { Task, CreateTaskFieldErrors, CreateTaskFormValues, CreateTaskInput } from '../types/task.types'

interface CreateTaskFormProps {
  projects: Project[]
  tasks: Task[]
  isSubmitting: boolean
  serverError: string | null
  successMessage: string | null
  onSubmit: (input: CreateTaskInput) => Promise<boolean>
  onCancel?: () => void
  onSuccess?: () => void
  variant?: 'card' | 'modal'
}

const getInitialValues = (projects: Project[]): CreateTaskFormValues => ({
  subject: '',
  project: projects[0]?.name || '',
  activityType: '',
  priority: 'Medium',
  isMilestone: false,
  parentTask: '',
  startDate: '',
  dueDate: '',
  engagementDays: '',
  description: '',
})

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

export function CreateTaskForm({
  projects,
  tasks,
  isSubmitting,
  serverError,
  onSubmit,
  onCancel,
  onSuccess,
}: CreateTaskFormProps) {
  const { options: kraOptions, loading: kraLoading } = useKraOptions()
  const [values, setValues] = useState<CreateTaskFormValues>(() => getInitialValues(projects))
  const [fieldErrors, setFieldErrors] = useState<CreateTaskFieldErrors>({})
  const [editorKey, setEditorKey] = useState(0)
  const [depTaskIds, setDepTaskIds] = useState<string[]>([])
  const [depPickerValue, setDepPickerValue] = useState('')

  useEffect(() => {
    setValues((prev) => ({
      ...prev,
      project: prev.project || projects[0]?.name || '',
    }))
  }, [projects])

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value, type } = e.target
    const checked = type === 'checkbox' ? (e.target as HTMLInputElement).checked : undefined
    setValues((prev) => ({ ...prev, [name]: checked !== undefined ? checked : value }))
    setFieldErrors((prev) => ({ ...prev, [name]: undefined }))
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (!values.subject.trim()) {
      setFieldErrors({ subject: 'Task subject is required.' })
      return
    }
    if (projects.length > 0 && !values.project?.trim()) {
      setFieldErrors({ project: 'Select a project for this task.' })
      return
    }

    const engDays = values.engagementDays !== '' ? Number(values.engagementDays) : undefined

    const didCreate = await onSubmit({
      subject: values.subject.trim(),
      project: values.project?.trim() || undefined,
      activityType: values.activityType?.trim() || undefined,
      priority: values.priority,
      isMilestone: values.isMilestone,
      parentTask: values.parentTask?.trim() || undefined,
      dependsOnTasks: depTaskIds.join(',') || undefined,
      startDate: values.startDate || undefined,
      dueDate: values.dueDate || undefined,
      engagementDays: engDays,
      description: values.description?.trim() || undefined,
    })

    if (didCreate) {
      setValues(getInitialValues(projects))
      setFieldErrors({})
      setEditorKey((k) => k + 1)
      setDepTaskIds([])
      setDepPickerValue('')
      onSuccess?.()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="pb-2">

      {/* ── Basic info ── */}
      <SectionDivider>Basic info</SectionDivider>

      <div className="space-y-3">
        {/* Subject */}
        <div>
          <FieldLabel htmlFor="create-subject">Subject *</FieldLabel>
          <input
            className={`${inputClass} ${fieldErrors.subject ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-100' : ''}`}
            id="create-subject"
            name="subject"
            onChange={handleChange}
            placeholder="e.g. Update Q2 status report"
            value={values.subject}
          />
          {fieldErrors.subject && (
            <p className="text-xs text-rose-600 mt-1">{fieldErrors.subject}</p>
          )}
        </div>

        {/* Project + KRA — stacked on mobile, side-by-side on desktop */}
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <FieldLabel htmlFor="create-project">Project</FieldLabel>
            <div className="relative w-full">
              <select
                className={`${selectClass} ${fieldErrors.project ? 'border-rose-300' : ''}`}
                id="create-project"
                name="project"
                onChange={handleChange}
                value={values.project}
              >
                <option value="">No project — general task</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.name}>{p.displayName}</option>
                ))}
              </select>
              <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 16 16">
                <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            {fieldErrors.project && (
              <p className="text-xs text-rose-600 mt-1">{fieldErrors.project}</p>
            )}
          </div>

          <div>
            <FieldLabel htmlFor="create-kra">KRA / Activity Type</FieldLabel>
            <KraCombobox
              id="create-kra"
              loading={kraLoading}
              onChange={(v) => setValues((prev) => ({ ...prev, activityType: v }))}
              options={kraOptions}
              value={values.activityType}
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
            checked={values.isMilestone}
            className="sr-only"
            name="isMilestone"
            onChange={handleChange}
            type="checkbox"
          />
          <p className="text-sm font-semibold text-slate-800">Is Milestone</p>
        </label>

      </div>

      {/* ── Priority ── */}
      <SectionDivider>Priority</SectionDivider>

      <div className="space-y-3">
        {/* Priority */}
        <div>
          <FieldLabel htmlFor="create-priority">Priority</FieldLabel>
          <div className="grid grid-cols-4 gap-2">
            {(['Low', 'Medium', 'High', 'Urgent'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setValues((prev) => ({ ...prev, priority: p }))}
                className={`py-2.5 rounded-lg text-xs font-semibold border transition-all ${
                  values.priority === p
                    ? p === 'Urgent'
                      ? 'bg-rose-600 border-rose-600 text-white shadow-sm'
                      : p === 'High'
                        ? 'bg-orange-500 border-orange-500 text-white shadow-sm'
                        : p === 'Medium'
                          ? 'bg-amber-500 border-amber-500 text-white shadow-sm'
                          : 'bg-slate-500 border-slate-500 text-white shadow-sm'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>
      <SectionDivider>Timeline</SectionDivider>
      <div className="space-y-3">
        <Timeline
          startDate={values.startDate}
          dueDate={values.dueDate}
          onStartDateChange={(v) => setValues((prev) => ({ ...prev, startDate: v }))}
          onDueDateChange={(v) => setValues((prev) => ({ ...prev, dueDate: v }))}
        />

        {/* Engagement Days */}
        <div>
          <FieldLabel htmlFor="create-eng-days">Engagement Days</FieldLabel>
          <input
            className={inputClass}
            id="create-eng-days"
            min={0}
            name="engagementDays"
            onChange={handleChange}
            placeholder="e.g. 5"
            type="number"
            value={values.engagementDays}
          />
          <p className="text-[11px] text-slate-400 mt-1">Number of days actively engaged on this task</p>
        </div>

      </div>

      {/* ── Parent task ── */}
      <SectionDivider>Parent task</SectionDivider>
      <div className="space-y-2">
        <div>
          <FieldLabel htmlFor="create-parent">Link to parent</FieldLabel>
          <div className="relative w-full">
            <select
              className={selectClass}
              id="create-parent"
              name="parentTask"
              onChange={handleChange}
              value={values.parentTask}
            >
              <option value="">None — top-level task</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>{t.subject}</option>
              ))}
            </select>
            <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 16 16">
              <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>
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
                .filter((t) => !depTaskIds.includes(t.id))
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
        key={editorKey}
        onChange={(html) => setValues((prev) => ({ ...prev, description: html }))}
      />

      {serverError ? (
        <div
          aria-live="polite"
          className="flex items-start gap-2.5 bg-rose-50 border border-rose-100 text-rose-700 p-3.5 rounded-lg mt-4"
          role="alert"
        >
          <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 16 16">
            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm-.75 3.75a.75.75 0 0 1 1.5 0v3.5a.75.75 0 0 1-1.5 0v-3.5zm.75 7a.875.875 0 1 1 0-1.75.875.875 0 0 1 0 1.75z" />
          </svg>
          <span className="text-sm">{serverError}</span>
        </div>
      ) : null}

      {/* ── Sticky footer ── */}
      <div className="sticky bottom-0 bg-white pt-4 pb-2 mt-5 flex gap-3 border-t border-slate-100">
        {onCancel ? (
          <button
            className="flex-1 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-sm font-medium transition-colors"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
        ) : null}
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
              Creating…
            </span>
          ) : (
            'Add task'
          )}
        </button>
      </div>
    </form>
  )
}
