/**
 * send-whatsapp-reminders.js
 *
 * Sends WhatsApp attendance reminder notifications to all active employees
 * via the Gupshup API. Designed to be run as a cron job.
 *
 * Config — add to .env.cron on the server:
 *   ERP_API_UPSTREAM          = https://erp.sauramandala.org
 *   ERP_ADMIN_USER            = Administrator
 *   ERP_ADMIN_PASSWORD        = yourpassword
 *   GUPSHUP_API_KEY           = your-gupshup-api-key
 *   GUPSHUP_APP_NAME          = your-app-name
 *   GUPSHUP_SRC_NUMBER        = 919876543210  (no + or spaces)
 *   GUPSHUP_CHECKIN_TMPL_ID   = 720c960f-19af-4980-bea6-fd241ba7d882
 *   GUPSHUP_CHECKOUT_TMPL_ID  = 7187d4d7-40c3-4a66-ac40-365d0affd410
 *   REMINDER_TYPE             = checkin   (or: checkout)
 *   SHIFT_NAME                = Morning Shift  (must match ERPNext Shift Type name)
 *
 * Run manually:
 *   REMINDER_TYPE=checkin  node scripts/send-whatsapp-reminders.js
 *   REMINDER_TYPE=checkout node scripts/send-whatsapp-reminders.js
 *
 * Crontab example (IST = UTC+5:30):
 *   # Check-in reminder at 09:15 IST (03:45 UTC)
 *   45 3 * * 1-6 cd /var/www/pm.sauramandala.org && REMINDER_TYPE=checkin  node scripts/send-whatsapp-reminders.js >> /var/log/wa-checkin.log  2>&1
 *   # Check-out reminder at 18:30 IST (13:00 UTC)
 *   0  13 * * 1-6 cd /var/www/pm.sauramandala.org && REMINDER_TYPE=checkout node scripts/send-whatsapp-reminders.js >> /var/log/wa-checkout.log 2>&1
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

// ─── Config ───────────────────────────────────────────────────────────────────

const BASE_URL     = (process.env.ERP_API_UPSTREAM   || '').replace(/\/$/, '')
const ADMIN_USR    = process.env.ERP_ADMIN_USER        || 'Administrator'
const ADMIN_PWD    = process.env.ERP_ADMIN_PASSWORD    || ''
const GS_API_KEY   = process.env.GUPSHUP_API_KEY       || ''
const GS_APP_NAME  = process.env.GUPSHUP_APP_NAME      || ''
const GS_SRC_NUM   = process.env.GUPSHUP_SRC_NUMBER    || ''
const TMPL_CHECKIN = process.env.GUPSHUP_CHECKIN_TMPL_ID  || '720c960f-19af-4980-bea6-fd241ba7d882'
const TMPL_CHECKOUT= process.env.GUPSHUP_CHECKOUT_TMPL_ID || '7187d4d7-40c3-4a66-ac40-565d0affd410'
const REMINDER_TYPE= (process.env.REMINDER_TYPE || 'checkin').toLowerCase()
const SHIFT_NAME   =  process.env.SHIFT_NAME    || ''

if (!BASE_URL || !ADMIN_PWD || !GS_API_KEY || !GS_APP_NAME || !GS_SRC_NUM) {
  console.error('[ERROR] Missing required env vars. Check ERP_API_UPSTREAM, ERP_ADMIN_PASSWORD, GUPSHUP_API_KEY, GUPSHUP_APP_NAME, GUPSHUP_SRC_NUMBER in .env.cron')
  process.exit(1)
}

if (REMINDER_TYPE !== 'checkin' && REMINDER_TYPE !== 'checkout') {
  console.error('[ERROR] REMINDER_TYPE must be "checkin" or "checkout"')
  process.exit(1)
}

if (!SHIFT_NAME) {
  console.error('[ERROR] SHIFT_NAME must be set (must match ERPNext Shift Type name exactly)')
  process.exit(1)
}

const TEMPLATE_ID = REMINDER_TYPE === 'checkin' ? TMPL_CHECKIN : TMPL_CHECKOUT

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
  const res = await fetch(BASE_URL + path, {
    method:  'POST',
    headers: authHeaders(),
    body:    JSON.stringify(body),
  })
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

// ─── Fetch employees ──────────────────────────────────────────────────────────

async function fetchActiveEmployees() {
  const json = await erpGet('/api/resource/Employee', {
    fields:            JSON.stringify(['name', 'employee_name', 'cell_number', 'default_shift']),
    filters:           JSON.stringify([
      ['Employee', 'status',        '=', 'Active'],
      ['Employee', 'default_shift', '=', SHIFT_NAME],
    ]),
    limit_page_length: '500',
  })
  return json.data.filter((e) => e.cell_number)
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function todayLabel() {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date())
}

// ─── Check if employee already checked in / out today ────────────────────────

function todayRange() {
  const now   = new Date()
  const pad   = (n) => String(n).padStart(2, '0')
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  return { from: `${today} 00:00:00`, to: `${today} 23:59:59` }
}

async function hasCheckedIn(employeeId) {
  const { from, to } = todayRange()
  const json = await erpGet('/api/resource/Employee Checkin', {
    fields:            JSON.stringify(['name']),
    filters:           JSON.stringify([
      ['Employee Checkin', 'employee',  '=', employeeId],
      ['Employee Checkin', 'log_type',  '=', 'IN'],
      ['Employee Checkin', 'time',      '>=', from],
      ['Employee Checkin', 'time',      '<=', to],
    ]),
    limit_page_length: '1',
  })
  return json.data.length > 0
}

async function hasCheckedOut(employeeId) {
  const { from, to } = todayRange()
  const json = await erpGet('/api/resource/Employee Checkin', {
    fields:            JSON.stringify(['name']),
    filters:           JSON.stringify([
      ['Employee Checkin', 'employee',  '=', employeeId],
      ['Employee Checkin', 'log_type',  '=', 'OUT'],
      ['Employee Checkin', 'time',      '>=', from],
      ['Employee Checkin', 'time',      '<=', to],
    ]),
    limit_page_length: '1',
  })
  return json.data.length > 0
}

// ─── Holiday check ────────────────────────────────────────────────────────────

/** Returns the holiday_list linked to the Shift Type, or null if not set. */
async function fetchShiftHolidayList() {
  try {
    const json = await erpGet(`/api/resource/Shift Type/${encodeURIComponent(SHIFT_NAME)}`)
    return json.data?.holiday_list ?? null
  } catch {
    return null
  }
}

