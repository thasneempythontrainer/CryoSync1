import { motion } from "framer-motion"
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
    color: "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400",
    borderColor: "border-l-amber-500",
    icon: <AlertTriangle className="size-4" />,
    format: (v: number) => String(v),
  },
  {
    key: "criticalIncidents",
    label: "Critical Incidents",
    color: "bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400",
    borderColor: "border-l-red-500",
    icon: <AlertCircle className="size-4" />,
    format: (v: number) => String(v),
  },
  {
    key: "avgResolutionDays",
    label: "Avg Resolution Time",
    color: "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400",
    borderColor: "border-l-blue-500",
    icon: <Clock className="size-4" />,
    format: (v: number) => `${v.toFixed(1)}d`,
  },
  {
    key: "regulatoryNotifiable",
    label: "Regulatory Notifiable",
    color: "bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-400",
    borderColor: "border-l-violet-500",
    icon: <ShieldCheck className="size-4" />,
    format: (v: number) => String(v),
  },
]

function SummaryCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-sm">
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
      {cards.map((card, index) => {
        const value = data[card.key as keyof ComplianceSummaryData]

        return (
          <motion.div
            key={card.key}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.08, duration: 0.3, ease: "easeOut" }}
            whileHover={{ y: -2 }}
            className={cn(
              "relative flex flex-col gap-3 overflow-hidden rounded-xl border border-border bg-card p-5 shadow-sm transition-colors dark:border-neutral-800 dark:bg-neutral-900",
              card.borderColor
            )}
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
          </motion.div>
        )
      })}
    </div>
  )
}

export { ComplianceSummaryCards }
export type { ComplianceSummaryCardsProps, ComplianceSummaryData }
