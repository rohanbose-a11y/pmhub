---
name: WhatsApp Notification Integration — Gupshup
description: Plan and progress for sending WhatsApp notifications to employees via Gupshup for check-in/check-out reminders
type: project
originSessionId: b32952f2-3f3e-439e-b46a-0e2f34f0146e
---
## Overview

The organization uses ERPNext and wants to send WhatsApp notifications to employees. They have a Meta-verified WhatsApp Business account and a Gupshup account.

**Decision:** Use Gupshup (not Meta Cloud API direct) — simpler integration, handles webhook complexity.

**Why:** Gupshup abstracts the heavy lifting and the team is comfortable with it.

---

## Phase 1 — Check-in / Check-out Notifications

### Notification Logic (finalised 2026-07-21)

| Scenario | Action |
|----------|--------|
| Employee has NOT checked in | Send `checkin_reminder` — "please mark your check-in" |
| Employee HAS checked in | Send `checkin_confirmation` — "Thank you for checking in at {{time}} on {{date}}" |
| Employee has NOT checked out | Send `checkout_reminder` — "please mark your check-out" |
| Employee HAS checked out | **No notification sent** |

---

## Templates

### Template 1: `checkin_reminder`
- **Category:** Utility
- **Language:** English
- **Label:** Attendance Check-in Reminder
- **Status:** Approved ✅ (confirmed working 2026-07-21)
- **Template ID:** `a8b37465-89d1-4f10-8c78-67cd86511231`
- **Body:**
  ```
  Hi {{1}}, this is a friendly reminder to mark your check-in attendance for {{2}} on SMF ERP. Please log in and update your attendance record. Thank you.
  ```
- **Params:** `{{1}}` = first name, `{{2}}` = date (e.g. 21 Jul 2026)

### Template 2: `checkout_reminder`
- **Category:** Utility
- **Language:** English
- **Label:** Attendance Check-out Reminder
- **Status:** Approved ✅ (confirmed 2026-07-21)
- **Template ID:** `b7382b33-dc9a-4c57-9366-0ff8abff98a8`
- **Body:**
  ```
  Hi {{1}}, this is a friendly reminder to mark your check-out attendance for {{2}} on SMF ERP. Please log in and update your attendance record. Thank you.
  ```
- **Params:** `{{1}}` = first name, `{{2}}` = date (e.g. 21 Jul 2026)

### Template 3: `checkin_confirmation`
- **Category:** Utility
- **Language:** English
- **Label:** Attendance Check-in Confirmation
- **Status:** Approved ✅ (confirmed working 2026-07-21)
- **Template ID:** `ba7d10fc-7be6-4db8-9d48-3458393de39d`
- **Body:**
  ```
  Thank you {{1}} for checking in at {{2}} on {{3}}.
  ```
- **Params:** `{{1}}` = first name, `{{2}}` = check-in time (e.g. 09:12 AM), `{{3}}` = date (e.g. 21 Jul 2026)

---

## Script: `scripts/send-whatsapp-reminders.js`

- Runs as a cron job, configured via `.env.cron` on the server
- Reads `REMINDER_TYPE=checkin` or `REMINDER_TYPE=checkout`
- Checks ERPNext `Employee Checkin` records to determine who has/hasn't checked in or out
- Skips employees on approved leave or on a holiday
- For check-in: fetches actual check-in time from ERPNext to include in confirmation message

### Cron schedule (IST = UTC+5:30)
```
# Check-in reminder at 09:15 IST (03:45 UTC) — for those who haven't checked in
45 3 * * 1-6 REMINDER_TYPE=checkin node scripts/send-whatsapp-reminders.js

# Check-in confirmation — run after employees have checked in (e.g. 10:00 IST / 04:30 UTC)
30 4 * * 1-6 REMINDER_TYPE=checkin node scripts/send-whatsapp-reminders.js

# Check-out reminder at 18:30 IST (13:00 UTC) — for those who haven't checked out
0 13 * * 1-6 REMINDER_TYPE=checkout node scripts/send-whatsapp-reminders.js
```

---

## Environment Variables

```env
# .env (frontend build — VITE_ vars are bundled)
VITE_GUPSHUP_BASE=/gupshup
VITE_GUPSHUP_APP_NAME=DRIVEBOT
VITE_GUPSHUP_SRC_NUMBER=917627993671
VITE_GUPSHUP_CHECKIN_TMPL_ID=a8b37465-89d1-4f10-8c78-67cd86511231
VITE_GUPSHUP_CHECKOUT_TMPL_ID=b7382b33-dc9a-4c57-9366-0ff8abff98a8
VITE_GUPSHUP_CHECKIN_CONFIRM_TMPL_ID=ba7d10fc-7be6-4db8-9d48-3458393de39d

# .env.cron (server-side script only)
GUPSHUP_API_KEY=<secret>
GUPSHUP_APP_NAME=DRIVEBOT
GUPSHUP_SRC_NUMBER=917627993671
GUPSHUP_CHECKIN_TMPL_ID=a8b37465-89d1-4f10-8c78-67cd86511231
GUPSHUP_CHECKOUT_TMPL_ID=b7382b33-dc9a-4c57-9366-0ff8abff98a8
GUPSHUP_CHECKIN_CONFIRM_TMPL_ID=ba7d10fc-7be6-4db8-9d48-3458393de39d
```

---

## Next Steps

1. ~~Create `checkin_confirmation` template and submit to Meta~~ ✓ Done (2026-07-21)
2. ~~checkin_reminder and checkin_confirmation approved and tested~~ ✅ Working (2026-07-21)
3. ~~Update script to use checkin_confirmation when employee has checked in~~ ✓ Done
4. Add nginx `/gupshup/` proxy block on production server before go-live
5. Verify `checkout_reminder` template approval status
6. Implement and test holiday skip logic
7. Set up cron jobs on the production server
