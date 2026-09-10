import {
  AlertTriangle,
  ShieldCheck,
  Clock,
  AlertCircle,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"

interface ComplianceSummaryData {
  openIncidents: number
  criticalIncidents: number
  avgResolutionDays: number
  regulatoryNotifiable: number
}

interface ComplianceSummaryCardsProps {
  data?: ComplianceSummaryData
  loading?: boolean
}

const cards = [
  {
    key: "openIncidents",
    label: "Open Incidents",
    color: "bg-warning/10 text-warning",
    icon: <AlertTriangle className="size-4" />,
    format: (v: number) => String(v),
  },
  {
    key: "criticalIncidents",
    label: "Critical Incidents",
    color: "bg-danger/10 text-danger",
    icon: <AlertCircle className="size-4" />,
    format: (v: number) => String(v),
  },
  {
    key: "avgResolutionDays",
    label: "Avg Resolution Time",
    color: "bg-primary/10 text-primary",
    icon: <Clock className="size-4" />,
    format: (v: number) => `${v.toFixed(1)}d`,
  },
  {
    key: "regulatoryNotifiable",
    label: "Regulatory Notifiable",
    color: "bg-purple-500/10 text-purple-500",
    icon: <ShieldCheck className="size-4" />,
    format: (v: number) => String(v),
  },
]

function SummaryCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-7 w-16" />
    </div>
  )
}

function ComplianceSummaryCards({ data, loading }: ComplianceSummaryCardsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SummaryCardSkeleton key={i} />
        ))}
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {cards.map((card) => {
        const value = data[card.key as keyof ComplianceSummaryData]

        return (
          <div
            key={card.key}
            className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {card.label}
              </span>
              <span className={cn("flex size-7 items-center justify-center rounded-lg", card.color)}>
                {card.icon}
              </span>
            </div>
            <span className="text-3xl font-semibold tracking-tight text-foreground">
              {card.format(value as number)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export { ComplianceSummaryCards }
export type { ComplianceSummaryCardsProps, ComplianceSummaryData }
