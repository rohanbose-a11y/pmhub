import type { Employee } from '../features/employees/types/employee.types'
import { httpClient } from './httpClient'

// ─── Frappe response shapes ───────────────────────────────────────────────────

interface FrappeListResponse<T> { data: T[] }

interface FrappeEmployeeRecord {
  name:               string
  employee_name?:     string | null
  user_id?:           string | null
  company_email?:     string | null
  personal_email?:    string | null
  cell_number?:       string | null
  nationality?:       string | null
  gender?:            string | null
  date_of_birth?:     string | null
  status?:            string | null
  employment_type?:   string | null
  designation?:       string | null
  department?:        string | null
  branch?:            string | null
  company?:           string | null
  date_of_joining?:   string | null
  // Address
  permanent_address?: string | null
  current_address?:   string | null
  // Tax
  pan_number?:        string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcAge(dob: string | null | undefined): number | null {
  if (!dob) return null
  const birth = new Date(dob)
  if (isNaN(birth.getTime())) return null
  const now  = new Date()
  let age    = now.getFullYear() - birth.getFullYear()
  const m    = now.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--
  return age
}

function toEmployee(r: FrappeEmployeeRecord): Employee {
  return {
    id:               r.name,
    fullName:         r.employee_name ?? '',
    userId:           r.user_id       ?? null,
    email:            r.company_email ?? r.personal_email ?? null,
    mobile:           r.cell_number   ?? null,
    nationality:      r.nationality   ?? null,
    gender:           r.gender        ?? null,
    dateOfBirth:      r.date_of_birth ?? null,
    age:              calcAge(r.date_of_birth),
    employmentStatus: r.status         ?? null,
    hireType:         r.employment_type ?? null,
    designation:      r.designation    ?? null,
    department:       r.department     ?? null,
    branch:           r.branch         ?? null,
    company:          r.company        ?? null,
    // Education / skills — not standard single fields; leave null for now
    levelOfEducation: null,
    degree:           null,
    hardSkill:        null,
    softSkill:        null,
    // Address — ERPNext permanent_address is a full multi-line text block
    address:          r.permanent_address ?? r.current_address ?? null,
    addressLine2:     null,
    city:             null,
    postalCode:       null,
    taxNumber:        r.pan_number ?? null,
  }
}

// ─── API ──────────────────────────────────────────────────────────────────────

export const employeeApi = {
  /**
   * Find the Employee document linked to the given Frappe username/email.
   *
   * Step 1 — resolve ID: query the list endpoint with only `["name"]`
   *   (field-level restrictions don't apply to the primary key).
   *   Tries user_id, company_email, and personal_email in parallel.
   *
   * Step 2 — fetch document: GET /api/resource/Employee/{id}
   *   Frappe returns all fields the session user is permitted to read on
   *   the specific document, avoiding the 417 permission error that occurs
   *   when projecting sensitive HR fields in a list query.
   */
  async findByUser(username: string): Promise<Employee | null> {
    if (!username) return null

    // ── Step 1: resolve employee ID ─────────────────────────────────────────
    const lookupFields: Array<'user_id' | 'company_email' | 'personal_email'> = [
      'user_id', 'company_email', 'personal_email',
    ]

    const idResults = await Promise.all(
      lookupFields.map((field) =>
        httpClient
          .get<FrappeListResponse<{ name: string }>>('/api/resource/Employee', {
            params: {
              fields:            JSON.stringify(['name']),
              filters:           JSON.stringify([['Employee', field, '=', username]]),
              limit_page_length: 1,
            },
          })
          .then((res) => res.data.data[0]?.name ?? null)
          .catch(() => null),
      ),
    )

    const employeeId = idResults.find(Boolean) ?? null

    if (!employeeId) {
      console.warn('[employeeApi] No Employee record found for user:', username)
      return null
    }

    // ── Step 2: fetch the full document by ID ────────────────────────────────
    const record = await httpClient
      .get<{ data: FrappeEmployeeRecord }>(`/api/resource/Employee/${encodeURIComponent(employeeId)}`)
      .then((res) => res.data.data)
      .catch((err) => {
        console.warn('[employeeApi] Failed to fetch Employee document:', err)
        return null
      })

    return record ? toEmployee(record) : null
  },
}
