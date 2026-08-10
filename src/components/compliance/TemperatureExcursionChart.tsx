import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts"
import { Thermometer } from "lucide-react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

interface ExcursionDataPoint {
  date: string
  excursions: number
  criticalExcursions: number
}

interface TemperatureExcursionChartProps {
  data?: ExcursionDataPoint[]
  loading?: boolean
}

const CriticalThresholdLine = (props: { value: number; label: string }) => {
  const { value, label } = props
  return (
    <ReferenceLine
      y={value}
      stroke="#ef4444"
      strokeDasharray="4 4"
      strokeWidth={1.5}
      label={{
        value: label,
        position: "right",
        fill: "#ef4444",
        fontSize: 11,
      }}
    />
  )
}

function TemperatureExcursionChart({ data, loading }: TemperatureExcursionChartProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-48 w-full rounded-lg" />
        </CardContent>
      </Card>
    )
  }

  const chartData = data ?? []

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-orange-50 text-orange-600 dark:bg-orange-950 dark:text-orange-400">
            <Thermometer className="size-4" />
          </span>
          <div>
            <CardTitle>Temperature Excursion Trends</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Daily excursion count over the last 30 days
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis
                dataKey="date"
                fontSize={10}
                className="fill-muted-foreground"
                tickLine={false}
                axisLine={false}
                tickFormatter={(val: string) => {
                  const d = new Date(val)
                  return `${d.getMonth() + 1}/${d.getDate()}`
                }}
                interval="preserveStartEnd"
              />
              <YAxis
                fontSize={10}
                className="fill-muted-foreground"
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--color-popover)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "8px",
                  fontSize: "12px",
                  color: "var(--color-popover-foreground)",
                }}
                labelFormatter={(val: unknown) => {
                  const d = new Date(val as string)
                  return d.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: "11px", color: "var(--color-muted-foreground)" }}
              />
              <CriticalThresholdLine value={3} label="Alert Threshold" />
              <Bar
                dataKey="excursions"
                fill="var(--color-chart-1)"
                radius={[3, 3, 0, 0]}
                maxBarSize={20}
                name="Excursions"
              />
              <Line
                type="monotone"
                dataKey="criticalExcursions"
                stroke="#ef4444"
                strokeWidth={2}
                dot={{ r: 3, fill: "#ef4444" }}
                name="Critical Excursions"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

export { TemperatureExcursionChart }
export type { TemperatureExcursionChartProps, ExcursionDataPoint }
