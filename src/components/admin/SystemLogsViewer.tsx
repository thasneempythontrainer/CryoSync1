import { useState, useRef, useEffect, useCallback } from "react"
import { motion } from "framer-motion"
import { Terminal, FileText, RefreshCw, ChevronDown } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { LoadingState } from "@/components/common/LoadingState"
import { ErrorState } from "@/components/common/ErrorState"
import { useSystemLogs } from "@/services/system-service"
import { formatDateTime } from "@/utils/formatters"
import { cn } from "@/lib/utils"

const logLevels = ["info", "warning", "error"] as const
const services = [
  "API Gateway", "Database", "Temperature Monitoring",
  "Notification Service", "Analytics Engine", "Authentication", "Storage Sensors",
] as const

const levelStyles: Record<string, string> = {
  info: "bg-primary/10 text-primary",
  warning: "bg-warning/10 text-warning",
  error: "bg-danger/10 text-danger",
}

interface LogEntry {
  id: string
  timestamp: string
  level: string
  service: string
  message: string
}

function SystemLogsViewer() {
  const [page, setPage] = useState(1)
  const [level, setLevel] = useState<string>("all")
  const [service, setService] = useState<string>("all")
  const pageSize = 25

  const params: Record<string, string> = {
    page: String(page),
    pageSize: String(pageSize),
  }
  if (level !== "all") params.level = level
  if (service !== "all") params.service = service

  const { data, isLoading, isError, refetch } = useSystemLogs(params)
  const logs: LogEntry[] = data?.data ?? []
  const total: number = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const tableRef = useRef<HTMLDivElement>(null)
  const prevLengthRef = useRef(logs.length)

  useEffect(() => {
    if (logs.length > prevLengthRef.current && tableRef.current) {
      tableRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" })
    }
    prevLengthRef.current = logs.length
  }, [logs.length])

  const handleLevelChange = useCallback((value: string | null) => {
    setLevel(value ?? '')
    setPage(1)
  }, [])

  const handleServiceChange = useCallback((value: string | null) => {
    setService(value ?? '')
    setPage(1)
  }, [])

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>System Logs</CardTitle>
            <CardDescription>Platform activity and event log</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
            <RefreshCw className="size-3.5" />
            Refresh
          </Button>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Terminal className="size-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Level:</span>
            <Select value={level} onValueChange={handleLevelChange}>
              <SelectTrigger className="h-7 w-24 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                {logLevels.map((l) => (
                  <SelectItem key={l} value={l} className="capitalize">{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1.5">
            <FileText className="size-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Service:</span>
            <Select value={service} onValueChange={handleServiceChange}>
              <SelectTrigger className="h-7 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Services</SelectItem>
                {services.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <LoadingState variant="skeleton" />
        ) : isError ? (
          <ErrorState
            title="Failed to load logs"
            description="Could not retrieve system logs. Please try again."
            onRetry={() => refetch()}
          />
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12">
            <Terminal className="size-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">No log entries found</p>
          </div>
        ) : (
          <>
            <div ref={tableRef} className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-40">Timestamp</TableHead>
                    <TableHead className="w-20">Level</TableHead>
                    <TableHead className="w-36">Service</TableHead>
                    <TableHead>Message</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log, i) => (
                    <motion.tr
                      key={log.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.015, duration: 0.2 }}
                      className="group border-b border-border transition-colors hover:bg-muted/30"
                    >
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateTime(log.timestamp)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn("text-[10px] font-medium uppercase leading-none", levelStyles[log.level])}
                        >
                          {log.level}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-medium text-foreground">
                        {log.service}
                      </TableCell>
                      <TableCell className="max-w-md truncate text-xs text-muted-foreground">
                        {log.message}
                      </TableCell>
                    </motion.tr>
                  ))}
                </TableBody>
              </Table>
            </div>

            {total > pageSize && (
              <div className="flex items-center justify-between border-t border-border px-4 py-3">
                <span className="text-xs text-muted-foreground">
                  Page {page} of {totalPages} ({total} entries)
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="xs"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

export { SystemLogsViewer }
