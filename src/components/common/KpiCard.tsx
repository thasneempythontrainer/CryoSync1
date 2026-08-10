import { motion } from "framer-motion"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"

import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"

interface KpiCardProps {
  label: string
  value: string | number
  trend?: "up" | "down" | "neutral"
  trendPercent?: number
  icon: React.ReactNode
  unit?: string
  loading?: boolean
  color?: string
}

function KpiCard({
  label,
  value,
  trend,
  trendPercent,
  icon,
  unit,
  loading,
  color,
}: KpiCardProps) {
  if (loading) {
    return (
      <div className="card-premium relative flex flex-col gap-3 p-4">
        <span
          className="absolute left-0 top-0 bottom-0 w-1 rounded-r-full"
          style={{ backgroundColor: color ?? "#22d3ee" }}
        />
        <div className="flex items-center justify-between">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="size-9 rounded-full" />
        </div>
        <div className="space-y-1.5">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-16" />
        </div>
      </div>
    )
  }

  const trendColor =
    trend === "up"
      ? "text-[#34d399]"
      : trend === "down"
        ? "text-red-500"
        : "text-muted-foreground"

  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className="card-premium relative flex flex-col gap-3 p-4 cursor-default"
    >
      <span
        className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full"
        style={{ backgroundColor: color ?? "#22d3ee" }}
      />

      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
        <span
          className={cn(
            "flex size-9 items-center justify-center rounded-full text-white",
            !color && "gradient-brand"
          )}
          style={color ? { backgroundColor: color } : undefined}
        >
          {icon}
        </span>
      </div>

      <div className="flex items-baseline gap-1.5">
        <span className="text-[28px] font-bold leading-none tracking-tight text-foreground">
          {value}
        </span>
        {unit && (
          <span className="text-sm font-medium text-muted-foreground">{unit}</span>
        )}
      </div>

      {trend !== undefined && trendPercent !== undefined && (
        <div className={cn("flex items-center gap-1 text-sm font-semibold", trendColor)}>
          {trend === "up" && <TrendingUp className="size-4" />}
          {trend === "down" && <TrendingDown className="size-4" />}
          {trend === "neutral" && <Minus className="size-3.5" />}
          <span>
            {trendPercent > 0 && "+"}
            {trendPercent}%
          </span>
        </div>
      )}
    </motion.div>
  )
}

export { KpiCard }
export type { KpiCardProps }
