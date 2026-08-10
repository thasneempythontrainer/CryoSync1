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
    <div className="card-premium p-5">
      <h3 className="mb-5 text-sm font-semibold text-foreground">Temperature Compliance</h3>
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
              contentStyle={{
                backgroundColor: 'var(--popover)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
                fontSize: 12,
                color: 'var(--popover-foreground)',
                boxShadow: 'var(--shadow-elevated)',
              }}
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
                      ? '#34d399'
                      : entry.complianceRate >= 85
                        ? '#fbbf24'
                        : '#ef4444'
                  }
                  fillOpacity={0.85}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
