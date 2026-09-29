import { useMemo, useEffect, useState } from 'react'
import { httpClient } from '../api/httpClient'

interface SearchLinkResponse {
  results: { value: string }[]
}

interface ActivityTypeRecord {
  name: string
  department: string | null
}

// Single module-level cache
let cache: ActivityTypeRecord[] | null = null

/** Fetches names via search_link (reliable path, matches Frappe desktop). */
async function fetchNames(): Promise<string[]> {
  try {
    const { data } = await httpClient.get<SearchLinkResponse>(
      '/api/method/frappe.desk.search.search_link',
      { params: { txt: '', doctype: 'Activity Type', reference_doctype: 'Task', page_length: 100 } },
    )
    const names = (data.results ?? []).map((r) => r.value).filter(Boolean)
    if (names.length > 0) return names
    console.warn('[useKraOptions] search_link returned 0 — trying REST for names')
  } catch (err) {
    console.warn('[useKraOptions] search_link failed:', err)
  }

  // Fallback: REST with just name (no custom fields)
  const { data } = await httpClient.get<{ data: { name: string }[] }>(
    '/api/resource/Activity Type',
    { params: { fields: JSON.stringify(['name']), limit_page_length: 100 } },
  )
  return (data.data ?? []).map((r) => r.name).filter(Boolean)
}

/**
 * Best-effort: fetch department info for each activity type.
 * Tries 'department' then 'custom_department' (ERPNext v14 prefixes custom fields).
 * Returns empty map on any failure — callers degrade to showing all types.
 */
async function fetchDeptMap(): Promise<Map<string, string>> {
  for (const field of ['custom_department', 'department']) {
    try {
      const { data } = await httpClient.get<{ data: { name: string; [k: string]: string | null }[] }>(
        '/api/resource/Activity Type',
        { params: { fields: JSON.stringify(['name', field]), limit_page_length: 100 } },
      )
      const map = new Map<string, string>()
      for (const r of data.data ?? []) {
        const dept = r[field]
        if (r.name && dept) map.set(r.name, dept)
      }
      if (map.size > 0) {
        console.log(`[useKraOptions] department field is "${field}", found ${map.size} entries`)
        return map
      }
    } catch {
      // try next field name
    }
  }
  console.warn('[useKraOptions] could not fetch department info — department filtering disabled')
  return new Map()
}

async function fetchActivityTypes(): Promise<ActivityTypeRecord[]> {
  const [names, deptMap] = await Promise.all([fetchNames(), fetchDeptMap()])
  return names.map((name) => ({ name, department: deptMap.get(name) ?? null }))
}

export function useKraOptions(department?: string | null) {
  const [allTypes, setAllTypes] = useState<ActivityTypeRecord[]>(cache ?? [])
  const [loading, setLoading]   = useState(cache === null)

  useEffect(() => {
    if (cache !== null) { setAllTypes(cache); setLoading(false); return }
    let cancelled = false
    fetchActivityTypes()
      .then((records) => {
        if (cancelled) return
        cache = [...records].sort((a, b) => a.name.localeCompare(b.name))
        setAllTypes(cache)
      })
      .catch(() => { /* cache stays null → next mount retries */ })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const options = useMemo(() => {
    if (!department) return allTypes.map((r) => r.name)
    const hasDeptInfo = allTypes.some((r) => r.department !== null)
    if (!hasDeptInfo) return allTypes.map((r) => r.name)
    return allTypes.filter((r) => r.department === department).map((r) => r.name)
  }, [allTypes, department])

  return { options, loading }
}
