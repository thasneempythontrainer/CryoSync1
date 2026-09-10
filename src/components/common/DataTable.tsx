import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Inbox,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusBadge } from "@/components/common/StatusBadge"
import { EmptyState } from "@/components/common/EmptyState"

interface ColumnDef {
  key: string
  label: string
  sortable?: boolean
  render?: (value: unknown, row: unknown) => React.ReactNode
  width?: string
  type?: "text" | "status"
}

interface DataTableProps {
  columns: ColumnDef[]
  data: unknown[]
  total: number
  page: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (pageSize: number) => void
  loading?: boolean
  sortBy?: string
  sortOrder?: "asc" | "desc"
  onSort?: (column: string) => void
  className?: string
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

function DataTable({
  columns,
  data,
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  loading = false,
  sortBy,
  sortOrder,
  onSort,
  className,
}: DataTableProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const startRow = total === 0 ? 0 : (page - 1) * pageSize + 1
  const endRow = Math.min(page * pageSize, total)

  function getPageNumbers(): (number | "...")[] {
    const pages: (number | "...")[] = []
    const delta = 2
    const left = Math.max(2, page - delta)
    const right = Math.min(totalPages - 1, page + delta)

    pages.push(1)
    if (left > 2) pages.push("...")
    for (let i = left; i <= right; i++) pages.push(i)
    if (right < totalPages - 1) pages.push("...")
    if (totalPages > 1) pages.push(totalPages)

    return pages
  }

  function renderCell(col: ColumnDef, value: unknown, row: unknown) {
    if (col.render) return col.render(value, row)
    if (col.type === "status") {
      return <StatusBadge status={String(value ?? "")} size="sm" />
    }
    return <span className="text-xs text-foreground">{String(value ?? "")}</span>
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="overflow-x-auto rounded border border-border">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={col.width ? { width: col.width, minWidth: col.width } : undefined}
                  className={cn(
                    "sticky top-0 z-10 h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/40",
                    col.sortable && "cursor-pointer select-none hover:text-foreground"
                  )}
                  onClick={() => {
                    if (col.sortable && onSort) onSort(col.key)
                  }}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {col.sortable && (
                      <>
                        {sortBy === col.key ? (
                          sortOrder === "asc" ? (
                            <ChevronUp className="size-3 text-foreground" />
                          ) : (
                            <ChevronDown className="size-3 text-foreground" />
                          )
                        ) : (
                          <ChevronsUpDown className="size-3 text-muted-foreground/30" />
                        )}
                      </>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: pageSize }).map((_, i) => (
                <tr
                  key={`skeleton-${i}`}
                  className="border-b border-border last:border-b-0"
                >
                  {columns.map((col) => (
                    <td key={col.key} className="px-3 py-2.5">
                      <Skeleton className="h-3.5 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>
                  <EmptyState
                    icon={<Inbox className="size-6" />}
                    title="No data found"
                    description="Try adjusting your filters or search terms."
                  />
                </td>
              </tr>
            ) : (
              data.map((row, i) => (
                <tr
                  key={(row as Record<string, unknown>).id ? String((row as Record<string, unknown>).id) : i}
                  className={cn(
                    "border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors",
                    i % 2 === 1 && "bg-muted/10"
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className="px-3 py-2.5"
                      style={col.width ? { width: col.width, minWidth: col.width } : undefined}
                    >
                      {renderCell(col, (row as Record<string, unknown>)[col.key], row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!loading && data.length > 0 && (
        <div className="flex flex-col items-center justify-between gap-2 sm:flex-row">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="tabular-nums">
              {startRow}&ndash;{endRow} of {total}
            </span>
            <span className="text-border">·</span>
            <span className="flex items-center gap-1">
              Rows
              <select
                value={pageSize}
                onChange={(e) => {
                  const newSize = Number(e.target.value)
                  if (onPageSizeChange) onPageSizeChange(newSize)
                  onPageChange(1)
                }}
                className="rounded border border-border bg-transparent px-1 py-px text-[11px] text-foreground outline-none"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </span>
          </div>

          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon-xs"
              disabled={page <= 1}
              onClick={() => onPageChange(1)}
            >
              <ChevronsLeft className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              <ChevronLeft className="size-3.5" />
            </Button>

            {getPageNumbers().map((p, i) =>
              p === "..." ? (
                <span
                  key={`ellipsis-${i}`}
                  className="flex size-5 items-center justify-center text-[10px] text-muted-foreground"
                >
                  ...
                </span>
              ) : (
                <Button
                  key={p}
                  variant={p === page ? "default" : "ghost"}
                  size="icon-xs"
                  onClick={() => onPageChange(p as number)}
                >
                  {p}
                </Button>
              )
            )}

            <Button
              variant="ghost"
              size="icon-xs"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              <ChevronRight className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              disabled={page >= totalPages}
              onClick={() => onPageChange(totalPages)}
            >
              <ChevronsRight className="size-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export { DataTable }
export type { ColumnDef, DataTableProps }
