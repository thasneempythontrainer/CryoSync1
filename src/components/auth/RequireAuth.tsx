import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

import { useAuthStore } from '@/store'
import { canAccessPage } from '@/lib/permissions'
import { MainLayout } from '@/components/layout'
import AccessDenied from '@/pages/AccessDenied/AccessDeniedPage'

function RequireAuth({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user)
  const location = useLocation()

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return (
    <MainLayout>
      {canAccessPage(user.role, location.pathname) ? children : <AccessDenied />}
    </MainLayout>
  )
}

export { RequireAuth }
