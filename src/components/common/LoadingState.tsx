import { cn } from "@/lib/utils"

interface LoadingStateProps {
  title?: string
  description?: string
  variant?: "spinner" | "skeleton"
  className?: string
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading">
      <div className="flex items-center gap-4">
        <div className="size-10 animate-pulse rounded-xl bg-muted" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <div className="h-3 w-full animate-pulse rounded bg-muted" />
      <div className="h-3 w-5/6 animate-pulse rounded bg-muted" />
      <div className="h-3 w-4/6 animate-pulse rounded bg-muted" />
      <div className="grid grid-cols-3 gap-4 pt-2">
        <div className="h-20 animate-pulse rounded-xl bg-muted" />
        <div className="h-20 animate-pulse rounded-xl bg-muted" />
        <div className="h-20 animate-pulse rounded-xl bg-muted" />
      </div>
    </div>
  )
}

function LoadingState({
  title,
  description,
  variant = "skeleton",
  className,
}: LoadingStateProps) {
  if (variant === "spinner") {
    return (
      <div className={cn("flex flex-col items-center justify-center gap-3 py-16", className)}>
        <div className="size-10 animate-spin rounded-full border-[3px] border-muted border-t-[#22d3ee]" />
        {title && <p className="text-sm font-medium text-muted-foreground">{title}</p>}
        {description && (
          <p className="max-w-sm text-center text-xs text-muted-foreground/70">{description}</p>
        )}
      </div>
    )
  }

  if (title || description) {
    return (
      <div className={cn("space-y-3", className)}>
        {title && <p className="text-sm font-medium text-muted-foreground">{title}</p>}
        {description && (
          <p className="max-w-sm text-xs text-muted-foreground/70">{description}</p>
        )}
        <LoadingSkeleton />
      </div>
    )
  }

  return <LoadingSkeleton />
}

export { LoadingState }
export type { LoadingStateProps }
