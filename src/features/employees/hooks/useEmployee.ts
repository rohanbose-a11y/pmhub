import { useEffect, useState } from 'react'

import { employeeApi } from '../../../api/employeeApi'
import type { Employee } from '../types/employee.types'

/**
 * Fetches the ERPNext Employee record linked to the given Frappe username.
 * Returns null while loading or if no record is found.
 */
export function useEmployee(username: string) {
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [loading,  setLoading]  = useState(false)

  useEffect(() => {
    if (!username) return

    let cancelled = false
    setLoading(true)

    employeeApi
      .findByUser(username)
      .then((emp) => { if (!cancelled) setEmployee(emp) })
      .catch(() => { if (!cancelled) setEmployee(null) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [username])

  return { employee, loading }
}
