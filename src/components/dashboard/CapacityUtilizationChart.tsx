import { RadialBarChart, RadialBar, PolarAngleAxis, ResponsiveContainer } from 'recharts'
import type { CapacityUtilization } from '@/types'
import { ChartCard } from './ChartCard'
import { SEMANTIC_COLORS } from './chart-utils'

interface CapacityUtilizationChartProps {
  data: CapacityUtilization[]
}

function utilizationColor(pct: number): string {
  if (pct >= 90) return SEMANTIC_COLORS.danger
  if (pct >= 80) return SEMANTIC_COLORS.warning
  return SEMANTIC_COLORS.primary
}

export function CapacityUtilizationChart({ data = [] }: CapacityUtilizationChartProps) {
  const avg = data.length
    ? Math.round(data.reduce((s, d) => s + d.pct, 0) / data.length)
    : 0

  return (
    <ChartCard title="Capacity Utilization" subtitle="Storage fill rate by zone">
      <div className="flex items-center gap-4">
        <div className="relative h-36 w-36 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart
              cx="50%"
              cy="50%"
              innerRadius="68%"
              outerRadius="100%"
              barSize={14}
              data={[{ name: 'overall', value: avg }]}
              startAngle={220}
              endAngle={-40}
            >
              <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
              <RadialBar
                dataKey="value"
                cornerRadius={8}
                fill={utilizationColor(avg)}
                background={{ fill: 'var(--border)' }}
              />
            </RadialBarChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold tabular-nums text-foreground">{avg}%</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Overall</span>
          </div>
        </div>
        <div className="flex-1 space-y-2.5">
          {data.map((zone) => (
            <div key={zone.zone}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="truncate text-xs font-medium text-foreground">{zone.zone}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{zone.pct}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, zone.pct)}%`,
                    backgroundColor: utilizationColor(zone.pct),
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </ChartCard>
  )
}
