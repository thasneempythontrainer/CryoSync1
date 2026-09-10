import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import type { RegimeTemperatureSpread } from '@/types'
import { ChartCard } from './ChartCard'
import { chartTooltipStyle, axisTick, labelFormatter, SEMANTIC_COLORS } from './chart-utils'

interface RegimeTemperatureSpreadChartProps {
  data: RegimeTemperatureSpread[]
}

export function RegimeTemperatureSpreadChart({ data = [] }: RegimeTemperatureSpreadChartProps) {
  return (
    <ChartCard title="Regime Temperature Spread" subtitle="Min / avg / max thresholds by regime">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -8 }}>
            <XAxis
              dataKey="regime"
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              interval={0}
              angle={-20}
              textAnchor="end"
              height={62}
            />
            <YAxis
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v}°`}
            />
            <Tooltip
              contentStyle={chartTooltipStyle}
              labelFormatter={(label) => labelFormatter(String(label))}
              formatter={(value, name) => [`${value}°C`, labelFormatter(String(name))]}
            />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="circle" iconSize={8} />
            <Bar dataKey="min" fill={SEMANTIC_COLORS.primary} radius={[4, 4, 0, 0]} maxBarSize={14} name="Min" />
            <Bar dataKey="avg" fill={SEMANTIC_COLORS.info} radius={[4, 4, 0, 0]} maxBarSize={14} name="Avg" />
            <Bar dataKey="max" fill={SEMANTIC_COLORS.purple} radius={[4, 4, 0, 0]} maxBarSize={14} name="Max" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}
