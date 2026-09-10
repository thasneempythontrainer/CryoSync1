import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { RegulatoryNotifiableTrend } from '@/types'
import { ChartCard } from './ChartCard'
import { chartTooltipStyle, axisTick, formatShortMonth, SEMANTIC_COLORS } from './chart-utils'

interface RegulatoryNotifiableChartProps {
  data: RegulatoryNotifiableTrend[]
}

export function RegulatoryNotifiableChart({ data = [] }: RegulatoryNotifiableChartProps) {
  return (
    <ChartCard title="Regulatory Notifiable" subtitle="Incidents reportable to regulators">
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
            <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={chartTooltipStyle}
              formatter={(value) => [value, 'Notifiable']}
              labelFormatter={(v) => {
                const d = new Date(`${v}-01`)
                return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
              }}
            />
            <Line
              type="monotone"
              dataKey="count"
              stroke={SEMANTIC_COLORS.danger}
              strokeWidth={2.5}
              dot={{ r: 3, fill: SEMANTIC_COLORS.danger, strokeWidth: 0 }}
              activeDot={{ r: 5, fill: SEMANTIC_COLORS.danger, strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}
