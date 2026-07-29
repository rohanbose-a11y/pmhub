# Changelog — 2026-07-29

## New Features

### Project Change in Task Edit Screen
- Added an inline **Project** row to `TaskDetailModal` (the detail/edit view used in Kanban, Tree, and Gantt pages).
- Clicking the row opens a searchable fixed-position dropdown populated exclusively with the current user's assigned projects (sourced from the store's `getAssignedProjects` call).
- Supports a "No project" clear option and highlights the currently selected project with a checkmark.
- Wired into the existing outside-click and Escape-key handlers so it closes correctly alongside other dropdowns.
- All four page files (`TasksPage`, `TaskKanbanPage`, `TaskTreePage`, `TaskGanttPage`) updated to pass `projects={projects}` to `<TaskDetailModal>`.
- `EditTaskForm` (the sidebar edit panel in the List view) already had a project dropdown; fixed an edge case where a task whose current project is not in the user's assigned list would incorrectly show "No project" — the current project is now preserved as a selectable option.

### Pre-populate Project When Creating a Task from a Filtered View
- Added `initialProject?: string` prop to `CreateTaskModal`.
- When the user has a specific project selected in the toolbar filter and clicks **Add Task**, the new task form now opens with that project pre-selected.
- When no project filter is active (`'all'`), the form falls back to the first user-assigned project as before.
- All four task page files pass `initialProject={projectFilter !== 'all' ? projectFilter : undefined}` to `<CreateTaskModal>`.
- The project dropdown in the creation form continues to show only the user's assigned projects.

---

## Bug Fixes & Improvements

### Engagement Days Auto-calculation — Edit Task Form
- Added `calcEngagementDays(start, due)` helper in `EditTaskForm` that computes the **inclusive** calendar-day count between the start and due date (e.g. Jul 1 → Jul 5 = 5 days).
- The `Timeline` component's `onStartDateChange` and `onDueDateChange` callbacks now call this helper and automatically populate the Engagement Days field whenever both dates are valid.
- Updating either date recalculates the value; the user can still manually type any number to override it.
- The hint text below the field updates dynamically: shows `"Auto-calculated from dates — edit to override"` once both dates are filled, and `"Auto-calculated when both dates are set"` otherwise.

### Engagement Days Auto-calculation — New Task Form (Create)
- `CreateTaskModal` was missing auto-calculation entirely — the start/due date `onChange` handlers only set the date state and never touched engagement days. Fixed by adding the same `calcEngagementDays` helper and calling it in both date handlers.
- The Engagement Days input row in `CreateTaskModal` used a transparent, borderless input with no `onClick` on the parent row, making it impossible to focus by clicking the label text. Fixed by adding a `ref` to the input and an `onClick={() => engDaysInputRef.current?.focus()}` on the row div, with `cursor-text` to communicate the affordance.
- `CreateTaskForm` (alternate form variant) received the same auto-calculation fix via functional `setValues` updater so the date and calculated engagement days are set atomically in one state update.
- Hint text in `CreateTaskForm` updated to match the edit form pattern.
