import * as XLSX from 'xlsx'
import type { Project } from '../features/projects/types/project.types'
import type { Task } from '../features/tasks/types/task.types'

// ── helpers ───────────────────────────────────────────────────────────────────

const stripHtml = (html: string | null | undefined) =>
  html ? html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim() : ''

function taskTypeName(t: Task) {
  if (t.isMilestone) return 'Milestone'
  if (t.isGroup)     return 'Activity'
  return 'Task'
}

// ── export ────────────────────────────────────────────────────────────────────

const TASK_HEADERS = [
  'ID',
  'Type',
  'Subject',
  'Parent Task ID',
  'Status',
  'Priority',
  'Activity Type',
  'RACI',
  'Start Date',
  'Due Date',
  'Progress %',
  'Engagement Days',
  'Description',
  'Assigned To',
  'Department',
]

const TASK_HELP = [
  '(leave blank to create new; existing ID = update)',
  '(Milestone / Activity / Task)',
  '(required — name of the item)',
  '(task ID of the parent milestone or activity)',
  '(Open / Working on it / Pending Review / Completed / Cancelled)',
  '(Low / Medium / High / Urgent)',
  '(KRA / activity category label)',
  '(RACI responsibility label)',
  '(yyyy-mm-dd)',
  '(yyyy-mm-dd)',
  '(0 – 100)',
  '(working days; leave blank to use default)',
  '(plain text description)',
  '(semicolon-separated emails, e.g. a@org.org; b@org.org)',
  '(department name)',
]

const BLANK_TASK_TEMPLATE = [
  '',
  'Task',
  'New task name',
  '',
  'Open',
  'Medium',
  '',
  '',
  '',
  '',
  0,
  1,
  '',
  '',
  '',
]

