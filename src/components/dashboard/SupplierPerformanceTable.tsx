import type { SupplierPerformance } from '@/types'
import { cn } from '@/lib/utils'

interface SupplierPerformanceTableProps {
  data: SupplierPerformance[]
}

function ScoreBadge({ score }: { score: number }) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums',
        score >= 90 && 'bg-success/10 text-success',
        score >= 80 && score < 90 && 'bg-warning/10 text-warning',
        score < 80 && 'bg-danger/10 text-danger',
      )}
    >
      {score}
    </span>
  )
}

export function SupplierPerformanceTable({ data }: SupplierPerformanceTableProps) {
  return (
    <div className="flex flex-col rounded-lg border border-border bg-card p-5">
      <h3 className="mb-4 text-sm font-semibold text-foreground">Supplier Performance</h3>
      <div className="max-h-80 overflow-y-auto -mx-5">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border/60">
              <th className="sticky top-0 bg-card px-5 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Supplier</th>
              <th className="sticky top-0 bg-card px-5 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Shipments</th>
              <th className="sticky top-0 bg-card px-5 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">On-Time %</th>
              <th className="sticky top-0 bg-card px-5 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Score</th>
            </tr>
          </thead>
          <tbody>
            {data.map((s, i) => (
              <tr
                key={s.supplierName}
                className={cn(
                  'border-b border-border/40 transition-colors hover:bg-muted/30',
                  i === data.length - 1 && 'border-b-0'
                )}
              >
                <td className="max-w-36 truncate px-5 py-3 text-sm font-medium text-foreground">{s.supplierName}</td>
                <td className="px-5 py-3 text-right text-sm tabular-nums text-muted-foreground">{s.shipments}</td>
                <td className="px-5 py-3 text-right text-sm tabular-nums text-muted-foreground">{s.onTime}%</td>
                <td className="px-5 py-3 text-right">
                  <ScoreBadge score={s.score} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
