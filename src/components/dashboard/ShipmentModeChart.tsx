import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import type { ShipmentModeBreakdown } from '@/types'
import { ChartCard } from './ChartCard'
import { chartTooltipStyle, labelFormatter, SEMANTIC_COLORS } from './chart-utils'

interface ShipmentModeChartProps {
  data: ShipmentModeBreakdown[]
}

const MODE_COLORS: Record<string, string> = {
  air_freight: SEMANTIC_COLORS.info,
  ground: SEMANTIC_COLORS.neutral,
  cold_chain_van: SEMANTIC_COLORS.primary,
  ocean: SEMANTIC_COLORS.success,
  rail: SEMANTIC_COLORS.purple,
}

export function ShipmentModeChart({ data = [] }: ShipmentModeChartProps) {
  const total = data.reduce((sum, item) => sum + item.count, 0)
  return (
    <ChartCard title="Transportation Mix" subtitle="Shipments by carrier mode">
      <div className="mx-auto w-full max-w-[240px]">
        <div className="aspect-square">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="count"
                nameKey="mode"
                cx="50%"
                cy="50%"
                innerRadius={48}
                outerRadius={80}
                paddingAngle={3}
                strokeWidth={0}
              >
                {data.map((entry) => (
                  <Cell
                    key={entry.mode}
                    fill={MODE_COLORS[entry.mode] ?? SEMANTIC_COLORS.primary}
                    fillOpacity={0.9}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={chartTooltipStyle}
                formatter={(value, name) => [value, labelFormatter(String(name))]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center justify-center gap-2 py-1">
          <span className="text-2xl font-bold tabular-nums text-foreground">{total}</span>
          <span className="text-xs text-muted-foreground">shipments</span>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
        {data.map((item) => (
          <div key={item.mode} className="flex items-center gap-1.5">
            <span
              className="inline-block size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: MODE_COLORS[item.mode] ?? SEMANTIC_COLORS.primary }}
            />
            <span className="text-xs text-muted-foreground">{labelFormatter(item.mode)}</span>
          </div>
        ))}
      </div>
    </ChartCard>
  )
}
