import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import type { ExcursionSeverityBreakdown } from '@/types'
import { ChartCard } from './ChartCard'
import { chartTooltipStyle, labelFormatter, SEMANTIC_COLORS } from './chart-utils'

interface ExcursionSeverityChartProps {
  data: ExcursionSeverityBreakdown[]
}

const SEVERITY_COLORS: Record<string, string> = {
  low: SEMANTIC_COLORS.success,
  medium: SEMANTIC_COLORS.warning,
  high: SEMANTIC_COLORS.orange,
  critical: SEMANTIC_COLORS.danger,
}

export function ExcursionSeverityChart({ data = [] }: ExcursionSeverityChartProps) {
  return (
    <ChartCard title="Excursion Severity" subtitle="Distribution of event severity">
      <div className="mx-auto w-full max-w-[240px]">
        <div className="aspect-square">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="count"
                nameKey="severity"
                cx="50%"
                cy="50%"
                innerRadius={48}
                outerRadius={80}
                paddingAngle={3}
                strokeWidth={0}
              >
                {data.map((entry) => (
                  <Cell
                    key={entry.severity}
                    fill={SEVERITY_COLORS[entry.severity] ?? SEMANTIC_COLORS.primary}
                    fillOpacity={0.9}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={chartTooltipStyle}
                formatter={(value, name) => [value, labelFormatter(String(name))]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
        {data.map((item) => (
          <div key={item.severity} className="flex items-center gap-1.5">
            <span
              className="inline-block size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: SEVERITY_COLORS[item.severity] ?? SEMANTIC_COLORS.primary }}
            />
            <span className="text-xs text-muted-foreground">{labelFormatter(item.severity)}</span>
          </div>
        ))}
      </div>
    </ChartCard>
  )
}
