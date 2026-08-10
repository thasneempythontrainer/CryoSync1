import { cn } from "@/lib/utils"
import { getStatusBg, getSeverityColor } from "@/utils/formatters"

interface StatusBadgeProps {
  status: string
  size?: "sm" | "md" | "lg"
}

const sizeMap = {
  sm: { wrapper: "px-2 py-0.5 text-[10px] leading-3", dot: "size-1.5" },
  md: { wrapper: "px-2.5 py-0.5 text-xs leading-4", dot: "size-2" },
  lg: { wrapper: "px-3 py-1 text-sm leading-5", dot: "size-2.5" },
}

function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
  const severityKeys = ["low", "medium", "high", "critical"]
  const isSeverity = severityKeys.includes(status.toLowerCase())
  const bgClass = isSeverity ? getSeverityColor(status) : getStatusBg(status)
  const s = sizeMap[size]

  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap", s.wrapper, bgClass)}>
      <span className={cn("inline-block rounded-full bg-current", s.dot)} />
      {status.replace(/_/g, " ")}
    </span>
  )
}

export { StatusBadge }
export type { StatusBadgeProps }
