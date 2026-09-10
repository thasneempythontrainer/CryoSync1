import type { RegionalMetric } from '@/types'
import { ChartCard } from './ChartCard'
import { SEMANTIC_COLORS } from './chart-utils'

interface RegionalComplianceChartProps {
  data: RegionalMetric[]
}

function complianceColor(rate: number): string {
  if (rate >= 95) return SEMANTIC_COLORS.success
  if (rate >= 92) return SEMANTIC_COLORS.warning
  return SEMANTIC_COLORS.danger
}

export function RegionalComplianceChart({ data = [] }: RegionalComplianceChartProps) {
  const sorted = [...data].sort((a, b) => b.compliance - a.compliance)
  return (
    <ChartCard title="Regional Compliance" subtitle="Cold-chain compliance rate by region">
      <div className="flex h-full flex-col justify-center gap-2.5">
        {sorted.map((d) => (
          <div key={d.region}>
            <div className="mb-1 flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-muted-foreground">{d.region}</span>
              <span className="font-medium tabular-nums">{d.compliance}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${d.compliance}%`, backgroundColor: complianceColor(d.compliance) }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-border/60 pt-2">
        {sorted.map((d) => (
          <div key={d.region} className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{d.region}</span>
            <span className="font-medium tabular-nums">{d.openIncidents}</span>
          </div>
        ))}
      </div>
    </ChartCard>
  )
}
