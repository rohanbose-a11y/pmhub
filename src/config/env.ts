const DEFAULT_API_BASE_URL = '/frappe'
const DEFAULT_API_UPSTREAM = 'https://erp-dev.sauramandala.org'

export const env = {
  isDev: import.meta.env.DEV,
  isProd: import.meta.env.PROD,
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL,
  apiProxyTarget: import.meta.env.VITE_API_PROXY_TARGET?.trim() || DEFAULT_API_UPSTREAM,
  gupshupBase:          import.meta.env.VITE_GUPSHUP_BASE?.trim()            || '/gupshup',
  gupshupAppName:       import.meta.env.VITE_GUPSHUP_APP_NAME?.trim()        || '',
  gupshupSrcNumber:     import.meta.env.VITE_GUPSHUP_SRC_NUMBER?.trim()      || '',
  gupshupCheckinTmpl:        import.meta.env.VITE_GUPSHUP_CHECKIN_TMPL_ID?.trim()         || '',
  gupshupCheckinConfirmTmpl: import.meta.env.VITE_GUPSHUP_CHECKIN_CONFIRM_TMPL_ID?.trim() || '',
  gupshupCheckoutTmpl:       import.meta.env.VITE_GUPSHUP_CHECKOUT_TMPL_ID?.trim()        || '',
}
