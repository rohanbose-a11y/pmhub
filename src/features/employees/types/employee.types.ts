// ─── Employee document ────────────────────────────────────────────────────────

export interface Employee {
  /** ERPNext document name, e.g. "EMP-00001" */
  id:               string
  fullName:         string
  userId:           string | null
  email:            string | null
  mobile:           string | null
  nationality:      string | null
  gender:           string | null
  dateOfBirth:      string | null
  age:              number | null
  employmentStatus: string | null
  hireType:         string | null
  designation:      string | null
  department:       string | null
  branch:           string | null
  company:          string | null
  // Education / skills
  levelOfEducation: string | null
  degree:           string | null
  hardSkill:        string | null
  softSkill:        string | null
  // Address
  address:          string | null
  addressLine2:     string | null
  city:             string | null
  postalCode:       string | null
  // Tax
  taxNumber:        string | null
}
