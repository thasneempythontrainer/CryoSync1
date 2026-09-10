import { useState } from "react"
import { BarChart3, Activity } from "lucide-react"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { type SystemMetric } from "@/types"
import { SEMANTIC_COLORS } from "@/components/dashboard/chart-utils"

interface SystemMetricsChartProps {
  services: SystemMetric[] | undefined
  loading: boolean
}

function buildChartData(services: SystemMetric[], metric: "latency" | "uptime") {
  return services.map((s) => ({
    name: s.name.replace(/\s+/g, "\n"),
    [s.name]: metric === "latency" ? s.latency : s.uptime,
  }))
}

const CHART_COLORS = [
  SEMANTIC_COLORS.primary, SEMANTIC_COLORS.success, SEMANTIC_COLORS.warning, SEMANTIC_COLORS.danger,
  SEMANTIC_COLORS.purple, SEMANTIC_COLORS.info, SEMANTIC_COLORS.orange, SEMANTIC_COLORS.danger,
]

interface CustomTooltipProps {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: string
  metric: "latency" | "uptime"
}

function CustomTooltip({ active, payload, label, metric }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) return null
  return (
    <div className="rounded-lg border border-border bg-popover p-3 shadow-md">
      <p className="mb-1 text-xs font-medium text-foreground">{label?.replace(/\n/g, " ")}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 text-xs">
          <span className="size-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-medium text-foreground">
            {metric === "latency" ? `${entry.value}ms` : `${entry.value}%`}
          </span>
        </div>
      ))}
    </div>
  )
}

function SystemMetricsChart({ services, loading }: SystemMetricsChartProps) {
  const [metric, setMetric] = useState<"latency" | "uptime">("latency")

  const chartData = services && services.length > 0 ? buildChartData(services, metric) : []

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>System Metrics</CardTitle>
            <CardDescription>Service performance over time</CardDescription>
          </div>
          <Tabs
            value={metric}
            onValueChange={(v) => setMetric(v as "latency" | "uptime")}
          >
            <TabsList>
              <TabsTrigger value="latency" className="gap-1.5">
                <Activity className="size-3.5" />
                Latency
              </TabsTrigger>
              <TabsTrigger value="uptime" className="gap-1.5">
                <BarChart3 className="size-3.5" />
                Uptime
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex flex-col gap-3">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-48 w-full" />
            </div>
          </div>
        ) : chartData.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No metric data available
          </div>
        ) : (
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis
                  dataKey="name"
                  fontSize={10}
                  className="fill-muted-foreground"
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  fontSize={11}
                  className="fill-muted-foreground"
                  axisLine={false}
                  tickLine={false}
                  width={45}
                  unit={metric === "latency" ? "ms" : "%"}
                />
                <Tooltip content={<CustomTooltip metric={metric} />} />
                <Legend
                  wrapperStyle={{ fontSize: 11, color: "var(--muted-foreground)" }}
                />
                {services?.map((s, i) => (
                  <Line
                    key={s.name}
                    type="monotone"
                    dataKey={s.name}
                    stroke={CHART_COLORS[i % CHART_COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 3, strokeWidth: 1 }}
                    activeDot={{ r: 5, strokeWidth: 1 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export { SystemMetricsChart }
export type { SystemMetricsChartProps }
