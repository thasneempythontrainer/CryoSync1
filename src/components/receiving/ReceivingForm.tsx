import { useState, useCallback, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronRight, ChevronLeft, Check, Package, Truck, ShieldCheck, ShieldX, FileX, ClipboardCheck, AlertTriangle, Thermometer } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { toast } from "@/components/ui/toast"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import {
  CARRIERS,
  TEMPERATURE_REGIMES,
  PRODUCT_CATEGORIES,
} from "@/constants/enterprise"
import { formatCurrency, formatCategory } from "@/utils/formatters"
import { useCreateShipment, useFacilities, useStorageZones } from "@/services"
import { useAuth } from "@/hooks"
import type { Facility, Shipment, StorageZone } from "@/types"

const receivingSchema = z.object({
  shipmentNumber: z.string().min(1, "Shipment number is required"),
  carrier: z.string().min(1, "Carrier is required"),
  trackingNumber: z.string().min(1, "Tracking number is required"),
  billOfLading: z.string().min(1, "Bill of lading is required"),
  priority: z.enum(["standard", "expedited", "critical"]),
  facilityId: z.string().min(1, "Facility is required"),
  supplierName: z.string().min(1, "Supplier name is required"),
  origin: z.string().min(1, "Origin is required"),
  category: z.string().min(1, "Product category is required"),
  temperatureRegime: z.string().min(1, "Temperature regime is required"),
  productCount: z.coerce.number().min(1, "At least 1 product required"),
  totalValue: z.coerce.number().min(0, "Value must be positive"),
  lotCount: z.coerce.number().min(1, "At least 1 lot required"),
  chainOfCustody: z.boolean(),
  coaAttached: z.boolean(),
  condition: z.enum(["excellent", "good", "fair", "damaged"]),
  storageZone: z.string().min(1, "Storage zone is required"),
  notes: z.string().optional(),
})

type ReceivingFormValues = z.infer<typeof receivingSchema>

const defaultValues: ReceivingFormValues = {
  shipmentNumber: "",
  carrier: "",
  trackingNumber: "",
  billOfLading: "",
  priority: "standard",
  facilityId: "",
  supplierName: "",
  origin: "",
  category: "",
  temperatureRegime: "",
  productCount: 1,
  totalValue: 0,
  lotCount: 1,
  chainOfCustody: false,
  coaAttached: false,
  condition: "good",
  storageZone: "",
  notes: "",
}

const steps = [
  { id: 0, title: "Shipment Details", icon: Truck },
  { id: 1, title: "Supplier & Product", icon: Package },
  { id: 2, title: "Batch & Compliance", icon: ShieldCheck },
  { id: 3, title: "Review & Confirm", icon: ClipboardCheck },
]

const stepVariants = {
  enter: (dir: number) => ({ opacity: 0, x: dir > 0 ? 60 : -60, scale: 0.98 }),
  center: { opacity: 1, x: 0, scale: 1, transition: { type: "spring" as const, stiffness: 300, damping: 30 } },
  exit: (dir: number) => ({ opacity: 0, x: dir > 0 ? -60 : 60, scale: 0.98, transition: { duration: 0.2 } }),
}

interface FormFieldProps {
  label: string
  error?: string
  children: React.ReactNode
}

function FormField({ label, error, children }: FormFieldProps) {
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
  checked,
  onChange,
}: {
  label: string
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
      <span className="text-sm text-muted-foreground transition-colors group-hover:text-foreground">
        {label}
      </span>
    </label>
  )
}

