import { useCallback, useEffect, useRef, useState } from "react"
import {
  Upload,
  FileSpreadsheet,
  TestTube,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  X,
  Search,
  Filter,
  Hash,
  Eye,
  Save,
  RotateCcw,
} from "lucide-react"

import { PageHeader } from "@/components/common/PageHeader"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/toast"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  getLabReports,
  getLabReportBatches,
  previewLabReports,
  confirmLabReports,
  type LabReport,
  type ImportBatch,
  type UploadResult,
  type PreviewRecord,
  type PreviewResult,
} from "@/services"
import { cn } from "@/lib/utils"
import { useNavigate } from "react-router-dom"

const MAX_FILE_BYTES = 25 * 1024 * 1024
const ACCEPTED_EXT = ".csv,.xlsx,.xls,.xlsm"

function statusTone(status: string): string {
  switch (status.toLowerCase()) {
    case "positive":
    case "reactive":
    case "failed":
      return "bg-destructive/10 text-destructive"
    case "passed":
    case "completed":
      return "bg-success/10 text-success"
    case "pending":
    case "processing":
      return "bg-muted text-muted-foreground"
    case "partial":
      return "bg-warning/10 text-warning"
    default:
      return "bg-muted text-muted-foreground"
  }
}

function formatValue(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "\u2014"
  return String(v)
}

function bytesLabel(n: number | null | undefined): string {
  if (!n) return "\u2014"
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  if (n >= 1024) return `${Math.round(n / 1024)} KB`
  return `${n} B`
}

function BatchStatusBadge({ status }: { status: string }) {
  return <Badge variant="outline" className={cn(statusTone(status))}>{status}</Badge>
}

function UploadResultBanner({ result }: { result: UploadResult }) {
  if (result.status === "failed") {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs text-destructive">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
        <div className="flex flex-col gap-1">
          <span className="font-semibold">
            {result.filename} could not be imported ({result.totalRows} row{result.totalRows === 1 ? "" : "s"} rejected)
          </span>
          {result.errors.map((e, i) => (
            <span key={i}>Row {e.sourceRow}: {e.error}</span>
          ))}
        </div>
      </div>
    )
  }
  return (
    <div className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/5 px-3 py-2.5 text-xs text-success">
      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
      <div>
        <span className="font-semibold">{result.filename} imported</span>
        <span className="text-muted-foreground">
          {" "}
          &middot; {result.successfulRows} of {result.totalRows} rows stored as {result.successfulRows}{" "}
          lab report{result.successfulRows === 1 ? "" : "s"}
        </span>
        {result.failedRows > 0 && (
          <span className="text-warning"> &middot; {result.failedRows} row{result.failedRows === 1 ? "" : "s"} skipped</span>
        )}
      </div>
    </div>
  )
}

