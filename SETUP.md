# ERPNext PM Hub — Setup Guide

## Access Details

| Item | Value |
|------|-------|
| Live (dev) URL | https://dev-pm.sauramandala.org/ |
| Login username | Administrator |
| Login password | Admin@123 |
| GitHub repo | https://github.com/rohanbose-a11y/pmhub.git |

---

## Prerequisites

Make sure the following are installed on the server:

- Node.js 18+
- npm
- git
- nginx
- certbot (for SSL)

---

## Setting Up a Test Site on a New Server

### 1. Clone the repo

```bash
cd /var/www
git clone https://github.com/rohanbose-a11y/pmhub.git test-pm.yourdomain.com
cd test-pm.yourdomain.com
```

### 2. Create the `.env` file

```bash
nano .env
```

Paste the following (update values as needed):

```env
VITE_API_BASE_URL=/frappe
VITE_API_PROXY_TARGET=https://erp-dev.sauramandala.org
VITE_GUPSHUP_BASE=/gupshup
VITE_GUPSHUP_APP_NAME=DRIVEBOT
VITE_GUPSHUP_SRC_NUMBER=917627993671
VITE_GUPSHUP_CHECKIN_TMPL_ID=a8b37465-89d1-4f10-8c78-67cd86511231
VITE_GUPSHUP_CHECKOUT_TMPL_ID=b7382b33-dc9a-4c57-9366-0ff8abff98a8

# ── LOCALHOST ONLY — never needed on the production server ──
# In production, nginx injects the apikey header directly in the nginx config.
# This is only used by the Vite dev proxy (vite.config.ts) on your local machine.
# No VITE_ prefix — this is NEVER bundled into the browser build.
GUPSHUP_API_KEY=sk_fdc4535e7e64424db32c1eceabc29fc8
```

### 3. Install dependencies and build

```bash
npm install
npm run build:prod
```

The built files will be in the `dist/` folder.

### 4. Configure nginx

#### Why do we proxy ERPNext and Gupshup through nginx?

**ERPNext (`/frappe/`)**
The React app is served from `https://dev-pm.sauramandala.org` but the ERPNext backend lives on a different domain (`erp-dev.sauramandala.org`). If the browser called ERPNext directly, it would be a cross-origin request and the browser blocks session cookies from being sent — breaking login. By routing `/frappe/` through nginx on the same domain, the browser sees it as same-origin, cookies work correctly, and ERPNext never needs to be exposed to the public internet directly.

**Gupshup (`/gupshup/`)**
The Gupshup API requires an `apikey` header for every request. If the frontend called Gupshup directly from the browser, that API key would be visible to anyone who opens DevTools — a serious security risk. By routing `/gupshup/` through nginx, the API key is injected server-side by nginx and the browser never sees it. The frontend just calls `/gupshup/...` and nginx silently adds the secret key before forwarding to `api.gupshup.io`.

In short: **ERPNext proxy = fixes cookies / CORS. Gupshup proxy = hides the API key.**

Create a new nginx site config:

```bash
sudo nano /etc/nginx/sites-available/test-pm.yourdomain.com
```

Paste the following (replace domain and Gupshup API key):

```nginx
server {
    server_name test-pm.yourdomain.com;

    root /var/www/test-pm.yourdomain.com/dist;
    index index.html;

    include /etc/nginx/mime.types;

    # SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API calls to ERPNext
    location /frappe/ {
        proxy_pass https://erp-dev.sauramandala.org/;
        proxy_http_version 1.1;
        proxy_set_header Host              erp-dev.sauramandala.org;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_ssl_verify off;
    }

    # Proxy WhatsApp API calls to Gupshup
    location /gupshup/ {
        proxy_pass https://api.gupshup.io/;
        proxy_http_version 1.1;
        proxy_set_header Host       api.gupshup.io;
        proxy_set_header apikey     "YOUR_GUPSHUP_API_KEY";
        proxy_ssl_verify off;
    }

    listen 80;
}
```

Enable the site and reload nginx:

```bash
sudo ln -s /etc/nginx/sites-available/test-pm.yourdomain.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 5. (Optional) Add SSL with Certbot

```bash
sudo certbot --nginx -d test-pm.yourdomain.com
```

---

## Updating the Site (After a Git Push)

```bash
cd /var/www/test-pm.yourdomain.com
git pull
npm run build:prod
```

No nginx reload needed — nginx serves static files directly from `dist/`.

---

## Project Structure (Quick Reference)

```
src/
  features/
    tasks/        — Task management
    projects/     — Projects
    timesheets/   — Timesheets
    whatsapp/     — WhatsApp admin (Administrator only)
    employees/    — Employee profiles
  shared/         — Layout, nav, shared components
  store/          — Zustand state (auth, workspace)
  config/env.ts   — All env vars accessed here
scripts/
  send-whatsapp-reminders.js   — Cron script for WhatsApp check-in/out notifications
  create-monthly-timesheets.js — Cron script for monthly timesheet creation
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS |
| State | Zustand |
| Backend | ERPNext / Frappe (existing instance) |
| WhatsApp | Gupshup API |
| Server | nginx + Ubuntu on AWS EC2 |
| SSL | Let's Encrypt (Certbot) |
