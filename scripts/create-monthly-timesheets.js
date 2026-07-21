/**
 * create-monthly-timesheets.js
 *
 * Logs in as Administrator, then creates a Draft Timesheet for the
 * current month for every Active Employee — skipping any that already exist.
 *
 * Config (add to .env.cron on the server):
 *   ERP_API_UPSTREAM   = https://erp.example.com
 *   ERP_ADMIN_USER     = Administrator
 *   ERP_ADMIN_PASSWORD = yourpassword
 *   ERP_COMPANY        = (optional — leave blank for all companies)
 *
 * Run manually to test:
 *   node scripts/create-monthly-timesheets.js
 *
 * Crontab — 07:00 on the 1st of every month:
 *   0 7 1 * * cd /var/www/project.sauramandala.org && node scripts/create-monthly-timesheets.js >> /var/log/monthly-timesheets.log 2>&1
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
} catch { /* env vars may be set directly in crontab */ }

// ─── Config ───────────────────────────────────────────────────────────────────
const BASE_URL  = (process.env.ERP_API_UPSTREAM || '').replace(/\/$/, '')
const ADMIN_USR = process.env.ERP_ADMIN_USER     || 'Administrator'
const ADMIN_PWD = process.env.ERP_ADMIN_PASSWORD || ''
const COMPANY   = process.env.ERP_COMPANY        || ''

if (!BASE_URL || !ADMIN_PWD) {
  console.error('[ERROR] ERP_API_UPSTREAM and ERP_ADMIN_PASSWORD must be set in .env.cron')
  process.exit(1)
}

// ─── Session cookie store ─────────────────────────────────────────────────────
let sessionCookie = ''

