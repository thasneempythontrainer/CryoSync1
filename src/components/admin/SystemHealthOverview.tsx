import { CheckCircle, XCircle, AlertTriangle, Clock, Activity } from "lucide-react"
import { motion } from "framer-motion"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { type SystemHealth } from "@/types"
import { formatDateTime } from "@/utils/formatters"
import { cn } from "@/lib/utils"

interface SystemHealthOverviewProps {
  data: SystemHealth | undefined
  loading: boolean
}

const statusConfig = {
  healthy: { color: "bg-emerald-500", glow: "shadow-emerald-500/30", icon: CheckCircle, label: "All Systems Operational" },
  degraded: { color: "bg-amber-500", glow: "shadow-amber-500/30", icon: AlertTriangle, label: "Degraded Performance" },
  critical: { color: "bg-red-500", glow: "shadow-red-500/30", icon: XCircle, label: "Critical System Issues" },
} as const

function SystemHealthOverview({ data, loading }: SystemHealthOverviewProps) {
  const status = data?.overall ?? "healthy"
  const config = statusConfig[status]
  const Icon = config.icon

  return (
    <Card>
      <CardHeader>
        <CardTitle>System Health</CardTitle>
        <CardDescription>Overall platform status overview</CardDescription>
      </CardHeader>
      <CardContent>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col items-center gap-4 py-6"
        >
          <div className={cn("relative flex size-20 items-center justify-center rounded-full shadow-lg", config.glow)}>
            <div className={cn("absolute inset-0 rounded-full opacity-20 blur-xl", config.color)} />
            <div className={cn("relative flex size-16 items-center justify-center rounded-full", config.color)}>
              <Icon className="size-8 text-white" />
            </div>
          </div>

          <div className="text-center">
            <h3 className="text-lg font-semibold text-foreground">{config.label}</h3>
            <p className="mt-1 text-sm capitalize text-muted-foreground">
              Overall: <span className="font-medium text-foreground">{status}</span>
            </p>
          </div>

          <div className="mt-2 grid w-full grid-cols-2 gap-4">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
              <Activity className="size-4 text-muted-foreground" />
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">Active Alerts</span>
                <span className={cn(
                  "text-sm font-semibold",
                  data?.activeAlerts && data.activeAlerts > 0 ? "text-amber-500" : "text-emerald-500"
                )}>
                  {loading ? "—" : data?.activeAlerts ?? 0}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
              <Clock className="size-4 text-muted-foreground" />
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">Last Updated</span>
                <span className="text-sm font-semibold text-foreground">
                  {loading ? "—" : data?.lastUpdated ? formatDateTime(data.lastUpdated) : "—"}
                </span>
              </div>
            </div>
          </div>
        </motion.div>
      </CardContent>
    </Card>
  )
}

export { SystemHealthOverview }
export type { SystemHealthOverviewProps }
