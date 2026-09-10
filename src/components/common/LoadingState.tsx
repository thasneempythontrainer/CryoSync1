import { cn } from "@/lib/utils"

interface LoadingStateProps {
  title?: string
  description?: string
  variant?: "spinner" | "skeleton"
  className?: string
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-label="Loading">
      <div className="flex items-center gap-3">
        <div className="size-8 animate-pulse rounded bg-muted" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
          <div className="h-2.5 w-1/2 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <div className="h-2.5 w-full animate-pulse rounded bg-muted" />
      <div className="h-2.5 w-5/6 animate-pulse rounded bg-muted" />
      <div className="h-2.5 w-4/6 animate-pulse rounded bg-muted" />
      <div className="grid grid-cols-3 gap-3 pt-1">
        <div className="h-16 animate-pulse rounded bg-muted" />
        <div className="h-16 animate-pulse rounded bg-muted" />
        <div className="h-16 animate-pulse rounded bg-muted" />
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
      <div className={cn("flex flex-col items-center justify-center gap-2 py-16", className)}>
        <div className="size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
        {title && <p className="text-xs font-medium text-muted-foreground">{title}</p>}
        {description && (
          <p className="max-w-sm text-center text-[11px] text-muted-foreground/70">{description}</p>
        )}
      </div>
    )
  }

  if (title || description) {
    return (
      <div className={cn("space-y-2", className)}>
        {title && <p className="text-xs font-medium text-muted-foreground">{title}</p>}
        {description && (
          <p className="max-w-sm text-[11px] text-muted-foreground/70">{description}</p>
        )}
        <LoadingSkeleton />
      </div>
    )
  }

  return <LoadingSkeleton />
}

export { LoadingState }
export type { LoadingStateProps }
