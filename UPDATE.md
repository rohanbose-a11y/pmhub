# Update Log

## 2026-07-16

1. **Task ID display fix**
   The short ID in the task detail modal was stripping hyphens (`TASK-20260` → `task20260`). Fixed to use `task.id` directly.

2. **Save button with dirty-state detection (Edit modal)**
   The Save button in the edit task form is now only shown when the user has actually changed something. Implemented via `useRef` snapshot at mount + `useMemo` diff against current values.

3. **Assignees field in Create Task modal**
   Added an Assignees row to the create task modal matching the style of the edit modal. User selects assignees upfront — the system automatically assigns them after the task is created (no manual second step).

4. **Auto-assign deadlock fix**
   The assignment calls were firing in parallel (`Promise.allSettled`) causing MySQL deadlock errors (1213). Fixed by sending all users in a single `assign_to.add` request (`bulkAssignTask`) so Frappe handles all inserts in one transaction.

5. **Assignment 500 error fix**
   `notify: true` was causing ERPNext to attempt email dispatch which 500'd when SMTP isn't configured. Fixed by passing `notify: false` for auto-assign during task creation.

6. **Engagement days stale display fix (Task detail modal)**
   After saving engagement days (or description / activity type) inline, the modal kept showing the old value until closed and reopened. Root cause: `dt = fullTask ?? task` always resolved to the stale fetched copy. Fixed by patching `fullTask` after each successful inline save (`saveEngDays`, `saveDesc`, `selectActType`, `saveLink`).

7. **Prev / Next navigation in task detail modal**
   The `< >` buttons in the top bar were decorative. Now they navigate through the filtered task list. Buttons are dimmed/disabled at the first and last task. Also supports `←` / `→` keyboard shortcuts when no input is focused.

8. **Comment system in task**
   Full comment system added to the task detail modal — users can post comments stored in `custom_comments` on the ERPNext Task document, with `@mention` support for teammates.

9. **Git repository + GitHub push**
   Initialized the git repo, set author as Rohan Bose, and pushed all code to `https://github.com/rohanbose-a11y/pmhub` — no Claude attribution anywhere in the contributor history.
