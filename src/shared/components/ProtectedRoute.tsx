import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuthStore } from '../../store/authStore'
import { PageLoader } from './PageLoader'

export function ProtectedRoute() {
  const location = useLocation()
  const user = useAuthStore((state) => state.user)
  const status = useAuthStore((state) => state.status)
  const isBootstrapped = useAuthStore((state) => state.isBootstrapped)

  if (!isBootstrapped || status === 'checking') {
    return <PageLoader label="Checking your session…" />
  }

  if (!user || status !== 'authenticated') {
    return <Navigate replace state={{ from: location.pathname }} to="/login" />
  }

  return <Outlet />
}
