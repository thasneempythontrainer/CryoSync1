import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import type { IncidentsTrendPoint } from '@/types'
import { ChartCard } from './ChartCard'
import { chartTooltipStyle, axisTick, formatShortMonth, SEMANTIC_COLORS } from './chart-utils'

interface IncidentsTrendChartProps {
  data: IncidentsTrendPoint[]
}

export function IncidentsTrendChart({ data = [] }: IncidentsTrendChartProps) {
  return (
    <ChartCard title="Incident Trends" subtitle="Created vs. resolved per month">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
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
              cursor={{ stroke: 'var(--border)' }}
              labelFormatter={(v) => {
                const d = new Date(`${v}-01`)
                return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="circle" iconSize={8} />
            <Area
              type="monotone"
              dataKey="created"
              stroke={SEMANTIC_COLORS.info}
              fill={SEMANTIC_COLORS.info}
              fillOpacity={0.15}
              strokeWidth={2}
              name="Created"
            />
            <Area
              type="monotone"
              dataKey="resolved"
              stroke={SEMANTIC_COLORS.success}
              fill={SEMANTIC_COLORS.success}
              fillOpacity={0.15}
              strokeWidth={2}
              name="Resolved"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}
