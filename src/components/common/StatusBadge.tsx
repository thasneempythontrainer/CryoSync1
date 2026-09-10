import { cn } from "@/lib/utils"
import { getStatusBg, getSeverityColor } from "@/utils/formatters"

interface StatusBadgeProps {
  status: string
  size?: "sm" | "md" | "lg"
}

const sizeMap = {
  sm: { wrapper: "px-1.5 py-px text-[10px] leading-3.5", dot: "size-1" },
  md: { wrapper: "px-2 py-0.5 text-[11px] leading-4", dot: "size-1.5" },
  lg: { wrapper: "px-2.5 py-1 text-xs leading-5", dot: "size-2" },
}

function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
  const severityKeys = ["low", "medium", "high", "critical"]
  const isSeverity = severityKeys.includes(status.toLowerCase())
  const bgClass = isSeverity ? getSeverityColor(status) : getStatusBg(status)
  const s = sizeMap[size]

  return (
    <span className={cn("inline-flex items-center gap-1 rounded font-medium whitespace-nowrap", s.wrapper, bgClass)}>
      <span className={cn("inline-block rounded-sm bg-current opacity-60", s.dot)} />
      {status.replace(/_/g, " ")}
    </span>
  )
}

export { StatusBadge }
export type { StatusBadgeProps }
