import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { DockToInventoryPoint } from '@/types'
import { ChartCard } from './ChartCard'
import { chartTooltipStyle, axisTick, formatDay, SEMANTIC_COLORS } from './chart-utils'

interface DockToInventoryChartProps {
  data: DockToInventoryPoint[]
}

export function DockToInventoryChart({ data = [] }: DockToInventoryChartProps) {
  const avg = data.length ? Math.round(data.reduce((s, d) => s + d.minutes, 0) / data.length) : 0
  return (
    <ChartCard
      title="Dock-to-Inventory Time"
      subtitle="Average receiving turnaround per day"
      badge={
        <span className="rounded-md bg-info/10 px-2 py-0.5 text-xs font-semibold text-info">
          {avg} min avg
        </span>
      }
    >
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
            <XAxis
              dataKey="date"
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              tickFormatter={formatDay}
            />
            <YAxis tick={axisTick} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={chartTooltipStyle}
              formatter={(value) => [`${value} min`, 'Dock-to-inventory']}
              labelFormatter={(v) => {
                const d = new Date(String(v))
                return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              }}
            />
            <defs>
              <linearGradient id="dockFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SEMANTIC_COLORS.primary} stopOpacity={0.35} />
                <stop offset="100%" stopColor={SEMANTIC_COLORS.primary} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="minutes"
              stroke={SEMANTIC_COLORS.primary}
              strokeWidth={2}
              fill="url(#dockFill)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}
