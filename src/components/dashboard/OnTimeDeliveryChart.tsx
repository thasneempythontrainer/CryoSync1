import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import type { OnTimeDeliveryPoint } from '@/types'
import { ChartCard } from './ChartCard'
import { chartTooltipStyle, axisTick, SEMANTIC_COLORS } from './chart-utils'

interface OnTimeDeliveryChartProps {
  data: OnTimeDeliveryPoint[]
}

export function OnTimeDeliveryChart({ data = [] }: OnTimeDeliveryChartProps) {
  const last = data.length ? data[data.length - 1].rate : 0
  return (
    <ChartCard
      title="On-Time Delivery"
      subtitle="Weekly on-time rate vs. 95% target"
      badge={
        <span className="rounded-md bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
          {last}%
        </span>
      }
    >
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
            <XAxis dataKey="week" tick={axisTick} tickLine={false} axisLine={false} />
            <YAxis
              domain={[85, 100]}
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip
              contentStyle={chartTooltipStyle}
              formatter={(value) => [`${value}%`, 'On-time rate']}
            />
            <ReferenceLine
              y={95}
              stroke="var(--muted-foreground)"
              strokeDasharray="4 4"
              label={{ value: '95% target', position: 'right', fontSize: 10, fill: 'var(--muted-foreground)' }}
            />
            <Line
              type="monotone"
              dataKey="rate"
              stroke={SEMANTIC_COLORS.success}
              strokeWidth={2.5}
              dot={{ r: 3, fill: SEMANTIC_COLORS.success, strokeWidth: 0 }}
              activeDot={{ r: 5, fill: SEMANTIC_COLORS.success, strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}
