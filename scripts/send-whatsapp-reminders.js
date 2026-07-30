/**
 * send-whatsapp-reminders.js
 *
 * Sends WhatsApp attendance reminders via the Gupshup API.
 * Run as a cron job every minute — the script processes all configured shifts,
 * fires reminders for whichever shift matches the current time, and exits silently
 * when it's not time for any shift.
 *
 * ─── .env.cron — multiple shifts ─────────────────────────────────────────────
 *
 *   ERP_API_UPSTREAM              = https://erp.sauramandala.org
 *   ERP_ADMIN_USER                = Administrator
 *   ERP_ADMIN_PASSWORD            = yourpassword
 *
 *   GUPSHUP_API_KEY               = sk_xxxxxxxxxxxx
 *   GUPSHUP_APP_NAME              = DRIVEBOT
 *   GUPSHUP_SRC_NUMBER            = 917627993671
 *   GUPSHUP_CHECKIN_TMPL_ID       = a8b37465-...
 *   GUPSHUP_CHECKIN_CONFIRM_TMPL_ID = ba7d10fc-...
 *   GUPSHUP_CHECKOUT_TMPL_ID      = b7382b33-...
 *
 *   # Shift 1
 *   SHIFT_1_NAME          = SMF Shillong Office
 *   SHIFT_1_CHECKIN_TIME  = 09:15
 *   SHIFT_1_CHECKOUT_TIME = 18:30
 *
 *   # Shift 2
 *   SHIFT_2_NAME          = SMF Night Shift
 *   SHIFT_2_CHECKIN_TIME  = 21:00
 *   SHIFT_2_CHECKOUT_TIME = 06:00
 *
 *   # Add SHIFT_3_*, SHIFT_4_* etc. for more shifts.
 *
 * ─── Crontab (runs every minute, Mon-Sat) ────────────────────────────────────
 *
 *   * * * * 1-6 cd /var/www/pm.sauramandala.org && node scripts/send-whatsapp-reminders.js >> /var/log/wa-reminders.log 2>&1
 *
 * ─── Manual / test run ───────────────────────────────────────────────────────
 *
 *   SHIFT_NAME=<name> REMINDER_TYPE=checkin  node scripts/send-whatsapp-reminders.js
 *   SHIFT_NAME=<name> REMINDER_TYPE=checkout node scripts/send-whatsapp-reminders.js
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// ─── Load .env.cron ───────────────────────────────────────────────────────────

const __dir = dirname(fileURLToPath(import.meta.url))
try {
  const lines = readFileSync(resolve(__dir, '../.env.cron'), 'utf8').split('\n')
  for (const line of lines) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const key = t.slice(0, eq).trim()
    const val = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (key && !(key in process.env)) process.env[key] = val
  }
} catch { /* env vars may be set directly */ }

// ─── Gupshup / ERP credentials ───────────────────────────────────────────────

const BASE_URL             = (process.env.ERP_API_UPSTREAM              || '').replace(/\/$/, '')
const ADMIN_USR            =  process.env.ERP_ADMIN_USER                || 'Administrator'
const ADMIN_PWD            =  process.env.ERP_ADMIN_PASSWORD            || ''
const GS_API_KEY           =  process.env.GUPSHUP_API_KEY               || ''
const GS_APP_NAME          =  process.env.GUPSHUP_APP_NAME              || ''
const GS_SRC_NUM           =  process.env.GUPSHUP_SRC_NUMBER            || ''
const TMPL_CHECKIN         =  process.env.GUPSHUP_CHECKIN_TMPL_ID       || ''
const TMPL_CHECKIN_CONFIRM =  process.env.GUPSHUP_CHECKIN_CONFIRM_TMPL_ID || ''
const TMPL_CHECKOUT        =  process.env.GUPSHUP_CHECKOUT_TMPL_ID      || ''

