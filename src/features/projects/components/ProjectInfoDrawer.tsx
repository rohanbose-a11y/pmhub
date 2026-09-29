import { useEffect, useRef, useState } from 'react'
import DOMPurify from 'dompurify'

import { projectApi } from '../../../api/projectApi'
import { taskApi }    from '../../../api/taskApi'
import type { Project, RawProjectMember } from '../types/project.types'
import { UserAvatar } from '../../../shared/components/UserAvatar'
import { useWorkStore } from '../../../store/workStore'
import { exportProjectToExcel, parseImportFile, type ImportRow } from '../../../utils/projectExcel'
import { useAuthStore }  from '../../../store/authStore'
import { taskService }   from '../../../services/taskService'

const STATUS_CONFIG: Record<string, { dot: string; pill: string }> = {
  Open:      { dot: 'bg-slate-400',   pill: 'bg-slate-100 text-slate-600'       },
  Working:   { dot: 'bg-blue-500',    pill: 'bg-blue-50 text-blue-700'          },
  Completed: { dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-700'    },
  Cancelled: { dot: 'bg-rose-400',    pill: 'bg-rose-50 text-rose-600'          },
}

function fmtDate(v: string | null | undefined) {
  if (!v) return null
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })
}

interface Props {
  project: Project
  onClose: () => void
}

// ── Import state machine ───────────────────────────────────────────────────────
type ImportPhase =
  | { phase: 'idle' }
  | { phase: 'parsed'; rows: ImportRow[]; filename: string }
  | { phase: 'importing'; done: number; total: number }
  | { phase: 'done';  created: number; updated: number; failed: number; errors: string[] }
  | { phase: 'error'; message: string }

