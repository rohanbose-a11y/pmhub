import { useEffect, useRef } from 'react'

import { httpClient } from '../../api/httpClient'
import { env } from '../../config/env'
import { useAuthStore } from '../../store/authStore'

// ─── Shared storage keys ──────────────────────────────────────────────────────

const CFG_KEY            = 'wa_shift_config'
const LOGS_KEY           = 'wa_logs'
const SCHEDULER_RUNS_KEY = 'wa_scheduler_runs'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ShiftReminderConfig {
  checkinTime:  string
  checkoutTime: string
  enabled:      boolean
}

type LogType =
  | 'checkin_reminder'
  | 'checkin_confirmation'
  | 'checkout_reminder'
  | 'skipped_on_leave'
  | 'skipped_holiday'
  | 'skipped_checked_out'
  | 'skipped_no_phone'

interface LogEntry {
  id: string; ts: string; employeeName: string; phone: string
  logType: LogType; status: 'sent' | 'failed' | 'skipped'; detail?: string
}

interface SchedulerRun {
  id: string; ts: string; shiftName: string
  type: 'checkin' | 'checkout'
  sent: number; skipped: number; failed: number
}

interface EmpRow {
  name: string; employee_name: string; cell_number: string | null
}

interface HolidayEntry {
  holiday_date: string; description: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function loadReminderConfigs(): Record<string, ShiftReminderConfig> {
  try { return JSON.parse(localStorage.getItem(CFG_KEY) || '{}') } catch { return {} }
}

function appendLog(entry: LogEntry) {
  try {
    const existing: LogEntry[] = JSON.parse(localStorage.getItem(LOGS_KEY) || '[]')
    localStorage.setItem(LOGS_KEY, JSON.stringify([entry, ...existing].slice(0, 500)))
  } catch { /* non-fatal */ }
}

function appendSchedulerRun(run: SchedulerRun) {
  try {
    const existing: SchedulerRun[] = JSON.parse(localStorage.getItem(SCHEDULER_RUNS_KEY) || '[]')
    localStorage.setItem(SCHEDULER_RUNS_KEY, JSON.stringify([run, ...existing].slice(0, 200)))
  } catch { /* non-fatal */ }
}

function cleanPhone(raw: string): string {
  let p = (raw ?? '').replace(/\D/g, '')
  if (p.length === 10 && /^[6-9]/.test(p)) p = '91' + p
  return p
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
}

function todayLabel(): string {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date())
}