if (!BASE_URL || !ADMIN_PWD || !GS_API_KEY || !GS_APP_NAME || !GS_SRC_NUM) {
  console.error('[ERROR] Missing required env vars. Check ERP_API_UPSTREAM, ERP_ADMIN_PASSWORD, GUPSHUP_* in .env.cron')
  process.exit(1)
}
if (!TMPL_CHECKIN || !TMPL_CHECKIN_CONFIRM || !TMPL_CHECKOUT) {
  console.error('[ERROR] Missing template IDs. Set GUPSHUP_CHECKIN_TMPL_ID, GUPSHUP_CHECKIN_CONFIRM_TMPL_ID, GUPSHUP_CHECKOUT_TMPL_ID')
  process.exit(1)
}

// ─── Build shift list from env vars ──────────────────────────────────────────
// Supports SHIFT_1_NAME / SHIFT_1_CHECKIN_TIME / SHIFT_1_CHECKOUT_TIME, etc.
// Also supports legacy single-shift SHIFT_NAME / CHECKIN_TIME / CHECKOUT_TIME.

function currentHHMM() {
  const n = new Date()
  return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`
}

const MANUAL_TYPE      = (process.env.REMINDER_TYPE || '').toLowerCase()
const MANUAL_SHIFT     =  process.env.SHIFT_NAME    || ''

// Collect numbered shifts: SHIFT_1_*, SHIFT_2_*, ...
const configuredShifts = []
for (let i = 1; i <= 20; i++) {
  const name = process.env[`SHIFT_${i}_NAME`] || ''
  if (!name) break
  configuredShifts.push({
    name,
    checkinTime:  process.env[`SHIFT_${i}_CHECKIN_TIME`]  || '',
    checkoutTime: process.env[`SHIFT_${i}_CHECKOUT_TIME`] || '',
  })
}

// Fall back to legacy single-shift format
if (configuredShifts.length === 0 && (process.env.SHIFT_NAME || process.env.CHECKIN_TIME)) {
  configuredShifts.push({
    name:         process.env.SHIFT_NAME     || '',
    checkinTime:  process.env.CHECKIN_TIME   || '',
    checkoutTime: process.env.CHECKOUT_TIME  || '',
  })
}

if (configuredShifts.length === 0) {
  console.error('[ERROR] No shifts configured. Add SHIFT_1_NAME, SHIFT_1_CHECKIN_TIME, SHIFT_1_CHECKOUT_TIME to .env.cron')
  process.exit(1)
}

// Determine which shifts need to fire right now
const now = currentHHMM()

const shiftsToRun = []

if (MANUAL_TYPE && MANUAL_SHIFT) {
  // Manual/test run — force a specific shift + type
  if (MANUAL_TYPE !== 'checkin' && MANUAL_TYPE !== 'checkout') {
    console.error('[ERROR] REMINDER_TYPE must be "checkin" or "checkout"')
    process.exit(1)
  }
  shiftsToRun.push({ name: MANUAL_SHIFT, type: MANUAL_TYPE })
} else {
  // Auto-detect from current time
  for (const shift of configuredShifts) {
    if (shift.checkinTime  && now === shift.checkinTime)  shiftsToRun.push({ name: shift.name, type: 'checkin'  })
    if (shift.checkoutTime && now === shift.checkoutTime) shiftsToRun.push({ name: shift.name, type: 'checkout' })
  }
  if (shiftsToRun.length === 0) process.exit(0)  // not time for any shift — exit silently
}

// ─── Session cookie store ─────────────────────────────────────────────────────

let sessionCookie = ''
function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(sessionCookie ? { Cookie: sessionCookie } : {}),
  }
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

async function erpPost(path, body) {
  const res = await fetch(BASE_URL + path, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`POST ${path} → ${res.status} ${res.statusText}\n${text}`)
  }
  return { res, json: await res.json() }
}

async function erpGet(path, params = {}) {
  const url = new URL(BASE_URL + path)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url.toString(), { headers: authHeaders() })
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${res.statusText}`)
  return res.json()
}

