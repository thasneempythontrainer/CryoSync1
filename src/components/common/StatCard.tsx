import { cn } from "@/lib/utils"

interface StatCardProps {
  label: string
  value: string | number
  subtext?: string
  color?: string
}

function StatCard({ label, value, subtext, color }: StatCardProps) {
  return (
    <div className="relative flex flex-col gap-1 overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm">
      <div
        className={cn(
          "absolute inset-y-0 left-0 w-0.5",
          color ?? "bg-primary"
        )}
      />
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="text-xl font-semibold text-foreground">{value}</span>
      {subtext && (
        <span className="text-xs text-muted-foreground">{subtext}</span>
      )}
    </div>
  )
}

export { StatCard }
export type { StatCardProps }
