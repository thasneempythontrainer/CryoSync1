import {
  Truck,
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  FileCheck,
  ArrowRightLeft,
} from 'lucide-react'
import type { RecentActivity } from '@/types'
import { cn } from '@/lib/utils'

interface ActivityFeedProps {
  data: RecentActivity[]
}

const activityConfig: Record<
  RecentActivity['type'],
  { icon: typeof Truck; color: string }
> = {
  shipment_received: { icon: Truck, color: 'text-cyan-400 bg-cyan-400/10' },
  compliance_flagged: { icon: AlertTriangle, color: 'text-amber-500 bg-amber-500/10' },
  lot_released: { icon: CheckCircle2, color: 'text-emerald-400 bg-emerald-400/10' },
  qa_reviewed: { icon: ClipboardCheck, color: 'text-violet-500 bg-violet-500/10' },
  deviation_resolved: { icon: FileCheck, color: 'text-cyan-500 bg-cyan-500/10' },
  transfer_completed: { icon: ArrowRightLeft, color: 'text-rose-500 bg-rose-500/10' },
}

function timeAgo(timestamp: string): string {
  const now = Date.now()
  const then = new Date(timestamp).getTime()
  const diff = now - then

  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`

  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks}w ago`

  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function ActivityFeed({ data }: ActivityFeedProps) {
  return (
    <div className="card-premium flex flex-col p-5">
      <h3 className="mb-1 text-sm font-semibold text-foreground">Recent Activity</h3>
      <div className="max-h-80 overflow-y-auto -mx-5 -mb-5 mt-3">
        {data.map((activity) => {
          const config = activityConfig[activity.type] || activityConfig.shipment_received
          const Icon = config.icon

          return (
            <div
              key={activity.id}
              className="flex items-start gap-3 border-b border-border/40 px-5 py-3.5 transition-colors last:border-b-0 hover:bg-muted/20"
            >
              <span
                className={cn(
                  'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg',
                  config.color,
                )}
              >
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{activity.title}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{activity.description}</p>
              </div>
              <span className="shrink-0 pt-1 text-xs tabular-nums text-muted-foreground">
                {timeAgo(activity.timestamp)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
