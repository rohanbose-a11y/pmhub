import { useState, useEffect } from 'react'

import { useAuthStore } from '../../../store/authStore'
import { httpClient } from '../../../api/httpClient'
import { env } from '../../../config/env'

// ─── Storage keys ─────────────────────────────────────────────────────────────

const CFG_KEY       = 'wa_shift_config'
const LOGS_KEY      = 'wa_logs'
const SCHEDULER_KEY = 'wa_scheduler_fired'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ErpShift {
  name:       string
  start_time: string
  end_time:   string
}

interface ShiftReminderConfig {
  checkinTime:  string
  checkoutTime: string
  enabled:      boolean
}

interface ShiftRow extends ErpShift, ShiftReminderConfig {}

interface LogEntry {
  id:           string
  ts:           string
  employeeName: string
  phone:        string
  type:         'checkin' | 'checkout'
  status:       'sent' | 'failed'
  error?:       string
}

interface EmpRow {
  name:          string
  employee_name: string
  cell_number:   string | null
}

interface HolidayEntry {
  holiday_date: string   // YYYY-MM-DD
  description:  string
  parent:       string   // holiday list name
}

interface ErpShiftFull extends ErpShift {
  holiday_list?: string | null
}

type Tab = 'dashboard' | 'settings' | 'logs'

// ─── localStorage helpers ─────────────────────────────────────────────────────

function loadReminderConfigs(): Record<string, ShiftReminderConfig> {
  try {
    const s = localStorage.getItem(CFG_KEY)
    return s ? JSON.parse(s) : {}
  } catch { return {} }
}

function saveReminderConfigs(cfg: Record<string, ShiftReminderConfig>) {
  localStorage.setItem(CFG_KEY, JSON.stringify(cfg))
}

function loadLogs(): LogEntry[] {
  try {
    const s = localStorage.getItem(LOGS_KEY)
    return s ? JSON.parse(s) : []
  } catch { return [] }
}

function appendLog(entry: LogEntry) {
  const existing = loadLogs()
  localStorage.setItem(LOGS_KEY, JSON.stringify([entry, ...existing].slice(0, 500)))
}

// ─── Scheduler fire-tracking (per shift + type + date) ───────────────────────

function wasFiredToday(shiftName: string, type: 'checkin' | 'checkout'): boolean {
  try {
    const today = new Date().toISOString().slice(0, 10)
    const data: Record<string, string[]> = JSON.parse(localStorage.getItem(SCHEDULER_KEY) || '{}')
    return (data[today] ?? []).includes(`${shiftName}::${type}`)
  } catch { return false }
}

function markFiredToday(shiftName: string, type: 'checkin' | 'checkout') {
  try {
    const today = new Date().toISOString().slice(0, 10)
    const data: Record<string, string[]> = JSON.parse(localStorage.getItem(SCHEDULER_KEY) || '{}')
    if (!data[today]) data[today] = []
    if (!data[today].includes(`${shiftName}::${type}`)) data[today].push(`${shiftName}::${type}`)
    // Keep only last 7 days
    const trimmed: Record<string, string[]> = {}
    Object.keys(data).sort().slice(-7).forEach((k) => { trimmed[k] = data[k] })
    localStorage.setItem(SCHEDULER_KEY, JSON.stringify(trimmed))
  } catch { /* non-fatal */ }
}

// ─── Time helpers ─────────────────────────────────────────────────────────────

function erpTimeToHHMM(t: string): string {
  return t?.slice(0, 5) ?? '00:00'
}

function addMinutes(hhmm: string, delta: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  let total = h * 60 + m + delta
  total = ((total % 1440) + 1440) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function todayLabel(): string {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date())
}

