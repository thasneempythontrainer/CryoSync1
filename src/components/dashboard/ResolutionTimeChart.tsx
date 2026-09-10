import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { ResolutionTimeByType } from '@/types'
import { ChartCard } from './ChartCard'
import { chartTooltipStyle, axisTick, labelFormatter, SEMANTIC_COLORS } from './chart-utils'

interface ResolutionTimeChartProps {
  data: ResolutionTimeByType[]
}

export function ResolutionTimeChart({ data = [] }: ResolutionTimeChartProps) {
  return (
    <ChartCard title="Resolution Time" subtitle="Average days to close by deviation type">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 32, bottom: 8, left: 8 }}>
            <XAxis
              type="number"
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v}d`}
            />
            <YAxis
              type="category"
              dataKey="type"
              tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
              tickLine={false}
              axisLine={false}
              width={130}
            />
            <Tooltip
              contentStyle={chartTooltipStyle}
              formatter={(value) => [`${Number(value).toFixed(1)} days`, 'Avg resolution']}
              labelFormatter={(label) => labelFormatter(String(label))}
            />
            <Bar dataKey="days" radius={[0, 4, 4, 0]} maxBarSize={20}>
              {data.map((entry) => (
                <Cell
                  key={entry.type}
                  fill={entry.days > 5 ? SEMANTIC_COLORS.danger : entry.days > 3 ? SEMANTIC_COLORS.warning : SEMANTIC_COLORS.success}
                  fillOpacity={0.9}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}