export function exportProjectToExcel(project: Project, tasks: Task[]) {
  const wb = XLSX.utils.book_new()

  // ── Sheet 1: Project Info ─────────────────────────────────────────────────
  const projectRows = [
    ['Field', 'Value'],
    ['Project ID',   project.name],
    ['Display Name', project.displayName],
    ['Status',       project.status],
    ['Start Date',   project.expectedStartDate ?? ''],
    ['End Date',     project.expectedEndDate   ?? ''],
    ['Owner',        project.owner             ?? ''],
    ['Notes',        stripHtml(project.notes)],
  ]
  const wsProject = XLSX.utils.aoa_to_sheet(projectRows)
  wsProject['!cols'] = [{ wch: 16 }, { wch: 60 }]
  XLSX.utils.book_append_sheet(wb, wsProject, 'Project Info')

  // ── Sheet 2: Tasks ────────────────────────────────────────────────────────
  const projectTasks = tasks.filter((t) => t.project === project.name)

  // Sort: milestones first, then activities, then tasks; alphabetically within
  const typeOrder = (t: Task) => (t.isMilestone ? 0 : t.isGroup ? 1 : 2)
  const sorted = [...projectTasks].sort((a, b) => typeOrder(a) - typeOrder(b) || a.subject.localeCompare(b.subject))

  // Row 1: headers, Row 2: help text, Row 3+: data (or one blank template if empty)
  const taskRows: (string | number)[][] = [TASK_HEADERS, TASK_HELP]

  if (sorted.length === 0) {
    taskRows.push(BLANK_TASK_TEMPLATE)
  } else {
    for (const t of sorted) {
      taskRows.push([
        t.id,
        taskTypeName(t),
        t.subject,
        t.parentTask ?? '',
        t.status,
        t.priority,
        t.activityType  ?? '',
        t.customRaci    ?? '',
        t.startDate     ?? '',
        t.dueDate       ?? '',
        t.progress      ?? 0,
        t.engagementDays ?? '',
        stripHtml(t.description),
        t.assignedTo.join('; '),
        t.department    ?? '',
      ])
    }
  }

  const wsTasks = XLSX.utils.aoa_to_sheet(taskRows)
  wsTasks['!cols'] = [
    { wch: 20 }, { wch: 10 }, { wch: 40 }, { wch: 20 },
    { wch: 16 }, { wch: 10 }, { wch: 24 }, { wch: 22 },
    { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 16 },
    { wch: 50 }, { wch: 30 }, { wch: 20 },
  ]
  XLSX.utils.book_append_sheet(wb, wsTasks, 'Tasks')

  // ── trigger download ──────────────────────────────────────────────────────
  const slug    = project.name.replace(/[^a-z0-9_-]/gi, '_')
  const date    = new Date().toISOString().slice(0, 10)
  const filename = `${slug}_${date}.xlsx`

  const buf  = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ── import parsing ────────────────────────────────────────────────────────────

export interface ImportRow {
  id:             string
  type:           'Milestone' | 'Activity' | 'Task'
  subject:        string
  parentTaskId:   string
  status:         string
  priority:       string
  activityType:   string
  customRaci:     string
  startDate:      string
  dueDate:        string
  progress:       number
  engagementDays: number | null
  description:    string
  assignedTo:     string[]
  department:     string
}

function normaliseType(raw: string): ImportRow['type'] {
  const v = (raw ?? '').trim().toLowerCase()
  if (v === 'milestone') return 'Milestone'
  if (v === 'activity')  return 'Activity'
  return 'Task'
}

function normalisePriority(raw: string) {
  const map: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' }
  return map[(raw ?? '').trim().toLowerCase()] ?? 'Medium'
}

function normaliseStatus(raw: string) {
  const allowed = ['Open', 'Working on it', 'Pending Review', 'Overdue', 'Completed', 'Cancelled']
  const match = allowed.find((s) => s.toLowerCase() === (raw ?? '').trim().toLowerCase())
  return match ?? 'Open'
}

function parseDate(raw: unknown): string {
  if (!raw) return ''
  if (typeof raw === 'number') {
    // Excel serial date — always reliable
    const d = XLSX.SSF.parse_date_code(raw)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.y}-${pad(d.m)}-${pad(d.d)}`
  }
  const s = String(raw).trim()
  if (!s) return ''
  // yyyy-mm-dd (ISO) — most common from our own export
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const parts = s.split(/[-/]/)
  if (parts.length === 3) {
    const [a, b, c] = parts
    // yyyy-mm-dd or yyyy/mm/dd
    if (a.length === 4) return `${a}-${b.padStart(2,'0')}-${c.padStart(2,'0')}`
    // m/d/yy or m/d/yyyy (US short form Excel exports as text)
    const year = c.length === 2 ? `20${c}` : c
    // b > 12 means a=month, b=day; otherwise assume US m/d/yy
    if (Number(b) > 12) return `${year}-${a.padStart(2,'0')}-${b.padStart(2,'0')}`
    // dd-mm-yyyy or dd/mm/yyyy (ambiguous — prefer m/d for US locale)
    if (Number(a) > 12) return `${year}-${b.padStart(2,'0')}-${a.padStart(2,'0')}`
    // Fall back to m/d/yy (most common Excel short date format)
    return `${year}-${a.padStart(2,'0')}-${b.padStart(2,'0')}`
  }
  return ''
}

export function parseImportFile(file: File): Promise<ImportRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.onload  = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb   = XLSX.read(data, { type: 'array', cellDates: false })

        const sheetName = wb.SheetNames.find((n) => n.toLowerCase() === 'tasks') ?? wb.SheetNames[1] ?? wb.SheetNames[0]
        const ws = wb.Sheets[sheetName]
        if (!ws) throw new Error('No Tasks sheet found in the workbook.')

        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })

        const parsed: ImportRow[] = []
        for (const row of rows) {
          const subject = String(row['Subject'] ?? '').trim()
          // Skip the help-text row (its Subject starts with '(' from TASK_HELP)
          if (!subject || subject.startsWith('(')) continue

          const assignedRaw = String(row['Assigned To'] ?? '').trim()
          const assignedTo  = assignedRaw ? assignedRaw.split(/[;,]/).map((s) => s.trim()).filter(Boolean) : []

          const engRaw = row['Engagement Days']
          const engDays = engRaw !== '' && !isNaN(Number(engRaw)) ? Number(engRaw) : null

          parsed.push({
            id:             String(row['ID'] ?? '').trim(),
            type:           normaliseType(String(row['Type'] ?? '')),
            subject,
            parentTaskId:   String(row['Parent Task ID'] ?? '').trim(),
            status:         normaliseStatus(String(row['Status']   ?? '')),
            priority:       normalisePriority(String(row['Priority'] ?? '')),
            activityType:   String(row['Activity Type'] ?? '').trim(),
            customRaci:     String(row['RACI']          ?? '').trim(),
            startDate:      parseDate(row['Start Date']),
            dueDate:        parseDate(row['Due Date']),
            progress:       Math.min(100, Math.max(0, Number(row['Progress %'] ?? 0) || 0)),
            engagementDays: engDays,
            description:    String(row['Description']    ?? '').trim(),
            assignedTo,
            department:     String(row['Department']     ?? '').trim(),
          })
        }

        resolve(parsed)
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    }
    reader.readAsArrayBuffer(file)
  })
}
