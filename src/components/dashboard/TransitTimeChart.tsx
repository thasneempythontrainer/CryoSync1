import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { TransitTimePoint } from '@/types'
import { ChartCard } from './ChartCard'
import { chartTooltipStyle, axisTick, SEMANTIC_COLORS } from './chart-utils'

interface TransitTimeChartProps {
  data: TransitTimePoint[]
}

export function TransitTimeChart({ data = [] }: TransitTimeChartProps) {
  const last = data.length ? data[data.length - 1].days : 0
  return (
    <ChartCard
      title="Transit Time"
      subtitle="Average in-transit duration by week"
      badge={
        <span className="rounded-md bg-indigo-500/10 px-2 py-0.5 text-xs font-semibold text-indigo-500">
          {last} days
        </span>
      }
    >
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
            <XAxis dataKey="week" tick={axisTick} tickLine={false} axisLine={false} />
            <YAxis
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v}d`}
            />
            <Tooltip
              contentStyle={chartTooltipStyle}
              formatter={(value) => [`${value} days`, 'Avg transit']}
            />
            <Line
              type="monotone"
              dataKey="days"
              stroke={SEMANTIC_COLORS.info}
              strokeWidth={2.5}
              dot={{ r: 3, fill: SEMANTIC_COLORS.info, strokeWidth: 0 }}
              activeDot={{ r: 5, fill: SEMANTIC_COLORS.info, strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}