// ─── ERPNext auth ─────────────────────────────────────────────────────────────

async function login() {
  const { res } = await erpPost('/api/method/login', { usr: ADMIN_USR, pwd: ADMIN_PWD })
  const cookies = res.headers.getSetCookie?.() ?? []
  sessionCookie = cookies.map((c) => c.split(';')[0]).join('; ')
  if (!sessionCookie) throw new Error('Login succeeded but no session cookie returned')
  console.log(`Logged in as ${ADMIN_USR}`)
}

async function logout() {
  try { await erpPost('/api/method/logout', {}) } catch { /* best-effort */ }
  console.log('Logged out')
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function todayLabel() {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date())
}

function todayRange() {
  const n   = new Date()
  const pad = (x) => String(x).padStart(2, '0')
  const d   = `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`
  return { from: `${d} 00:00:00`, to: `${d} 23:59:59` }
}

// ─── ERPNext helpers ──────────────────────────────────────────────────────────

async function fetchActiveEmployees(shiftName) {
  const json = await erpGet('/api/resource/Employee', {
    fields:            JSON.stringify(['name', 'employee_name', 'cell_number']),
    filters:           JSON.stringify([
      ['Employee', 'status',        '=', 'Active'],
      ['Employee', 'default_shift', '=', shiftName],
    ]),
    limit_page_length: '500',
  })
  return json.data.filter((e) => e.cell_number)
}

async function getCheckinTime(employeeId) {
  const { from, to } = todayRange()
  const json = await erpGet('/api/resource/Employee Checkin', {
    fields:            JSON.stringify(['time']),
    filters:           JSON.stringify([
      ['Employee Checkin', 'employee', '=', employeeId],
      ['Employee Checkin', 'log_type', '=', 'IN'],
      ['Employee Checkin', 'time',     '>=', from],
      ['Employee Checkin', 'time',     '<=', to],
    ]),
    limit_page_length: '1',
    order_by:          'time asc',
  })
  if (!json.data.length) return null
  const dt = new Date(json.data[0].time.replace(' ', 'T'))
  return dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase()
}

async function hasCheckedOut(employeeId) {
  const { from, to } = todayRange()
  const json = await erpGet('/api/resource/Employee Checkin', {
    fields:            JSON.stringify(['name']),
    filters:           JSON.stringify([
      ['Employee Checkin', 'employee', '=', employeeId],
      ['Employee Checkin', 'log_type', '=', 'OUT'],
      ['Employee Checkin', 'time',     '>=', from],
      ['Employee Checkin', 'time',     '<=', to],
    ]),
    limit_page_length: '1',
  })
  return json.data.length > 0
}

async function hasLeaveToday(employeeId) {
  const { from } = todayRange()
  const today = from.slice(0, 10)
  const json = await erpGet('/api/resource/Leave Application', {
    fields:            JSON.stringify(['name']),
    filters:           JSON.stringify([
      ['Leave Application', 'employee',  '=',  employeeId],
      ['Leave Application', 'from_date', '<=', today],
      ['Leave Application', 'to_date',   '>=', today],
      ['Leave Application', 'status',    '=',  'Approved'],
      ['Leave Application', 'docstatus', '=',  1],
    ]),
    limit_page_length: '1',
  })
  return json.data.length > 0
}

async function fetchShiftHolidayList(shiftName) {
  try {
    const json = await erpGet(`/api/resource/Shift Type/${encodeURIComponent(shiftName)}`)
    return json.data?.holiday_list ?? null
  } catch { return null }
}

async function isTodayHoliday(holidayList) {
  const { from } = todayRange()
  const today = from.slice(0, 10)
  const json = await erpGet('/api/resource/Holiday', {
    fields:            JSON.stringify(['holiday_date']),
    filters:           JSON.stringify([
      ['Holiday', 'parent',       '=', holidayList],
      ['Holiday', 'holiday_date', '=', today],
    ]),
    limit_page_length: '1',
  })
  return json.data.length > 0
}