/** Returns true if today is a holiday in the given holiday list. */
async function isTodayHoliday(holidayList) {
  const { from } = todayRange()
  const today = from.slice(0, 10) // YYYY-MM-DD
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

// ─── Leave check ──────────────────────────────────────────────────────────────

/** Returns true if the employee has an approved leave covering today. */
async function hasLeaveToday(employeeId) {
  const { from } = todayRange()
  const today = from.slice(0, 10) // YYYY-MM-DD
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

// ─── Send WhatsApp message via Gupshup ────────────────────────────────────────

async function sendWhatsApp(phone, recipientName) {
  const firstName  = recipientName.split(' ')[0]
  const cleanPhone = phone.replace(/\D/g, '')
  const dateLabel  = todayLabel()    // e.g. "20 Jul 2026"  → {{2}} in template

  const body = new URLSearchParams({
    channel:     'whatsapp',
    source:      GS_SRC_NUM,
    destination: cleanPhone,
    'src.name':  GS_APP_NAME,
    template:    JSON.stringify({ id: TEMPLATE_ID, params: [firstName, dateLabel] }),
  })

  const res = await fetch('https://api.gupshup.io/wa/api/v1/template/msg', {
    method:  'POST',
    headers: {
      apikey:         GS_API_KEY,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept:         'application/json',
    },
    body: body.toString(),
  })

  const json = await res.json().catch(() => ({}))

  if (!res.ok || json.status === 'error') {
    throw new Error(json.message ?? `HTTP ${res.status}`)
  }

  return json
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n=== WhatsApp ${REMINDER_TYPE} Reminder — ${SHIFT_NAME}  [${new Date().toISOString()}] ===\n`)

  await login()

  // ── 1. Holiday check ────────────────────────────────────────────────────────
  const holidayList = await fetchShiftHolidayList()
  if (holidayList) {
    let holiday = false
    try { holiday = await isTodayHoliday(holidayList) } catch { /* non-fatal */ }
    if (holiday) {
      console.log(`Today is a holiday (${holidayList}). No reminders sent.`)
      await logout()
      process.exit(0)
    }
    console.log(`Holiday check passed (${holidayList}) — not a holiday.`)
  } else {
    console.log(`No holiday list linked to shift "${SHIFT_NAME}" — skipping holiday check.`)
  }

  // ── 2. Fetch employees ──────────────────────────────────────────────────────
  let employees
  try {
    employees = await fetchActiveEmployees()
  } catch (err) {
    console.error('[ERROR] Could not fetch employees:', err.message)
    await logout()
    process.exit(1)
  }

  console.log(`Found ${employees.length} active employee(s) in "${SHIFT_NAME}" with a phone number.\n`)

  let sent = 0, skipped = 0, failed = 0

  for (const emp of employees) {
    const tag = `${emp.name} — ${emp.employee_name}`

    try {
      // Skip if on approved leave today
      const onLeave = await hasLeaveToday(emp.name)
      if (onLeave) {
        console.log(`  SKIP     ${tag}  (on leave today)`)
        skipped++
        continue
      }

      // Skip if already checked in/out today
      if (REMINDER_TYPE === 'checkin') {
        const alreadyIn = await hasCheckedIn(emp.name)
        if (alreadyIn) {
          console.log(`  SKIP     ${tag}  (already checked in)`)
          skipped++
          continue
        }
      } else {
        const alreadyOut = await hasCheckedOut(emp.name)
        if (alreadyOut) {
          console.log(`  SKIP     ${tag}  (already checked out)`)
          skipped++
          continue
        }
      }

      await sendWhatsApp(emp.cell_number, emp.employee_name)
      console.log(`  SENT     ${tag}  → ${emp.cell_number}`)
      sent++
    } catch (err) {
      console.error(`  FAILED   ${tag}  → ${err.message}`)
      failed++
    }

    // Small delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 250))
  }

  await logout()

  console.log(`\n─────────────────────────────────────`)
  console.log(`  Sent    : ${sent}`)
  console.log(`  Skipped : ${skipped}  (holiday / on leave / already checked ${REMINDER_TYPE === 'checkin' ? 'in' : 'out'})`)
  console.log(`  Failed  : ${failed}`)
  console.log(`─────────────────────────────────────\n`)

  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error('[FATAL]', err.message)
  process.exit(1)
})
