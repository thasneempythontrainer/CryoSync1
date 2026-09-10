import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import type { IncidentsByFacility } from '@/types'
import { ChartCard } from './ChartCard'
import { chartTooltipStyle, axisTick, SEMANTIC_COLORS } from './chart-utils'

interface IncidentsByFacilityChartProps {
  data: IncidentsByFacility[]
}

export function IncidentsByFacilityChart({ data = [] }: IncidentsByFacilityChartProps) {
  return (
    <ChartCard title="Incidents by Facility" subtitle="Open vs. resolved deviations">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
            <XAxis
              dataKey="facility"
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              interval={0}
              angle={-14}
              textAnchor="end"
              height={52}
            />
            <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={chartTooltipStyle}
              cursor={{ fill: 'var(--muted)', fillOpacity: 0.35 }}
            />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="circle" iconSize={8} />
            <Bar dataKey="open" fill={SEMANTIC_COLORS.danger} radius={[4, 4, 0, 0]} maxBarSize={22} name="Open" />
            <Bar dataKey="resolved" fill={SEMANTIC_COLORS.success} radius={[4, 4, 0, 0]} maxBarSize={22} name="Resolved" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}
