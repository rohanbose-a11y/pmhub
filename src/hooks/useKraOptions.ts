import { useEffect, useState } from 'react'
import { httpClient } from '../api/httpClient'

interface SearchLinkResult {
  value: string
}

interface SearchLinkResponse {
  results: SearchLinkResult[]
}

interface RestListResponse {
  data: { name: string }[]
}

let cache: string[] | null = null

/**
 * Fetches Activity Type names via search_link (same call Frappe desktop makes).
 * passing reference_doctype='Task' is required in newer Frappe versions —
 * without it, Frappe blocks the search if the user has no explicit read
 * permission on Activity Type, even though they can access it via Task.
 */
async function fetchActivityTypes(): Promise<string[]> {
  // Attempt 1: search_link with reference_doctype (matches what Frappe desktop sends)
  try {
    const { data } = await httpClient.get<SearchLinkResponse>(
      '/api/method/frappe.desk.search.search_link',
      {
        params: {
          txt: '',
          doctype: 'Activity Type',
          reference_doctype: 'Task',
          page_length: 100,
        },
      },
    )
    const names = (data.results ?? []).map((r) => r.value).filter(Boolean)
    console.log('[useKraOptions] search_link returned', names.length, 'Activity Types:', names)
    if (names.length > 0) return names
    console.warn('[useKraOptions] search_link returned 0 results — trying REST fallback')
  } catch (err) {
    console.warn('[useKraOptions] search_link failed, trying REST fallback:', err)
  }

  // Attempt 2: REST list endpoint — works when the user has direct read permission
  try {
    const { data } = await httpClient.get<RestListResponse>('/api/resource/Activity Type', {
      params: {
        fields: JSON.stringify(['name']),
        limit_page_length: 100,
      },
    })
    const names = (data.data ?? []).map((r) => r.name).filter(Boolean)
    console.log('[useKraOptions] REST fallback returned', names.length, 'Activity Types:', names)
    return names
  } catch (err) {
    console.error('[useKraOptions] REST fallback also failed:', err)
    throw err
  }
}

export function useKraOptions() {
  const [options, setOptions] = useState<string[]>(cache ?? [])
  const [loading, setLoading] = useState(cache === null)

  useEffect(() => {
    if (cache !== null) return
    let cancelled = false

    fetchActivityTypes()
      .then((names) => {
        if (cancelled) return
        cache = names
        setOptions(names)
      })
      .catch(() => {
        if (cancelled) return
        // Leave cache as null so the next mount can retry — do NOT set cache = []
        // as that would permanently block retries for the entire session.
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [])

  return { options, loading }
}
