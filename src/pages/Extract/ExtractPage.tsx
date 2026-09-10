import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  Upload,
  FileText,
  Scan,
  Sparkles,
  Copy,
  Download,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  X,
  ShieldCheck,
  Crosshair,
  BarChart3,
} from "lucide-react"

import { PageHeader } from "@/components/common/PageHeader"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/toast"
import {
  extractFormData,
  compareExtractModes,
  stageReceivingPrefill,
  type ExtractedField,
  type ExtractFormResult,
  type ExtractModeComparison,
} from "@/services"
import { cn } from "@/lib/utils"
import { EVALUATION, type EvaluationData } from "./evaluation-data"

const MAX_FILE_BYTES = 12 * 1024 * 1024
const ACCEPTED_TYPES = "image/png,image/jpeg,image/webp,application/pdf"

const DOCUMENT_TYPES = [
  { value: "auto", label: "Auto-detect" },
  { value: "packing_slip", label: "Packing slip" },
  { value: "shipping_label", label: "Shipping label" },
  { value: "bill_of_lading", label: "Bill of lading" },
  { value: "certificate_of_analysis", label: "Certificate of analysis" },
]

const SECTION_ORDER = ["shipment", "parties", "product", "compliance"] as const
const SECTION_TITLES: Record<string, string> = {
  shipment: "Shipment Details",
  parties: "Parties & Route",
  product: "Product",
  compliance: "Compliance",
}

const MODE_COMPARISON: { label: string; standard: string; precision: string }[] = [
  { label: "Field values", standard: "From a single reading", precision: "Confirmed by 2nd pass" },
  { label: "Confidence score", standard: "As first read", precision: "Raised when passes agree" },
  { label: "Verified shield", standard: "\u2014", precision: "On confirmed fields" },
  { label: "Misread values", standard: "Stand as-is", precision: "Auto-corrected + warning" },
  { label: "Needs-review flags", standard: "Confidence below 70%", precision: "Also after corrections" },
  { label: "Warnings panel", standard: "Enum issues only", precision: "+ verification notes" },
]

type FieldValues = Record<string, string | number | boolean | null>

function ToggleSwitch({
  label,
  description,
  checked,
  onChange,
}: {
  label: React.ReactNode
  description?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="group flex cursor-pointer items-start gap-3">
      <div
        data-checked={checked}
        className="relative mt-0.5 h-6 w-10 shrink-0 rounded-full border border-input bg-input/30 transition-colors data-[checked=true]:bg-primary"
      >
        <div
          data-checked={checked}
          className="absolute top-0.5 left-0.5 h-4.5 w-4.5 rounded-full bg-white shadow-sm transition-transform data-[checked=true]:translate-x-4"
        />
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
      </div>
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {description && (
          <span className="text-xs text-muted-foreground">{description}</span>
        )}
      </span>
    </label>
  )
}

function confidenceTone(confidence: number): string {
  if (confidence >= 0.85) return "bg-success/10 text-success"
  if (confidence >= 0.7) return "bg-warning/10 text-warning"
  return "bg-destructive/10 text-destructive"
}

function formatFieldValue(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined || v === "") return "\u2014"
  if (typeof v === "boolean") return v ? "Yes" : "No"
  return String(v)
}

function ConfidenceBadge({ field }: { field: ExtractedField }) {
  if (field.value === null || field.value === "") {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        not found
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className={cn("gap-1 tabular-nums", confidenceTone(field.confidence))}>
      {field.verified ? <ShieldCheck className="size-3" /> : null}
      {Math.round(field.confidence * 100)}%
    </Badge>
  )
}

function FieldEditor({
  field,
  value,
  onChange,
}: {
  field: ExtractedField
  value: string | number | boolean | null
  onChange: (v: string | number | boolean | null) => void
}) {
  const title = [
    field.evidence ? `Evidence: "${field.evidence}"` : null,
    field.needsReview ? "Low confidence - please review" : null,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-lg border p-3 transition-colors",
        field.needsReview
          ? "border-warning/40 bg-warning/[0.04]"
          : "border-border bg-transparent",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
          {field.label}
          {field.needsReview && <AlertTriangle className="size-3 text-warning" />}
        </label>
        <ConfidenceBadge field={field} />
      </div>

      {field.type === "boolean" ? (
        <ToggleSwitch
          label={value ? "Yes" : "No"}
          checked={Boolean(value)}
          onChange={(v) => onChange(v)}
        />
      ) : field.type === "enum" && field.options?.length ? (
        <select
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value || null)}
          title={title}
          className={cn(
            "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none",
            "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
            !value && "text-muted-foreground",
          )}
        >
          <option value="">Not specified</option>
          {field.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : (
        <Input
          value={value === null || value === undefined ? "" : String(value)}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Not found in document"
          title={title}
          className="h-8"
        />
      )}

      {field.evidence && (
        <p className="truncate text-[11px] text-muted-foreground/80 italic" title={field.evidence}>
          &ldquo;{field.evidence}&rdquo;
        </p>
      )}
    </div>
  )
}

