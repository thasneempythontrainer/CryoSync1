import { Search, RotateCcw } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface FilterDef {
  key: string
  label: string
  type: "select" | "date" | "search"
  placeholder?: string
  options?: Array<{ value: string; label: string }>
}

interface FilterBarProps {
  filters: FilterDef[]
  values: Record<string, string>
  onChange: (key: string, value: string) => void
  onReset?: () => void
  className?: string
}

function FilterBar({ filters, values, onChange, onReset, className }: FilterBarProps) {
  const hasActiveFilters = Object.values(values).some((v) => v !== "")

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded border border-border bg-card p-2",
        className
      )}
    >
      {filters.map((filter) => (
        <div key={filter.key} className="flex min-w-full sm:min-w-0 sm:flex-1">
          {filter.type === "search" ? (
            <div className="relative w-full">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder={filter.placeholder ?? filter.label}
                value={values[filter.key] ?? ""}
                onChange={(e) => onChange(filter.key, e.target.value)}
                className="h-10 w-full pl-8 sm:h-auto sm:w-48"
              />
            </div>
          ) : filter.type === "date" ? (
            <Input
              type="date"
              value={values[filter.key] ?? ""}
              onChange={(e) => onChange(filter.key, e.target.value)}
              className="h-10 w-full sm:h-auto sm:w-40"
            />
          ) : (
            <Select
              value={values[filter.key] ?? ""}
              onValueChange={(v) => onChange(filter.key, v ?? "")}
            >
              <SelectTrigger className="h-10 w-full sm:h-auto sm:w-40">
                <SelectValue placeholder={filter.placeholder ?? filter.label} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">{filter.placeholder ?? `All ${filter.label}`}</SelectItem>
                {filter.options?.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      ))}

      {hasActiveFilters && onReset && (
        <Button variant="ghost" size="sm" onClick={onReset}>
          <RotateCcw className="size-4" />
          Reset
        </Button>
      )}
    </div>
  )
}

export { FilterBar }
export type { FilterDef, FilterBarProps }
