import { Search, RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DEVIATION_TYPES } from "@/constants/enterprise"
import { useFacilities } from "@/services"
import type { ComplianceStatus, ComplianceSeverity } from "@/types"

const STATUS_OPTIONS: { value: ComplianceStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "investigating", label: "Investigating" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
]

const SEVERITY_OPTIONS: { value: ComplianceSeverity; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
]

interface ComplianceFiltersProps {
  values: {
    status: string
    severity: string
    type: string
    facility: string
    search: string
  }
  onChange: (key: string, value: string) => void
  onReset: () => void
}

function ComplianceFilters({ values, onChange, onReset }: ComplianceFiltersProps) {
  const { data: facilities } = useFacilities()
  const hasActiveFilters = Object.values(values).some((v) => v !== "")

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
      <div className="relative min-w-48">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search incidents..."
          value={values.search}
          onChange={(e) => onChange("search", e.target.value)}
          className="h-8 w-full rounded-lg border border-input bg-transparent py-1 pr-2 pl-8 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring"
        />
      </div>

      <Select
        value={values.status}
        onValueChange={(v) => onChange("status", v ?? '')}
      >
        <SelectTrigger className="w-32">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All Statuses</SelectItem>
          {STATUS_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={values.severity}
        onValueChange={(v) => onChange("severity", v ?? '')}
      >
        <SelectTrigger className="w-32">
          <SelectValue placeholder="Severity" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All Severities</SelectItem>
          {SEVERITY_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={values.type}
        onValueChange={(v) => onChange("type", v ?? '')}
      >
        <SelectTrigger className="w-44">
          <SelectValue placeholder="Deviation Type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All Types</SelectItem>
          {DEVIATION_TYPES.map((opt) => (
            <SelectItem key={opt.id} value={opt.id}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={values.facility}
        onValueChange={(v) => onChange("facility", v ?? '')}
      >
        <SelectTrigger className="w-48">
          <SelectValue placeholder="Facility" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All Facilities</SelectItem>
          {(facilities ?? []).map((opt) => (
            <SelectItem key={opt.id} value={opt.id}>
              {opt.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={onReset}>
          <RotateCcw className="size-4" />
          Reset
        </Button>
      )}
    </div>
  )
}

export { ComplianceFilters }
export type { ComplianceFiltersProps }
