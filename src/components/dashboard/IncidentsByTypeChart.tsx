import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { IncidentsByType } from '@/types'
import { ChartCard } from './ChartCard'
import { chartTooltipStyle, axisTick, labelFormatter, CHART_PALETTE } from './chart-utils'

interface IncidentsByTypeChartProps {
  data: IncidentsByType[]
}

export function IncidentsByTypeChart({ data = [] }: IncidentsByTypeChartProps) {
  return (
    <ChartCard title="Incidents by Type" subtitle="Deviations by root-cause category">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
            <XAxis
              dataKey="type"
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              interval={0}
              angle={-18}
              textAnchor="end"
              height={58}
            />
            <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={chartTooltipStyle}
              cursor={{ fill: 'var(--muted)', fillOpacity: 0.35 }}
              formatter={(value) => [value, 'Incidents']}
              labelFormatter={(label) => labelFormatter(String(label))}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={26}>
              {data.map((entry, i) => (
                <Cell key={entry.type} fill={CHART_PALETTE[i % CHART_PALETTE.length]} fillOpacity={0.9} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}
