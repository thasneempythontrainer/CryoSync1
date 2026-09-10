import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { ShipmentPriorityBreakdown } from '@/types'
import { ChartCard } from './ChartCard'
import { chartTooltipStyle, axisTick, labelFormatter, SEMANTIC_COLORS } from './chart-utils'

interface ShipmentPriorityChartProps {
  data: ShipmentPriorityBreakdown[]
}

const PRIORITY_COLORS: Record<string, string> = {
  standard: SEMANTIC_COLORS.success,
  expedited: SEMANTIC_COLORS.warning,
  critical: SEMANTIC_COLORS.danger,
}

export function ShipmentPriorityChart({ data = [] }: ShipmentPriorityChartProps) {
  const total = data.reduce((sum, item) => sum + item.count, 0)
  const critical = data.find((d) => d.priority === 'critical')?.count ?? 0
  return (
    <ChartCard
      title="Priority Mix"
      subtitle={`${critical.toLocaleString()} critical of ${total.toLocaleString()} total`}
      badge={
        critical > 0 ? (
          <span className="rounded-md bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger">
            {((critical / Math.max(1, total)) * 100).toFixed(0)}% critical
          </span>
        ) : undefined
      }
    >
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
              dataKey="priority"
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
              tickLine={false}
              axisLine={false}
              width={90}
            />
            <Tooltip
              contentStyle={chartTooltipStyle}
              formatter={(value) => [value, 'Shipments']}
              labelFormatter={(label) => labelFormatter(String(label))}
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={22}>
              {data.map((entry) => (
                <Cell
                  key={entry.priority}
                  fill={PRIORITY_COLORS[entry.priority] ?? SEMANTIC_COLORS.primary}
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