function ModeComparison({ selected }: { selected: "standard" | "precision" }) {
  return (
    <div className="mt-3 border-t pt-3">
      <table className="w-full text-[11px]">
        <thead>
          <tr>
            <th className="pb-1 text-left font-medium text-muted-foreground" aria-label="Attribute" />
            <th
              className={cn(
                "pb-1 text-left font-semibold",
                selected === "standard" ? "text-primary" : "text-muted-foreground",
              )}
            >
              Standard
            </th>
            <th
              className={cn(
                "pb-1 text-left font-semibold",
                selected === "precision" ? "text-primary" : "text-muted-foreground",
              )}
            >
              Precision
            </th>
          </tr>
        </thead>
        <tbody>
          {MODE_COMPARISON.map((row) => (
            <tr key={row.label} className="border-t border-border/60">
              <td className="py-1 pr-2 align-top text-muted-foreground">{row.label}</td>
              <td
                className={cn(
                  "py-1 pr-2 align-top",
                  selected === "standard" ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {row.standard}
              </td>
              <td
                className={cn(
                  "py-1 align-top",
                  selected === "precision" ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {row.precision}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MetricBars({
  label,
  standard,
  precision,
  format = (v) => String(v),
}: {
  label: string
  standard: number
  precision: number
  format?: (v: number) => string
}) {
  const max = Math.max(standard, precision, 1)
  const row = (name: string, value: number, strong: boolean) => (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-[10px] text-muted-foreground">{name}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            strong ? "bg-primary" : "bg-primary/40",
          )}
          style={{ width: `${Math.max(2, (value / max) * 100)}%` }}
        />
      </div>
      <span className="w-12 shrink-0 text-right text-[11px] font-medium tabular-nums">
        {format(value)}
      </span>
    </div>
  )
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {row("Standard", standard, false)}
      {row("Precision", precision, true)}
    </div>
  )
}

function ComparisonCard({ comparison }: { comparison: ExtractModeComparison }) {
  const { standard, precision } = comparison
  const count = (r: ExtractFormResult, pred: (f: ExtractedField) => boolean) =>
    r.fields.filter(pred).length
  const nonNull = (f: ExtractedField) => f.value !== null
  const fieldsTotal = standard.metrics?.fieldsTotal ?? standard.fields.length
  const latency = (r: ExtractFormResult & { elapsedMs?: number }) =>
    (r.metrics?.elapsedMs ?? r.elapsedMs ?? 0) / 1000
  const evChecked = (standard.metrics?.evidenceChecked ?? 0) + (precision.metrics?.evidenceChecked ?? 0)

  return (
    <Card size="sm" className="w-full border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle>Mode quality comparison</CardTitle>
        <CardDescription>
          The same document extracted back-to-back with both modes
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="grid gap-x-10 gap-y-5 sm:grid-cols-2">
          <MetricBars
            label="Overall confidence"
            standard={standard.overallConfidence * 100}
            precision={precision.overallConfidence * 100}
            format={(v) => `${Math.round(v)}%`}
          />
          <MetricBars
            label={`Fields extracted (of ${fieldsTotal})`}
            standard={count(standard, nonNull)}
            precision={count(precision, nonNull)}
          />
          <MetricBars
            label="Verified fields"
            standard={count(standard, (f) => Boolean(f.verified) && nonNull(f))}
            precision={count(precision, (f) => Boolean(f.verified) && nonNull(f))}
          />
          <MetricBars
            label="Flagged for review"
            standard={count(standard, (f) => Boolean(f.needsReview))}
            precision={count(precision, (f) => Boolean(f.needsReview))}
          />
          <MetricBars
            label="Warnings / corrections"
            standard={standard.warnings.length}
            precision={precision.warnings.length}
          />
          <MetricBars
            label="Latency (seconds)"
            standard={latency(standard)}
            precision={latency(precision)}
            format={(v) => `${v.toFixed(1)}s`}
          />
          {evChecked > 0 && (
            <MetricBars
              label="Evidence quotes verified"
              standard={
                ((standard.metrics?.evidenceVerified ?? 0) /
                  Math.max(1, standard.metrics?.evidenceChecked ?? 0)) *
                100
              }
              precision={
                ((precision.metrics?.evidenceVerified ?? 0) /
                  Math.max(1, precision.metrics?.evidenceChecked ?? 0)) *
                100
              }
              format={(v) => `${Math.round(v)}%`}
            />
          )}
        </div>

        {comparison.valueDifferences.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-foreground">
              Values that differed between modes ({comparison.valueDifferences.length})
            </p>
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                    <th className="px-3 py-1.5 font-medium">Field</th>
                    <th className="px-3 py-1.5 font-medium">Standard</th>
                    <th className="px-3 py-1.5 font-medium">Precision</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.valueDifferences.map((d) => (
                    <tr key={d.key} className="border-b last:border-b-0">
                      <td className="px-3 py-1.5 font-medium text-foreground">{d.label}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{formatFieldValue(d.standard)}</td>
                      <td className="px-3 py-1.5 text-foreground">{formatFieldValue(d.precision)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function EvalBar({ label, value, right }: { label: string; value: number; right?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-32 shrink-0 truncate text-[11px] text-muted-foreground" title={label}>
        {label}
      </span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            value >= 0.95 ? "bg-success" : value >= 0.85 ? "bg-warning" : "bg-destructive",
          )}
          style={{ width: `${Math.max(2, value * 100)}%` }}
        />
      </div>
      <span className="w-10 shrink-0 text-right text-[11px] font-medium tabular-nums">
        {right ?? `${Math.round(value * 100)}%`}
      </span>
    </div>
  )
}

function EvalStat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className={cn("text-lg font-semibold tabular-nums", tone ?? "text-foreground")}>{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
    </div>
  )
}

function EvaluationCard({ data }: { data: EvaluationData }) {
  const { headline } = data
  const cal = [...data.calibration].filter((c) => c.total > 0)
  const allCrossOk = data.crossPage.length > 0 && data.crossPage.every((c) => c.correct)

  return (
    <Card size="sm" className="w-full border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle>Extraction quality evaluation</CardTitle>
        <CardDescription>
          Measured {data.generatedAt} on a {data.corpusDocs}-document ground-truth corpus against
          the production endpoint &middot; rerun with{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[10px]">
            python backend/evaluate_extract.py
          </code>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <EvalStat
            label="Standard mode accuracy"
            value={`${Math.round(headline.standardAccuracy * 100)}%`}
          />
          <EvalStat
            label="Precision mode accuracy"
            value={`${Math.round(headline.precisionAccuracy * 100)}%`}
            tone="text-primary"
          />
          <EvalStat
            label="Evidence quotes verified"
            value={
              data.citations.rate !== null
                ? `${data.citations.verified}/${data.citations.withEvidence}`
                : "n/a"
            }
            tone="text-success"
          />
          <EvalStat
            label="Avg latency (std / precision)"
            value={`${headline.standardLatencySec}s / ${headline.precisionLatencySec}s`}
          />
        </div>

        <div className="grid gap-x-10 gap-y-6 lg:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold text-foreground">Accuracy by business-critical field</p>
            {data.fields.map((f) => (
              <EvalBar key={f.key} label={f.label} value={f.accuracy} />
            ))}
          </div>

          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-semibold text-foreground">By document type</p>
              {data.groups.map((g) => (
                <EvalBar key={g.group} label={`${g.group} (${g.docs})`} value={g.accuracy} />
              ))}
            </div>

            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-semibold text-foreground">Confidence calibration</p>
              {cal.length ? (
                cal.map((c) => (
                  <EvalBar
                    key={c.bucket}
                    label={`stated ${c.bucket}`}
                    value={c.accuracy ?? 0}
                    right={`${c.total} fields`}
                  />
                ))
              ) : (
                <p className="text-[11px] text-muted-foreground">No low-confidence fields observed.</p>
              )}
            </div>

            {data.failures.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-semibold text-foreground">Observed misses (standard mode)</p>
                <div className="overflow-hidden rounded-lg border">
                  <table className="w-full text-[11px]">
                    <tbody>
                      {data.failures.slice(0, 6).map((f) => (
                        <tr key={`${f.doc}-${f.field}`} className="border-b last:border-b-0">
                          <td className="px-2 py-1.5 font-medium text-foreground">{f.label}</td>
                          <td className="px-2 py-1.5 text-muted-foreground" title={f.doc}>
                            {f.doc.replace(/^(\d+)-.*$/, "$1")}
                          </td>
                          <td className="px-2 py-1.5 text-success">expected &ldquo;{f.expected}&rdquo;</td>
                          <td className="px-2 py-1.5 text-destructive">
                            got {f.actual === "None" ? "null" : `&ldquo;${f.actual}&rdquo;`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {data.missCount > data.failures.length && (
                  <p className="text-[10px] text-muted-foreground">
                    +{data.missCount - data.failures.length} more in the full report
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          {data.missCount > 0 && (
            <Badge variant="outline" className="text-warning">
              {data.missCount} field{data.missCount === 1 ? "" : "s"} missed on first pass
            </Badge>
          )}
          {allCrossOk && (
            <Badge variant="outline" className="gap-1 text-success">
              <CheckCircle2 className="size-3" />
              Cross-page fields all resolved
            </Badge>
          )}
          {data.amendment.standardResolved && (
            <Badge variant="outline" className="gap-1 text-success">
              <CheckCircle2 className="size-3" />
              Amendment conflict resolved (standard)
            </Badge>
          )}
          {data.amendment.precisionResolved && (
            <Badge variant="outline" className="gap-1 text-success">
              <CheckCircle2 className="size-3" />
              Amendment conflict resolved (precision)
            </Badge>
          )}
          {data.exceptions.every((x) => x.outcome === "rejected") && (
            <Badge variant="outline" className="gap-1 text-success">
              <ShieldCheck className="size-3" />
              All malformed inputs rejected safely
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background px-2.5 py-1.5">
      <p className="text-sm font-semibold tabular-nums text-foreground">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  )
}

function RunMetrics({ result }: { result: ExtractFormResult }) {
  const m = result.metrics
  if (!m) return null

  const total = m.fieldsTotal ?? result.fields.length
  const found = m.fieldsFound ?? result.fields.filter((f) => f.value !== null).length
  const buckets = m.confidenceBuckets ?? { high: 0, medium: 0, low: 0 }
  const bucketTotal = Math.max(1, buckets.high + buckets.medium + buckets.low)
  const evChecked = m.evidenceChecked ?? 0
  const evVerified = m.evidenceVerified ?? 0
  const pages = m.pages ?? 0

  const perPage: Record<number, string[]> = {}
  for (const [key, page] of Object.entries(m.fieldPages ?? {})) {
    const label = result.fields.find((f) => f.key === key)?.label ?? key
    ;(perPage[page] ??= []).push(label)
  }

  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-foreground">Run metrics</p>
        <span className="text-[10px] text-muted-foreground">
          measured from this extraction
        </span>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MiniStat label="Total time" value={`${((m.elapsedMs ?? 0) / 1000).toFixed(1)}s`} />
        <MiniStat label="Model time" value={`${((m.modelMs ?? 0) / 1000).toFixed(1)}s`} />
        {(m.renderMs ?? 0) > 0 && (
          <MiniStat label="PDF render" value={`${m.renderMs}ms`} />
        )}
        {pages > 1 && <MiniStat label="Pages read" value={String(pages)} />}
        {result.mode === "precision" && (
          <MiniStat label="Corrections made" value={String(m.corrections ?? 0)} />
        )}
      </div>

      <div className="mt-3 flex flex-col gap-2.5">
        <div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Field completeness</span>
            <span className="font-medium tabular-nums text-foreground">
              {found}/{total}
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${Math.max(2, (found / Math.max(1, total)) * 100)}%` }}
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Evidence traceability</span>
            <span className="font-medium tabular-nums text-foreground">
              {evChecked > 0 ? `${evVerified}/${evChecked} quotes verified` : "n/a"}
            </span>
          </div>
          {evChecked > 0 ? (
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  evVerified === evChecked ? "bg-success" : "bg-warning",
                )}
                style={{ width: `${Math.max(2, (evVerified / evChecked) * 100)}%` }}
              />
            </div>
          ) : (
            <p className="mt-1 text-[10px] text-muted-foreground">
              Image scans have no text layer - quotes can't be auto-checked.
            </p>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Confidence distribution</span>
            <span className="font-medium tabular-nums text-foreground">
              {buckets.high} high &middot; {buckets.medium} med &middot; {buckets.low} low
            </span>
          </div>
          <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="bg-success" style={{ width: `${(buckets.high / bucketTotal) * 100}%` }} />
            <div className="bg-warning" style={{ width: `${(buckets.medium / bucketTotal) * 100}%` }} />
            <div className="bg-destructive" style={{ width: `${(buckets.low / bucketTotal) * 100}%` }} />
          </div>
        </div>

        {pages > 1 && Object.keys(perPage).length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <span className="text-[11px] text-muted-foreground">Fields sourced from:</span>
            {Object.entries(perPage)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([page, labels]) => (
                <Badge
                  key={page}
                  variant="outline"
                  className="text-[10px] font-normal text-muted-foreground"
                  title={labels.join(", ")}
                >
                  p{page} &middot; {labels.length} {labels.length === 1 ? "field" : "fields"}
                </Badge>
              ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ExtractPage() {
  const navigate = useNavigate()
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [docType, setDocType] = useState("auto")
  const [precisionMode, setPrecisionMode] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ExtractFormResult | null>(null)
  const [values, setValues] = useState<FieldValues>({})
  const [comparing, setComparing] = useState(false)
  const [comparison, setComparison] = useState<ExtractModeComparison | null>(null)
  const [compareError, setCompareError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const acceptFile = useCallback(
    (candidate: File | null | undefined) => {
      if (!candidate) return
      if (candidate.size > MAX_FILE_BYTES) {
        toast.add({
          title: "File too large",
          description: "Documents must be 12 MB or smaller.",
          type: "error",
        })
        return
      }
      if (!/^image\/(png|jpe?g|webp)$/.test(candidate.type) && candidate.type !== "application/pdf") {
        toast.add({
          title: "Unsupported file",
          description: "Upload a PNG, JPEG, WebP image or a PDF document.",
          type: "error",
        })
        return
      }
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setFile(candidate)
      setPreviewUrl(candidate.type.startsWith("image/") ? URL.createObjectURL(candidate) : null)
      setResult(null)
      setValues({})
      setError(null)
      setComparison(null)
      setCompareError(null)
    },
    [previewUrl],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragActive(false)
      acceptFile(e.dataTransfer.files?.[0])
    },
    [acceptFile],
  )

  const readFileAsBase64 = (f: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = String(reader.result ?? "")
        resolve(dataUrl.slice(dataUrl.indexOf(",") + 1))
      }
      reader.onerror = () => reject(new Error("Could not read the file"))
      reader.readAsDataURL(f)
    })

  const buildParams = useCallback(async () => {
    if (!file) return null
    const dataBase64 = await readFileAsBase64(file)
    // Some drag-drop sources report an empty file.type; the backend sniffs
    // content, but give it the right hint from the extension when we can.
    const mimeType =
      file.type ||
      (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream")
    return {
      fileName: file.name,
      mimeType,
      dataBase64,
      documentType: docType !== "auto" ? docType : undefined,
    }
  }, [file, docType])

  const handleExtract = useCallback(async () => {
    if (!file || extracting) return
    const params = await buildParams()
    if (!params) return
    setExtracting(true)
    setError(null)
    try {
      const res = await extractFormData({ ...params, precisionMode })
      setResult(res)
      const next: FieldValues = {}
      for (const f of res.fields) next[f.key] = f.value
      setValues(next)
      toast.add({
        title: precisionMode ? "Precision extraction complete" : "Extraction complete",
        description: `${res.fields.filter((f) => f.value !== null).length} fields extracted at ${Math.round(res.overallConfidence * 100)}% average confidence.`,
        type: "success",
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : "Extraction failed. Please try again."
      setError(message)
    } finally {
      setExtracting(false)
    }
  }, [file, extracting, precisionMode, buildParams])

  const handleCompare = useCallback(async () => {
    if (!file || comparing) return
    const params = await buildParams()
    if (!params) return
    setComparing(true)
    setCompareError(null)
    try {
      const res = await compareExtractModes(params)
      setComparison(res)
      const diff = res.valueDifferences.length
      toast.add({
        title: "Mode comparison ready",
        description:
          diff > 0
            ? `Precision corrected or changed ${diff} value${diff === 1 ? "" : "s"} vs Standard.`
            : "Both modes agreed on every extracted value.",
        type: "success",
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : "Comparison failed. Please try again."
      setCompareError(message)
    } finally {
      setComparing(false)
    }
  }, [file, comparing, buildParams])

  const handleCopyJson = useCallback(async () => {
    if (!result) return
    try {
      await navigator.clipboard.writeText(JSON.stringify(values, null, 2))
      toast.add({ title: "Copied", description: "Extracted JSON copied to clipboard.", type: "success" })
    } catch {
      toast.add({ title: "Copy failed", description: "Clipboard access was denied.", type: "error" })
    }
  }, [result, values])

  const handleDownloadJson = useCallback(() => {
    if (!result) return
    const blob = new Blob([JSON.stringify(values, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `cryosync-extract-${Date.now()}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }, [result, values])

  const handleUseInReceiving = useCallback(() => {
    if (!result) return
    stageReceivingPrefill(result, values)
    toast.add({
      title: "Staged for receiving",
      description: "Fields will prefill the New Intake form.",
      type: "success",
    })
    navigate("/receiving")
  }, [result, values, navigate])

  const reviewCount = result?.fields.filter((f) => f.needsReview).length ?? 0
  const verifiedCount = result?.fields.filter((f) => f.verified && f.value !== null).length ?? 0

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="AI Extract"
        description="Turn shipping documents into structured form data with precision AI extraction"
      />

      <div className="grid w-full grid-cols-1 items-start gap-6 lg:grid-cols-[380px_1fr]">
        <Card size="sm" className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle>Source Document</CardTitle>
            <CardDescription>Upload a packing slip, shipping label, or bill of lading</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_TYPES}
              className="hidden"
              onChange={(e) => acceptFile(e.target.files?.[0])}
            />

            {file ? (
              <div className="relative overflow-hidden rounded-lg border border-border bg-muted/30">
                {previewUrl ? (
                  <img src={previewUrl} alt={file.name} className="max-h-64 w-full object-contain" />
                ) : (
                  <div className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
                    <FileText className="size-8" />
                    <span className="text-xs">{file.name}</span>
                    <span className="text-[11px]">
                      {file.type === "application/pdf" ? "PDF · all pages will be read" : file.type}
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  aria-label="Remove file"
                  onClick={() => {
                    if (previewUrl) URL.revokeObjectURL(previewUrl)
                    setFile(null)
                    setPreviewUrl(null)
                    setResult(null)
                  }}
                  className="absolute top-2 right-2 inline-flex size-6 items-center justify-center rounded-full bg-background/90 text-muted-foreground shadow-sm transition-colors hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ) : (
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
                  "flex h-44 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 text-center transition-colors",
                  dragActive
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50 hover:bg-muted/40",
                )}
              >
                <Upload className="size-6 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">
                  Drop a document here or click to browse
                </span>
                <span className="text-xs text-muted-foreground">
                  PNG, JPEG, WebP or PDF (single or multi-page) · up to 12 MB
                </span>
              </button>
            )}

            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-muted-foreground">Document type</label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {DOCUMENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-lg border p-3">
              <ToggleSwitch
                label={
                  <span className="flex items-center gap-1.5">
                    <Crosshair className="size-3.5 text-primary" />
                    Precision Mode
                  </span>
                }
                checked={precisionMode}
                onChange={setPrecisionMode}
              />
              <ModeComparison selected={precisionMode ? "precision" : "standard"} />
            </div>

            <Button
              size="xl"
              onClick={handleExtract}
              disabled={!file || extracting || comparing}
              className="w-full"
            >
              {extracting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {precisionMode ? "Running precision pass..." : "Extracting..."}
                </>
              ) : (
                <>
                  <Sparkles className="size-4" />
                  Extract form data
                </>
              )}
            </Button>

            <Button
              variant="outline"
              size="xl"
              onClick={handleCompare}
              disabled={!file || extracting || comparing}
              className="w-full"
            >
              {comparing ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Running both modes...
                </>
              ) : (
                <>
                  <BarChart3 className="size-4" />
                  Compare both modes
                </>
              )}
            </Button>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {compareError && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span>{compareError}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card size="sm" className="min-h-[420px] border-border/60 shadow-sm">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>Extracted Data</CardTitle>
                <CardDescription>
                  {result
                    ? `Detected ${result.documentType.replace(/_/g, " ")} · ${result.mode} mode`
                    : "Review and correct extracted values before applying them"}
                </CardDescription>
              </div>
              {result && (
                <div className="flex items-center gap-1.5">
                  {(result.pages ?? 0) > 1 && (
                    <Badge variant="outline" className="gap-1 text-muted-foreground">
                      <FileText className="size-3" />
                      {result.pages} pages
                    </Badge>
                  )}
                  {result.mode === "precision" && (
                    <Badge variant="outline" className="gap-1 text-primary">
                      <Crosshair className="size-3" />
                      Precision
                    </Badge>
                  )}
                  {verifiedCount > 0 && (
                    <Badge variant="outline" className="gap-1 text-success">
                      <ShieldCheck className="size-3" />
                      {verifiedCount} verified
                    </Badge>
                  )}
                  {reviewCount > 0 && (
                    <Badge variant="outline" className="gap-1 text-warning">
                      <AlertTriangle className="size-3" />
                      {reviewCount} need review
                    </Badge>
                  )}
                </div>
              )}
            </div>

            {result && (
              <div className="mt-2 flex items-center gap-3">
                <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      result.overallConfidence >= 0.85
                        ? "bg-success"
                        : result.overallConfidence >= 0.7
                          ? "bg-warning"
                          : "bg-destructive",
                    )}
                    style={{ width: `${Math.round(result.overallConfidence * 100)}%` }}
                  />
                </div>
                <span className="shrink-0 text-xs font-semibold tabular-nums text-foreground">
                  {Math.round(result.overallConfidence * 100)}% avg confidence
                </span>
              </div>
            )}
          </CardHeader>

          <CardContent>
            {!result && !extracting && (
              <div className="flex h-72 flex-col items-center justify-center gap-3 text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                  <Scan className="size-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">No extraction yet</p>
                  <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">
                    Upload a document and press &ldquo;Extract form data&rdquo;. Enable
                    Precision Mode for verified, review-ready output.
                  </p>
                </div>
              </div>
            )}

            {extracting && (
              <div className="flex h-72 flex-col items-center justify-center gap-3">
                <Loader2 className="size-6 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">
                  {precisionMode
                    ? "Reading document, then verifying every field..."
                    : "Reading document..."}
                </p>
              </div>
            )}

            {result && !extracting && (
              <div className="flex flex-col gap-5">
                <RunMetrics result={result} />

                {result.warnings.length > 0 && (
                  <div className="rounded-lg border border-warning/30 bg-warning/[0.06] px-3 py-2.5">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-warning">
                      <AlertTriangle className="size-3.5" />
                      Verification notes
                    </div>
                    <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-xs text-muted-foreground">
                      {result.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {SECTION_ORDER.map((section) => {
                  const fields = result.fields.filter((f) => f.section === section)
                  if (!fields.length) return null
                  return (
                    <div key={section} className="flex flex-col gap-2.5">
                      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                        {SECTION_TITLES[section]}
                      </h3>
                      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                        {fields.map((f) => (
                          <FieldEditor
                            key={f.key}
                            field={f}
                            value={values[f.key] ?? null}
                            onChange={(v) => setValues((prev) => ({ ...prev, [f.key]: v }))}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}

                <div className="sticky bottom-0 -mx-(--card-spacing) flex flex-wrap items-center justify-end gap-2 border-t bg-background/95 px-(--card-spacing) py-3 backdrop-blur-md">
                  <CheckCircle2 className="mr-auto hidden size-4 text-success sm:block" />
                  <Button variant="outline" size="sm" onClick={handleCopyJson}>
                    <Copy className="size-3.5" />
                    Copy JSON
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleDownloadJson}>
                    <Download className="size-3.5" />
                    Download
                  </Button>
                  <Button size="sm" onClick={handleUseInReceiving}>
                    Use in Receiving
                    <ArrowRight className="size-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {comparison && !comparing && <ComparisonCard comparison={comparison} />}

      <EvaluationCard data={EVALUATION} />
    </div>
  )
}

export { ExtractPage }
export default ExtractPage
