import { useCallback, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { motion } from "framer-motion"
import {
  Siren,
  Thermometer,
  FileText,
  Activity,
  Package,
  ShieldCheck,
  AlertTriangle,
  User,
  Loader2,
  CheckCircle2,
  ArrowRight,
} from "lucide-react"

import { PageHeader } from "@/components/common/PageHeader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/components/ui/toast"
import { Separator } from "@/components/ui/separator"
import { useCreateComplianceIncident } from "@/services/compliance-service"
import { useFacilities } from "@/services/reference-service"
import { useAuth } from "@/hooks"
import { formatCategory } from "@/utils/formatters"
import { cn } from "@/lib/utils"
import type { DeviationType, ComplianceSeverity } from "@/types"

const reportSchema = z.object({
  title: z.string().min(1, "A short title is required").max(140, "Keep the title under 140 characters"),
  description: z.string().min(10, "Describe what happened (at least 10 characters)"),
  deviationType: z.string().min(1, "Select a deviation type"),
  severity: z.string().min(1, "Select a severity"),
  facilityId: z.string().optional(),
  shipmentNumber: z.string().optional(),
  lotNumber: z.string().optional(),
  regulatoryNotifiable: z.boolean().default(false),
})

type ReportFormValues = z.infer<typeof reportSchema>

const DEFAULT_VALUES: ReportFormValues = {
  title: "",
  description: "",
  deviationType: "",
  severity: "",
  facilityId: "",
  shipmentNumber: "",
  lotNumber: "",
  regulatoryNotifiable: false,
}

const DEVIATION_OPTIONS: { value: DeviationType; icon: React.ReactNode }[] = [
  { value: "temperature_excursion", icon: <Thermometer className="size-4" /> },
  { value: "documentation_gap", icon: <FileText className="size-4" /> },
  { value: "quality_deviation", icon: <Activity className="size-4" /> },
  { value: "chain_of_custody_break", icon: <Package className="size-4" /> },
  { value: "storage_violation", icon: <ShieldCheck className="size-4" /> },
  { value: "labeling_error", icon: <FileText className="size-4" /> },
  { value: "contamination_suspected", icon: <AlertTriangle className="size-4" /> },
  { value: "equipment_malfunction", icon: <Activity className="size-4" /> },
  { value: "human_error", icon: <User className="size-4" /> },
  { value: "packaging_failure", icon: <Package className="size-4" /> },
]

const SEVERITY_OPTIONS: { value: ComplianceSeverity; badge: string }[] = [
  { value: "low", badge: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  { value: "medium", badge: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400" },
  { value: "high", badge: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400" },
  { value: "critical", badge: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400" },
]

const NEXT_STEPS = [
  {
    title: "Logged & queued",
    detail: "The incident is filed with an open status and appears in the Compliance log immediately.",
  },
  {
    title: "Assigned & investigated",
    detail: "QA reviews the report, performs root cause analysis, and updates the audit trail.",
  },
  {
    title: "Resolved & verified",
    detail: "Corrective action is recorded and the incident is closed with full documentation.",
  },
]

function FormField({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-foreground">{label}</label>
      {children}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}

function ToggleSwitch({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="group flex cursor-pointer items-center gap-3 py-1">
      <div
        data-checked={checked}
        className="relative h-7 w-12 shrink-0 rounded-full border border-input bg-input/30 transition-colors data-[checked=true]:bg-primary"
      >
        <div
          data-checked={checked}
          className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform data-[checked=true]:translate-x-5"
        />
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
      </div>
      <span className="flex flex-col">
        <span className="text-sm font-medium text-foreground transition-colors group-hover:text-foreground">
          {label}
        </span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </span>
    </label>
  )
}

function ReportPage() {
  const { user } = useAuth()
  const createIncident = useCreateComplianceIncident()
  const { data: facilities } = useFacilities()
  const [submittedNumber, setSubmittedNumber] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<ReportFormValues>({
    resolver: zodResolver(reportSchema) as any,
    defaultValues: DEFAULT_VALUES,
    mode: "onChange",
  })

  const severity = watch("severity")
  const regulatoryNotifiable = watch("regulatoryNotifiable")
  const selectedSeverity = SEVERITY_OPTIONS.find((s) => s.value === severity)

  const onSubmit = useCallback(
    async (data: ReportFormValues) => {
      try {
        const result = await createIncident.mutateAsync({
          title: data.title,
          description: data.description,
          deviationType: data.deviationType as DeviationType,
          severity: data.severity as ComplianceSeverity,
          facilityId: data.facilityId || undefined,
          shipmentNumber: data.shipmentNumber || undefined,
          lotNumber: data.lotNumber || undefined,
          regulatoryNotifiable: data.regulatoryNotifiable,
          reportedBy: user?.displayName || "Unknown",
          detectedBy: user?.displayName || undefined,
        })
        setSubmittedNumber(result.incidentNumber)
        toast.add({
          title: "Incident Reported",
          description: `${result.incidentNumber} has been logged and queued for QA review.`,
          type: "success",
        })
        reset(DEFAULT_VALUES)
      } catch {
        toast.add({
          title: "Error",
          description: "Failed to report the incident. Please try again.",
          type: "error",
        })
      }
    },
    [createIncident, user, reset]
  )

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col gap-6 p-4 sm:p-6"
    >
      <PageHeader
        title="Report Compliance Issue"
        description="File a compliance, quality, or cold-chain incident for QA review"
      />

      {submittedNumber && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3"
        >
          <CheckCircle2 className="size-5 shrink-0 text-emerald-500" />
          <div className="min-w-0 text-sm">
            <span className="font-medium text-emerald-700 dark:text-emerald-400">
              {submittedNumber}
            </span>
            <span className="text-muted-foreground">
              {" "}
              was reported successfully. It is now open in the Compliance log. Report another issue below or use the buttons to dismiss this message.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSubmittedNumber(null)}
            className="ml-auto shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400"
          >
            Dismiss
          </button>
        </motion.div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col gap-5 rounded-xl border border-border bg-card p-5 shadow-sm lg:col-span-2"
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="Title" error={errors.title?.message}>
              <Input
                {...register("title")}
                placeholder="e.g. Temperature excursion on shipment SHP-1001"
                className="h-11"
              />
            </FormField>

            <FormField label="Deviation Type" error={errors.deviationType?.message}>
              <Select
                value={watch("deviationType")}
                onValueChange={(v) => setValue("deviationType", v ?? "", { shouldValidate: true })}
              >
                <SelectTrigger className="h-11 w-full" aria-label="Deviation type">
                  <SelectValue placeholder="Select deviation type" />
                </SelectTrigger>
                <SelectContent>
                  {DEVIATION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.icon}
                      {formatCategory(opt.value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </div>

          <FormField label="Description" error={errors.description?.message}>
            <Textarea
              {...register("description")}
              placeholder="Describe what happened, where, and what was observed..."
              className="min-h-28"
            />
          </FormField>

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="Severity" error={errors.severity?.message}>
              <Select
                value={severity}
                onValueChange={(v) => setValue("severity", v ?? "", { shouldValidate: true })}
              >
                <SelectTrigger className="h-11 w-full" aria-label="Severity">
                  <SelectValue placeholder="Select severity" />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <Badge className={cn("capitalize", opt.badge)}>{opt.value}</Badge>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedSeverity && (
                <span className="text-xs text-muted-foreground">
                  Selected: <Badge className={cn("capitalize", selectedSeverity.badge)}>{severity}</Badge>
                </span>
              )}
            </FormField>

            <FormField label="Facility">
              <Select
                value={watch("facilityId")}
                onValueChange={(v) => setValue("facilityId", v ?? "")}
              >
                <SelectTrigger className="h-11 w-full" aria-label="Facility">
                  <SelectValue placeholder="Select facility (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {(facilities ?? []).map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="Shipment Reference">
              <Input
                {...register("shipmentNumber")}
                placeholder="e.g. SHP-1001 (optional)"
                className="h-11"
              />
            </FormField>

            <FormField label="Lot Number">
              <Input
                {...register("lotNumber")}
                placeholder="e.g. LOT-2026-004 (optional)"
                className="h-11"
              />
            </FormField>
          </div>

          <Separator />

          <ToggleSwitch
            label="Regulatory notifiable"
            description="Mark if this may need to be reported to a regulatory body (e.g. FDA, EMA)."
            checked={regulatoryNotifiable}
            onChange={(v) => setValue("regulatoryNotifiable", v)}
          />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Reported by: <span className="font-medium text-foreground">{user?.displayName ?? "Current user"}</span>
            </p>
            <Button type="submit" size="lg" disabled={createIncident.isPending} className="w-full sm:w-auto">
              {createIncident.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Siren className="size-4" />
                  Report Incident
                </>
              )}
            </Button>
          </div>
        </form>

        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h3 className="mb-1 text-sm font-semibold text-foreground">What happens next</h3>
            <p className="mb-4 text-xs text-muted-foreground">
              Every report is logged with an audit trail and assigned for investigation.
            </p>
            <div className="flex flex-col">
              {NEXT_STEPS.map((step, i) => (
                <div key={step.title} className="relative flex gap-3 pb-5 last:pb-0">
                  <div className="flex flex-col items-center">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-primary/30 bg-primary/10 text-[11px] font-semibold text-primary">
                      {i + 1}
                    </span>
                    {i < NEXT_STEPS.length - 1 && <span className="mt-1 w-px flex-1 bg-border" />}
                  </div>
                  <div className="flex min-w-0 flex-col gap-0.5 pt-0.5">
                    <span className="flex items-center gap-1 text-sm font-medium text-foreground">
                      {step.title}
                      {i === 0 && <ArrowRight className="size-3 text-muted-foreground/40" />}
                    </span>
                    <p className="text-xs leading-relaxed text-muted-foreground">{step.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
              <AlertTriangle className="size-4 text-amber-500" />
              Good to know
            </h3>
            <ul className="flex flex-col gap-2 text-xs leading-relaxed text-muted-foreground">
              <li>
                Link a <span className="font-medium text-foreground">shipment reference</span> whenever possible so
                investigators can pull temperature logs and supplier details instantly.
              </li>
              <li>
                Mark <span className="font-medium text-foreground">regulatory notifiable</span> if the issue could
                affect patient safety or require external reporting.
              </li>
              <li>
                You can also resolve and document corrective actions from the{" "}
                <span className="font-medium text-foreground">Compliance &amp; Cold Chain</span> page.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export default ReportPage
