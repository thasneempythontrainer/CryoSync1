import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import type { ShipmentTrend } from '@/types'
import { ChartCard } from './ChartCard'
import { chartTooltipStyle, axisTick, SEMANTIC_COLORS } from './chart-utils'

interface ShipmentTrendChartProps {
  data: ShipmentTrend[]
}

export function ShipmentTrendChart({ data }: ShipmentTrendChartProps) {
  return (
    <ChartCard title="Shipment Trends" subtitle="Daily intake volume by status">
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
            <XAxis
              dataKey="date"
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => {
                const d = new Date(v)
                return `${d.getMonth() + 1}/${d.getDate()}`
              }}
            />
            <YAxis
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={chartTooltipStyle}
              labelFormatter={(label) => {
                if (!label) return ''
                const d = new Date(label as string)
                return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
              iconType="circle"
              iconSize={8}
            />
            <Line
              type="monotone"
              dataKey="received"
              stroke={SEMANTIC_COLORS.primary}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 5, fill: SEMANTIC_COLORS.primary, strokeWidth: 0 }}
              name="Received"
            />
            <Line
              type="monotone"
              dataKey="quarantined"
              stroke={SEMANTIC_COLORS.warning}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: SEMANTIC_COLORS.warning, strokeWidth: 0 }}
              name="Quarantined"
            />
            <Line
              type="monotone"
              dataKey="rejected"
              stroke={SEMANTIC_COLORS.danger}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: SEMANTIC_COLORS.danger, strokeWidth: 0 }}
              name="Rejected"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}
