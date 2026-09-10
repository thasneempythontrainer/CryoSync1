import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { InventoryByZone } from '@/types'
import { ChartCard } from './ChartCard'
import { chartTooltipStyle, axisTick, SEMANTIC_COLORS } from './chart-utils'

interface InventoryByZoneChartProps {
  data: InventoryByZone[]
}

export function InventoryByZoneChart({ data = [] }: InventoryByZoneChartProps) {
  return (
    <ChartCard title="Inventory by Zone" subtitle="Units stored per storage zone">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
            <XAxis
              type="number"
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <YAxis
              type="category"
              dataKey="zone"
              tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
              tickLine={false}
              axisLine={false}
              width={128}
            />
            <Tooltip
              contentStyle={chartTooltipStyle}
              formatter={(value) => [`${Number(value).toLocaleString()}`, 'Units']}
            />
            <Bar dataKey="quantity" radius={[0, 4, 4, 0]} maxBarSize={20}>
              {data.map((entry) => (
                <Cell
                  key={entry.zone}
                  fill={entry.zone.toLowerCase().includes('quarantine') ? SEMANTIC_COLORS.orange : SEMANTIC_COLORS.primary}
                  fillOpacity={0.9}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}
