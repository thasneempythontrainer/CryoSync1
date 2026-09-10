import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import type { StorageOccupancy } from '@/types'
import { ChartCard } from './ChartCard'
import { chartTooltipStyle, axisTick, CHART_PALETTE } from './chart-utils'

interface StorageOccupancyChartProps {
  data: StorageOccupancy[]
}

export function StorageOccupancyChart({ data = [] }: StorageOccupancyChartProps) {
  return (
    <ChartCard title="Storage Occupancy" subtitle="Capacity vs. utilized units by zone">
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
            <XAxis
              dataKey="zone"
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              interval={0}
              angle={-18}
              textAnchor="end"
              height={54}
            />
            <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={chartTooltipStyle}
              cursor={{ fill: 'var(--muted)', fillOpacity: 0.35 }}
            />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="circle" iconSize={8} />
            <Bar dataKey="capacity" fill={CHART_PALETTE[1]} radius={[4, 4, 0, 0]} maxBarSize={18} name="Capacity" fillOpacity={0.45} />
            <Bar dataKey="utilized" fill={CHART_PALETTE[0]} radius={[4, 4, 0, 0]} maxBarSize={18} name="Utilized" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}
