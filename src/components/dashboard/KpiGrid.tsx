import type { DashboardKpi } from '@/types'
import { KpiCard } from '@/components/common'
import {
  Truck,
  Package,
  ShieldCheck,
  AlertTriangle,
  Thermometer,
  Clock,
  BarChart3,
  Activity,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const iconMap: Record<string, LucideIcon> = {
  truck: Truck,
  package: Package,
  'shield-check': ShieldCheck,
  'alert-triangle': AlertTriangle,
  thermometer: Thermometer,
  clock: Clock,
  'bar-chart-3': BarChart3,
  activity: Activity,
}

const accentMap: Record<string, string> = {
  shipments: 'border-l-[#22d3ee]',
  inventory: 'border-l-[#34d399]',
  compliance: 'border-l-[#a78bfa]',
  quality: 'border-l-[#38bdf8]',
  temperature: 'border-l-[#f472b6]',
  throughput: 'border-l-[#fbbf24]',
  default: 'border-l-primary',
}

interface KpiGridProps {
  kpis: DashboardKpi[]
}

export function KpiGrid({ kpis }: KpiGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
      {kpis.map((kpi) => {
        const Icon = iconMap[kpi.icon] || Activity
        const accent = accentMap[kpi.icon] || accentMap.default
        return (
          <KpiCard
            key={kpi.label}
            label={kpi.label}
            value={kpi.value}
            unit={kpi.unit}
            trend={kpi.trend}
            trendPercent={kpi.trendPercent}
            icon={<Icon className="size-5" />}
          />
        )
      })}
    </div>
  )
}
