import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import type { OnTimeBySupplier } from '@/types'
import { ChartCard } from './ChartCard'
import { chartTooltipStyle, axisTick, SEMANTIC_COLORS } from './chart-utils'

interface OnTimeBySupplierChartProps {
  data: OnTimeBySupplier[]
}

export function OnTimeBySupplierChart({ data = [] }: OnTimeBySupplierChartProps) {
  return (
    <ChartCard title="On-Time by Supplier" subtitle="Delivery reliability vs. 90% bar">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 32, bottom: 8, left: 8 }}>
            <XAxis
              type="number"
              domain={[80, 100]}
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v}%`}
            />
            <YAxis
              type="category"
              dataKey="supplier"
              tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
              tickLine={false}
              axisLine={false}
              width={118}
            />
            <Tooltip
              contentStyle={chartTooltipStyle}
              formatter={(value) => [`${value}%`, 'On-time rate']}
            />
            <ReferenceLine
              x={90}
              stroke="var(--muted-foreground)"
              strokeDasharray="4 4"
              label={{ value: '90%', position: 'top', fontSize: 10, fill: 'var(--muted-foreground)' }}
            />
            <Bar dataKey="rate" radius={[0, 4, 4, 0]} maxBarSize={18}>
              {data.map((entry) => (
                <Cell
                  key={entry.supplier}
                  fill={entry.rate >= 93 ? SEMANTIC_COLORS.success : entry.rate >= 90 ? SEMANTIC_COLORS.warning : SEMANTIC_COLORS.danger}
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
