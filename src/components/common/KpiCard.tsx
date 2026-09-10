import { useId } from "react"
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
  spark?: number[]
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const id = useId()
  const width = 160
  const height = 32
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const step = width / (data.length - 1)
  const points = data.map(
    (v, i) =>
      `${(i * step).toFixed(1)},${(height - 2 - ((v - min) / range) * (height - 6)).toFixed(1)}`,
  )

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block"
      preserveAspectRatio="none"
      aria-hidden
    >
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
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
  spark,
}: KpiCardProps) {
  if (loading) {
    return (
      <div className="card-premium flex flex-col gap-2 p-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="size-6 rounded" />
        </div>
        <div className="space-y-1">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-3 w-12" />
        </div>
      </div>
    )
  }

  const trendColor =
    trend === "up"
      ? "text-success"
      : trend === "down"
        ? "text-danger"
        : "text-muted-foreground"

  return (
    <div className="card-premium flex flex-col gap-2 p-3 cursor-default">
      <div className="flex items-center justify-between">
        <span className="data-label">{label}</span>
        <span
          className="flex size-6 items-center justify-center rounded bg-muted text-muted-foreground"
          style={color ? { backgroundColor: `${color}14`, color } : undefined}
        >
          {icon}
        </span>
      </div>

      <div className="flex items-baseline gap-1">
        <span className="text-xl font-semibold leading-none tracking-tight text-foreground">
          {value}
        </span>
        {unit && (
          <span className="text-[11px] font-medium text-muted-foreground">{unit}</span>
        )}
      </div>

      {trend !== undefined && trendPercent !== undefined && (
        <div className={cn("flex items-center gap-1 text-[11px] font-medium", trendColor)}>
          {trend === "up" && <TrendingUp className="size-3" />}
          {trend === "down" && <TrendingDown className="size-3" />}
          {trend === "neutral" && <Minus className="size-3" />}
          <span>
            {trendPercent > 0 && "+"}
            {trendPercent}%
          </span>
        </div>
      )}

      {spark && spark.length > 1 && (
        <div className="mt-auto -mx-0.5">
          <Sparkline data={spark} color={color ?? "oklch(0.42 0.09 185)"} />
        </div>
      )}
    </div>
  )
}

export { KpiCard }
export type { KpiCardProps }
