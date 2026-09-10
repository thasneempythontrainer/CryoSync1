import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import type { InventoryByStatus } from '@/types'
import { ChartCard } from './ChartCard'
import { chartTooltipStyle, labelFormatter, SEMANTIC_COLORS } from './chart-utils'

interface InventoryByStatusChartProps {
  data: InventoryByStatus[]
}

const STATUS_COLORS: Record<string, string> = {
  available: SEMANTIC_COLORS.success,
  quality_hold: SEMANTIC_COLORS.warning,
  reserved: SEMANTIC_COLORS.info,
  expired: SEMANTIC_COLORS.danger,
  disposed: SEMANTIC_COLORS.neutral,
  quarantined: SEMANTIC_COLORS.orange,
}

export function InventoryByStatusChart({ data = [] }: InventoryByStatusChartProps) {
  const total = data.reduce((s, d) => s + d.count, 0)
  const hold = data.find((d) => d.status === 'quality_hold')?.count ?? 0
  return (
    <ChartCard
      title="Inventory by Status"
      subtitle="Lots across storage lifecycle"
      badge={
        <span className="rounded-md bg-warning/10 px-2 py-0.5 text-xs font-semibold text-warning">
          {hold.toLocaleString()} on hold
        </span>
      }
    >
      <div className="mx-auto w-full max-w-[240px]">
        <div className="aspect-square">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="count"
                nameKey="status"
                cx="50%"
                cy="50%"
                innerRadius={48}
                outerRadius={80}
                paddingAngle={3}
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
        <div className="flex items-center justify-center gap-2 py-1">
          <span className="text-2xl font-bold tabular-nums text-foreground">
            {total.toLocaleString()}
          </span>
          <span className="text-xs text-muted-foreground">lots</span>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
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
