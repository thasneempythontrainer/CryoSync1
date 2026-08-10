import { motion } from "framer-motion"
import { Server, Wifi, Database, Shield, Cpu, HardDrive, Globe, Activity } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/common/StatusBadge"
import { Skeleton } from "@/components/ui/skeleton"
import { type SystemMetric } from "@/types"
import { formatDateTime, formatNumber } from "@/utils/formatters"
import { cn } from "@/lib/utils"
import { AGENT_NAME } from "@/lib/branding"

const serviceIcons: Record<string, React.ReactNode> = {
  "Lakebase Status": <Database className="size-5" />,
  "Delta Lake Status": <HardDrive className="size-5" />,
  [`${AGENT_NAME} Status`]: <Cpu className="size-5" />,
  "Database Status": <Database className="size-5" />,
  "API Gateway": <Globe className="size-5" />,
  "Sync Service": <Activity className="size-5" />,
  "Replication Service": <Server className="size-5" />,
  "Authentication Service": <Shield className="size-5" />,
}

const defaultIcon = <Wifi className="size-5" />

interface ServiceStatusGridProps {
  services: SystemMetric[] | undefined
  loading: boolean
}

function ServiceStatusGrid({ services, loading }: ServiceStatusGridProps) {
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.05 },
    },
  }

  const item = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0 },
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Service Status</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {loading
            ? Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="rounded-lg border border-border p-4">
                  <Skeleton className="mb-3 h-4 w-32" />
                  <Skeleton className="mb-2 h-5 w-20" />
                  <Skeleton className="h-3 w-24" />
                </div>
              ))
            : services && services.length > 0
              ? (
                  <motion.div variants={container} initial="hidden" animate="show" className="contents">
                    {services.map((svc) => (
                      <motion.div key={svc.name} variants={item}>
                        <div className={cn(
                          "group relative rounded-lg border border-border p-4 transition-colors hover:bg-muted/30",
                          svc.status === "down" && "border-red-500/30 bg-red-500/5",
                          svc.status === "degraded" && "border-amber-500/30 bg-amber-500/5",
                        )}>
                          <div className="mb-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">
                                {serviceIcons[svc.name] ?? defaultIcon}
                              </span>
                              <span className="text-sm font-medium text-foreground">{svc.name}</span>
                            </div>
                            <StatusBadge status={svc.status} size="sm" />
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="flex flex-col">
                              <span className="text-muted-foreground">Latency</span>
                              <span className="font-medium text-foreground">{svc.latency}ms</span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-muted-foreground">Uptime</span>
                              <span className="font-medium text-foreground">{formatNumber(svc.uptime)}%</span>
                            </div>
                          </div>

                          <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                            <span>Checked {formatDateTime(svc.lastChecked)}</span>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </motion.div>
                )
              : (
                <div className="col-span-full py-8 text-center text-sm text-muted-foreground">
                  No service data available
                </div>
              )}
        </div>
      </CardContent>
    </Card>
  )
}

export { ServiceStatusGrid }
export type { ServiceStatusGridProps }
