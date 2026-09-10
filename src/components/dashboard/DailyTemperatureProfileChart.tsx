import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import type { DailyTemperatureProfile } from '@/types'
import { ChartCard } from './ChartCard'
import { chartTooltipStyle, axisTick, SEMANTIC_COLORS } from './chart-utils'

interface DailyTemperatureProfileChartProps {
  data: DailyTemperatureProfile[]
}

export function DailyTemperatureProfileChart({ data = [] }: DailyTemperatureProfileChartProps) {
  return (
    <ChartCard
      title="Daily Temperature Profile"
      subtitle="Live band telemetry by storage regime (°C)"
    >
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -8 }}>
            <XAxis
              dataKey="hour"
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              interval={3}
            />
            <YAxis
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v}°`}
            />
            <Tooltip
              contentStyle={chartTooltipStyle}
              formatter={(value, name) => [`${value}°C`, name]}
            />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="circle" iconSize={8} />
            <Line
              type="monotone"
              dataKey="refrigerated"
              stroke={SEMANTIC_COLORS.primary}
              strokeWidth={2}
              dot={false}
              name="2-8°C"
            />
            <Line
              type="monotone"
              dataKey="frozen"
              stroke={SEMANTIC_COLORS.info}
              strokeWidth={2}
              dot={false}
              name="-20°C"
            />
            <Line
              type="monotone"
              dataKey="ultraFrozen"
              stroke={SEMANTIC_COLORS.purple}
              strokeWidth={2}
              dot={false}
              name="-80°C"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}