function LabReportsPage() {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [reports, setReports] = useState<LabReport[]>([])
  const [total, setTotal] = useState(0)
  const [batches, setBatches] = useState<ImportBatch[]>([])
  const [loading, setLoading] = useState(true)
  const [recentBatchId, setRecentBatchId] = useState<string | null>(null)

  const loadReports = useCallback(async () => {
    setLoading(true)
    try {
      const [r, b] = await Promise.all([
        getLabReports({
          page: 1,
          pageSize: 100,
          search: search.trim() || undefined,
          status: statusFilter || undefined,
          batchId: recentBatchId ?? undefined,
        }),
        getLabReportBatches({ page: 1, pageSize: 10 }),
      ])
      setReports(r.data)
      setTotal(r.total)
      setBatches(b.data)
    } catch {
      toast.add({ title: "Failed to load lab reports", type: "error" })
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter, recentBatchId])

  useEffect(() => {
    loadReports()
  }, [loadReports])

  const acceptFile = useCallback((candidate: File | null | undefined) => {
    if (!candidate) return
    if (candidate.size > MAX_FILE_BYTES) {
      toast.add({ title: "File too large", description: "Uploads must be 25 MB or smaller.", type: "error" })
      return
    }
    const ext = candidate.name.toLowerCase().split(".").pop()
    if (!ACCEPTED_EXT.includes(`.${ext}`)) {
      toast.add({ title: "Unsupported file", description: "Upload a CSV or Excel (.xlsx/.xls/.xlsm) file.", type: "error" })
      return
    }
    setFile(candidate)
    setPreview(null)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragActive(false)
      acceptFile(e.dataTransfer.files?.[0])
    },
    [acceptFile],
  )

  const handlePreview = useCallback(async () => {
    if (!file || previewing) return
    setPreviewing(true)
    try {
      const res = await previewLabReports(file)
      setPreview(res)
      toast.add({
        title: "Preview ready",
        description: `${res.successfulRows} of ${res.totalRows} rows parsed successfully. Review before confirming.`,
        type: res.failedRows > 0 ? "warning" : "success",
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : "Preview failed. Please try again."
      toast.add({ title: "Preview failed", description: message, type: "error" })
    } finally {
      setPreviewing(false)
    }
  }, [file, previewing])

  const handleConfirm = useCallback(async () => {
    if (!preview || confirming) return
    setConfirming(true)
    try {
      const res = await confirmLabReports({
        records: preview.records,
        filename: preview.filename,
        fileSizeBytes: file?.size,
      })
      setRecentBatchId(res.batchId)
      setPreview(null)
      setFile(null)
      await loadReports()
      toast.add({
        title: "Lab reports confirmed",
        description: `${res.successfulRows} report${res.successfulRows === 1 ? "" : "s"} stored from ${res.filename}.`,
        type: "success",
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : "Confirm failed. Please try again."
      toast.add({ title: "Confirm failed", description: message, type: "error" })
    } finally {
      setConfirming(false)
    }
  }, [preview, confirming, file, loadReports])

  const handleClearPreview = useCallback(() => {
    setPreview(null)
    setFile(null)
  }, [])

  // Preview table with view action
  const renderPreviewTable = useCallback((records: PreviewRecord[]) => {
    const displayCols = [
      { key: "sampleReference", header: "Sample / Unit" },
      { key: "unitNumber", header: "CBU #" },
      { key: "testType", header: "Test Type" },
      { key: "testName", header: "Test Name" },
      { key: "resultValue", header: "Result" },
      { key: "resultUnit", header: "Unit" },
      { key: "status", header: "Status" },
      { key: "performedAt", header: "Date" },
      { key: "cordBloodUnitId", header: "Linked CBU" },
    ] as const

    return (
      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              {displayCols.map((col) => (
                <TableHead key={col.key} className="cursor-pointer hover:bg-muted/50">
                  {col.header}
                </TableHead>
              ))}
              <TableHead className="w-12">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={displayCols.length + 1} className="text-center text-muted-foreground py-8">
                  No preview records
                </TableCell>
              </TableRow>
            ) : (
              records.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium text-foreground">{formatValue(r.sampleReference || r.unitNumber)}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{formatValue(r.unitNumber)}</TableCell>
                  <TableCell>{formatValue(r.testType)}</TableCell>
                  <TableCell>{formatValue(r.testName)}</TableCell>
                  <TableCell>
                    {formatValue(r.resultValue)}
                    {r.resultUnit && <span className="text-muted-foreground ml-1">{r.resultUnit}</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatValue(r.resultUnit)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn(statusTone(r.status))}>{r.status}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.performedAt ? r.performedAt.slice(0, 10) : "\u2014"}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{formatValue(r.cordBloodUnitId)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => navigate(`/lab-reports/${r.id}`)} title="View details">
                      <Eye className="size-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    )
  }, [navigate])

  const remaining = total - reports.length

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Lab Reports"
        description="Upload CSV or Excel dumps of lab reports for collected samples, preview, then confirm to store"
      />

      <div className="grid w-full grid-cols-1 items-start gap-6 lg:grid-cols-[400px_1fr]">
        <Card size="sm" className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="size-4 text-primary" />
              Import lab reports
            </CardTitle>
            <CardDescription>CSV or Excel dump of lab results. Preview parsed rows, then confirm to persist.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_EXT}
              className="hidden"
              onChange={(e) => acceptFile(e.target.files?.[0])}
            />

            {file && !preview ? (
              <>
                <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
                    <FileSpreadsheet className="size-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {bytesLabel(file.size)} &middot; {file.type || "spreadsheet"}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Remove file"
                    onClick={() => setFile(null)}
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-background/90 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>

                <ul className="flex flex-col gap-1.5 rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
                  <li className="flex items-start gap-1.5">
                    <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-primary" />
                    <span>Known columns (sample, test, result, dates, etc.) map onto structured fields.</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <Hash className="mt-0.5 size-3 shrink-0 text-primary" />
                    <span>Any extra columns are preserved as report details &mdash; nothing is lost.</span>
                  </li>
                </ul>

                <div className="flex gap-2">
                  <Button size="xl" onClick={handlePreview} disabled={previewing} className="flex-1">
                    {previewing ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Parsing...
                      </>
                    ) : (
                      <>
                        <Upload className="size-4" />
                        Preview Import
                      </>
                    )}
                  </Button>
                  <Button size="xl" variant="outline" onClick={() => setFile(null)}>
                    <RotateCcw className="size-4" />
                    Clear
                  </Button>
                </div>
              </>
            ) : preview ? (
              <>
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
                      <FileSpreadsheet className="size-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{preview.filename}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {preview.totalRows} rows &middot; {preview.successfulRows} valid &middot; {preview.failedRows} errors &middot; {preview.linkedCbuCount} linked CBU{preview.linkedCbuCount !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={handleClearPreview} title="Discard preview">
                    <X className="size-3.5" />
                  </Button>
                </div>

                {preview.errors.length > 0 && (
                  <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
                    <p className="font-semibold mb-1">{preview.errors.length} row{preview.errors.length === 1 ? "" : "s"} with errors (will be skipped):</p>
                    <ul className="space-y-0.5 max-h-24 overflow-auto">
                      {preview.errors.slice(0, 10).map((e, i) => (
                        <li key={i}>Row {e.sourceRow}: {e.error}</li>
                      ))}
                      {preview.errors.length > 10 && <li>...and {preview.errors.length - 10} more</li>}
                    </ul>
                  </div>
                )}

                <div className="max-h-96 overflow-auto">
                  {renderPreviewTable(preview.records)}
                </div>

                <div className="flex gap-2 pt-2 border-t">
                  <Button size="xl" variant="outline" onClick={handleClearPreview} className="flex-1">
                    <RotateCcw className="size-4" />
                    Discard & Re-upload
                  </Button>
                  <Button size="xl" onClick={handleConfirm} disabled={confirming} className="flex-1">
                    {confirming ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="size-4" />
                        Confirm Import
                      </>
                    )}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDragActive(true)
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={handleDrop}
                  className={cn(
                    "flex h-40 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 text-center transition-colors",
                    dragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/40",
                  )}
                >
                  <Upload className="size-6 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">Drop a spreadsheet here or click to browse</span>
                  <span className="text-xs text-muted-foreground">CSV, XLSX, XLS or XLSM &middot; up to 25 MB</span>
                </button>

                <ul className="flex flex-col gap-1.5 rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
                  <li className="flex items-start gap-1.5">
                    <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-primary" />
                    <span>Known columns (sample, test, result, dates, etc.) map onto structured fields.</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <Hash className="mt-0.5 size-3 shrink-0 text-primary" />
                    <span>Any extra columns are preserved as report details &mdash; nothing is lost.</span>
                  </li>
                </ul>
              </>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          {batches.length > 0 && (
            <Card size="sm" className="border-border/60 shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm">Recent imports</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>File</TableHead>
                      <TableHead>Rows</TableHead>
                      <TableHead>Stored</TableHead>
                      <TableHead>Skipped</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>When</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {batches.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium text-foreground">{b.filename}</TableCell>
                        <TableCell>{b.totalRows}</TableCell>
                        <TableCell className="text-success">{b.successfulRows}</TableCell>
                        <TableCell className={b.failedRows ? "text-warning" : "text-muted-foreground"}>{b.failedRows}</TableCell>
                        <TableCell><BatchStatusBadge status={b.status} /></TableCell>
                        <TableCell className="text-muted-foreground">{b.completedAt ? b.completedAt.slice(0, 19).replace("T", " ") : "\u2014"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <Card size="sm" className="border-border/60 shadow-sm">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <TestTube className="size-4 text-primary" />
                    Imported lab reports
                  </CardTitle>
                  <Badge variant="outline" className="gap-1 text-muted-foreground">
                    {total}
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="relative">
                    <Search className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search sample, test..."
                      className="h-8 pl-7 text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Filter className="size-3.5 text-muted-foreground" />
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="h-8 rounded-lg border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <option value="">All statuses</option>
                      <option value="pending">Pending</option>
                      <option value="passed">Passed</option>
                      <option value="positive">Positive</option>
                      <option value="negative">Negative</option>
                      <option value="failed">Failed</option>
                    </select>
                  </div>
                </div>
              </div>
              <CardDescription>First {reports.length} reports &middot; every original column is retained per report</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {loading ? (
                <div className="flex h-32 flex-col items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="size-5 animate-spin" />
                  <span className="text-xs">Loading reports...</span>
                </div>
              ) : reports.length === 0 ? (
                <div className="flex h-40 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                  <TestTube className="size-6" />
                  <p className="text-xs">No lab reports yet. Upload a CSV or Excel file to get started.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sample / Unit</TableHead>
                      <TableHead>Test</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Result</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reports.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium text-foreground">{formatValue(r.sampleReference || r.unitNumber)}</TableCell>
                        <TableCell>{formatValue(r.testType)}</TableCell>
                        <TableCell>{formatValue(r.testName)}</TableCell>
                        <TableCell>
                          {formatValue(r.resultValue)}
                          {r.resultUnit && <span className="text-muted-foreground ml-1">{r.resultUnit}</span>}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{r.performedAt ? r.performedAt.slice(0, 10) : "\u2014"}</TableCell>
                        <TableCell className="text-muted-foreground">{r.sourceFilename}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => navigate(`/lab-reports/${r.id}`)} title="View details">
                            <Eye className="size-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {!loading && remaining > 0 && (
                <p className="mt-2 text-center text-[11px] text-muted-foreground">
                  +{remaining} more report{remaining === 1 ? "" : "s"} (filters apply to the stored set)
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export { LabReportsPage }
export default LabReportsPage