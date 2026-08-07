import { lazy, Suspense, useEffect, useRef } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { LoginPage } from '../../features/auth/pages/LoginPage'
import { AppShellLayout } from '../../shared/components/AppShellLayout'
import { PageLoader } from '../../shared/components/PageLoader'
import { ProtectedRoute } from '../../shared/components/ProtectedRoute'
import { useAuthStore } from '../../store/authStore'

const DashboardPage        = lazy(() => import('../../features/dashboard/pages/DashboardPage').then(m => ({ default: m.DashboardPage })))
const ProjectDashboardPage = lazy(() => import('../../features/dashboard/pages/ProjectDashboardPage').then(m => ({ default: m.ProjectDashboardPage })))
const NotificationsPage = lazy(() => import('../../features/notifications/pages/NotificationsPage').then(m => ({ default: m.NotificationsPage })))
const ProfilePage       = lazy(() => import('../../features/profile/pages/ProfilePage').then(m => ({ default: m.ProfilePage })))
const ProjectsPage      = lazy(() => import('../../features/projects/pages/ProjectsPage').then(m => ({ default: m.ProjectsPage })))
const TasksPage         = lazy(() => import('../../features/tasks/pages/TasksPage').then(m => ({ default: m.TasksPage })))
const TaskTreePage      = lazy(() => import('../../features/tasks/pages/TaskTreePage').then(m => ({ default: m.TaskTreePage })))
const TaskKanbanPage    = lazy(() => import('../../features/tasks/pages/TaskKanbanPage').then(m => ({ default: m.TaskKanbanPage })))
const TaskGanttPage     = lazy(() => import('../../features/tasks/pages/TaskGanttPage').then(m => ({ default: m.TaskGanttPage })))
const TimesheetsPage        = lazy(() => import('../../features/timesheets/pages/TimesheetsPage').then(m => ({ default: m.TimesheetsPage })))
const ChannelsPage          = lazy(() => import('../../features/channels/pages/ChannelsPage').then(m => ({ default: m.ChannelsPage })))
const DirectMessagesPage    = lazy(() => import('../../features/dm/pages/DirectMessagesPage').then(m => ({ default: m.DirectMessagesPage })))
const EmployeeProfilePage   = lazy(() => import('../../features/employees/pages/EmployeeProfilePage').then(m => ({ default: m.EmployeeProfilePage })))
const WhatsAppAdminPage     = lazy(() => import('../../features/whatsapp/pages/WhatsAppAdminPage').then(m => ({ default: m.WhatsAppAdminPage })))
const CalendarPage          = lazy(() => import('../../features/calendar/pages/CalendarPage').then(m => ({ default: m.CalendarPage })))

export function AppRouter() {
  const bootstrap = useAuthStore((state) => state.bootstrap)
  const isBootstrapped = useAuthStore((state) => state.isBootstrapped)
  const status = useAuthStore((state) => state.status)
  const hasRequestedSession = useRef(false)

  useEffect(() => {
    if (hasRequestedSession.current) {
      return
    }

    hasRequestedSession.current = true
    void bootstrap()
  }, [bootstrap])

  if (!isBootstrapped && status === 'checking') {
    return <PageLoader label="Restoring your session…" />
  }

  return (
    <Routes>
      <Route element={<LoginPage />} path="/login" />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppShellLayout />}>
          <Route element={<Suspense fallback={<PageLoader label="Loading…" />}><DashboardPage /></Suspense>} path="/dashboard" />
          <Route element={<Suspense fallback={<PageLoader label="Loading…" />}><ProjectDashboardPage /></Suspense>} path="/dashboard/project" />
          <Route element={<Suspense fallback={<PageLoader label="Loading…" />}><NotificationsPage /></Suspense>} path="/notifications" />
          <Route element={<Suspense fallback={<PageLoader label="Loading…" />}><ProjectsPage /></Suspense>} path="/projects" />
          <Route element={<Suspense fallback={<PageLoader label="Loading…" />}><TasksPage /></Suspense>} path="/tasks" />
          <Route element={<Suspense fallback={<PageLoader label="Loading…" />}><TaskTreePage /></Suspense>} path="/tasks/tree" />
          <Route element={<Suspense fallback={<PageLoader label="Loading…" />}><TaskKanbanPage /></Suspense>} path="/tasks/kanban" />
          <Route element={<Suspense fallback={<PageLoader label="Loading…" />}><TaskGanttPage /></Suspense>} path="/tasks/gantt" />
          <Route element={<Suspense fallback={<PageLoader label="Loading…" />}><TimesheetsPage /></Suspense>} path="/timesheets" />
          <Route element={<Suspense fallback={<PageLoader label="Loading…" />}><ChannelsPage /></Suspense>} path="/channels" />
          <Route element={<Suspense fallback={<PageLoader label="Loading…" />}><DirectMessagesPage /></Suspense>} path="/dm" />
          <Route element={<Suspense fallback={<PageLoader label="Loading…" />}><ProfilePage /></Suspense>} path="/profile" />
          <Route element={<Suspense fallback={<PageLoader label="Loading…" />}><EmployeeProfilePage /></Suspense>} path="/employees/profile" />
          <Route element={<Suspense fallback={<PageLoader label="Loading…" />}><WhatsAppAdminPage /></Suspense>} path="/whatsapp" />
          <Route element={<Suspense fallback={<PageLoader label="Loading…" />}><CalendarPage /></Suspense>} path="/calendar" />
        </Route>
      </Route>

      <Route element={<Navigate replace to="/dashboard" />} path="/" />
      <Route element={<Navigate replace to="/dashboard" />} path="*" />
    </Routes>
  )
}
