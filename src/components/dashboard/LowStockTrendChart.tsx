import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { LowStockTrend } from '@/types'
import { ChartCard } from './ChartCard'
import { chartTooltipStyle, axisTick, formatShortMonth, SEMANTIC_COLORS } from './chart-utils'

interface LowStockTrendChartProps {
  data: LowStockTrend[]
}

export function LowStockTrendChart({ data = [] }: LowStockTrendChartProps) {
  return (
    <ChartCard title="Low Stock Lots" subtitle="Items at or below reorder threshold">
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
            <XAxis
              dataKey="month"
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              tickFormatter={formatShortMonth}
            />
            <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={chartTooltipStyle}
              formatter={(value) => [value, 'Low-stock lots']}
              labelFormatter={(v) => {
                const d = new Date(`${v}-01`)
                return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
              }}
            />
            <Bar dataKey="count" fill={SEMANTIC_COLORS.warning} radius={[4, 4, 0, 0]} maxBarSize={30} fillOpacity={0.9} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}
