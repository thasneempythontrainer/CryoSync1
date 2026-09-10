import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { FirstPassYield } from '@/types'
import { ChartCard } from './ChartCard'
import { chartTooltipStyle, axisTick, formatShortMonth, SEMANTIC_COLORS } from './chart-utils'

interface FirstPassYieldChartProps {
  data: FirstPassYield[]
}

export function FirstPassYieldChart({ data = [] }: FirstPassYieldChartProps) {
  const last = data.length ? data[data.length - 1].value : 0
  return (
    <ChartCard
      title="First-Pass Yield"
      subtitle="Receiving checks passed without rework"
      badge={
        <span className="rounded-md bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
          {last}%
        </span>
      }
    >
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
            <XAxis
              dataKey="month"
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              tickFormatter={formatShortMonth}
            />
            <YAxis
              domain={[92, 100]}
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip
              contentStyle={chartTooltipStyle}
              formatter={(value) => [`${value}%`, 'First-pass yield']}
              labelFormatter={(v) => {
                const d = new Date(`${v}-01`)
                return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
              }}
            />
            <defs>
              <linearGradient id="fpyFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SEMANTIC_COLORS.success} stopOpacity={0.35} />
                <stop offset="100%" stopColor={SEMANTIC_COLORS.success} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="value"
              stroke={SEMANTIC_COLORS.success}
              strokeWidth={2.5}
              fill="url(#fpyFill)"
              dot={{ r: 3, fill: SEMANTIC_COLORS.success, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}
