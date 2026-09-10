import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { DeviationRatePoint } from '@/types'
import { ChartCard } from './ChartCard'
import { chartTooltipStyle, axisTick, formatShortMonth, SEMANTIC_COLORS } from './chart-utils'

interface DeviationRateChartProps {
  data: DeviationRatePoint[]
}

export function DeviationRateChart({ data = [] }: DeviationRateChartProps) {
  return (
    <ChartCard title="Deviation Rate" subtitle="Shipments flagged per month (%)">
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
            <XAxis
              dataKey="month"
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              tickFormatter={formatShortMonth}
            />
            <YAxis
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip
              contentStyle={chartTooltipStyle}
              formatter={(value) => [`${value}%`, 'Deviation rate']}
              labelFormatter={(v) => {
                const d = new Date(`${v}-01`)
                return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
              }}
            />
            <Line
              type="monotone"
              dataKey="rate"
              stroke={SEMANTIC_COLORS.warning}
              strokeWidth={2.5}
              dot={{ r: 3, fill: SEMANTIC_COLORS.warning, strokeWidth: 0 }}
              activeDot={{ r: 5, fill: SEMANTIC_COLORS.warning, strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}