export function ProjectInfoDrawer({ project, onClose }: Props) {
  const [members,        setMembers]        = useState<RawProjectMember[]>([])
  const [loadingMembers, setLoadingMembers] = useState(true)

  // export
  const tasks         = useWorkStore((s) => s.tasks)
  const [exporting,   setExporting]   = useState(false)

  // import
  const fileRef                       = useRef<HTMLInputElement>(null)
  const [importState, setImportState] = useState<ImportPhase>({ phase: 'idle' })
  const username  = useAuthStore((s) => s.user?.username ?? '')
  const loadWorkspace = useWorkStore((s) => s.loadWorkspace)

  useEffect(() => {
    let alive = true
    projectApi.getProjectMembers(project.name)
      .then((raw) => { if (alive) setMembers(raw) })
      .catch((e) => { if (alive) { console.error('Failed to load project members:', e); setMembers([]) } })
      .finally(() => { if (alive) setLoadingMembers(false) })
    return () => { alive = false }
  }, [project.name])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const sg    = STATUS_CONFIG[project.status] ?? STATUS_CONFIG.Open
  const start = fmtDate(project.expectedStartDate)
  const end   = fmtDate(project.expectedEndDate)
  const notes = project.notes ?? ''

  // ── Export ──────────────────────────────────────────────────────────────────
  const handleExport = async () => {
    setExporting(true)
    try {
      exportProjectToExcel(project, tasks)
    } finally {
      setExporting(false)
    }
  }

  // ── Import file picked ──────────────────────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const rows = await parseImportFile(file)
      if (rows.length === 0) {
        setImportState({ phase: 'error', message: 'No valid rows found in the Tasks sheet.' })
        return
      }
      setImportState({ phase: 'parsed', rows, filename: file.name })
    } catch (err) {
      setImportState({ phase: 'error', message: err instanceof Error ? err.message : 'Failed to parse file.' })
    }
    e.target.value = ''
  }

  // ── Run import ──────────────────────────────────────────────────────────────
  const runImport = async () => {
    if (importState.phase !== 'parsed') return
    const { rows } = importState
    setImportState({ phase: 'importing', done: 0, total: rows.length })

    let created = 0
    let updated = 0
    const rowErrors: string[] = []
    // Track newly-created task IDs by subject for parent resolution within this batch
    const subjectToId = new Map<string, string>()

    const resolveParent = (raw: string) => {
      if (!raw) return undefined
      if (subjectToId.has(raw)) return subjectToId.get(raw)
      return raw // assume it's an existing task ID
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const isExisting = !!row.id

      const isMilestone = row.type === 'Milestone'
      const isGroup     = row.type === 'Milestone' || row.type === 'Activity'
      // Avoid sending 0 — Frappe treats `not 0` as mandatory-field failure
      const engDays     = (row.engagementDays && row.engagementDays > 0) ? row.engagementDays : undefined

      try {
        if (isExisting) {
          await taskService.updateTask(row.id, {
            subject:        row.subject,
            project:        project.name,
            activityType:   row.activityType  || undefined,
            customRaci:     row.customRaci     || undefined,
            status:         row.status,
            priority:       row.priority,
            isMilestone,
            isGroup,
            parentTask:     resolveParent(row.parentTaskId) ?? null,
            startDate:      row.startDate     || undefined,
            dueDate:        row.dueDate       || undefined,
            progress:       row.progress,
            engagementDays: engDays,
            description:    row.description   || undefined,
            department:     row.department    || undefined,
          })
          updated++
        } else {
          const created_task = await taskService.createTask({
            subject:        row.subject,
            project:        project.name,
            activityType:   row.activityType  || undefined,
            customRaci:     row.customRaci     || undefined,
            priority:       row.priority,
            isMilestone,
            isGroup,
            parentTask:     resolveParent(row.parentTaskId),
            startDate:      row.startDate     || undefined,
            dueDate:        row.dueDate       || undefined,
            engagementDays: engDays,
            description:    row.description   || undefined,
            assignedTo:     row.assignedTo,
          })
          subjectToId.set(row.subject, created_task.id)
          created++
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        rowErrors.push(`Row ${i + 1} "${row.subject}": ${msg}`)
        console.error('[import] Failed row', i + 1, row.subject, err)
      }

      setImportState({ phase: 'importing', done: i + 1, total: rows.length })
    }

    // Assign users to existing updated tasks (bulk assign is separate from updateTask)
    const existingWithAssignees = rows.filter((r) => !!r.id && r.assignedTo.length > 0)
    for (const row of existingWithAssignees) {
      try { await taskApi.bulkAssignTask(row.id, row.assignedTo) } catch { /* non-fatal */ }
    }

    // Reload workspace so new/updated tasks appear in the task list
    if (username) await loadWorkspace(username, true).catch(console.error)

    setImportState({ phase: 'done', created, updated, failed: rowErrors.length, errors: rowErrors })
  }

  const resetImport = () => {
    setImportState({ phase: 'idle' })
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div
      className="fixed inset-0 z-50 animate-fade-in flex items-stretch justify-end"
      style={{ background: 'rgba(0,0,0,.4)' }}
      onClick={onClose}
    >
      <div
        className="relative flex flex-col bg-white overflow-hidden shadow-2xl h-full w-full max-w-[420px]"
        style={{ borderLeft: '1px solid #E5E7EB' }}
        onClick={(e) => e.stopPropagation()}
      >

        {/* ── Header ── */}
        <div className="flex-shrink-0 flex items-center gap-2 px-5 h-12 border-b border-slate-100">
          <span className="flex-1 text-[13px] font-semibold text-slate-700 truncate">Project info</span>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            aria-label="Close project info"
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors"
          >
            <svg fill="none" viewBox="0 0 12 12" width={11} height={11}>
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6"/>
            </svg>
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto scrollbar-none">

          <div className="px-5 pt-5 pb-4">
            <h2 className="text-[16px] font-semibold text-slate-900 leading-tight">{project.displayName}</h2>
            <p className="text-[11px] text-slate-400 mt-0.5 font-mono">{project.name}</p>
          </div>

          <div className="h-px bg-slate-100 mx-5" />

          <div className="divide-y divide-slate-50">

            {/* Status */}
            <div className="flex items-center gap-3 px-5 py-3">
              <span className="text-[11.5px] text-slate-400 w-24 flex-shrink-0">Status</span>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] font-medium ${sg.pill}`}>
                <span className={`w-[5px] h-[5px] rounded-full flex-shrink-0 ${sg.dot}`} />
                {project.status}
              </span>
            </div>

            {/* Start – End */}
            <div className="flex items-start gap-3 px-5 py-3">
              <span className="text-[11.5px] text-slate-400 w-24 flex-shrink-0 pt-0.5">Start – End</span>
              <span className="text-[12.5px] text-slate-700">
                {start || end ? (
                  <>
                    {start ?? <span className="text-slate-300">Not set</span>}
                    <span className="text-slate-300"> – </span>
                    {end ?? <span className="text-slate-300">Not set</span>}
                  </>
                ) : (
                  <span className="text-slate-300">Not set</span>
                )}
              </span>
            </div>

            {/* Owner */}
            <div className="flex items-center gap-3 px-5 py-3">
              <span className="text-[11.5px] text-slate-400 w-24 flex-shrink-0">Owner</span>
              {project.owner ? (
                <div className="flex items-center gap-2 min-w-0">
                  <UserAvatar name={project.owner} size="xs" />
                  <span className="text-[12.5px] text-slate-700 truncate">{project.owner}</span>
                </div>
              ) : (
                <span className="text-[12px] text-slate-300">Not assigned</span>
              )}
            </div>

            {/* Department */}
            {project.department && (
              <div className="flex items-center gap-3 px-5 py-3">
                <span className="text-[11.5px] text-slate-400 w-24 flex-shrink-0">Department</span>
                <span className="text-[12.5px] text-slate-700">{project.department}</span>
              </div>
            )}

            {/* About */}
            {notes && (
              <div className="flex items-start gap-3 px-5 py-3">
                <span className="text-[11.5px] text-slate-400 w-24 flex-shrink-0 pt-0.5">About</span>
                <div
                  className="text-[12.5px] text-slate-700 flex-1 min-w-0 [&_p]:mb-1 [&_ol]:list-decimal [&_ol]:pl-4 [&_ul]:list-disc [&_ul]:pl-4"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(notes) }}
                />
              </div>
            )}

            {/* Team */}
            <div className="flex items-start gap-3 px-5 py-3">
              <span className="text-[11.5px] text-slate-400 w-24 flex-shrink-0 pt-0.5">Team</span>
              <div className="flex-1 min-w-0">
                {loadingMembers ? (
                  <span className="text-[12px] text-slate-400">Loading…</span>
                ) : members.length > 0 ? (
                  <div className="space-y-1">
                    {members.map((m) => (
                      <div key={m.user} className="flex items-center gap-2 py-0.5">
                        <UserAvatar name={m.user} fullName={m.full_name} size="xs" />
                        <span className="text-[12.5px] text-slate-700 truncate">{m.full_name || m.user}</span>
                        {project.owner === m.user && (
                          <span className="text-[10px] text-violet-500 font-medium ml-auto flex-shrink-0">Owner</span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : project.owner ? (
                  <div className="flex items-center gap-2">
                    <UserAvatar name={project.owner} size="xs" />
                    <span className="text-[12.5px] text-slate-700 truncate">{project.owner}</span>
                  </div>
                ) : (
                  <span className="text-[12px] text-slate-300">No members</span>
                )}
              </div>
            </div>
          </div>

          {/* ── Export & Import ─────────────────────────────────────────────── */}
          <div className="mx-5 mt-5 mb-2 space-y-3">

            {/* Export */}
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-[12px] font-semibold text-slate-700 mb-0.5">Export Project</p>
              <p className="text-[11px] text-slate-400 mb-3 leading-relaxed">
                Download project data — milestones, activities, and tasks — as an Excel file.
                Use it as a reference or edit offline; re-import to apply changes.
                Keep the <span className="font-medium text-slate-500">ID</span> column blank for new rows.
              </p>
              <button
                type="button"
                onClick={handleExport}
                disabled={exporting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11.5px] font-medium bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 hover:border-slate-300 disabled:opacity-50 transition-colors shadow-sm"
              >
                {exporting ? (
                  <>
                    <Spinner />
                    Exporting…
                  </>
                ) : (
                  <>
                    <ExcelIcon />
                    Export to Excel
                  </>
                )}
              </button>
            </div>

            {/* Import */}
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-[12px] font-semibold text-slate-700 mb-0.5">Import Project Data</p>
              <p className="text-[11px] text-slate-400 mb-3 leading-relaxed">
                Upload an Excel file in the export format to create or update milestones,
                activities, and tasks. Rows with an existing <span className="font-medium text-slate-500">ID</span> are
                updated; rows with a blank <span className="font-medium text-slate-500">ID</span> are created.
              </p>

              {importState.phase === 'idle' && (
                <>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11.5px] font-medium bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 hover:border-slate-300 transition-colors shadow-sm"
                  >
                    <UploadIcon />
                    Choose Excel file…
                  </button>
                </>
              )}

              {importState.phase === 'parsed' && (
                <div className="space-y-2.5">
                  <p className="text-[11.5px] text-slate-600">
                    <span className="font-medium">{importState.filename}</span>
                    {' — '}
                    <span className="text-emerald-600 font-medium">{importState.rows.length} row{importState.rows.length !== 1 ? 's' : ''}</span>
                    {' ready to import ('}
                    {importState.rows.filter((r) => !r.id).length} new,{' '}
                    {importState.rows.filter((r) => !!r.id).length} update
                    {')'}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={runImport}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11.5px] font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-sm"
                    >
                      <UploadIcon color="white" />
                      Import
                    </button>
                    <button
                      type="button"
                      onClick={resetImport}
                      className="px-3 py-1.5 rounded-lg text-[11.5px] font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {importState.phase === 'importing' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[11.5px] text-slate-600">
                    <Spinner />
                    Importing… {importState.done} / {importState.total}
                  </div>
                  <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-200"
                      style={{ width: `${Math.round((importState.done / importState.total) * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {importState.phase === 'done' && (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-1.5 text-[11.5px] text-emerald-700 font-medium">
                    <CheckIcon />
                    Done — {importState.created} created, {importState.updated} updated
                    {importState.failed > 0 && (
                      <span className="text-rose-600 font-medium ml-1">({importState.failed} failed)</span>
                    )}
                  </div>
                  {importState.errors.length > 0 && (
                    <div className="rounded-lg bg-rose-50 border border-rose-100 p-2.5 space-y-1 max-h-32 overflow-y-auto">
                      {importState.errors.map((e, i) => (
                        <p key={i} className="text-[10.5px] text-rose-700 leading-relaxed">{e}</p>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={resetImport}
                    className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    Import another file
                  </button>
                </div>
              )}

              {importState.phase === 'error' && (
                <div className="space-y-2.5">
                  <div className="flex items-start gap-1.5 text-[11.5px] text-rose-600">
                    <ErrorIcon />
                    <span>{importState.message}</span>
                  </div>
                  <button
                    type="button"
                    onClick={resetImport}
                    className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    Try again
                  </button>
                </div>
              )}
            </div>
          </div>

          <div style={{ height: 32 }} />
        </div>
      </div>
    </div>
  )
}

// ── Micro icons ───────────────────────────────────────────────────────────────

function ExcelIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 20 20" fill="none" aria-hidden>
      <rect x="2" y="2" width="16" height="16" rx="3" fill="#1D6F42"/>
      <path d="M6 7l2.5 3L6 13h1.8L10 10.5 12.2 13H14l-2.5-3L14 7h-1.8L10 9.5 7.8 7H6z" fill="white"/>
    </svg>
  )
}

function UploadIcon({ color = 'currentColor' }: { color?: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 2v9M5 5l3-3 3 3M3 12h10" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function Spinner() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="animate-spin text-slate-400" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40 20" strokeLinecap="round"/>
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 8l3.5 3.5L13 5" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function ErrorIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="flex-shrink-0 mt-0.5" aria-hidden>
      <circle cx="8" cy="8" r="6.5" stroke="#e11d48" strokeWidth="1.5"/>
      <path d="M8 5v4M8 10.5v.5" stroke="#e11d48" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}
