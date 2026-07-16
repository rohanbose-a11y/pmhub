# Production Deployment

## Recommended production architecture

```text
Browser / Mobile App
        |
        v
   HTTPS domain
   (Nginx serving Vite build)
        |
        +--> /            -> static React PWA files
        +--> /frappe/*    -> reverse proxy to ERPNext / Frappe backend
```

This keeps the frontend and API on the same visible origin while forwarding ERPNext requests securely upstream.

## Environment values

```env
VITE_API_BASE_URL=/frappe
VITE_API_PROXY_TARGET=https://erp-dev.sauramandala.org
ERP_API_UPSTREAM=https://erp-dev.sauramandala.org
```

## Local production-style build

```bash
npm install
npm run build:prod
npm run preview:prod
```

## Docker deployment

```bash
docker compose -f docker-compose.production.yml up --build -d
```

The container exposes the app on `http://localhost:8080`.

## Why this architecture is safer

- no browser-to-backend raw cross-origin calls in production
- `/frappe` stays same-origin for session cookies
- ERPNext stays behind an HTTPS reverse proxy target
- the React app is deployed as static assets only


cd /var/www/project.sauramandala.org                                                         
  git pull                                                                                     
  npm run build:prod
  

  node scripts/create-monthly-timesheets.js