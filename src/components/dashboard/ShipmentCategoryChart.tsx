import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { ShipmentCategoryBreakdown } from '@/types'
import { ChartCard } from './ChartCard'
import { chartTooltipStyle, axisTick, labelFormatter, CHART_PALETTE } from './chart-utils'

interface ShipmentCategoryChartProps {
  data: ShipmentCategoryBreakdown[]
}

export function ShipmentCategoryChart({ data = [] }: ShipmentCategoryChartProps) {
  return (
    <ChartCard title="Shipments by Category" subtitle="Volume split across product lines">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
            <XAxis
              dataKey="category"
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              interval={0}
              angle={-18}
              textAnchor="end"
              height={56}
            />
            <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={chartTooltipStyle}
              formatter={(value) => [value, 'Shipments']}
              labelFormatter={(label) => labelFormatter(String(label))}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={30}>
              {data.map((entry, i) => (
                <Cell key={entry.category} fill={CHART_PALETTE[i % CHART_PALETTE.length]} fillOpacity={0.9} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}
