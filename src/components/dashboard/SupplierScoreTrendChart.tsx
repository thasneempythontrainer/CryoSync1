import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import type { SupplierScoreTrendPoint } from '@/types'
import { ChartCard } from './ChartCard'
import { chartTooltipStyle, axisTick, formatShortMonth, CHART_PALETTE } from './chart-utils'

interface SupplierScoreTrendChartProps {
  data: SupplierScoreTrendPoint[]
}

export function SupplierScoreTrendChart({ data = [] }: SupplierScoreTrendChartProps) {
  const suppliers = Object.keys(data[0] ?? {}).filter((k) => k !== 'month')
  return (
    <ChartCard title="Supplier Score Trend" subtitle="Composite score trajectory by supplier">
      <div className="h-64">
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
              domain={[60, 100]}
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v}`}
            />
            <Tooltip
              contentStyle={chartTooltipStyle}
              labelFormatter={(v) => {
                const d = new Date(`${v}-01`)
                return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" iconSize={8} />
            {suppliers.map((supplier, i) => (
              <Line
                key={supplier}
                type="monotone"
                dataKey={supplier}
                stroke={CHART_PALETTE[i % CHART_PALETTE.length]}
                strokeWidth={2}
                dot={false}
                name={supplier}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}
