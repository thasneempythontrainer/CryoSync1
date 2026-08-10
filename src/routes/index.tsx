import { lazy, Suspense } from 'react'
import type { RouteObject } from 'react-router-dom'

import { RequireAuth } from '@/components/auth/RequireAuth'
import { LoadingState } from '@/components/common'

const DashboardPage = lazy(() => import('@/pages/Dashboard/DashboardPage'))
const ReceivingPage = lazy(() => import('@/pages/Receiving/ReceivingPage'))
const CompliancePage = lazy(() => import('@/pages/Compliance/CompliancePage'))
const ReportPage = lazy(() => import('@/pages/Report/ReportPage'))
const GeniePage = lazy(() => import('@/pages/Genie/GeniePage'))
const AdminPage = lazy(() => import('@/pages/Admin/AdminPage'))
const RiskPage = lazy(() => import('@/pages/Risk/RiskPage'))
const LoginPage = lazy(() => import('@/pages/Login/LoginPage'))

function PageLoader() {
  return (
    <div className="flex h-full items-center justify-center p-12">
      <LoadingState title="Loading..." variant="spinner" />
    </div>
  )
}

const NotFound = lazy(() => import('@/pages/NotFound'))

function withPage(Page: React.ComponentType) {
  return (
    <Suspense fallback={<PageLoader />}>
      <Page />
    </Suspense>
  )
}

export const routes: RouteObject[] = [
  {
    path: '/login',
    element: (
      <Suspense fallback={<PageLoader />}>
        <LoginPage />
      </Suspense>
    ),
  },
  {
    path: '/',
    element: <RequireAuth>{withPage(DashboardPage)}</RequireAuth>,
  },
  {
    path: '/dashboard',
    element: <RequireAuth>{withPage(DashboardPage)}</RequireAuth>,
  },
  {
    path: '/receiving',
    element: <RequireAuth>{withPage(ReceivingPage)}</RequireAuth>,
  },
  {
    path: '/compliance',
    element: <RequireAuth>{withPage(CompliancePage)}</RequireAuth>,
  },
  {
    path: '/report',
    element: <RequireAuth>{withPage(ReportPage)}</RequireAuth>,
  },
  {
    path: '/genie',
    element: <RequireAuth>{withPage(GeniePage)}</RequireAuth>,
  },
  {
    path: '/admin',
    element: <RequireAuth>{withPage(AdminPage)}</RequireAuth>,
  },
  {
    path: '/risk',
    element: <RequireAuth>{withPage(RiskPage)}</RequireAuth>,
  },
  {
    path: '*',
    element: <RequireAuth>{withPage(NotFound)}</RequireAuth>,
  },
]
