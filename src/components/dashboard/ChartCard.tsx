import type { ReactNode } from 'react'

interface ChartCardProps {
  title: string
  subtitle?: string
  badge?: ReactNode
  children: ReactNode
  className?: string
}

export function ChartCard({ title, subtitle, badge, children, className }: ChartCardProps) {
  return (
    <div className={`card-premium flex flex-col p-3 ${className ?? ''}`}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
          {subtitle && <p className="mt-px truncate text-[11px] text-muted-foreground">{subtitle}</p>}
        </div>
        {badge}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  )
}

export type { ChartCardProps }
