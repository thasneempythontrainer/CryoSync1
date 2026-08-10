import { Eye, ShieldCheck, AlertTriangle } from "lucide-react"

import { DataTable, type ColumnDef } from "@/components/common/DataTable"
import { StatusBadge } from "@/components/common/StatusBadge"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatCategory } from "@/utils/formatters"
import type { ComplianceSummary } from "@/types"

interface ComplianceDataGridProps {
  data: ComplianceSummary[]
  total: number
  page: number
  pageSize: number
  onPageChange: (page: number) => void
  onSort?: (column: string) => void
  onRowClick?: (incident: ComplianceSummary) => void
  loading?: boolean
  sortBy?: string
  sortOrder?: "asc" | "desc"
}

function ComplianceDataGrid({
  data,
  total,
  page,
  pageSize,
  onPageChange,
  onSort,
  onRowClick,
  loading = false,
  sortBy,
  sortOrder,
}: ComplianceDataGridProps) {
  const columns: ColumnDef[] = [
    {
      key: "incidentNumber",
      label: "Incident #",
      sortable: true,
      width: "130px",
      render: (value: unknown) => (
        <span className="font-mono text-xs font-medium text-foreground">{value as string}</span>
      ),
    },
    {
      key: "title",
      label: "Title",
      sortable: true,
      render: (value: unknown, row: unknown) => (
        <button
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation()
            onRowClick?.(row as ComplianceSummary)
          }}
          className="max-w-[200px] truncate text-sm font-medium text-foreground hover:text-primary transition-colors text-left cursor-pointer"
        >
          {value as string}
        </button>
      ),
    },
    {
      key: "deviationType",
      label: "Type",
      sortable: true,
      width: "160px",
      render: (value: unknown) => (
        <span className="text-sm text-muted-foreground">{formatCategory(value as string)}</span>
      ),
    },
    {
      key: "severity",
      label: "Severity",
      sortable: true,
      width: "120px",
      render: (value: unknown) => <StatusBadge status={value as string} size="sm" />,
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      width: "130px",
      render: (value: unknown) => <StatusBadge status={value as string} size="sm" />,
    },
    {
      key: "facilityName",
      label: "Facility",
      sortable: true,
      render: (value: unknown) => (
        <span className="text-sm text-muted-foreground">{value as string}</span>
      ),
    },
    {
      key: "daysOpen",
      label: "Days Open",
      sortable: true,
      width: "100px",
      render: (value: unknown) => (
        <span className="text-sm tabular-nums text-foreground">{value as number}d</span>
      ),
    },
    {
      key: "regulatoryNotifiable",
      label: "Regulatory",
      width: "100px",
      render: (value: unknown) =>
        value ? (
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="size-3" />
            Yes
          </Badge>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        ),
    },
    {
      key: "actions",
      label: "",
      width: "60px",
      render: (_: unknown, row: unknown) => (
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation()
            onRowClick?.(row as ComplianceSummary)
          }}
        >
          <Eye className="size-4" />
        </Button>
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      data={data}
      total={total}
      page={page}
      pageSize={pageSize}
      onPageChange={onPageChange}
      loading={loading}
      sortBy={sortBy}
      sortOrder={sortOrder}
      onSort={onSort}
    />
  )
}

export { ComplianceDataGrid }
export type { ComplianceDataGridProps }
