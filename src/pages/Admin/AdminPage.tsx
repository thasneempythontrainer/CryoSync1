import { useState, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Activity,
  Server,
  Terminal,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
} from "lucide-react"

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/common/PageHeader"
import { ErrorState } from "@/components/common/ErrorState"
import { LoadingState } from "@/components/common/LoadingState"
import { useSystemHealth } from "@/services/system-service"
import { formatDateTime } from "@/utils/formatters"
import { cn } from "@/lib/utils"

import { SystemHealthOverview } from "@/components/admin/SystemHealthOverview"
import { ServiceStatusGrid } from "@/components/admin/ServiceStatusGrid"
import { SystemMetricsChart } from "@/components/admin/SystemMetricsChart"
import { SystemLogsViewer } from "@/components/admin/SystemLogsViewer"

const tabs = [
  { id: "health", label: "System Health", icon: Activity },
  { id: "services", label: "Services", icon: Server },
  { id: "logs", label: "Logs", icon: Terminal },
] as const

function AdminPage() {
  const [activeTab, setActiveTab] = useState("health")
  const { data, isLoading, isError, refetch, isFetching } = useSystemHealth()

  const overall = data?.overall ?? "healthy"

  const statusIndicator = {
    healthy: { icon: CheckCircle, className: "text-success" },
    degraded: { icon: AlertTriangle, className: "text-warning" },
    critical: { icon: AlertTriangle, className: "text-danger" },
  }[overall]

  const StatusIcon = statusIndicator.icon

  const handleRefresh = useCallback(() => {
    refetch()
  }, [refetch])

  const pageActions = (
    <div className="flex items-center gap-2">
      <div className="hidden items-center gap-1.5 sm:flex">
        <StatusIcon className={cn("size-4", statusIndicator.className)} />
        <span className={cn("text-xs font-medium capitalize", statusIndicator.className)}>
          {overall}
        </span>
        {data?.lastUpdated && (
          <span className="text-xs text-muted-foreground">
            Updated {formatDateTime(data.lastUpdated)}
          </span>
        )}
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={handleRefresh}
        disabled={isFetching}
        className="gap-1.5"
      >
        <RefreshCw className={cn("size-3.5", isFetching && "animate-spin")} />
        {isFetching ? "Refreshing..." : "Refresh"}
      </Button>
    </div>
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Admin & System Health"
        description="Monitor platform services, view logs, and manage configuration"
        actions={pageActions}
      />

      {isLoading ? (
        <LoadingState variant="skeleton" />
      ) : isError ? (
        <ErrorState
          title="Failed to load system health"
          description="Unable to retrieve system status. Please try again."
          onRetry={handleRefresh}
        />
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            {tabs.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id} className="gap-1.5">
                <tab.icon className="size-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <TabsContent value="health" className="mt-0">
                <div className="grid gap-6 lg:grid-cols-5">
                  <div className="lg:col-span-2">
                    <SystemHealthOverview data={data} loading={isLoading} />
                  </div>
                  <div className="lg:col-span-3">
                    <SystemMetricsChart services={data?.services} loading={isLoading} />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="services" className="mt-0">
                <ServiceStatusGrid services={data?.services} loading={isLoading} />
              </TabsContent>

              <TabsContent value="logs" className="mt-0">
                <SystemLogsViewer />
              </TabsContent>
            </motion.div>
          </AnimatePresence>
        </Tabs>
      )}
    </div>
  )
}

export default AdminPage