// ─── Phone helper ─────────────────────────────────────────────────────────────

function cleanPhone(raw) {
  let p = (raw ?? '').replace(/\D/g, '')
  if (p.length === 10 && /^[6-9]/.test(p)) p = '91' + p
  return p
}

// ─── Gupshup send ─────────────────────────────────────────────────────────────

async function sendWhatsApp(phone, templateId, params) {
  const body = new URLSearchParams({
    channel:     'whatsapp',
    source:      GS_SRC_NUM,
    destination: phone,
    'src.name':  GS_APP_NAME,
    template:    JSON.stringify({ id: templateId, params }),
  })
  const res = await fetch('https://api.gupshup.io/wa/api/v1/template/msg', {
    method:  'POST',
    headers: { apikey: GS_API_KEY, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body:    body.toString(),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.status === 'error') throw new Error(json.message ?? `HTTP ${res.status}`)
  return json
}

// ─── Process one shift ────────────────────────────────────────────────────────

async function processShift(shiftName, type) {
  console.log(`\n─── ${shiftName} / ${type} ───────────────────────────────`)

  // Holiday check
  const holidayList = await fetchShiftHolidayList(shiftName)
  if (holidayList) {
    let holiday = false
    try { holiday = await isTodayHoliday(holidayList) } catch { /* non-fatal */ }
    if (holiday) {
      console.log(`  Today is a holiday (${holidayList}). No reminders sent.`)
      return
    }
    console.log(`  Holiday check passed (${holidayList}).`)
  }

  // Fetch employees
  let employees
  try {
    employees = await fetchActiveEmployees(shiftName)
  } catch (err) {
    console.error(`  [ERROR] Could not fetch employees: ${err.message}`)
    return
  }
  console.log(`  Found ${employees.length} employee(s) with a phone number.`)

  let sent = 0, skipped = 0, failed = 0
  const date = todayLabel()

  for (const emp of employees) {
    const tag       = `${emp.employee_name}`
    const phone     = cleanPhone(emp.cell_number)
    const firstName = emp.employee_name.split(' ')[0]

    try {
      const onLeave = await hasLeaveToday(emp.name)
      if (onLeave) { console.log(`  SKIP     ${tag}  (on approved leave)`); skipped++; continue }

      if (type === 'checkin') {
        const checkinTime = await getCheckinTime(emp.name)
        if (checkinTime) {
          await sendWhatsApp(phone, TMPL_CHECKIN_CONFIRM, [firstName, checkinTime, date])
          console.log(`  SENT     ${tag}  → ${phone}  [confirmed: ${checkinTime}]`)
        } else {
          await sendWhatsApp(phone, TMPL_CHECKIN, [firstName, date])
          console.log(`  SENT     ${tag}  → ${phone}  [check-in reminder]`)
        }
      } else {
        const alreadyOut = await hasCheckedOut(emp.name)
        if (alreadyOut) { console.log(`  SKIP     ${tag}  (already checked out)`); skipped++; continue }
        await sendWhatsApp(phone, TMPL_CHECKOUT, [firstName, date])
        console.log(`  SENT     ${tag}  → ${phone}  [check-out reminder]`)
      }
      sent++
    } catch (err) {
      console.error(`  FAILED   ${tag}  → ${err.message}`)
      failed++
    }

    await new Promise((r) => setTimeout(r, 250))
  }

  console.log(`  Result: ${sent} sent, ${skipped} skipped, ${failed} failed`)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n=== WhatsApp Reminders  [${new Date().toISOString()}]  (${shiftsToRun.length} shift(s) to process) ===`)

  await login()

  for (const { name, type } of shiftsToRun) {
    await processShift(name, type)
  }

  await logout()
  console.log('\n=== Done ===\n')
}

main().catch((err) => {
  console.error('[FATAL]', err.message)
  process.exit(1)
})
