import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget = env.VITE_API_PROXY_TARGET || 'https://erp-dev.sauramandala.org'

  return {
    plugins: [react(), ...(mode === 'development' ? [basicSsl()] : [])],
    server: {
      host: '0.0.0.0',
      port: 5173,
      https: mode === 'development' ? {} : undefined,
      proxy: {
        '/frappe': {
          target: proxyTarget,
          changeOrigin: true,
          secure: false,
          cookieDomainRewrite: '',
          cookiePathRewrite: '/',
          rewrite: (path) => path.replace(/^\/frappe/, ''),
        },
      },
    },
    preview: {
      host: '0.0.0.0',
      port: 4173,
    },
  }
})