function authHeaders(extra = {}) {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(sessionCookie ? { Cookie: sessionCookie } : {}),
    ...extra,
  }
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────
async function erpPost(path, body) {
  const res = await fetch(BASE_URL + path, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
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

// ─── Auth ─────────────────────────────────────────────────────────────────────
async function login() {
  const { res } = await erpPost('/api/method/login', {
    usr: ADMIN_USR,
    pwd: ADMIN_PWD,
  })
  // Capture all Set-Cookie headers and join them for subsequent requests
  const cookies = res.headers.getSetCookie?.() ?? []
  sessionCookie = cookies.map((c) => c.split(';')[0]).join('; ')
  if (!sessionCookie) throw new Error('Login succeeded but no session cookie returned')
  console.log(`Logged in as ${ADMIN_USR}`)
}

async function logout() {
  try {
    await erpPost('/api/method/logout', {})
    console.log('Logged out')
  } catch { /* best-effort */ }
}

// ─── ERPNext helpers ──────────────────────────────────────────────────────────
async function fetchAllActiveEmployees() {
  const filters = [['Employee', 'status', '=', 'Active']]
  if (COMPANY) filters.push(['Employee', 'company', '=', COMPANY])

  const json = await erpGet('/api/resource/Employee', {
    fields: JSON.stringify(['name', 'employee_name', 'company', 'user_id', 'company_email', 'personal_email']),
    filters: JSON.stringify(filters),
    limit_page_length: '500',
  })
  // Normalise: add a resolved `userId` field using first populated email field
  return json.data.map((emp) => ({
    ...emp,
    userId: [emp.userId, emp.company_email, emp.personal_email]
      .map((v) => v?.trim())
      .find(Boolean) ?? null,
  }))
}

async function fetchFirstActivityType() {
  try {
    const json = await erpGet('/api/resource/Activity Type', {
      fields: JSON.stringify(['name']),
      limit_page_length: '1',
    })
    return json.data[0]?.name ?? null
  } catch {
    return null
  }
}

/** Returns the existing timesheet name for this employee+month, or null if none. */
async function findExistingTimesheet(employeeId, startDate, endDate) {
  const json = await erpGet('/api/resource/Timesheet', {
    fields: JSON.stringify(['name']),
    filters: JSON.stringify([
      ['Timesheet', 'employee', '=', employeeId],
      ['Timesheet', 'start_date', '>=', startDate],
      ['Timesheet', 'start_date', '<=', endDate],
    ]),
    limit_page_length: '1',
  })
  return json.data[0]?.name ?? null
}

/** Returns all timesheet names ever created for this employee. */
async function fetchAllTimesheetNames(employeeId) {
  const json = await erpGet('/api/resource/Timesheet', {
    fields: JSON.stringify(['name']),
    filters: JSON.stringify([['Timesheet', 'employee', '=', employeeId]]),
    order_by: 'modified desc',
    limit_page_length: '500',
  })
  return json.data.map((d) => d.name)
}

/**
 * Share a timesheet with the employee's own Frappe user account so they can
 * see it in the app regardless of DocPerm configuration.
 * The Administrator session has full access, so frappe.share.add succeeds here.
 */
async function shareWithEmployee(tsName, userId) {
  try {
    await erpPost('/api/method/frappe.share.add', {
      doctype: 'Timesheet',
      name:    tsName,
      user:    userId,
      read:    1,
      write:   1,
      submit:  1,
      share:   1,
    })
  } catch (err) {
    console.warn(`    WARN   share ${tsName} → ${userId} failed: ${err.message}`)
  }
}

async function createTimesheet(employee, startDate, endDate, activityType) {
  // ERPNext requires at least one time_logs row to save a Timesheet.
  // Placeholder: 1 second at midnight on the 1st — outside normal work hours
  // so it never overlaps with real time logs. Employees replace it.
  const firstDay = startDate.slice(0, 7) + '-01'   // always YYYY-MM-01
  const placeholderLog = {
    doctype: 'Timesheet Detail',
    from_time: `${firstDay} 00:00:00`,
    to_time:   `${firstDay} 00:00:01`,
    hours: 0,
    is_billable: 0,
    description: 'Auto-created placeholder — please update with actual hours',
    ...(activityType ? { activity_type: activityType } : {}),
  }

  const { json } = await erpPost('/api/resource/Timesheet', {
    doctype: 'Timesheet',
    employee: employee.name,
    company: employee.company || COMPANY || undefined,
    start_date: startDate,
    end_date: endDate,
    time_logs: [placeholderLog],
  })
  return json.data.name  // e.g. "TS-00042"
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
function currentMonthBounds() {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()          // 0-based
  const pad = (n) => String(n).padStart(2, '0')
  const mm = pad(m + 1)
  // Build date strings directly — avoids toISOString() UTC shift (e.g. IST → UTC loses a day)
  const lastDay = new Date(y, m + 1, 0).getDate()
  return {
    startDate: `${y}-${mm}-01`,
    endDate:   `${y}-${mm}-${pad(lastDay)}`,
    label:     `${y}-${mm}`,
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const { startDate, endDate, label } = currentMonthBounds()

  console.log(`\n=== Monthly Timesheet Job  [${new Date().toISOString()}] ===`)
  console.log(`Month: ${label}  (${startDate} → ${endDate})\n`)

  await login()

  let employees
  try {
    employees = await fetchAllActiveEmployees()
  } catch (err) {
    console.error('[ERROR] Could not fetch employees:', err.message)
    await logout()
    process.exit(1)
  }

  console.log(`Found ${employees.length} active employee(s).`)

  const activityType = await fetchFirstActivityType()
  console.log(`Activity type for placeholder: ${activityType ?? '(none — will be left blank)'}\n`)

  let created = 0
  let skipped = 0
  let failed  = 0

  for (const emp of employees) {
    const tag = `${emp.name} — ${emp.employee_name}`
    try {
      // ── Current month ────────────────────────────────────────────────────────
      const existingTs = await findExistingTimesheet(emp.name, startDate, endDate)
      if (existingTs) {
        if (emp.userId) await shareWithEmployee(existingTs, emp.userId)
        console.log(`  SKIP     ${tag}`)
        skipped++
      } else {
        const tsName = await createTimesheet(emp, startDate, endDate, activityType)
        if (emp.userId) await shareWithEmployee(tsName, emp.userId)
        console.log(`  CREATED  ${tag}  →  ${tsName}`)
        created++
      }

      // ── Historical backfill ──────────────────────────────────────────────────
      // Share every past timesheet with the employee so they can see their full
      // history in the app. frappe.share.add is idempotent — re-sharing an
      // already-shared document is safe and simply refreshes the DocShare record.
      if (emp.userId) {
        const allNames = await fetchAllTimesheetNames(emp.name)
        for (const tsName of allNames) {
          await shareWithEmployee(tsName, emp.userId)
        }
        if (allNames.length > 1) {
          console.log(`    backfilled ${allNames.length} timesheet(s) for ${emp.name}`)
        }
      }
    } catch (err) {
      console.error(`  FAILED   ${tag}  →  ${err.message}`)
      failed++
    }
  }

  await logout()

  console.log(`\n─────────────────────────────────────`)
  console.log(`  Created : ${created}`)
  console.log(`  Skipped : ${skipped}  (already existed)`)
  console.log(`  Failed  : ${failed}`)
  console.log(`─────────────────────────────────────\n`)

  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error('[FATAL]', err.message)
  process.exit(1)
})
