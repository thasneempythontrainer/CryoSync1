import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts'
import type { ColdChainExcursion } from '@/types'
import { ChartCard } from './ChartCard'
import { chartTooltipStyle, axisTick, formatDay, SEMANTIC_COLORS } from './chart-utils'

interface ColdChainExcursionsChartProps {
  data: ColdChainExcursion[]
}

export function ColdChainExcursionsChart({ data = [] }: ColdChainExcursionsChartProps) {
  return (
    <ChartCard
      title="Cold-Chain Excursions"
      subtitle="Daily excursion count with critical threshold"
      badge={
        <span className="rounded-md bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger">
          {data.reduce((s, d) => s + d.criticalExcursions, 0)} critical
        </span>
      }
    >
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
            <XAxis
              dataKey="date"
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              tickFormatter={formatDay}
            />
            <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={chartTooltipStyle}
              labelFormatter={(v) => {
                const d = new Date(String(v))
                return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="circle" iconSize={8} />
            <ReferenceLine
              y={10}
              stroke="var(--muted-foreground)"
              strokeDasharray="4 4"
              label={{ value: 'Alert', position: 'right', fontSize: 10, fill: 'var(--muted-foreground)' }}
            />
            <Bar dataKey="excursions" fill={SEMANTIC_COLORS.orange} radius={[4, 4, 0, 0]} maxBarSize={16} name="Excursions" />
            <Line
              type="monotone"
              dataKey="criticalExcursions"
              stroke={SEMANTIC_COLORS.danger}
              strokeWidth={2.5}
              dot={{ r: 3, fill: SEMANTIC_COLORS.danger, strokeWidth: 0 }}
              name="Critical"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}
