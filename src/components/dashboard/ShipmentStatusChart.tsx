import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import type { ShipmentStatusBreakdown } from '@/types'
import { ChartCard } from './ChartCard'
import { chartTooltipStyle, labelFormatter, SEMANTIC_COLORS } from './chart-utils'

interface ShipmentStatusChartProps {
  data: ShipmentStatusBreakdown[]
}

const STATUS_COLORS: Record<string, string> = {
  in_transit: SEMANTIC_COLORS.info,
  receiving: SEMANTIC_COLORS.warning,
  quarantined: SEMANTIC_COLORS.orange,
  released: SEMANTIC_COLORS.success,
  rejected: SEMANTIC_COLORS.danger,
  scheduled: SEMANTIC_COLORS.purple,
  arrived: SEMANTIC_COLORS.neutral,
}

export function ShipmentStatusChart({ data = [] }: ShipmentStatusChartProps) {
  const total = data.reduce((sum, item) => sum + item.count, 0)
  return (
    <ChartCard
      title="Shipment Status"
      subtitle={`${total.toLocaleString()} shipments in pipeline`}
    >
      <div className="mx-auto w-full max-w-[260px]">
        <div className="aspect-square">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <Pie
                data={data}
                dataKey="count"
                nameKey="status"
                cx="50%"
                cy="50%"
                innerRadius={52}
                outerRadius={82}
                paddingAngle={2}
                strokeWidth={0}
              >
                {data.map((entry) => (
                  <Cell
                    key={entry.status}
                    fill={STATUS_COLORS[entry.status] ?? SEMANTIC_COLORS.primary}
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
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
        {data.map((item) => (
          <div key={item.status} className="flex items-center gap-1.5">
            <span
              className="inline-block size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: STATUS_COLORS[item.status] ?? SEMANTIC_COLORS.primary }}
            />
            <span className="text-xs text-muted-foreground">{labelFormatter(item.status)}</span>
          </div>
        ))}
      </div>
    </ChartCard>
  )
}
