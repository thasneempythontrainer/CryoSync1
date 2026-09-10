import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { InventoryByFacility } from '@/types'
import { SEMANTIC_COLORS } from './chart-utils'
import { ChartCard } from './ChartCard'
import { chartTooltipStyle, axisTick } from './chart-utils'
import { formatCompactCurrency } from '@/utils/formatters'

interface InventoryByFacilityChartProps {
  data: InventoryByFacility[]
}

export function InventoryByFacilityChart({ data = [] }: InventoryByFacilityChartProps) {
  return (
    <ChartCard title="Inventory Value by Facility" subtitle="On-hand stock value per site">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -4 }}>
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
            <YAxis
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => formatCompactCurrency(Number(v))}
            />
            <Tooltip
              contentStyle={chartTooltipStyle}
              cursor={{ fill: 'var(--muted)', fillOpacity: 0.35 }}
              formatter={(value) => [formatCompactCurrency(Number(value)), 'Stock value']}
            />
            <Bar dataKey="value" fill={SEMANTIC_COLORS.success} radius={[4, 4, 0, 0]} maxBarSize={42} fillOpacity={0.9} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}