async function sendWhatsApp(
  phone: string, templateId: string, params: string[],
): Promise<{ ok: boolean; error?: string }> {
  try {
    const body = new URLSearchParams({
      channel: 'whatsapp', source: env.gupshupSrcNumber, destination: phone,
      'src.name': env.gupshupAppName, template: JSON.stringify({ id: templateId, params }),
    })
    const res = await fetch(`${env.gupshupBase}/wa/api/v1/template/msg`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: body.toString(),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 160)}` }
    }
    const json: { status?: string; message?: string } = await res.json().catch(() => ({}))
    if (json.status === 'error') return { ok: false, error: json.message ?? 'Gupshup error' }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error' }
  }
}

function todayRangeStr() {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const d = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  return { from: `${d} 00:00:00`, to: `${d} 23:59:59` }
}

async function getEmployeeCheckinTime(employeeId: string): Promise<string | null> {
  const { from, to } = todayRangeStr()
  const res = await httpClient.get<{ data: { time: string }[] }>('/api/resource/Employee Checkin', {
    params: {
      fields: JSON.stringify(['time']),
      filters: JSON.stringify([
        ['Employee Checkin', 'employee', '=', employeeId],
        ['Employee Checkin', 'log_type', '=', 'IN'],
        ['Employee Checkin', 'time', '>=', from],
        ['Employee Checkin', 'time', '<=', to],
      ]),
      limit_page_length: 1, order_by: 'time asc',
    },
  })
  if (!res.data.data.length) return null
  const dt = new Date(res.data.data[0].time.replace(' ', 'T'))
  return dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase()
}

async function hasEmployeeCheckedOut(employeeId: string): Promise<boolean> {
  const { from, to } = todayRangeStr()
  const res = await httpClient.get<{ data: { name: string }[] }>('/api/resource/Employee Checkin', {
    params: {
      fields: JSON.stringify(['name']),
      filters: JSON.stringify([
        ['Employee Checkin', 'employee', '=', employeeId],
        ['Employee Checkin', 'log_type', '=', 'OUT'],
        ['Employee Checkin', 'time', '>=', from],
        ['Employee Checkin', 'time', '<=', to],
      ]),
      limit_page_length: 1,
    },
  })
  return res.data.data.length > 0
}

async function hasLeaveToday(employeeId: string): Promise<boolean> {
  const { from } = todayRangeStr()
  const today = from.slice(0, 10)
  const res = await httpClient.get<{ data: { name: string }[] }>('/api/resource/Leave Application', {
    params: {
      fields: JSON.stringify(['name']),
      filters: JSON.stringify([
        ['Leave Application', 'employee', '=', employeeId],
        ['Leave Application', 'from_date', '<=', today],
        ['Leave Application', 'to_date', '>=', today],
        ['Leave Application', 'status', '=', 'Approved'],
        ['Leave Application', 'docstatus', '=', 1],
      ]),
      limit_page_length: 1,
    },
  })
  return res.data.data.length > 0
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useWhatsAppScheduler() {
  const user         = useAuthStore((s) => s.user)
  const isAdmin      = user?.roles?.includes('Administrator') ?? false
  const envConfigured = !!(
    env.gupshupAppName && env.gupshupSrcNumber &&
    env.gupshupCheckinTmpl && env.gupshupCheckinConfirmTmpl && env.gupshupCheckoutTmpl
  )

  // In-memory: holiday cache (refreshed daily) + fired-today dedup
  const holidaysCacheRef  = useRef<{ date: string; entries: HolidayEntry[] }>({ date: '', entries: [] })
  const schedulerFiredRef = useRef<Record<string, string>>({}) // "shift::type" → ISO date

  // WhatsAppAdminPage can dispatch 'wa-scheduler-reset' to clear dedup for re-testing
  useEffect(() => {
    const handler = () => { schedulerFiredRef.current = {} }
    window.addEventListener('wa-scheduler-reset', handler)
    return () => window.removeEventListener('wa-scheduler-reset', handler)
  }, [])

  useEffect(() => {
    if (!isAdmin || !envConfigured) return

    async function loadTodayHolidays(): Promise<HolidayEntry[]> {
      const todayStr = new Date().toISOString().slice(0, 10)
      if (holidaysCacheRef.current.date === todayStr) return holidaysCacheRef.current.entries

      try {
        const pad = (n: number) => String(n).padStart(2, '0')
        const now = new Date()
        const d   = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`

        const listRes = await httpClient.get<{ data: { name: string }[] }>('/api/resource/Holiday List', {
          params: {
            fields:  JSON.stringify(['name']),
            filters: JSON.stringify([
              ['Holiday List', 'from_date', '<=', d],
              ['Holiday List', 'to_date',   '>=', d],
            ]),
            limit_page_length: 10,
          },
        })

        const entries: HolidayEntry[] = []
        for (const { name } of listRes.data.data ?? []) {
          const hlRes = await httpClient.get<{ data: { holidays: { holiday_date: string; description: string }[] } }>(
            `/api/resource/Holiday List/${encodeURIComponent(name)}`,
          )
          for (const h of hlRes.data.data?.holidays ?? []) {
            if (h.holiday_date.slice(0, 10) === todayStr) entries.push(h)
          }
        }

        holidaysCacheRef.current = { date: todayStr, entries }
        return entries
      } catch {
        return []
      }
    }

    async function tick() {
      const now      = new Date()
      const todayStr = now.toISOString().slice(0, 10)
      const cfg      = loadReminderConfigs()   // always read latest from localStorage

      for (const [shiftName, shiftCfg] of Object.entries(cfg)) {
        if (!shiftCfg.enabled) continue

        for (const type of ['checkin', 'checkout'] as const) {
          const target = type === 'checkin' ? shiftCfg.checkinTime : shiftCfg.checkoutTime
          const key    = `${shiftName}::${type}`

          // In-memory dedup — resets on page reload
          if (schedulerFiredRef.current[key] === todayStr) continue

          // 1-minute forward window
          const [th, tm]   = target.split(':').map(Number)
          const nowMins    = now.getHours() * 60 + now.getMinutes()
          const targetMins = th * 60 + tm
          const diff       = nowMins - targetMins
          if (diff < 0 || diff > 1) continue

          // Mark fired before async work to prevent double-fire
          schedulerFiredRef.current[key] = todayStr

          // Holiday check
          const todayHolidays = await loadTodayHolidays()
          if (todayHolidays.length > 0) {
            const holidayName = stripHtml(todayHolidays[0].description) || 'Holiday'
            appendSchedulerRun({ id: crypto.randomUUID(), ts: now.toISOString(), shiftName, type, sent: 0, skipped: 0, failed: 0 })
            appendLog({
              id: crypto.randomUUID(), ts: now.toISOString(),
              employeeName: `All Employees — ${shiftName}`,
              phone: '', logType: 'skipped_holiday', status: 'skipped', detail: holidayName,
            })
            continue
          }

          // Fetch employees for this shift and send
          try {
            const res = await httpClient.get<{ data: EmpRow[] }>('/api/resource/Employee', {
              params: {
                fields:  JSON.stringify(['name', 'employee_name', 'cell_number']),
                filters: JSON.stringify([
                  ['Employee', 'status',       '=', 'Active'],
                  ['Employee', 'default_shift', '=', shiftName],
                ]),
                limit_page_length: 500,
              },
            })

            const date = todayLabel()
            let sent = 0, skipped = 0, failed = 0

            for (const emp of res.data.data) {
              const baseLog = { id: crypto.randomUUID(), ts: new Date().toISOString(), employeeName: emp.employee_name }

              if (!emp.cell_number) {
                appendLog({ ...baseLog, phone: '', logType: 'skipped_no_phone', status: 'skipped' })
                skipped++; continue
              }

              const phone     = cleanPhone(emp.cell_number)
              const firstName = emp.employee_name.split(' ')[0]

              const onLeave = await hasLeaveToday(emp.name).catch(() => false)
              if (onLeave) {
                appendLog({ ...baseLog, phone, logType: 'skipped_on_leave', status: 'skipped' })
                skipped++; continue
              }

              let logType: LogType
              let templateId: string
              let params: string[]

              if (type === 'checkin') {
                const checkinTime = await getEmployeeCheckinTime(emp.name).catch(() => null)
                if (checkinTime) {
                  logType = 'checkin_confirmation'; templateId = env.gupshupCheckinConfirmTmpl; params = [firstName, checkinTime, date]
                } else {
                  logType = 'checkin_reminder'; templateId = env.gupshupCheckinTmpl; params = [firstName, date]
                }
              } else {
                const alreadyOut = await hasEmployeeCheckedOut(emp.name).catch(() => false)
                if (alreadyOut) {
                  appendLog({ ...baseLog, phone, logType: 'skipped_checked_out', status: 'skipped' })
                  skipped++; continue
                }
                logType = 'checkout_reminder'; templateId = env.gupshupCheckoutTmpl; params = [firstName, date]
              }

              const result = await sendWhatsApp(phone, templateId, params)
              appendLog({ ...baseLog, phone, logType, status: result.ok ? 'sent' : 'failed', detail: result.error })
              result.ok ? sent++ : failed++
            }

            appendSchedulerRun({ id: crypto.randomUUID(), ts: new Date().toISOString(), shiftName, type, sent, skipped, failed })
          } catch { /* non-fatal */ }
        }
      }
    }

    const id = setInterval(() => { void tick() }, 30_000)
    void tick()
    return () => clearInterval(id)
  }, [isAdmin, envConfigured])
}
