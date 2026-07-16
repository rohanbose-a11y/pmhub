import axios from 'axios'

import { env } from '../config/env'

export const httpClient = axios.create({
  baseURL: env.apiBaseUrl,
  withCredentials: true,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
})

// Frappe requires X-Frappe-CSRF-Token for all non-GET /api/method/ calls.
// The token is stored in the frappe_csrf_token cookie after login.
httpClient.interceptors.request.use((config) => {
  const method = config.method?.toUpperCase() ?? 'GET'

  if (method === 'GET') {
    // Prevent browser and service-worker caching of API responses so that
    // background polls always return fresh data (new assignments, notifications).
    config.headers['Cache-Control'] = 'no-cache'
    config.headers['Pragma'] = 'no-cache'
  } else {
    const csrfToken = document.cookie
      .split('; ')
      .find((row) => row.startsWith('frappe_csrf_token='))
      ?.split('=')[1]

    if (csrfToken && csrfToken !== 'None') {
      config.headers['X-Frappe-CSRF-Token'] = decodeURIComponent(csrfToken)
    }
  }
  return config
})
