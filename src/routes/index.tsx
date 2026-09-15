import { lazy, Suspense } from 'react'
import type { RouteObject } from 'react-router-dom'

import { RequireAuth } from '@/components/auth/RequireAuth'
import { LoadingState } from '@/components/common'

const DashboardPage = lazy(() => import('@/pages/Dashboard/DashboardPage'))
const CbuTrackingPage = lazy(() => import('@/pages/CbuTracking/CbuTrackingPage'))
const CustomersPage = lazy(() => import('@/pages/Customers/CustomersPage'))
const StoragePage = lazy(() => import('@/pages/Storage/StoragePage'))
const CompliancePage = lazy(() => import('@/pages/Compliance/CompliancePage'))
const TransplantsPage = lazy(() => import('@/pages/Transplants/TransplantsPage'))
const PaymentsPage = lazy(() => import('@/pages/Payments/PaymentsPage'))
const ReferralsPage = lazy(() => import('@/pages/Referrals/ReferralsPage'))
const FranchiseesPage = lazy(() => import('@/pages/Franchisees/FranchiseesPage'))
const ReportPage = lazy(() => import('@/pages/Report/ReportPage'))
const GeniePage = lazy(() => import('@/pages/Genie/GeniePage'))
const ExtractPage = lazy(() => import('@/pages/Extract/ExtractPage'))
const LabReportsPage = lazy(() => import('@/pages/LabReports/LabReportsPage'))
const LabReportDetailPage = lazy(() => import('@/pages/LabReports/LabReportDetailPage'))
const AdminPage = lazy(() => import('@/pages/Admin/AdminPage'))
const ReceivingPage = lazy(() => import('@/pages/Receiving/ReceivingPage'))
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
    path: '/cbus',
    element: <RequireAuth>{withPage(CbuTrackingPage)}</RequireAuth>,
  },
  {
    path: '/customers',
    element: <RequireAuth>{withPage(CustomersPage)}</RequireAuth>,
  },
  {
    path: '/storage',
    element: <RequireAuth>{withPage(StoragePage)}</RequireAuth>,
  },
  {
    path: '/compliance',
    element: <RequireAuth>{withPage(CompliancePage)}</RequireAuth>,
  },
  {
    path: '/transplants',
    element: <RequireAuth>{withPage(TransplantsPage)}</RequireAuth>,
  },
  {
    path: '/payments',
    element: <RequireAuth>{withPage(PaymentsPage)}</RequireAuth>,
  },
  {
    path: '/referrals',
    element: <RequireAuth>{withPage(ReferralsPage)}</RequireAuth>,
  },
  {
    path: '/franchisees',
    element: <RequireAuth>{withPage(FranchiseesPage)}</RequireAuth>,
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
    path: '/extract',
    element: <RequireAuth>{withPage(ExtractPage)}</RequireAuth>,
  },
  {
    path: '/lab-reports',
    element: <RequireAuth>{withPage(LabReportsPage)}</RequireAuth>,
  },
  {
    path: '/lab-reports/:reportId',
    element: <RequireAuth><LabReportDetailPage /></RequireAuth>,
  },
  {
    path: '/admin',
    element: <RequireAuth>{withPage(AdminPage)}</RequireAuth>,
  },
  {
    path: '/receiving',
    element: <RequireAuth>{withPage(ReceivingPage)}</RequireAuth>,
  },
  {
    path: '*',
    element: <RequireAuth>{withPage(NotFound)}</RequireAuth>,
  },
]
