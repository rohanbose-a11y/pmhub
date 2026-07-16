const DEFAULT_API_BASE_URL = '/frappe'
const DEFAULT_API_UPSTREAM = 'https://erp-dev.sauramandala.org'

export const env = {
  isDev: import.meta.env.DEV,
  isProd: import.meta.env.PROD,
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL,
  apiProxyTarget: import.meta.env.VITE_API_PROXY_TARGET?.trim() || DEFAULT_API_UPSTREAM,
}
