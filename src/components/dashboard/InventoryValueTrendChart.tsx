import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { InventoryValueTrend } from '@/types'
import { ChartCard } from './ChartCard'
import { chartTooltipStyle, axisTick, formatShortMonth, SEMANTIC_COLORS } from './chart-utils'
import { formatCompactCurrency } from '@/utils/formatters'

interface InventoryValueTrendChartProps {
  data: InventoryValueTrend[]
}

export function InventoryValueTrendChart({ data = [] }: InventoryValueTrendChartProps) {
  return (
    <ChartCard title="Inventory Value Trend" subtitle="Cumulative on-hand value (12 months)">
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -4 }}>
            <XAxis
              dataKey="month"
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              tickFormatter={formatShortMonth}
            />
            <YAxis
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => formatCompactCurrency(Number(v))}
            />
            <Tooltip
              contentStyle={chartTooltipStyle}
              formatter={(value) => [formatCompactCurrency(Number(value)), 'Stock value']}
              labelFormatter={(v) => {
                const d = new Date(`${v}-01`)
                return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
              }}
            />
            <defs>
              <linearGradient id="invValueFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SEMANTIC_COLORS.success} stopOpacity={0.4} />
                <stop offset="100%" stopColor={SEMANTIC_COLORS.success} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="value"
              stroke={SEMANTIC_COLORS.success}
              strokeWidth={2.5}
              fill="url(#invValueFill)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}
