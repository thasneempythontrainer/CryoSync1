import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts'
import type { TemperatureCompliance } from '@/types'
import { ChartCard } from './ChartCard'
import { chartTooltipStyle, SEMANTIC_COLORS } from './chart-utils'

interface TemperatureComplianceChartProps {
  data: TemperatureCompliance[]
}

function labelFormatter(cat: string) {
  return cat
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function TemperatureComplianceChart({ data }: TemperatureComplianceChartProps) {
  const chartData = data.map((d) => ({
    ...d,
    label: labelFormatter(d.category),
  }))

  return (
    <ChartCard title="Temperature Compliance">
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 8, right: 24, bottom: 8, left: 8 }}
          >
            <XAxis
              type="number"
              domain={[0, 100]}
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v}%`}
            />
            <YAxis
              type="category"
              dataKey="label"
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
              tickLine={false}
              axisLine={false}
              width={140}
            />
            <Tooltip
              contentStyle={chartTooltipStyle}
              formatter={(value) => [`${value}%`, 'Compliance Rate']}
            />
            <ReferenceLine
              x={95}
              stroke="var(--muted-foreground)"
              strokeDasharray="4 4"
              strokeWidth={1}
              label={{
                value: '95% threshold',
                position: 'top',
                fontSize: 10,
                fill: 'var(--muted-foreground)',
              }}
            />
            <Bar dataKey="complianceRate" radius={[0, 4, 4, 0]} maxBarSize={20}>
              {chartData.map((entry) => (
                <Cell
                  key={entry.category}
                  fill={
                    entry.complianceRate >= 95
                      ? SEMANTIC_COLORS.success
                      : entry.complianceRate >= 85
                        ? SEMANTIC_COLORS.warning
                        : SEMANTIC_COLORS.danger
                  }
                  fillOpacity={0.85}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}
