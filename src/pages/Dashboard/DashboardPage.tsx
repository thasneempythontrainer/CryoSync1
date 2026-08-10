import { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { RefreshCw, Download } from 'lucide-react'

import { useDashboardData, useFacilities } from '@/services'
import { PageHeader, LoadingState, ErrorState, FilterBar } from '@/components/common'
import type { FilterDef } from '@/components/common'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks'

import { KpiGrid } from '@/components/dashboard'
import { ShipmentTrendChart } from '@/components/dashboard'
import { TemperatureComplianceChart } from '@/components/dashboard'
import { SupplierPerformanceTable } from '@/components/dashboard'
import { InventoryDistributionChart } from '@/components/dashboard'
import { ActivityFeed } from '@/components/dashboard'
import { ExpiryTimelineChart } from '@/components/dashboard'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.07 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 200, damping: 24 },
  },
}

export default function DashboardPage() {
  const [filters, setFilters] = useState<Record<string, string>>({})
  const { data: facilities } = useFacilities()
  const { role } = useAuth()

  const dashboardDescription =
    role === 'dock'
      ? 'Your receiving intake overview — arrivals, pending docks, and flagged shipments'
      : role === 'qa'
        ? 'Quality overview — compliance incidents, excursions, and at-risk inventory'
        : 'Pharmaceutical cold-chain intelligence overview'

  const filterDefs: FilterDef[] = [
    {
      key: 'facility',
      label: 'All Facilities',
      type: 'select',
      options: (facilities ?? []).map((f) => ({
        value: f.id,
        label: f.name,
      })),
    },
    {
      key: 'dateRange',
      label: 'Date Range',
      type: 'select',
      options: [
        { value: '7', label: 'Last 7 days' },
        { value: '30', label: 'Last 30 days' },
        { value: '90', label: 'Last 90 days' },
        { value: '365', label: 'Last year' },
      ],
    },
  ]
  const { data, isLoading, error, refetch } = useDashboardData({
    facility: filters.facility || undefined,
    dateRange: filters.dateRange || undefined,
  })

  const handleFilterChange = useCallback((key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }, [])

  const handleReset = useCallback(() => {
    setFilters({})
  }, [])

  const handleExport = useCallback(() => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dashboard-export-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [data])

  if (error) {
    return (
      <div className="space-y-6 p-4 sm:p-6">
        <PageHeader title="Dashboard" description={dashboardDescription} />
        <ErrorState
          title="Failed to load dashboard"
          description={error instanceof Error ? error.message : 'An unexpected error occurred'}
          onRetry={() => refetch()}
        />
      </div>
    )
  }

  return (
    <motion.div
      className="space-y-6 p-4 sm:p-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.div variants={itemVariants}>
        <PageHeader
          title="Dashboard"
          description={dashboardDescription}
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
                <RefreshCw className={`size-4 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="size-4" />
                Export
              </Button>
            </div>
          }
        />
      </motion.div>

      <motion.div variants={itemVariants}>
        <FilterBar
          filters={filterDefs}
          values={filters}
          onChange={handleFilterChange}
          onReset={handleReset}
        />
      </motion.div>

      {isLoading ? (
        <motion.div variants={itemVariants}>
          <LoadingState />
        </motion.div>
      ) : data ? (
        <>
          <motion.div variants={itemVariants}>
            <KpiGrid kpis={data.kpis} />
          </motion.div>

          <motion.div
            className="grid grid-cols-1 lg:grid-cols-2 gap-6"
            variants={itemVariants}
          >
            <ShipmentTrendChart data={data.shipmentTrends} />
            <TemperatureComplianceChart data={data.temperatureCompliance} />
          </motion.div>

          <motion.div
            className="grid grid-cols-1 lg:grid-cols-3 gap-6"
            variants={itemVariants}
          >
            <SupplierPerformanceTable data={data.supplierPerformance} />
            <InventoryDistributionChart data={data.inventoryDistribution} />
            <ActivityFeed data={data.recentActivity} />
          </motion.div>

          <motion.div variants={itemVariants}>
            <ExpiryTimelineChart data={data.expiryTimeline} />
          </motion.div>
        </>
      ) : null}
    </motion.div>
  )
}
