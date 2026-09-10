import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import type { ComplianceScoreTrend } from '@/types'
import { ChartCard } from './ChartCard'
import { chartTooltipStyle, axisTick, formatShortMonth, SEMANTIC_COLORS } from './chart-utils'

interface ComplianceScoreTrendChartProps {
  data: ComplianceScoreTrend[]
}

export function ComplianceScoreTrendChart({ data = [] }: ComplianceScoreTrendChartProps) {
  return (
    <ChartCard
      title="Compliance Score"
      subtitle="Overall compliance rate vs. 95% threshold"
      badge={
        <span className="rounded-md bg-purple-500/10 px-2 py-0.5 text-xs font-semibold text-purple-500">
          {data.length ? data[data.length - 1].rate : 0}%
        </span>
      }
    >
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
            <XAxis
              dataKey="month"
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              tickFormatter={formatShortMonth}
            />
            <YAxis
              domain={[90, 100]}
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip
              contentStyle={chartTooltipStyle}
              formatter={(value) => [`${value}%`, 'Compliance']}
              labelFormatter={(v) => {
                const d = new Date(`${v}-01`)
                return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
              }}
            />
            <ReferenceLine
              y={95}
              stroke="var(--muted-foreground)"
              strokeDasharray="4 4"
              label={{ value: '95%', position: 'right', fontSize: 10, fill: 'var(--muted-foreground)' }}
            />
            <Line
              type="monotone"
              dataKey="rate"
              stroke={SEMANTIC_COLORS.purple}
              strokeWidth={2.5}
              dot={{ r: 3, fill: SEMANTIC_COLORS.purple, strokeWidth: 0 }}
              activeDot={{ r: 5, fill: SEMANTIC_COLORS.purple, strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}
