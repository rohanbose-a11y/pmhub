# Changelog — 2026-07-30

## New Features

### Auto Repeat — Full UI/UX Overhaul (Task Detail Modal)

Replaced the old repeat toggle in `TaskDetailModal` with a dedicated **Repeat tab** that has four distinct view states:

1. **Summary card** (repeat exists, view mode) — shows frequency badge, Active/Disabled status, human-readable schedule description (e.g. "Every Monday, Wednesday"), start/end dates, and a pencil edit button.
2. **Edit form** (repeat exists, edit mode) — full config form with Save / Cancel.
3. **Empty state** (no repeat configured) — icon + "Set up repeat" CTA.
4. **New repeat form** (repeat being created) — config form with Save / Cancel.

The tab navigation item shows an indigo dot badge when a repeat is active.

### Auto Repeat — Upcoming Dates Timeline

In the summary card view, a **Upcoming** timeline section now appears below the summary card showing the next 5 scheduled occurrences from today:
- Computed client-side from the repeat config (frequency, start date, end date, weekdays, day-of-month).
- First dot is filled indigo (next occurrence); subsequent dots are hollow.
- A **"Today"** pill badge appears if any date lands on the current day.
- Respects end date — stops generating dates once the repeat ends.
- Handles all frequencies: Daily, Weekly (with specific weekdays), Monthly, Quarterly, Half-yearly, Yearly.
- Dates show full format: `Sat, Jan 2, 2027`.
- **Sunday skip**: if a computed date falls on Sunday it is automatically moved to Monday (the next working day). If Monday is also a holiday it continues advancing until a non-holiday weekday is found. Applies to Monthly, Quarterly, Half-yearly, and Yearly frequencies. Daily skips Sundays entirely (Monday follows naturally).
- **Holiday skip** (Monthly+ only): fetches the company Holiday List from HR Settings and skips any holiday dates, advancing to the next day until a non-holiday is found.

### Auto Repeat — Weekly Day Picker

Added a **Repeat on Days** picker (Mon–Fri buttons) for Weekly frequency in both `CreateTaskModal` and `TaskDetailModal`. Saturday and Sunday are intentionally excluded.

### Auto Repeat — `isGroup` Toggle

- `CreateTaskModal`: added Is Group toggle (indigo, between Is Milestone and Assignees).
- `TaskDetailModal`: Is Group row is now interactive (click to toggle, wired to `toggleIsGroup`), was previously read-only.
- `EditTaskForm`: added Is Group checkbox in a 2-column grid alongside Is Milestone.

### Dependency / Subtask Picker — Create Task Modal

Replaced the old auto-add `<select>` in `CreateTaskModal` with a **Subtasks** section matching the style of `TaskDetailModal`:
- Header with count badge.
- List items with dot bullets and remove buttons.
- Picker row (select + Add + Cancel) revealed by "+ Add Task" pill button.

---

## Bug Fixes

### Auto Repeat — Toggle Always Showing OFF

The previous implementation used `getByTask` which filtered by `reference_document` — a Dynamic Link field that Frappe blocks in REST list queries. Fixed by switching strategy: read the `auto_repeat` field that Frappe writes onto the Task document itself, then `GET /api/resource/Auto Repeat/{name}` directly by name.

### Auto Repeat — 417 on Create (Duplicate)

Frappe throws `417 Expectation Failed` with message "already on auto repeat AUT-AR-XXXXX" when a task already has an Auto Repeat. Fixed in `autoRepeatApi.create`: catch the error, parse the existing record name from the message via regex, and call `update` instead.

### Auto Repeat — Weekly Days Not Saving / Loading

Was incorrectly using individual boolean columns. Frappe uses a `repeat_on_days` child table with rows like `{ day: "Monday" }`. Fixed `autoRepeatApi` to send `repeat_on_days: [{ day: "Monday" }, ...]` on create/update and map the child table rows back to lowercase `Weekday[]` on load.

### TypeScript — `autoRepeat` Missing from Mock Task Object

After adding `autoRepeat: string | null` to the `Task` interface, `CreateTaskModal`'s inline mock Task passed to `AssignTaskModal` was missing the field. Fixed by adding `autoRepeat: null`.

### Auto Repeat — Wrong Dates and Weekdays in Timeline (Timezone Bug)

`toISOString()` outputs UTC midnight, which shifts the date back one day in UTC+ timezones (e.g. IST UTC+5:30). Fixed by using a local ISO formatter (`YYYY-MM-DD` from `getFullYear/getMonth/getDate`) throughout `getUpcomingDates`, `todayStr`, and the label parse in the timeline render.

### Auto Repeat — `Half-Yearly` Rejected by Frappe (417)

Frappe's select field value is `"Half-yearly"` (lowercase y). We were sending `"Half-Yearly"`. Fixed the `RepeatFrequency` type in `autoRepeatApi.ts` and updated all references in `CreateTaskModal` and `TaskDetailModal`.
