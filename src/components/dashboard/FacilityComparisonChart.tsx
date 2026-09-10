import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import type { FacilityComparisonPoint } from '@/types'
import { ChartCard } from './ChartCard'
import { chartTooltipStyle, labelFormatter, CHART_PALETTE } from './chart-utils'

interface FacilityComparisonChartProps {
  data: FacilityComparisonPoint[]
}

export function FacilityComparisonChart({ data }: FacilityComparisonChartProps) {
  const facilities = Object.keys(data[0] ?? {}).filter((k) => k !== 'metric')
  return (
    <ChartCard title="Facility Comparison" subtitle="Operational scorecard across sites">
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="72%">
            <PolarGrid className="stroke-border/60" />
            <PolarAngleAxis
              dataKey="metric"
              tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
            />
            <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} />
            <Tooltip contentStyle={chartTooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" iconSize={8} />
            {facilities.map((facility, i) => (
              <Radar
                key={facility}
                name={facility}
                dataKey={facility}
                stroke={CHART_PALETTE[i % CHART_PALETTE.length]}
                fill={CHART_PALETTE[i % CHART_PALETTE.length]}
                fillOpacity={0.12}
                strokeWidth={2}
              />
            ))}
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
        {data.map((d) => labelFormatter(d.metric)).join(' · ')}
      </p>
    </ChartCard>
  )
}
