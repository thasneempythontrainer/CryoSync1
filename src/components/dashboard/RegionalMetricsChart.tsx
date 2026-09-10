import { BarChart, Bar, XAxis, YAxis, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import type { RegionalMetric } from '@/types'
import { ChartCard } from './ChartCard'
import { chartTooltipStyle, axisTick, SEMANTIC_COLORS } from './chart-utils'

interface RegionalMetricsChartProps {
  data: RegionalMetric[]
}

const REGION_COLORS: Record<string, string> = {
  Northeast: SEMANTIC_COLORS.primary,
  Midwest: SEMANTIC_COLORS.purple,
  South: SEMANTIC_COLORS.success,
  West: SEMANTIC_COLORS.warning,
}

export function RegionalMetricsChart({ data = [] }: RegionalMetricsChartProps) {
  const total = data.reduce((sum, d) => sum + d.shipments, 0)
  return (
    <ChartCard title="Shipments by Region" subtitle={`${total.toLocaleString()} shipments total`}>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -24 }}>
            <XAxis dataKey="region" tick={axisTick} tickLine={false} axisLine={false} />
            <YAxis tick={axisTick} tickLine={false} axisLine={false} width={44} />
            <Tooltip
              contentStyle={chartTooltipStyle}
              cursor={{ fill: 'rgba(255,255,255,0.05)' }}
              formatter={(value, name) => [value, name]}
            />
            <Bar dataKey="shipments" name="Shipments" radius={[3, 3, 0, 0]}>
              {data.map((entry) => (
                <Cell
                  key={entry.region}
                  fill={REGION_COLORS[entry.region] ?? SEMANTIC_COLORS.primary}
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