function fmtTs(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

// ─── Gupshup API call ─────────────────────────────────────────────────────────

async function sendWhatsApp(
  phone: string,
  recipientName: string,
  type: 'checkin' | 'checkout',
  dateLabel: string,
): Promise<{ ok: boolean; error?: string }> {
  const templateId = type === 'checkin' ? env.gupshupCheckinTmpl : env.gupshupCheckoutTmpl
  const firstName  = recipientName.split(' ')[0]

  try {
    const body = new URLSearchParams({
      channel:     'whatsapp',
      source:      env.gupshupSrcNumber,
      destination: phone,
      'src.name':  env.gupshupAppName,
      template:    JSON.stringify({ id: templateId, params: [firstName, dateLabel] }),
    })

    const res = await fetch(`${env.gupshupBase}/wa/api/v1/template/msg`, {
      method:  'POST',
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

// ─── Component ────────────────────────────────────────────────────────────────

export function WhatsAppAdminPage() {
  const user = useAuthStore((s) => s.user)

  const [tab,           setTab]           = useState<Tab>('dashboard')
  const [erpShifts,     setErpShifts]     = useState<ErpShift[]>([])
  const [reminderCfg,   setReminderCfg]   = useState<Record<string, ShiftReminderConfig>>(loadReminderConfigs)
  const [empCounts,     setEmpCounts]     = useState<Record<string, number>>({})
  const [loadingShifts, setLoadingShifts] = useState(true)
  const [fetchError,    setFetchError]    = useState<string | null>(null)
  const [logs,          setLogs]          = useState<LogEntry[]>(loadLogs)
  const [saved,         setSaved]         = useState(false)

  // Test send
  const [testPhone,   setTestPhone]   = useState('')
  const [testName,    setTestName]    = useState('')
  const [testType,    setTestType]    = useState<'checkin' | 'checkout'>('checkin')
  const [testSending, setTestSending] = useState(false)
  const [testResult,  setTestResult]  = useState<{ ok: boolean; msg: string } | null>(null)

  // Bulk send
  const [bulkSending,  setBulkSending]  = useState(false)
  const [bulkProgress, setBulkProgress] = useState('')

  // Scheduler
  const [lastSchedulerFire, setLastSchedulerFire] = useState<string | null>(null)

  // Calendar
  const today          = new Date()
  const [calYear,       setCalYear]       = useState(today.getFullYear())
  const [calMonth,      setCalMonth]      = useState(today.getMonth())   // 0-based
  const [holidayLists,      setHolidayLists]      = useState<string[]>([])
  const [selectedHolidayList, setSelectedHolidayList] = useState<string>('')
  const [holidays,            setHolidays]            = useState<HolidayEntry[]>([])
  const [loadingHolidays,     setLoadingHolidays]     = useState(false)

  const isAdmin      = user?.roles?.includes('Administrator') ?? false
  const envConfigured = !!(env.gupshupAppName && env.gupshupSrcNumber && env.gupshupCheckinTmpl && env.gupshupCheckoutTmpl)

  // ── Fetch shifts + employee counts ────────────────────────────────────────
  useEffect(() => {
    if (!isAdmin) return

    async function load() {
      try {
        const shiftRes = await httpClient.get<{ data: ErpShiftFull[] }>('/api/resource/Shift Type', {
          params: { fields: JSON.stringify(['name', 'start_time', 'end_time', 'holiday_list']), limit_page_length: 100 },
        })
        const shifts = shiftRes.data.data ?? []
        setErpShifts(shifts)

        setReminderCfg((prev) => {
          const next = { ...prev }
          let changed = false
          for (const s of shifts) {
            if (!next[s.name]) {
              next[s.name] = {
                checkinTime:  addMinutes(erpTimeToHHMM(s.start_time), 15),
                checkoutTime: addMinutes(erpTimeToHHMM(s.end_time), -15),
                enabled:      false,
              }
              changed = true
            }
          }
          if (changed) saveReminderConfigs(next)
          return next
        })

        try {
          const empRes = await httpClient.get<{ data: { default_shift: string | null }[] }>('/api/resource/Employee', {
            params: {
              fields:            JSON.stringify(['default_shift']),
              filters:           JSON.stringify([['Employee', 'status', '=', 'Active']]),
              limit_page_length: 1000,
            },
          })
          const counts: Record<string, number> = {}
          for (const s of shifts) counts[s.name] = 0
          for (const emp of empRes.data.data) {
            const sh = emp.default_shift
            if (sh && sh in counts) counts[sh]++
          }
          setEmpCounts(counts)
        } catch { /* non-critical */ }
      } catch (err) {
        setFetchError(err instanceof Error ? err.message : 'Failed to fetch shifts')
      } finally {
        setLoadingShifts(false)
      }
    }

    void load()
  }, [isAdmin])

  // ── Fetch active Holiday Lists (from_date ≤ today ≤ to_date) ────────────
  useEffect(() => {
    if (!isAdmin) return
    const pad     = (n: number) => String(n).padStart(2, '0')
    const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
    httpClient
      .get<{ data: { name: string }[] }>('/api/resource/Holiday List', {
        params: {
          fields:            JSON.stringify(['name']),
          filters:           JSON.stringify([
            ['Holiday List', 'from_date', '<=', todayStr],
            ['Holiday List', 'to_date',   '>=', todayStr],
          ]),
          limit_page_length: 100,
        },
      })
      .then((res) => {
        const names = (res.data.data ?? []).map((r) => r.name)
        setHolidayLists(names)
        if (names.length > 0) {
          // Prefer the list linked to the first shift that has one
          const linked = (erpShifts as ErpShiftFull[]).find((s) => s.holiday_list)?.holiday_list
          setSelectedHolidayList(linked && names.includes(linked) ? linked : names[0])
        }
      })
      .catch(() => {})
  }, [isAdmin, erpShifts])

  // ── Fetch holidays from Holiday List document (child table) ─────────────
  useEffect(() => {
    if (!isAdmin || !selectedHolidayList) { setHolidays([]); return }

    const pad     = (n: number) => String(n).padStart(2, '0')
    const from    = `${calYear}-${pad(calMonth + 1)}-01`
    const lastDay = new Date(calYear, calMonth + 1, 0).getDate()
    const to      = `${calYear}-${pad(calMonth + 1)}-${pad(lastDay)}`

    setLoadingHolidays(true)
    httpClient
      .get<{ data: { holidays: { holiday_date: string; description: string }[] } }>(
        `/api/resource/Holiday List/${encodeURIComponent(selectedHolidayList)}`,
      )
      .then((res) => {
        const all = res.data.data?.holidays ?? []
        const inRange = all
          .filter((h) => {
            const d = h.holiday_date.slice(0, 10)
            return d >= from && d <= to
          })
          .map((h) => ({ holiday_date: h.holiday_date, description: h.description, parent: selectedHolidayList }))
        setHolidays(inRange)
      })
      .catch(() => setHolidays([]))
      .finally(() => setLoadingHolidays(false))
  }, [isAdmin, selectedHolidayList, calYear, calMonth])

  // ── Browser scheduler — checks every 30s, fires when time matches ─────────
  useEffect(() => {
    if (!isAdmin || !envConfigured) return

    async function tick() {
      const now   = new Date()
      const hhmm  = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
      const cfg   = loadReminderConfigs()

      for (const [shiftName, shiftCfg] of Object.entries(cfg)) {
        if (!shiftCfg.enabled) continue

        for (const type of ['checkin', 'checkout'] as const) {
          const target = type === 'checkin' ? shiftCfg.checkinTime : shiftCfg.checkoutTime
          if (hhmm !== target) continue
          if (wasFiredToday(shiftName, type)) continue

          markFiredToday(shiftName, type)
          setLastSchedulerFire(`${type === 'checkin' ? 'Check-in' : 'Check-out'} sent for "${shiftName}" at ${hhmm}`)

          // Fetch employees for this specific shift and send
          try {
            const res = await httpClient.get<{ data: EmpRow[] }>('/api/resource/Employee', {
              params: {
                fields:  JSON.stringify(['name', 'employee_name', 'cell_number']),
                filters: JSON.stringify([
                  ['Employee', 'status',        '=', 'Active'],
                  ['Employee', 'default_shift',  '=', shiftName],
                ]),
                limit_page_length: 500,
              },
            })
            const employees = res.data.data.filter((e) => !!e.cell_number)
            const date = todayLabel()
            for (const emp of employees) {
              const phone  = (emp.cell_number ?? '').replace(/\D/g, '')
              const result = await sendWhatsApp(phone, emp.employee_name, type, date)
              appendLog({
                id: crypto.randomUUID(), ts: new Date().toISOString(),
                employeeName: emp.employee_name, phone, type,
                status: result.ok ? 'sent' : 'failed', error: result.error,
              })
            }
            setLogs(loadLogs())
          } catch { /* non-fatal — already logged */ }
        }
      }
    }

    const id = setInterval(() => { void tick() }, 30_000)
    void tick() // run immediately on mount too
    return () => clearInterval(id)
  }, [isAdmin, envConfigured])

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F8FAFC' }}>
        <p className="text-[14px] text-slate-400">You don't have permission to view this page.</p>
      </div>
    )
  }

  const shiftRows: ShiftRow[] = erpShifts.map((s) => ({
    ...s,
    ...(reminderCfg[s.name] ?? {
      checkinTime:  addMinutes(erpTimeToHHMM(s.start_time), 15),
      checkoutTime: addMinutes(erpTimeToHHMM(s.end_time), -15),
      enabled:      false,
    }),
  }))

  function updateShiftConfig(name: string, patch: Partial<ShiftReminderConfig>) {
    setReminderCfg((prev) => ({ ...prev, [name]: { ...prev[name], ...patch } }))
  }

  function handleSave() {
    saveReminderConfigs(reminderCfg)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  function handleClearLogs() {
    localStorage.removeItem(LOGS_KEY)
    setLogs([])
  }

  async function handleTestSend() {
    if (!testPhone || !testName) return
    setTestSending(true)
    setTestResult(null)
    const result = await sendWhatsApp(testPhone, testName, testType, todayLabel())
    appendLog({
      id: crypto.randomUUID(), ts: new Date().toISOString(),
      employeeName: testName, phone: testPhone,
      type: testType, status: result.ok ? 'sent' : 'failed', error: result.error,
    })
    setLogs(loadLogs())
    setTestResult({ ok: result.ok, msg: result.ok ? 'Message sent successfully.' : (result.error ?? 'Failed') })
    setTestSending(false)
  }

  async function handleBulkSend(type: 'checkin' | 'checkout') {
    setBulkSending(true)
    setBulkProgress('Fetching active employees…')
    try {
      const res = await httpClient.get<{ data: EmpRow[] }>('/api/resource/Employee', {
        params: {
          fields:            JSON.stringify(['name', 'employee_name', 'cell_number']),
          filters:           JSON.stringify([['Employee', 'status', '=', 'Active']]),
          limit_page_length: 500,
        },
      })
      const employees = res.data.data.filter((e) => !!e.cell_number)
      if (employees.length === 0) {
        setBulkProgress('No employees with a phone number found.')
        setBulkSending(false)
        return
      }
      setBulkProgress(`Sending to ${employees.length} employee(s)…`)
      let sent = 0, failed = 0
      const date = todayLabel()
      for (const emp of employees) {
        const phone  = (emp.cell_number ?? '').replace(/\D/g, '')
        const result = await sendWhatsApp(phone, emp.employee_name, type, date)
        appendLog({ id: crypto.randomUUID(), ts: new Date().toISOString(), employeeName: emp.employee_name, phone, type, status: result.ok ? 'sent' : 'failed', error: result.error })
        result.ok ? sent++ : failed++
      }
      setLogs(loadLogs())
      setBulkProgress(`Done — ${sent} sent, ${failed} failed.`)
    } catch (err) {
      setBulkProgress(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setBulkSending(false)
    }
  }

  // ──────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen" style={{ background: '#F8FAFC' }}>
      <div className="px-6 pt-5 pb-16">

        {/* ── Page header ───────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <h1 className="text-[20px] font-bold text-slate-900 tracking-tight">WhatsApp Notifications</h1>
            <span
              className="text-[10.5px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' }}
            >
              Admin Only
            </span>
          </div>
        </div>

        {/* ── Tabs ──────────────────────────────────────────────────────────── */}
        <div
          className="inline-flex items-center gap-1 p-1 rounded-xl mb-5"
          style={{ background: 'white', border: '1px solid #E5E7EB' }}
        >
          {([
            { id: 'dashboard', label: 'Dashboard' },
            { id: 'settings',  label: 'Settings' },
            { id: 'logs',      label: `Logs${logs.length > 0 ? ` (${logs.length})` : ''}` },
          ] as { id: Tab; label: string }[]).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => { setTab(t.id); if (t.id === 'logs') setLogs(loadLogs()) }}
              className="flex items-center justify-center px-5 py-1.5 rounded-lg text-[12.5px] font-semibold transition-all"
              style={{
                background: tab === t.id ? '#F5F3FF' : 'transparent',
                color:      tab === t.id ? '#7B3FF2' : '#6B7280',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ══ DASHBOARD ═════════════════════════════════════════════════════════ */}
        {tab === 'dashboard' && (() => {
          const allLogs   = loadLogs()
          const todayStr  = new Date().toISOString().slice(0, 10)
          const todayLogs = allLogs.filter((l) => l.ts.slice(0, 10) === todayStr)

          const totalSent    = allLogs.filter((l) => l.status === 'sent').length
          const totalFailed  = allLogs.filter((l) => l.status === 'failed').length
          const todaySent    = todayLogs.filter((l) => l.status === 'sent').length
          const todayFailed  = todayLogs.filter((l) => l.status === 'failed').length
          const checkinSent  = allLogs.filter((l) => l.type === 'checkin'  && l.status === 'sent').length
          const checkoutSent = allLogs.filter((l) => l.type === 'checkout' && l.status === 'sent').length
          const successRate  = allLogs.length > 0 ? Math.round((totalSent / allLogs.length) * 100) : 0
          const recentLogs   = allLogs.slice(0, 6)

          const enabledShifts = shiftRows.filter((s) => s.enabled).length

          const StatCard = ({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) => (
            <div className="rounded-2xl px-5 py-4" style={{ background: 'white', border: '1px solid #E5E7EB' }}>
              <p className="text-[11.5px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
              <p className="text-[28px] font-bold leading-none" style={{ color }}>{value}</p>
              {sub && <p className="text-[11.5px] text-slate-400 mt-1">{sub}</p>}
            </div>
          )

          return (
            <div className="space-y-4">

              {/* ── Scheduler status banner ─────────────────────────────────── */}
              <div
                className="flex items-center gap-3 px-5 py-3 rounded-2xl"
                style={{
                  background: enabledShifts > 0 ? '#F0FDF4' : '#F8FAFC',
                  border: `1px solid ${enabledShifts > 0 ? '#BBF7D0' : '#E5E7EB'}`,
                }}
              >
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: enabledShifts > 0 ? '#22C55E' : '#9CA3AF',
                    boxShadow: enabledShifts > 0 ? '0 0 0 3px #DCFCE7' : 'none' }}
                />
                <div className="flex-1 min-w-0">
                  {enabledShifts > 0 ? (
                    <>
                      <p className="text-[12.5px] font-semibold" style={{ color: '#15803D' }}>
                        Scheduler active — {enabledShifts} shift{enabledShifts > 1 ? 's' : ''} enabled
                      </p>
                      <p className="text-[11.5px]" style={{ color: '#16A34A' }}>
                        {lastSchedulerFire ?? 'Monitoring… messages fire automatically when the scheduled time is reached.'}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-[12.5px] font-semibold text-slate-500">Scheduler inactive</p>
                      <p className="text-[11.5px] text-slate-400">Enable the toggle for at least one shift in Settings to start auto-sending.</p>
                    </>
                  )}
                </div>
                <span
                  className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{
                    background: enabledShifts > 0 ? '#DCFCE7' : '#F3F4F6',
                    color:      enabledShifts > 0 ? '#15803D' : '#9CA3AF',
                  }}
                >
                  {enabledShifts > 0 ? 'Running' : 'Paused'}
                </span>
              </div>

              {/* ── Stat cards ──────────────────────────────────────────────── */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Sent Today"    value={todaySent}    sub={todayFailed > 0 ? `${todayFailed} failed` : 'No failures'} color="#7B3FF2" />
                <StatCard label="Total Sent"    value={totalSent}    sub={`${totalFailed} failed overall`} color="#1D4ED8" />
                <StatCard label="Success Rate"  value={`${successRate}%`} sub={`${allLogs.length} total attempts`} color="#16A34A" />
                <StatCard label="Active Shifts" value={enabledShifts} sub={`of ${shiftRows.length} shifts enabled`} color="#F59E0B" />
              </div>

              {/* ── Bottom row ──────────────────────────────────────────────── */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                {/* Check-in vs Check-out */}
                <div className="rounded-2xl px-5 py-4" style={{ background: 'white', border: '1px solid #E5E7EB' }}>
                  <p className="text-[13px] font-semibold text-slate-800 mb-4">Message Breakdown</p>
                  <div className="space-y-3">
                    {/* Check-in bar */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[12px] font-semibold text-slate-600">Check-in</span>
                        <span className="text-[12px] font-bold" style={{ color: '#1D4ED8' }}>{checkinSent}</span>
                      </div>
                      <div className="h-2 rounded-full w-full" style={{ background: '#F1F5F9' }}>
                        <div
                          className="h-2 rounded-full transition-all"
                          style={{
                            width: totalSent > 0 ? `${Math.round((checkinSent / totalSent) * 100)}%` : '0%',
                            background: '#3B82F6',
                          }}
                        />
                      </div>
                    </div>
                    {/* Check-out bar */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[12px] font-semibold text-slate-600">Check-out</span>
                        <span className="text-[12px] font-bold" style={{ color: '#6D28D9' }}>{checkoutSent}</span>
                      </div>
                      <div className="h-2 rounded-full w-full" style={{ background: '#F1F5F9' }}>
                        <div
                          className="h-2 rounded-full transition-all"
                          style={{
                            width: totalSent > 0 ? `${Math.round((checkoutSent / totalSent) * 100)}%` : '0%',
                            background: '#7B3FF2',
                          }}
                        />
                      </div>
                    </div>
                    {/* Success vs Failed bar */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[12px] font-semibold text-slate-600">Failed</span>
                        <span className="text-[12px] font-bold" style={{ color: '#DC2626' }}>{totalFailed}</span>
                      </div>
                      <div className="h-2 rounded-full w-full" style={{ background: '#F1F5F9' }}>
                        <div
                          className="h-2 rounded-full transition-all"
                          style={{
                            width: allLogs.length > 0 ? `${Math.round((totalFailed / allLogs.length) * 100)}%` : '0%',
                            background: '#EF4444',
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  {allLogs.length === 0 && (
                    <p className="text-[12px] text-slate-400 text-center py-4">No messages sent yet.</p>
                  )}
                </div>

                {/* Recent activity */}
                <div className="rounded-2xl overflow-hidden" style={{ background: 'white', border: '1px solid #E5E7EB' }}>
                  <div className="px-5 py-3.5" style={{ borderBottom: '1px solid #F3F4F6' }}>
                    <p className="text-[13px] font-semibold text-slate-800">Recent Activity</p>
                  </div>
                  {recentLogs.length === 0 ? (
                    <div className="flex flex-col items-center py-10 gap-2">
                      <p className="text-[12.5px] font-semibold text-slate-500">No activity yet</p>
                      <p className="text-[11.5px] text-slate-400">Send a test message to see it here.</p>
                    </div>
                  ) : (
                    <div className="divide-y" style={{ borderColor: '#F9FAFB' }}>
                      {recentLogs.map((log) => (
                        <div key={log.id} className="flex items-center gap-3 px-5 py-3">
                          {/* Type dot */}
                          <div
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ background: log.type === 'checkin' ? '#3B82F6' : '#7B3FF2' }}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-[12.5px] font-semibold text-slate-800 truncate">{log.employeeName}</p>
                            <p className="text-[11px] text-slate-400">{log.type === 'checkin' ? 'Check-in' : 'Check-out'} · {fmtTs(log.ts)}</p>
                          </div>
                          <span
                            className="text-[10.5px] font-semibold px-2 py-0.5 rounded-md flex-shrink-0"
                            style={{
                              background: log.status === 'sent' ? '#DCFCE7' : '#FEE2E2',
                              color:      log.status === 'sent' ? '#16A34A' : '#DC2626',
                            }}
                          >
                            {log.status === 'sent' ? 'Sent' : 'Failed'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            </div>
          )
        })()}

        {/* ══ SETTINGS ══════════════════════════════════════════════════════════ */}
        {tab === 'settings' && (
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4 items-start">

            {/* ── LEFT column ───────────────────────────────────────────────── */}
            <div className="space-y-4">

            {/* Shift Schedule */}
            <div className="rounded-2xl overflow-hidden" style={{ background: 'white', border: '1px solid #E5E7EB' }}>

              {/* Card header */}
              <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #F3F4F6' }}>
                <div>
                  <p className="text-[14px] font-semibold text-slate-800">Shift Schedule</p>
                  <p className="text-[12px] text-slate-400 mt-0.5">Fetched from ERPNext. Set reminder times per shift.</p>
                </div>
                <div className="flex items-center gap-2">
                  {saved && (
                    <span className="text-[12px] font-semibold" style={{ color: '#22C55E' }}>Saved ✓</span>
                  )}
                  <button
                    type="button"
                    onClick={handleSave}
                    className="text-[12.5px] font-semibold px-4 py-1.5 rounded-lg transition-colors"
                    style={{ background: '#7B3FF2', color: 'white' }}
                  >
                    Save
                  </button>
                </div>
              </div>

              {/* Loading skeleton */}
              {loadingShifts && (
                <div className="divide-y" style={{ borderColor: '#F3F4F6' }}>
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-4 px-6 py-4 animate-pulse">
                      <div className="h-3 bg-slate-100 rounded-full w-44" />
                      <div className="h-3 bg-slate-100 rounded-full w-12" />
                      <div className="h-3 bg-slate-100 rounded-full w-12" />
                      <div className="h-7 bg-slate-100 rounded-lg w-24 ml-auto" />
                      <div className="h-7 bg-slate-100 rounded-lg w-24" />
                      <div className="h-5 bg-slate-100 rounded-full w-9" />
                    </div>
                  ))}
                </div>
              )}

              {/* Error */}
              {!loadingShifts && fetchError && (
                <div className="px-6 py-4">
                  <div className="flex items-center gap-2 text-[12.5px] text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                    <svg fill="none" viewBox="0 0 16 16" width={14} height={14} className="flex-shrink-0">
                      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4"/>
                      <path d="M8 5v3.5M8 10v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                    </svg>
                    Failed to load shifts: {fetchError}
                  </div>
                </div>
              )}

              {/* Empty */}
              {!loadingShifts && !fetchError && shiftRows.length === 0 && (
                <div className="flex flex-col items-center py-14 gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#F5F3FF' }}>
                    <svg fill="none" viewBox="0 0 20 20" width={18} height={18} style={{ color: '#7B3FF2' }}>
                      <rect x="3" y="4" width="14" height="12" rx="3" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M7 2v3M13 2v3M3 9h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <p className="text-[13px] font-semibold text-slate-600">No shift types found</p>
                  <p className="text-[12px] text-slate-400">Add Shift Types in ERPNext HR module first.</p>
                </div>
              )}

              {/* Table */}
              {!loadingShifts && shiftRows.length > 0 && (
                <>
                  {/* Column headers */}
                  <div
                    className="grid px-6 py-2.5"
                    style={{ gridTemplateColumns: '1fr 70px 70px 112px 120px 56px', gap: 12, borderBottom: '1px solid #F3F4F6' }}
                  >
                    {['Shift', 'Start', 'End', 'Check-in At', 'Check-out At', 'Active'].map((h) => (
                      <span key={h} className="text-[10.5px] font-semibold text-slate-400 uppercase tracking-wider">{h}</span>
                    ))}
                  </div>

                  <div className="divide-y" style={{ borderColor: '#F9FAFB' }}>
                    {shiftRows.map((row) => (
                      <div
                        key={row.name}
                        className="grid items-center px-6 py-3.5 hover:bg-slate-50 transition-colors"
                        style={{ gridTemplateColumns: '1fr 70px 70px 112px 120px 56px', gap: 12 }}
                      >
                        {/* Shift name + employee count */}
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-slate-800 truncate">{row.name}</p>
                          {(empCounts[row.name] ?? 0) > 0 && (
                            <p className="text-[11px] mt-0.5" style={{ color: '#7B3FF2' }}>
                              {empCounts[row.name]} employees
                            </p>
                          )}
                        </div>

                        {/* Shift start (read-only) */}
                        <span className="text-[12.5px] text-slate-500 font-mono">{erpTimeToHHMM(row.start_time)}</span>

                        {/* Shift end (read-only) */}
                        <span className="text-[12.5px] text-slate-500 font-mono">{erpTimeToHHMM(row.end_time)}</span>

                        {/* Check-in reminder time */}
                        <input
                          type="time"
                          value={row.checkinTime}
                          onChange={(e) => updateShiftConfig(row.name, { checkinTime: e.target.value })}
                          className="w-full h-8 px-2 text-[12.5px] rounded-lg outline-none"
                          style={{ border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#1D4ED8' }}
                        />

                        {/* Check-out reminder time */}
                        <input
                          type="time"
                          value={row.checkoutTime}
                          onChange={(e) => updateShiftConfig(row.name, { checkoutTime: e.target.value })}
                          className="w-full h-8 px-2 text-[12.5px] rounded-lg outline-none"
                          style={{ border: '1px solid #DDD6FE', background: '#F5F3FF', color: '#6D28D9' }}
                        />

                        {/* Enable toggle */}
                        <div className="flex justify-center">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={row.enabled}
                            onClick={() => updateShiftConfig(row.name, { enabled: !row.enabled })}
                            className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0"
                            style={{ background: row.enabled ? '#7B3FF2' : '#D1D5DB' }}
                          >
                            <span
                              className="inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform"
                              style={{ transform: row.enabled ? 'translateX(18px)' : 'translateX(2px)' }}
                            />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>{/* /Shift Schedule card */}

            {/* ── Holiday Calendar ──────────────────────────────────────────── */}
            {(() => {
              const pad   = (n: number) => String(n).padStart(2, '0')
              const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`

              // Build holiday map: date → descriptions
              // Normalize to YYYY-MM-DD (ERPNext may return "2026-07-20 00:00:00")
              const holidayMap = new Map<string, string[]>()
              for (const h of holidays) {
                const key = h.holiday_date.slice(0, 10)
                const d   = holidayMap.get(key) ?? []
                if (!d.includes(h.description)) d.push(h.description)
                holidayMap.set(key, d)
              }

              // Calendar grid
              const firstOfMonth = new Date(calYear, calMonth, 1)
              const daysInMonth  = new Date(calYear, calMonth + 1, 0).getDate()
              const startDow     = firstOfMonth.getDay() // 0=Sun

              const cells: (number | null)[] = [
                ...Array(startDow).fill(null),
                ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
              ]
              // pad to full weeks
              while (cells.length % 7 !== 0) cells.push(null)

              const monthLabel = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' })
                .format(new Date(calYear, calMonth, 1))

              function prevMonth() {
                if (calMonth === 0) { setCalYear((y) => y - 1); setCalMonth(11) }
                else setCalMonth((m) => m - 1)
              }
              function nextMonth() {
                if (calMonth === 11) { setCalYear((y) => y + 1); setCalMonth(0) }
                else setCalMonth((m) => m + 1)
              }

              return (
                <div className="rounded-2xl overflow-hidden" style={{ background: 'white', border: '1px solid #E5E7EB' }}>

                  {/* Header */}
                  <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #F3F4F6' }}>
                    <div>
                      <p className="text-[14px] font-semibold text-slate-800">
                        {selectedHolidayList || 'Holiday Calendar'}
                      </p>
                      <p className="text-[12px] text-slate-400 mt-0.5">Reminders are skipped on holidays</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button type="button" onClick={prevMonth}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 transition-colors"
                        style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}
                      >
                        <svg fill="none" viewBox="0 0 14 14" width={10} height={10}>
                          <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                      <span className="text-[12.5px] font-semibold text-slate-700 w-32 text-center">{monthLabel}</span>
                      <button type="button" onClick={nextMonth}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 transition-colors"
                        style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}
                      >
                        <svg fill="none" viewBox="0 0 14 14" width={10} height={10}>
                          <path d="M5 2l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    </div>
                  </div>

                  <div className="px-6 py-4">

                    {/* Day-of-week headers */}
                    <div className="grid grid-cols-7 mb-1">
                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                        <div key={d} className="text-center text-[10.5px] font-semibold text-slate-400 py-1.5">
                          {d}
                        </div>
                      ))}
                    </div>

                    {/* Loading skeleton */}
                    {loadingHolidays ? (
                      <div className="grid grid-cols-7 gap-y-1 animate-pulse">
                        {Array.from({ length: 35 }).map((_, i) => (
                          <div key={i} className="h-9 mx-0.5 rounded-lg bg-slate-50" />
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-7 gap-y-1">
                        {cells.map((day, i) => {
                          if (day === null) return <div key={`empty-${i}`} />

                          const dateStr   = `${calYear}-${pad(calMonth + 1)}-${pad(day)}`
                          const isToday   = dateStr === todayStr
                          const isSunday  = (startDow + day - 1) % 7 === 0
                          const hNames    = holidayMap.get(dateStr)
                          const isHoliday = !!hNames

                          const showHoliday = isHoliday && !isSunday
                          const circleBg    = isToday ? '#7B3FF2' : showHoliday ? '#EF4444' : 'transparent'

                          return (
                            <div
                              key={day}
                              title={hNames?.join(', ')}
                              className="flex flex-col items-center py-1 mx-0.5"
                            >
                              <div
                                className="w-8 h-8 flex items-center justify-center rounded-full"
                                style={{ background: circleBg }}
                              >
                                <span
                                  className="text-[13px] font-semibold leading-none"
                                  style={{
                                    color: isToday || showHoliday ? 'white'
                                         : isSunday              ? '#CBD5E1'
                                         : '#374151',
                                  }}
                                >
                                  {day}
                                </span>
                              </div>
                              {showHoliday && (
                                <span
                                  className="text-[8.5px] leading-tight text-center mt-0.5 px-0.5 w-full truncate"
                                  style={{ color: '#EF4444' }}
                                >
                                  {hNames![0]}
                                </span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* Legend */}
                    <div className="flex items-center gap-4 mt-4 pt-3" style={{ borderTop: '1px solid #F3F4F6' }}>
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-full" style={{ background: '#7B3FF2' }} />
                        <span className="text-[11px] text-slate-500">Today</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-full" style={{ background: '#EF4444' }} />
                        <span className="text-[11px] text-slate-500">Holiday — reminders skipped</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[12px] font-semibold" style={{ color: '#CBD5E1' }}>S</span>
                        <span className="text-[11px] text-slate-500">Sunday</span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })()}

            </div>{/* /Left column */}

            {/* ── RIGHT: Manual Send ────────────────────────────────────────── */}
            <div className="space-y-4">

              {/* Env warning */}
              {!envConfigured && (
                <div className="flex items-start gap-2.5 text-[12.5px] text-amber-700 bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3.5">
                  <svg fill="none" viewBox="0 0 16 16" width={14} height={14} className="flex-shrink-0 mt-0.5">
                    <path d="M8 1.5L14 13H2L8 1.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                    <path d="M8 6v3M8 10.5v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                  </svg>
                  App configuration incomplete — check <code className="bg-amber-100 px-1 rounded">.env</code> on the server.
                </div>
              )}

              {/* Send to all */}
              <div className="rounded-2xl overflow-hidden" style={{ background: 'white', border: '1px solid #E5E7EB' }}>
                <div className="px-5 py-4" style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <p className="text-[14px] font-semibold text-slate-800">Send to All Employees</p>
                  <p className="text-[12px] text-slate-400 mt-0.5">Sends to all active employees with a phone number.</p>
                </div>
                <div className="px-5 py-4 flex flex-col gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleBulkSend('checkin')}
                    disabled={bulkSending || !envConfigured}
                    className="flex items-center justify-center gap-2 w-full text-[12.5px] font-semibold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ background: '#EFF6FF', color: '#1D4ED8' }}
                  >
                    <svg fill="none" viewBox="0 0 16 16" width={13} height={13}>
                      <path d="M8 3v10M8 3l-3 3M8 3l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    {bulkSending ? 'Sending…' : 'Send Check-in Reminder'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkSend('checkout')}
                    disabled={bulkSending || !envConfigured}
                    className="flex items-center justify-center gap-2 w-full text-[12.5px] font-semibold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ background: '#F5F3FF', color: '#6D28D9' }}
                  >
                    <svg fill="none" viewBox="0 0 16 16" width={13} height={13}>
                      <path d="M8 3v10M8 13l-3-3M8 13l3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    {bulkSending ? 'Sending…' : 'Send Check-out Reminder'}
                  </button>
                  {bulkProgress && (
                    <p className="text-[12px] text-slate-500 text-center">{bulkProgress}</p>
                  )}
                </div>
              </div>

              {/* Test single */}
              <div className="rounded-2xl overflow-hidden" style={{ background: 'white', border: '1px solid #E5E7EB' }}>
                <div className="px-5 py-4" style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <p className="text-[14px] font-semibold text-slate-800">Test Message</p>
                  <p className="text-[12px] text-slate-400 mt-0.5">Send a test to a single number.</p>
                </div>
                <div className="px-5 py-4 space-y-3">
                  <div>
                    <p className="text-[11px] font-medium text-slate-400 mb-1">Phone number</p>
                    <input
                      type="text"
                      value={testPhone}
                      onChange={(e) => setTestPhone(e.target.value)}
                      placeholder="e.g. 919876543210"
                      className="w-full h-8 px-3 text-[12.5px] rounded-lg outline-none"
                      style={{ border: '1px solid #E5E7EB', color: '#111827' }}
                    />
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-slate-400 mb-1">Recipient name</p>
                    <input
                      type="text"
                      value={testName}
                      onChange={(e) => setTestName(e.target.value)}
                      placeholder="e.g. Rohan Bose"
                      className="w-full h-8 px-3 text-[12.5px] rounded-lg outline-none"
                      style={{ border: '1px solid #E5E7EB', color: '#111827' }}
                    />
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-slate-400 mb-1">Type</p>
                    <select
                      value={testType}
                      onChange={(e) => setTestType(e.target.value as 'checkin' | 'checkout')}
                      className="w-full h-8 px-3 text-[12.5px] rounded-lg outline-none"
                      style={{ border: '1px solid #E5E7EB', color: '#111827', background: 'white' }}
                    >
                      <option value="checkin">Check-in</option>
                      <option value="checkout">Check-out</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={handleTestSend}
                    disabled={testSending || !testPhone || !testName || !envConfigured}
                    className="w-full h-8 text-[12.5px] font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ background: '#7B3FF2', color: 'white' }}
                  >
                    {testSending ? 'Sending…' : 'Send Test'}
                  </button>
                  {testResult && (
                    <p
                      className="text-[12px] font-semibold text-center"
                      style={{ color: testResult.ok ? '#16A34A' : '#DC2626' }}
                    >
                      {testResult.msg}
                    </p>
                  )}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ══ LOGS ════════════════════════════════════════════════════════════ */}
        {tab === 'logs' && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[12px] text-slate-400">
                Logs from manual sends in this browser. Cron job logs are on the server.
              </p>
              {logs.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearLogs}
                  className="text-[12px] font-semibold px-3 py-1.5 rounded-lg"
                  style={{ background: '#FEF2F2', color: '#DC2626' }}
                >
                  Clear Logs
                </button>
              )}
            </div>

            {logs.length === 0 ? (
              <div
                className="rounded-2xl flex flex-col items-center py-20 gap-3"
                style={{ background: 'white', border: '1px solid #E5E7EB' }}
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#F5F3FF' }}>
                  <svg fill="none" viewBox="0 0 20 20" width={18} height={18} style={{ color: '#7B3FF2' }}>
                    <path d="M4 4h12v12H4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                    <path d="M7 8h6M7 11h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
                <p className="text-[13px] font-semibold text-slate-600">No logs yet</p>
                <p className="text-[12px] text-slate-400">Send a test message to see results here.</p>
              </div>
            ) : (
              <div className="rounded-2xl overflow-hidden" style={{ background: 'white', border: '1px solid #E5E7EB' }}>
                {/* Table header */}
                <div
                  className="grid px-6 py-2.5"
                  style={{ gridTemplateColumns: '140px 1fr 150px 100px 96px', gap: 12, borderBottom: '1px solid #F3F4F6' }}
                >
                  {['Timestamp', 'Employee', 'Phone', 'Type', 'Status'].map((h) => (
                    <span key={h} className="text-[10.5px] font-semibold text-slate-400 uppercase tracking-wider">{h}</span>
                  ))}
                </div>

                <div className="divide-y" style={{ borderColor: '#F9FAFB' }}>
                  {logs.map((log) => (
                    <div
                      key={log.id}
                      className="grid items-start px-6 py-3 hover:bg-slate-50 transition-colors"
                      style={{ gridTemplateColumns: '140px 1fr 150px 100px 96px', gap: 12 }}
                    >
                      <span className="text-[11.5px] text-slate-400 tabular-nums">{fmtTs(log.ts)}</span>
                      <span className="text-[13px] font-semibold text-slate-800 truncate">{log.employeeName}</span>
                      <span className="text-[11.5px] text-slate-400 font-mono truncate">{log.phone}</span>
                      <span
                        className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-md w-fit"
                        style={{
                          background: log.type === 'checkin' ? '#DBEAFE' : '#EDE9FE',
                          color:      log.type === 'checkin' ? '#1D4ED8' : '#6D28D9',
                        }}
                      >
                        {log.type === 'checkin' ? 'Check-in' : 'Check-out'}
                      </span>
                      <div>
                        <span
                          className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-md w-fit"
                          style={{
                            background: log.status === 'sent' ? '#DCFCE7' : '#FEE2E2',
                            color:      log.status === 'sent' ? '#16A34A' : '#DC2626',
                          }}
                        >
                          {log.status === 'sent' ? '✓ Sent' : '✕ Failed'}
                        </span>
                        {log.error && (
                          <p className="text-[10.5px] text-red-400 mt-0.5 leading-tight">{log.error}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
