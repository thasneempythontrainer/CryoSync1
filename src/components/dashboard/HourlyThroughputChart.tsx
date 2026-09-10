import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { HourlyThroughputPoint } from '@/types'
import { ChartCard } from './ChartCard'
import { chartTooltipStyle, axisTick, SEMANTIC_COLORS } from './chart-utils'

interface HourlyThroughputChartProps {
  data: HourlyThroughputPoint[]
}

export function HourlyThroughputChart({ data = [] }: HourlyThroughputChartProps) {
  const peak = data.reduce((max, d) => Math.max(max, d.shipments), 0)
  return (
    <ChartCard
      title="Hourly Throughput"
      subtitle="Shipments processed by hour of day"
      badge={
        <span className="rounded-md bg-purple-500/10 px-2 py-0.5 text-xs font-semibold text-purple-500">
          Peak {peak}/hr
        </span>
      }
    >
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
            <XAxis
              dataKey="hour"
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              interval={2}
            />
            <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip contentStyle={chartTooltipStyle} formatter={(value) => [value, 'Shipments']} />
            <defs>
              <linearGradient id="hourlyFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SEMANTIC_COLORS.purple} stopOpacity={0.4} />
                <stop offset="100%" stopColor={SEMANTIC_COLORS.purple} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="shipments"
              stroke={SEMANTIC_COLORS.purple}
              strokeWidth={2}
              fill="url(#hourlyFill)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}
