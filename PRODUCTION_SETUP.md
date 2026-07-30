# Production Server Setup Guide

Complete steps to deploy the ERPNext PM Hub (including WhatsApp reminders) to a production Ubuntu/AWS server.

---

## Prerequisites

- Ubuntu server with Node.js 18+ installed
- Nginx installed and running
- Domain pointed to the server (e.g. `pm.sauramandala.org`)
- SSH access as `ubuntu` user
- ERPNext instance running (e.g. `erp.sauramandala.org`)
- Gupshup account with approved templates

---

## 1. Server Directory Setup (first time only)

SSH into the server and create the app directory:

```bash
sudo mkdir -p /var/www/pm.sauramandala.org
sudo chown ubuntu:ubuntu /var/www/pm.sauramandala.org
```

---

## 2. Build Locally

On your local machine:

```bash
npm install
npm run build:prod
```

This produces a `dist/` folder with the compiled frontend.

---

## 3. Deploy Files to Server

From your local machine, copy the built files and the cron script:

```bash
# Copy frontend build
scp -r dist/* ubuntu@your-server-ip:/var/www/pm.sauramandala.org/

# Copy the WhatsApp cron script
scp scripts/send-whatsapp-reminders.js ubuntu@your-server-ip:/var/www/pm.sauramandala.org/scripts/send-whatsapp-reminders.js
```

> If using git on the server instead of SCP:
> ```bash
> cd /var/www/pm.sauramandala.org
> git pull
> npm run build:prod
> ```

---

## 4. Nginx Configuration

Create or edit the nginx site config:

```bash
sudo nano /etc/nginx/sites-available/pm.sauramandala.org
```

Paste this config (replace domains and API key as needed):

```nginx
server {
    listen 80;
    server_name pm.sauramandala.org;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name pm.sauramandala.org;

    ssl_certificate     /etc/letsencrypt/live/pm.sauramandala.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/pm.sauramandala.org/privkey.pem;

    root /var/www/pm.sauramandala.org;
    index index.html;

    # Serve the React SPA
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy ERPNext API calls
    location /frappe/ {
        proxy_pass https://erp.sauramandala.org/;
        proxy_set_header Host erp.sauramandala.org;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Proxy Gupshup WhatsApp API (injects API key server-side)
    location /gupshup/ {
        proxy_pass https://api.gupshup.io/;
        proxy_set_header apikey "sk_your_actual_gupshup_api_key_here";
        proxy_set_header Host api.gupshup.io;
    }
}
```

Enable the site and reload nginx:

```bash
sudo ln -s /etc/nginx/sites-available/pm.sauramandala.org /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 5. Set Server Timezone to IST

```bash
sudo timedatectl set-timezone Asia/Kolkata
timedatectl   # verify: Time zone: Asia/Kolkata (IST, +0530)
```

---

## 6. Create `.env.cron` on the Server

This file holds credentials and shift times for the cron script. **Never commit this file.**

```bash
nano /var/www/pm.sauramandala.org/.env.cron
```

Paste and fill in your values:

```env
ERP_API_UPSTREAM=https://erp.sauramandala.org
ERP_ADMIN_USER=Administrator
ERP_ADMIN_PASSWORD=your_erp_password_here
ERP_COMPANY=

GUPSHUP_API_KEY=sk_your_gupshup_api_key_here
GUPSHUP_APP_NAME=DRIVEBOT
GUPSHUP_SRC_NUMBER=917627993671
GUPSHUP_CHECKIN_TMPL_ID=a8b37465-89d1-4f10-8c78-67cd86511231
GUPSHUP_CHECKIN_CONFIRM_TMPL_ID=ba7d10fc-7be6-4db8-9d48-3458393de39d
GUPSHUP_CHECKOUT_TMPL_ID=b7382b33-dc9a-4c57-9366-0ff8abff98a8

# Shift 1
SHIFT_1_NAME=SMF Shillong Office
SHIFT_1_CHECKIN_TIME=09:15
SHIFT_1_CHECKOUT_TIME=18:30

# Shift 2 (leave blank if not needed)
SHIFT_2_NAME=
SHIFT_2_CHECKIN_TIME=
SHIFT_2_CHECKOUT_TIME=

# Add SHIFT_3_*, SHIFT_4_* etc. for more shifts
```

> Times must be in 24-hour `HH:MM` format (e.g. `09:15`, `18:30`).  
> The cron script reads these times and exits silently when it's not the right minute — no crontab changes are needed when times change, just update this file.

---

## 7. Test the Script Manually

Before enabling the cron, do a manual test to confirm everything works end-to-end:

```bash
cd /var/www/pm.sauramandala.org

# Force a check-in reminder for Shift 1
REMINDER_TYPE=checkin SHIFT_NAME="SMF Shillong Office" node scripts/send-whatsapp-reminders.js

# Force a check-out reminder for Shift 1
REMINDER_TYPE=checkout SHIFT_NAME="SMF Shillong Office" node scripts/send-whatsapp-reminders.js
```

Expected output:
```
=== WhatsApp Reminders  [2026-07-21T...]  (1 shift(s) to process) ===
Logged in as Administrator

─── SMF Shillong Office / checkout ───────────────────────────────
  Holiday check passed (...)
  Found N employee(s) with a phone number.
  SENT     Employee Name  → 91XXXXXXXXXX  [check-out reminder]
  Result: N sent, 0 skipped, 0 failed
Logged out

=== Done ===
```

If you see `[FATAL]` errors, check:
- `.env.cron` credentials are correct
- ERP server is reachable from this machine
- Shift name exactly matches the shift name in ERPNext

---

## 8. Set Up the Cron Job

```bash
crontab -e
```

Add this line (runs every minute, Monday–Saturday):

```
* * * * 1-6 cd /var/www/pm.sauramandala.org && /usr/bin/node scripts/send-whatsapp-reminders.js >> /var/www/pm.sauramandala.org/wa-reminders.log 2>&1
```

Verify it was saved:

```bash
crontab -l
```

---

## 9. Monitor Logs

```bash
tail -f /var/www/pm.sauramandala.org/wa-reminders.log
```

The log will only have entries at the configured shift times. Silence between those times is normal — the script exits without output when it's not the right minute.

---

## 10. Adding or Changing Shifts

Only `.env.cron` needs to change — no crontab edits required.

```bash
nano /var/www/pm.sauramandala.org/.env.cron
```

Add `SHIFT_2_NAME`, `SHIFT_2_CHECKIN_TIME`, `SHIFT_2_CHECKOUT_TIME` (and so on up to `SHIFT_20_*`). Changes take effect on the next cron tick.

---

## Ongoing Deployments (after initial setup)

For future code updates:

```bash
# Local machine
npm run build:prod
scp -r dist/* ubuntu@your-server-ip:/var/www/pm.sauramandala.org/
scp scripts/send-whatsapp-reminders.js ubuntu@your-server-ip:/var/www/pm.sauramandala.org/scripts/
```

No nginx or cron changes are needed for routine frontend updates.

 crontab -e
* * * * 1-6 cd /var/www/project.sauramandala.org && /usr/bin/node scripts/send-whatsapp-reminders.js >> /var/www/project.sauramandala.org/wa-reminders.log 2>&1

tail -100 /var/www/project.sauramandala.org
/wa-reminders.log