import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { CategoryExpiryRisk } from '@/types'
import { ChartCard } from './ChartCard'
import { chartTooltipStyle, axisTick, labelFormatter, SEMANTIC_COLORS } from './chart-utils'

interface CategoryExpiryRiskChartProps {
  data: CategoryExpiryRisk[]
}

export function CategoryExpiryRiskChart({ data = [] }: CategoryExpiryRiskChartProps) {
  return (
    <ChartCard
      title="Expiry Risk by Category"
      subtitle="Avg days to expiry · lower = higher risk"
    >
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
            <YAxis tick={axisTick} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}d`} />
            <Tooltip
              contentStyle={chartTooltipStyle}
              formatter={(value) => [`${value} days`, 'Avg to expiry']}
              labelFormatter={(label) => labelFormatter(String(label))}
            />
            <Bar dataKey="avgDays" radius={[4, 4, 0, 0]} maxBarSize={30}>
              {data.map((entry) => (
                <Cell
                  key={entry.category}
                  fill={entry.avgDays <= 45 ? SEMANTIC_COLORS.danger : entry.avgDays <= 75 ? SEMANTIC_COLORS.warning : SEMANTIC_COLORS.success}
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
