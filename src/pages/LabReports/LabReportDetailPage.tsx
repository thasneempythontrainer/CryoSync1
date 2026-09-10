import { useEffect, useState } from "react"
import { useParams } from "react-router-dom"
import {
  ChevronLeft,
  FileSpreadsheet,
  TestTube,
  Loader2,
  Hash,
  User,
  Calendar,
  Database,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react"

import { PageHeader } from "@/components/common/PageHeader"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import { getLabReport, type LabReport } from "@/services"
import { cn } from "@/lib/utils"

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
    default:
      return "bg-muted text-muted-foreground"
  }
}

function formatValue(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "\u2014"
  return String(v)
}

function LabReportHeader({ report }: { report: LabReport }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
          <TestTube className="size-4 text-primary" />
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Report ID</p>
          <p className="font-mono text-sm font-medium text-foreground">{report.reportId}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-blue/10">
          <Database className="size-4 text-blue" />
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">CBU Link</p>
          <p className="font-mono text-sm font-medium text-foreground">{report.unitNumber || report.cordBloodUnitId || "\u2014"}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-amber/10">
          <Hash className="size-4 text-amber" />
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Sample</p>
          <p className="font-mono text-sm font-medium text-foreground">{report.sampleReference || "\u2014"}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3">
        <Badge variant="outline" className={cn(statusTone(report.status))}>
          {report.status}
        </Badge>
        <div className="ml-auto">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Status</p>
        </div>
      </div>
    </div>
  )
}

function DetailGrid({ report }: { report: LabReport }) {
  const fields = [
    { label: "Test Type", value: report.testType, icon: TestTube },
    { label: "Test Name", value: report.testName, icon: TestTube },
    { label: "Test Method", value: report.testMethod, icon: Database },
    { label: "Instrument", value: report.instrument, icon: Database },
    { label: "Result Value", value: report.resultValue, icon: Hash },
    { label: "Result Unit", value: report.resultUnit, icon: Hash },
    { label: "Result Text", value: report.resultText, icon: FileSpreadsheet },
    { label: "Reference Low", value: report.referenceLow, icon: AlertTriangle },
    { label: "Reference High", value: report.referenceHigh, icon: AlertTriangle },
    { label: "Reference Range", value: report.referenceText, icon: AlertTriangle },
    { label: "Performed At", value: report.performedAt ? report.performedAt.slice(0, 19).replace("T", " ") : null, icon: Calendar },
    { label: "Performed By", value: report.performedBy, icon: User },
    { label: "Reviewed By", value: report.reviewedBy, icon: User },
    { label: "Reviewed At", value: report.reviewedAt ? report.reviewedAt.slice(0, 19).replace("T", " ") : null, icon: Calendar },
    { label: "Review Notes", value: report.reviewNotes, icon: FileSpreadsheet },
  ].filter((f) => f.value)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <TestTube className="size-4 text-primary" />
          Test Details
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {fields.map((f) => (
            <div key={f.label} className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                <f.icon className="size-3" />
                <span>{f.label}</span>
              </div>
              <p className="text-sm font-medium text-foreground">{formatValue(f.value)}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function DetailsExpansion({ details }: { details: Record<string, string | number | null> }) {
  const entries = Object.entries(details ?? {}).filter(
    ([, v]) => v !== null && v !== undefined && v !== ""
  )

  if (entries.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Hash className="size-4 text-primary" />
            Additional Columns
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">No additional columns in this report.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Hash className="size-4 text-primary" />
          Additional Columns ({entries.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map(([k, v]) => (
            <div key={k} className="rounded-lg border bg-muted/30 p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</p>
              <p className="text-sm font-medium text-foreground">{String(v)}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function Provenance({ report }: { report: LabReport }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <FileSpreadsheet className="size-4 text-primary" />
          Source & Provenance
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Source File</p>
          <p className="font-mono text-sm font-medium text-foreground truncate">{report.sourceFilename}</p>
        </div>
        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Source Row</p>
          <p className="font-mono text-sm font-medium text-foreground">{report.sourceRow ?? "\u2014"}</p>
        </div>
        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Batch ID</p>
          <p className="font-mono text-sm font-medium text-foreground">{report.batchId}</p>
        </div>
        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Created</p>
          <p className="text-sm font-medium text-foreground">{report.createdAt?.slice(0, 19).replace("T", " ") || "\u2014"}</p>
        </div>
      </CardContent>
    </Card>
  )
}

export default function LabReportDetailPage() {
  const { reportId } = useParams<{ reportId: string }>()
  const [report, setReport] = useState<LabReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!reportId) {
      setError("Report ID not found")
      setLoading(false)
      return
    }
    let cancelled = false
    getLabReport(reportId)
      .then((data) => {
        if (!cancelled) setReport(data)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load report")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [reportId])

  if (loading) {
    return (
      <div className="flex flex-1 flex-col gap-5 p-5">
        <PageHeader title="Lab Report" description="Loading..." />
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      </div>
    )
  }

  if (error || !report) {
    return (
      <div className="flex flex-1 flex-col gap-5 p-5">
        <PageHeader title="Lab Report" description="Not found" />
        <div className="flex flex-col items-center justify-center h-64 text-center text-muted-foreground">
          <AlertTriangle className="size-10 text-destructive" />
          <p className="mt-2">{error || "Lab report not found"}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-5 p-5">
      <PageHeader
        title="Lab Report Detail"
        description={report.reportId}
      />
      <LabReportHeader report={report} />
      <Separator />
      <Tabs defaultValue="details" className="flex-1">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="details">Test Details</TabsTrigger>
          <TabsTrigger value="extras">Additional Columns</TabsTrigger>
          <TabsTrigger value="provenance">Provenance</TabsTrigger>
        </TabsList>
        <TabsContent value="details">
          <DetailGrid report={report} />
        </TabsContent>
        <TabsContent value="extras">
          <DetailsExpansion details={report.details} />
        </TabsContent>
        <TabsContent value="provenance">
          <Provenance report={report} />
        </TabsContent>
      </Tabs>
    </div>
  )
}