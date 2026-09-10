import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import type { QualityInspectionResult } from '@/types'
import { ChartCard } from './ChartCard'
import { chartTooltipStyle, axisTick, formatShortMonth, SEMANTIC_COLORS } from './chart-utils'

interface QualityInspectionChartProps {
  data: QualityInspectionResult[]
}

export function QualityInspectionChart({ data = [] }: QualityInspectionChartProps) {
  return (
    <ChartCard title="Quality Inspection Results" subtitle="QA outcomes by month">
      <div className="h-64">
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
              cursor={{ fill: 'var(--muted)', fillOpacity: 0.35 }}
              labelFormatter={(v) => {
                const d = new Date(`${v}-01`)
                return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="circle" iconSize={8} />
            <Bar dataKey="passed" stackId="inspect" fill={SEMANTIC_COLORS.success} name="Passed" maxBarSize={34} />
            <Bar dataKey="pending" stackId="inspect" fill={SEMANTIC_COLORS.warning} name="Pending" />
            <Bar dataKey="failed" stackId="inspect" fill={SEMANTIC_COLORS.danger} name="Failed" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}
