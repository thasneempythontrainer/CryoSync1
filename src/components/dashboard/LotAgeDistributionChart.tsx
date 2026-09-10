import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { LotAgeDistribution } from '@/types'
import { ChartCard } from './ChartCard'
import { chartTooltipStyle, axisTick, SEMANTIC_COLORS } from './chart-utils'

interface LotAgeDistributionChartProps {
  data: LotAgeDistribution[]
}

export function LotAgeDistributionChart({ data = [] }: LotAgeDistributionChartProps) {
  return (
    <ChartCard title="Lot Age Distribution" subtitle="Inventory aging profile">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
            <XAxis dataKey="bucket" tick={axisTick} tickLine={false} axisLine={false} />
            <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip contentStyle={chartTooltipStyle} formatter={(value) => [value, 'Lots']} />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={30}>
              {data.map((entry, i) => (
                <Cell
                  key={entry.bucket}
                  fill={i <= 1 ? SEMANTIC_COLORS.primary : i <= 3 ? SEMANTIC_COLORS.info : SEMANTIC_COLORS.warning}
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
