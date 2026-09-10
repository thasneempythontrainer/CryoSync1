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
import { Skeleton } from "@/components/ui/skeleton"
import { ChartCard } from "@/components/dashboard/ChartCard"
import { SEMANTIC_COLORS } from "@/components/dashboard/chart-utils"

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
      stroke={SEMANTIC_COLORS.danger}
      strokeDasharray="4 4"
      strokeWidth={1.5}
      label={{
        value: label,
        position: "right",
        fill: SEMANTIC_COLORS.danger,
        fontSize: 11,
      }}
    />
  )
}

function TemperatureExcursionChart({ data, loading }: TemperatureExcursionChartProps) {
  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <Skeleton className="h-5 w-48 mb-2" />
        <Skeleton className="h-4 w-64 mb-4" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    )
  }

  const chartData = data ?? []

  return (
    <ChartCard title="Temperature Excursion Trends" subtitle="Daily excursion count over the last 30 days">
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
              fill={SEMANTIC_COLORS.primary}
              radius={[3, 3, 0, 0]}
              maxBarSize={20}
              name="Excursions"
            />
            <Line
              type="monotone"
              dataKey="criticalExcursions"
              stroke={SEMANTIC_COLORS.danger}
              strokeWidth={2}
              dot={{ r: 3, fill: SEMANTIC_COLORS.danger }}
              name="Critical Excursions"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}

export { TemperatureExcursionChart }
export type { TemperatureExcursionChartProps, ExcursionDataPoint }
