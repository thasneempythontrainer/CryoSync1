import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts'
import type { ReceivingVolume } from '@/types'
import { ChartCard } from './ChartCard'
import { chartTooltipStyle, axisTick, formatShortMonth, SEMANTIC_COLORS } from './chart-utils'

interface ReceivingVolumeChartProps {
  data: ReceivingVolume[]
}

export function ReceivingVolumeChart({ data = [] }: ReceivingVolumeChartProps) {
  return (
    <ChartCard title="Receiving Volume" subtitle="Monthly intake vs. target">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
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
              labelFormatter={(v) => {
                const d = new Date(`${v}-01`)
                return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="circle" iconSize={8} />
            <Bar dataKey="volume" fill={SEMANTIC_COLORS.info} radius={[4, 4, 0, 0]} maxBarSize={28} name="Volume" />
            <Line
              type="monotone"
              dataKey="target"
              stroke={SEMANTIC_COLORS.warning}
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={{ r: 3, fill: SEMANTIC_COLORS.warning, strokeWidth: 0 }}
              name="Target"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}