function ReceivingForm({ prefillShipment }: { prefillShipment?: string }) {
  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState(0)
  const [showSuccess, setShowSuccess] = useState(false)
  const [createdShipmentNumber, setCreatedShipmentNumber] = useState("")

  const createShipment = useCreateShipment()
  const { data: facilities } = useFacilities()
  const { data: storageZones } = useStorageZones()
  const { can } = useAuth()
  const canCreateShipment = can("act:create_shipment")

  const form = useForm<ReceivingFormValues>({
    resolver: zodResolver(receivingSchema) as any,
    defaultValues,
    mode: "onChange",
  })

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    trigger,
    reset,
    formState: { errors },
  } = form

  useEffect(() => {
    if (prefillShipment) {
      setValue("shipmentNumber", prefillShipment, { shouldValidate: true })
    }
  }, [prefillShipment, setValue])

  const watchedValues = watch()
  const carrier = watchedValues.carrier
  const priority = watchedValues.priority
  const facilityId = watchedValues.facilityId
  const category = watchedValues.category
  const tempRegime = watchedValues.temperatureRegime
  const condition = watchedValues.condition
  const storageZone = watchedValues.storageZone

  const goNext = useCallback(async () => {
    const fields = getStepFields(step)
    const valid = await trigger(fields)
    if (valid) {
      setDirection(1)
      setStep((s) => Math.min(s + 1, 3))
    }
  }, [step, trigger])

  const goBack = useCallback(() => {
    setDirection(-1)
    setStep((s) => Math.max(s - 1, 0))
  }, [])

  const onSubmit = useCallback(
    async (data: ReceivingFormValues) => {
      const facility = (facilities ?? []).find((f) => f.id === data.facilityId)
      const payload: Partial<Shipment> = {
        shipmentNumber: data.shipmentNumber,
        carrier: data.carrier,
        trackingNumber: data.trackingNumber,
        billOfLading: data.billOfLading,
        priority: data.priority,
        facilityId: data.facilityId,
        facilityName: facility?.name ?? "",
        supplierName: data.supplierName,
        origin: data.origin,
        category: data.category as Shipment["category"],
        temperatureRegime: data.temperatureRegime as Shipment["temperatureRegime"],
        productCount: data.productCount,
        totalValue: data.totalValue,
        lotCount: data.lotCount,
        chainOfCustody: data.chainOfCustody,
        coaAttached: data.coaAttached,
        condition: data.condition,
        storageZone: data.storageZone,
        status: "receiving",
        notes: data.notes ?? "",
        destination: facility?.location ?? "",
      }

      try {
        const result = await createShipment.mutateAsync(payload)
        setCreatedShipmentNumber(result.shipmentNumber)
        setShowSuccess(true)
        toast.add({
          title: "Shipment Created",
          description: `Receiving intake ${result.shipmentNumber} has been started.`,
          type: "success",
        })
      } catch {
        toast.add({
          title: "Error",
          description: "Failed to create shipment. Please try again.",
          type: "error",
        })
      }
    },
    [createShipment, facilities],
  )

  const progress = ((step + 1) / steps.length) * 100

  return (
    <>
      <Card size="sm" className="w-full border-border/60 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-semibold">New Receiving Intake</CardTitle>
              <CardDescription>Multi-step form to document incoming cold-chain shipments</CardDescription>
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              {steps.map((s) => (
                <div key={s.id} className="flex items-center gap-2">
                  <div
                    data-active={s.id === step}
                    data-complete={s.id < step}
                    className="flex size-8 items-center justify-center rounded-full border-2 text-xs font-semibold transition-all data-[complete=true]:border-primary data-[complete=true]:bg-primary data-[complete=true]:text-primary-foreground data-[active=true]:border-primary data-[active=true]:text-primary data-[active=false]:border-muted-foreground/30 data-[active=false]:text-muted-foreground/50"
                  >
                    {s.id < step ? <Check className="size-4" /> : s.id + 1}
                  </div>
                  <span
                    data-active={s.id === step}
                    className="hidden text-xs font-medium sm:inline data-[active=true]:text-foreground data-[active=false]:text-muted-foreground/60"
                  >
                    {s.title}
                  </span>
                </div>
              ))}
            </div>

            <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="px-(--card-spacing)">
          <form onSubmit={handleSubmit(onSubmit as any)}>
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={step}
                custom={direction}
                variants={stepVariants}
                initial="enter"
                animate="center"
                exit="exit"
              >
                {step === 0 && (
                  <StepShipmentDetails
                    register={register}
                    setValue={setValue}
                    errors={errors}
                    carrier={carrier}
                    priority={priority}
                    facilityId={facilityId}
                    facilities={facilities ?? []}
                  />
                )}
                {step === 1 && (
                  <StepSupplierProduct
                    register={register}
                    setValue={setValue}
                    errors={errors}
                    category={category}
                    tempRegime={tempRegime}
                  />
                )}
                {step === 2 && (
                  <StepBatchCompliance
                    register={register}
                    setValue={setValue}
                    errors={errors}
                    condition={condition}
                    storageZone={storageZone}
                    chainOfCustody={watchedValues.chainOfCustody}
                    coaAttached={watchedValues.coaAttached}
                    category={category}
                    tempRegime={tempRegime}
                    storageZones={storageZones ?? []}
                  />
                )}
                {step === 3 && <StepReview watchedValues={watchedValues} facilities={facilities ?? []} />}
              </motion.div>
            </AnimatePresence>
          </form>
          </div>
        </CardContent>

        <CardFooter className="sticky bottom-0 z-20 flex items-center justify-between gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur-md">
          {step > 0 ? (
            <Button type="button" variant="outline" size="xl" onClick={goBack} className="flex-1 sm:flex-none">
              <ChevronLeft className="size-4" />
              Back
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">
              Step {step + 1} of {steps.length}
            </span>
          )}
          <div className="flex items-center gap-2 sm:gap-3">
            {step > 0 && (
              <span className="hidden text-xs text-muted-foreground sm:inline">
                Step {step + 1} of {steps.length}
              </span>
            )}
            {step < 3 ? (
              <Button type="button" size="xl" onClick={goNext} className="flex-1 sm:flex-none">
                Next
                <ChevronRight className="size-4" />
              </Button>
            ) : canCreateShipment ? (
              <Button
                type="button"
                size="xl"
                disabled={createShipment.isPending}
                onClick={handleSubmit(onSubmit as any)}
                className="flex-1 sm:flex-none"
              >
                {createShipment.isPending ? "Submitting..." : "Confirm & Submit"}
              </Button>
            ) : (
              <Button type="button" size="xl" disabled className="flex-1 sm:flex-none">
                Create access required
              </Button>
            )}
          </div>
        </CardFooter>
      </Card>

      <Dialog open={showSuccess} onOpenChange={setShowSuccess}>
        <DialogTrigger />
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-600">
              <div className="flex size-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900 dark:text-emerald-400">
                <Check className="size-4" />
              </div>
              Intake Created
            </DialogTitle>
            <DialogDescription className="pt-2">
              Receiving intake has been successfully created and is now in progress.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-muted/30 p-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Shipment Number</span>
              <span className="font-mono font-semibold text-foreground">{createdShipmentNumber}</span>
            </div>
            <Separator className="my-2" />
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Status</span>
              <Badge
                variant="outline"
                className="bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
              >
                Receiving
              </Badge>
            </div>
          </div>
          <DialogFooter showCloseButton>
            <Button
              variant="default"
              size="xl"
              className="w-full"
              onClick={() => {
                setShowSuccess(false)
                reset(defaultValues)
                setStep(0)
              }}
            >
              Start New Intake
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function getStepFields(step: number): (keyof ReceivingFormValues)[] {
  switch (step) {
    case 0:
      return ["shipmentNumber", "carrier", "trackingNumber", "billOfLading", "priority", "facilityId"]
    case 1:
      return ["supplierName", "origin", "category", "temperatureRegime", "productCount", "totalValue"]
    case 2:
      return ["lotCount", "chainOfCustody", "coaAttached", "condition", "storageZone"]
    default:
      return []
  }
}

interface StepSharedProps {
  register: ReturnType<typeof useForm<ReceivingFormValues>>["register"]
  setValue: ReturnType<typeof useForm<ReceivingFormValues>>["setValue"]
  errors: ReturnType<typeof useForm<ReceivingFormValues>>["formState"]["errors"]
}

function StepShipmentDetails({
  register,
  setValue,
  errors,
  carrier,
  priority,
  facilityId,
  facilities,
}: StepSharedProps & { carrier: string; priority: string; facilityId: string; facilities: Facility[] }) {
  return (
    <div className="grid gap-6">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Truck className="size-4" />
        Transport Information
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Shipment Number *" error={errors.shipmentNumber?.message}>
          <Input {...register("shipmentNumber")} placeholder="e.g. SHP-20260729-0001" className="h-11" />
        </FormField>
        <FormField label="Carrier *" error={errors.carrier?.message}>
          <Select
            value={carrier}
            onValueChange={(v) => setValue("carrier", v ?? "", { shouldValidate: true })}
          >
            <SelectTrigger className="h-11 w-full">
              <SelectValue placeholder="Select carrier" />
            </SelectTrigger>
            <SelectContent>
              {CARRIERS.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Tracking Number *" error={errors.trackingNumber?.message}>
          <Input {...register("trackingNumber")} placeholder="e.g. TRK-123456789" className="h-11" />
        </FormField>
        <FormField label="Bill of Lading *" error={errors.billOfLading?.message}>
          <Input {...register("billOfLading")} placeholder="e.g. BOL-2026-000001" className="h-11" />
        </FormField>
      </div>

      <Separator />

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Priority *" error={errors.priority?.message}>
          <Select
            value={priority}
            onValueChange={(v) =>
              setValue("priority", (v ?? "standard") as "standard" | "expedited" | "critical", { shouldValidate: true })
            }
          >
            <SelectTrigger className="h-11 w-full">
              <SelectValue placeholder="Select priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="standard">Standard</SelectItem>
              <SelectItem value="expedited">Expedited</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Destination Facility *" error={errors.facilityId?.message}>
          <Select
            value={facilityId}
            onValueChange={(v) => setValue("facilityId", v ?? "", { shouldValidate: true })}
          >
            <SelectTrigger className="h-11 w-full">
              <SelectValue placeholder="Select facility" />
            </SelectTrigger>
            <SelectContent>
              {facilities.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </div>
    </div>
  )
}

function StepSupplierProduct({
  register,
  setValue,
  errors,
  category,
  tempRegime,
}: StepSharedProps & { category: string; tempRegime: string }) {
  return (
    <div className="grid gap-6">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Package className="size-4" />
        Supplier & Product Information
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Supplier Name *" error={errors.supplierName?.message}>
          <Input {...register("supplierName")} placeholder="e.g. Thermo Fisher Scientific" className="h-11" />
        </FormField>
        <FormField label="Origin *" error={errors.origin?.message}>
          <Input {...register("origin")} placeholder="e.g. Waltham, MA" className="h-11" />
        </FormField>
      </div>

      <Separator />

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Product Category *" error={errors.category?.message}>
          <Select
            value={category}
            onValueChange={(v) => setValue("category", v ?? "", { shouldValidate: true })}
          >
            <SelectTrigger className="h-11 w-full">
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {PRODUCT_CATEGORIES.map((pc) => (
                <SelectItem key={pc.id} value={pc.id}>
                  {pc.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Temperature Regime *" error={errors.temperatureRegime?.message}>
          <Select
            value={tempRegime}
            onValueChange={(v) => setValue("temperatureRegime", v ?? "", { shouldValidate: true })}
          >
            <SelectTrigger className="h-11 w-full">
              <SelectValue placeholder="Select regime" />
            </SelectTrigger>
            <SelectContent>
              {TEMPERATURE_REGIMES.map((tr) => (
                <SelectItem key={tr.id} value={tr.id}>
                  {tr.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Product Count *" error={errors.productCount?.message}>
          <Input {...register("productCount")} type="number" min={1} inputMode="numeric" className="h-11" />
        </FormField>
        <FormField label="Total Value ($) *" error={errors.totalValue?.message}>
          <Input {...register("totalValue")} type="number" min={0} step="0.01" inputMode="decimal" className="h-11" />
        </FormField>
      </div>
    </div>
  )
}

function ComplianceAlert({ icon: Icon, title, description, variant }: {
  icon: typeof AlertTriangle
  title: string
  description: string
  variant: 'warning' | 'critical' | 'info'
}) {
  const colors = {
    warning: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300',
    critical: 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-300',
    info: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300',
  }
  return (
    <div className={`flex items-start gap-3 rounded-lg border p-3 ${colors[variant]}`}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs font-semibold">{title}</p>
        <p className="mt-0.5 text-xs opacity-80">{description}</p>
      </div>
    </div>
  )
}

function StepBatchCompliance({
  register,
  setValue,
  errors,
  condition,
  storageZone,
  chainOfCustody,
  coaAttached,
  category,
  tempRegime,
  storageZones,
}: StepSharedProps & {
  condition: string
  storageZone: string
  chainOfCustody: boolean
  coaAttached: boolean
  category: string
  tempRegime: string
  storageZones: StorageZone[]
}) {
  const coldChainSensitive = ['vaccines', 'biologics', 'monoclonal_antibodies', 'insulin_products', 'cold_chain_medicines', 'elisa_kits'].includes(category)
  const isCriticalTemp = ['frozen_minus_20', 'ultra_frozen_minus_80', 'liquid_nitrogen'].includes(tempRegime)

  return (
    <div className="grid gap-6">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <ShieldCheck className="size-4" />
        Batch & Compliance Details
      </div>

      <div className="grid gap-3">
        {coldChainSensitive && (
          <ComplianceAlert
            icon={Thermometer}
            title="Cold-Chain Sensitive Product"
            description="Verify temperature data logger and ensure continuous cold chain during receiving."
            variant="info"
          />
        )}
        {isCriticalTemp && (
          <ComplianceAlert
            icon={Thermometer}
            title="Critical Temperature Regime"
            description={`${tempRegime.replace(/_/g, ' ')} requires immediate transfer to designated storage. Prepare receiving team.`}
            variant="warning"
          />
        )}
        {condition === 'damaged' && (
          <ComplianceAlert
            icon={AlertTriangle}
            title="Damaged Goods Reported"
            description="Document damage with photos, notify QA, and initiate damage assessment before releasing."
            variant="critical"
          />
        )}
        {condition === 'fair' && (
          <ComplianceAlert
            icon={AlertTriangle}
            title="Condition Concerns"
            description="Inspect thoroughly. Consider quarantine for detailed quality assessment."
            variant="warning"
          />
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Lot Count *" error={errors.lotCount?.message}>
          <Input {...register("lotCount")} type="number" min={1} inputMode="numeric" className="h-11" />
        </FormField>
        <FormField label="Condition *" error={errors.condition?.message}>
          <Select
            value={condition}
            onValueChange={(v) =>
              setValue("condition", (v ?? "good") as "excellent" | "good" | "fair" | "damaged", { shouldValidate: true })
            }
          >
            <SelectTrigger className="h-11 w-full">
              <SelectValue placeholder="Select condition" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="excellent">Excellent</SelectItem>
              <SelectItem value="good">Good</SelectItem>
              <SelectItem value="fair">Fair</SelectItem>
              <SelectItem value="damaged">Damaged</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Storage Zone *" error={errors.storageZone?.message}>
          <Select
            value={storageZone}
            onValueChange={(v) => setValue("storageZone", v ?? "", { shouldValidate: true })}
          >
            <SelectTrigger className="h-11 w-full">
              <SelectValue placeholder="Select zone" />
            </SelectTrigger>
            <SelectContent>
              {storageZones.map((z) => (
                <SelectItem key={z.id} value={z.name}>
                  {z.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <div />
      </div>

      <Separator />

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-4">
          <ToggleSwitch
            label="Chain of Custody Documentation Complete"
            checked={chainOfCustody}
            onChange={(v) => setValue("chainOfCustody", v, { shouldValidate: true })}
          />
          {!chainOfCustody && (
            <ComplianceAlert
              icon={ShieldX}
              title="Chain of Custody Not Verified"
              description="Required for controlled substances and high-value biologics. Complete documentation before release."
              variant="warning"
            />
          )}
          <ToggleSwitch
            label="Certificate of Analysis (COA) Attached"
            checked={coaAttached}
            onChange={(v) => setValue("coaAttached", v, { shouldValidate: true })}
          />
          {!coaAttached && (
            <ComplianceAlert
              icon={FileX}
              title="COA Missing"
              description="Certificate of Analysis is required for QA release. Obtain from supplier before processing."
              variant="warning"
            />
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground">Notes</label>
        <Textarea {...register("notes")} placeholder="Additional receiving notes or observations..." rows={3} className="text-base" />
      </div>
    </div>
  )
}

function StepReview({ watchedValues, facilities }: { watchedValues: ReceivingFormValues; facilities: Facility[] }) {
  const facility = facilities.find((f) => f.id === watchedValues.facilityId)
  const regime = TEMPERATURE_REGIMES.find((r) => r.id === watchedValues.temperatureRegime)
  const category = PRODUCT_CATEGORIES.find((c) => c.id === watchedValues.category)

  const reviewFlags: { label: string; severity: 'critical' | 'warning' | 'info' }[] = []
  if (watchedValues.condition === 'damaged') reviewFlags.push({ label: 'Damaged goods', severity: 'critical' })
  if (watchedValues.condition === 'fair') reviewFlags.push({ label: 'Condition concerns', severity: 'warning' })
  if (!watchedValues.chainOfCustody) reviewFlags.push({ label: 'Chain of custody not verified', severity: 'warning' })
  if (!watchedValues.coaAttached) reviewFlags.push({ label: 'COA not attached', severity: 'warning' })
  if (['vaccines', 'biologics', 'monoclonal_antibodies', 'cold_chain_medicines'].includes(watchedValues.category)) {
    reviewFlags.push({ label: 'Cold-chain sensitive — verify temp log', severity: 'info' })
  }

  const priorityLabel =
    watchedValues.priority === "critical"
      ? "Critical"
      : watchedValues.priority === "expedited"
        ? "Expedited"
        : "Standard"

  return (
    <div className="grid gap-6">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <ClipboardCheck className="size-4" />
        Review All Information
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="rounded-lg border bg-muted/20 p-4">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Shipment Details
          </h4>
          <div className="space-y-2 text-sm">
            <ReviewRow label="Shipment Number" value={watchedValues.shipmentNumber} />
            <ReviewRow label="Carrier" value={watchedValues.carrier} />
            <ReviewRow label="Tracking" value={watchedValues.trackingNumber} />
            <ReviewRow label="BOL" value={watchedValues.billOfLading} />
            <ReviewRow label="Priority" value={priorityLabel} />
            <ReviewRow label="Facility" value={facility?.name ?? watchedValues.facilityId} />
          </div>
        </div>

        <div className="rounded-lg border bg-muted/20 p-4">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Supplier & Product
          </h4>
          <div className="space-y-2 text-sm">
            <ReviewRow label="Supplier" value={watchedValues.supplierName} />
            <ReviewRow label="Origin" value={watchedValues.origin} />
            <ReviewRow label="Category" value={category?.label ?? formatCategory(watchedValues.category)} />
            <ReviewRow label="Temperature" value={regime?.label ?? watchedValues.temperatureRegime} />
            <ReviewRow label="Product Count" value={String(watchedValues.productCount)} />
            <ReviewRow label="Total Value" value={formatCurrency(watchedValues.totalValue)} />
          </div>
        </div>

        <div className="rounded-lg border bg-muted/20 p-4">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Batch & Compliance
          </h4>
          <div className="space-y-2 text-sm">
            <ReviewRow label="Lot Count" value={String(watchedValues.lotCount)} />
            <ReviewRow
              label="Condition"
              value={watchedValues.condition.charAt(0).toUpperCase() + watchedValues.condition.slice(1)}
            />
            <ReviewRow label="Storage Zone" value={watchedValues.storageZone} />
            <ReviewRow label="Chain of Custody" value={watchedValues.chainOfCustody ? "Yes" : "No"} />
            <ReviewRow label="COA Attached" value={watchedValues.coaAttached ? "Yes" : "No"} />
          </div>
        </div>

        <div className="rounded-lg border bg-muted/20 p-4">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notes</h4>
          <p className="text-sm text-muted-foreground">
            {watchedValues.notes || "No additional notes provided."}
          </p>
        </div>
      </div>

      {reviewFlags.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
            <AlertTriangle className="size-3.5" />
            Compliance Notes
          </h4>
          <ul className="space-y-1">
            {reviewFlags.map((f, i) => (
              <li key={i} className="flex items-center gap-2 text-xs">
                <span className={`inline-block size-1.5 rounded-full ${
                  f.severity === 'critical' ? 'bg-red-500' : f.severity === 'warning' ? 'bg-amber-500' : 'bg-blue-500'
                }`} />
                {f.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value || "\u2014"}</span>
    </div>
  )
}

export { ReceivingForm }
export type { ReceivingFormValues }
