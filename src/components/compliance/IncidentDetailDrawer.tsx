import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  User,
  UserCircle2,
  FileText,
  CheckCircle,
  AlertTriangle,
  ShieldCheck,
  Thermometer,
  Package,
  Activity,
} from "lucide-react"

import { cn } from "@/lib/utils"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { StatusBadge } from "@/components/common/StatusBadge"
import { LoadingState } from "@/components/common/LoadingState"
import { ErrorState } from "@/components/common/ErrorState"
import { formatDate, formatDateTime, formatCategory } from "@/utils/formatters"
import { useComplianceIncident, useResolveIncident, useAssignIncident, getAuditLog } from "@/services/compliance-service"
import { useUsers } from "@/services/reference-service"
import { useAuth } from "@/hooks"
import type { AuditLogEntry } from "@/types"

interface IncidentDetailDrawerProps {
  incidentId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

const deviationIcons: Record<string, React.ReactNode> = {
  temperature_excursion: <Thermometer className="size-4" />,
  documentation_gap: <FileText className="size-4" />,
  quality_deviation: <Activity className="size-4" />,
  chain_of_custody_break: <Package className="size-4" />,
  storage_violation: <ShieldCheck className="size-4" />,
  labeling_error: <FileText className="size-4" />,
  contamination_suspected: <AlertTriangle className="size-4" />,
  equipment_malfunction: <Activity className="size-4" />,
  human_error: <User className="size-4" />,
  packaging_failure: <Package className="size-4" />,
}

function AuditTimeline({ entries }: { entries: AuditLogEntry[] }) {
  return (
    <div className="relative space-y-0">
      {entries.map((entry, i) => (
        <div key={entry.id} className="relative flex gap-3 pb-6 last:pb-0">
          <div className="flex flex-col items-center">
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full border-2 bg-background",
                i === entries.length - 1
                  ? "border-success text-success"
                  : "border-muted-foreground/30 text-muted-foreground"
              )}
            >
              {i === entries.length - 1 ? (
                <CheckCircle className="size-3" />
              ) : (
                <span className="size-1.5 rounded-full bg-current" />
              )}
            </span>
            {i < entries.length - 1 && (
              <span className="mt-1 w-px flex-1 bg-border" />
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-0.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-foreground">{entry.action}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatDateTime(entry.timestamp)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{entry.details}</p>
            <span className="mt-0.5 text-[11px] text-muted-foreground/60">
              by {entry.performedBy}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span className="shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
      <div className="text-right text-sm text-foreground">{value}</div>
    </div>
  )
}

function IncidentDetailDrawer({ incidentId, open, onOpenChange }: IncidentDetailDrawerProps) {
  const { data: incident, isLoading, isError, refetch } = useComplianceIncident(incidentId ?? undefined)
  const { can, user } = useAuth()
  const canResolve = can("act:resolve_event")
  const canAssign = can("act:assign_event")
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([])
  const [auditLoading, setAuditLoading] = useState(false)

  const resolveMutation = useResolveIncident()
  const assignMutation = useAssignIncident()
  const { data: users = [] } = useUsers()
  const [correctiveAction, setCorrectiveAction] = useState("")
  const [closureNotes, setClosureNotes] = useState("")
  const [showResolveForm, setShowResolveForm] = useState(false)
  const [showAssignForm, setShowAssignForm] = useState(false)
  const [assigneeId, setAssigneeId] = useState("")

  async function loadAuditLog(id: string) {
    setAuditLoading(true)
    try {
      const entries = await getAuditLog(id)
      setAuditLog(entries)
    } finally {
      setAuditLoading(false)
    }
  }

  function handleOpenChange(open: boolean) {
    onOpenChange(open)
    if (open && incidentId) {
      loadAuditLog(incidentId)
    }
  }

  useEffect(() => {
    if (open && incidentId) {
      loadAuditLog(incidentId)
    }
  }, [incidentId, open])

  async function handleResolve() {
    if (!incidentId || !correctiveAction || !closureNotes) return
    await resolveMutation.mutateAsync({
      id: incidentId,
      resolution: { correctiveAction, closureNotes },
    })
    setShowResolveForm(false)
    setCorrectiveAction("")
    setClosureNotes("")
    refetch()
    if (incidentId) loadAuditLog(incidentId)
  }

  async function handleAssign() {
    if (!incidentId || !assigneeId) return
    const assignee = users.find((u) => u.id === assigneeId)
    if (!assignee) return
    await assignMutation.mutateAsync({
      id: incidentId,
      data: {
        assignedById: assignee.id,
        assignedTo: assignee.displayName,
        assignedBy: user?.displayName,
        status: "investigating",
      },
    })
    setShowAssignForm(false)
    setAssigneeId("")
    refetch()
    if (incidentId) loadAuditLog(incidentId)
  }

  function openAssignForm() {
    setAssigneeId(incident?.assignedById ?? "")
    setShowAssignForm(true)
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl">
        <SheetHeader className="border-b border-border pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {incident && (
                <StatusBadge status={incident.status} size="sm" />
              )}
            </div>
          </div>
          {incident && (
            <>
              <SheetTitle className="mt-2 text-lg">{incident.title}</SheetTitle>
              <SheetDescription>
                <span className="font-mono text-xs text-muted-foreground">
                  {incident.incidentNumber}
                </span>
              </SheetDescription>
            </>
          )}
        </SheetHeader>

        {isLoading && (
          <div className="p-4">
            <LoadingState title="Loading incident..." variant="skeleton" />
          </div>
        )}

        {isError && (
          <div className="p-4">
            <ErrorState
              title="Failed to load incident"
              onRetry={() => refetch()}
            />
          </div>
        )}

        {incident && (
          <div className="flex-1 overflow-y-auto">
            <div className="space-y-6 p-4">
              <div>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Overview
                </h3>
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <InfoRow
                    label="Deviation Type"
                    value={
                      <span className="inline-flex items-center gap-1.5">
                        {deviationIcons[incident.deviationType]}
                        {formatCategory(incident.deviationType)}
                      </span>
                    }
                  />
                  <Separator className="my-1" />
                  <InfoRow
                    label="Severity"
                    value={<StatusBadge status={incident.severity} size="sm" />}
                  />
                  <Separator className="my-1" />
                  <InfoRow
                    label="Facility"
                    value={incident.facilityName}
                  />
                  <Separator className="my-1" />
                  <InfoRow
                    label="Detected Date"
                    value={formatDate(incident.detectedDate)}
                  />
                  <Separator className="my-1" />
                  <InfoRow
                    label="Reported By"
                    value={incident.reportedBy}
                  />
                  <Separator className="my-1" />
                  <InfoRow
                    label="Assigned To"
                    value={incident.assignedTo || "—"}
                  />
                  {incident.assignedBy && (
                    <>
                      <Separator className="my-1" />
                      <InfoRow label="Assigned By" value={incident.assignedBy} />
                    </>
                  )}
                  {incident.lotNumber && (
                    <>
                      <Separator className="my-1" />
                      <InfoRow label="Lot Number" value={incident.lotNumber} />
                    </>
                  )}
                  {incident.productName && (
                    <>
                      <Separator className="my-1" />
                      <InfoRow label="Product" value={incident.productName} />
                    </>
                  )}
                  {incident.supplierName && (
                    <>
                      <Separator className="my-1" />
                      <InfoRow label="Supplier" value={incident.supplierName} />
                    </>
                  )}
                  {incident.shipmentNumber && (
                    <>
                      <Separator className="my-1" />
                      <InfoRow label="Shipment" value={incident.shipmentNumber} />
                    </>
                  )}
                  {incident.temperatureRegime && (
                    <>
                      <Separator className="my-1" />
                      <InfoRow label="Temperature Regime" value={formatCategory(incident.temperatureRegime)} />
                    </>
                  )}
                  <Separator className="my-1" />
                  <InfoRow
                    label="Regulatory Notifiable"
                    value={
                      incident.regulatoryNotifiable ? (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="size-3" />
                          Yes
                        </Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">No</span>
                      )
                    }
                  />
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Description
                </h3>
                <p className="rounded-lg border border-border bg-muted/30 p-3 text-sm leading-relaxed text-foreground">
                  {incident.description}
                </p>
              </div>

              <div>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Resolution Details
                </h3>
                {incident.rootCause && (
                  <div className="mb-2 rounded-lg border border-border bg-muted/30 p-3">
                    <span className="text-xs font-medium text-muted-foreground">Root Cause</span>
                    <p className="mt-1 text-sm text-foreground">{incident.rootCause}</p>
                  </div>
                )}
                {incident.correctiveAction && (
                  <div className="mb-2 rounded-lg border border-border bg-muted/30 p-3">
                    <span className="text-xs font-medium text-muted-foreground">Corrective Action</span>
                    <p className="mt-1 text-sm text-foreground">{incident.correctiveAction}</p>
                  </div>
                )}
                {incident.preventiveAction && (
                  <div className="mb-2 rounded-lg border border-border bg-muted/30 p-3">
                    <span className="text-xs font-medium text-muted-foreground">Preventive Action</span>
                    <p className="mt-1 text-sm text-foreground">{incident.preventiveAction}</p>
                  </div>
                )}
                {incident.resolvedDate && (
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <span className="text-xs font-medium text-muted-foreground">Resolved Date</span>
                    <p className="mt-1 text-sm text-foreground">{formatDateTime(incident.resolvedDate)}</p>
                  </div>
                )}
                {!incident.rootCause && !incident.correctiveAction && !incident.preventiveAction && !incident.resolvedDate && (
                  <p className="text-sm text-muted-foreground">No resolution details recorded yet.</p>
                )}
              </div>

              <div>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Audit Trail
                </h3>
                {auditLoading ? (
                  <LoadingState title="Loading audit log..." variant="spinner" />
                ) : (
                  <AuditTimeline entries={auditLog} />
                )}
              </div>
            </div>

            <div className="sticky bottom-0 border-t border-border bg-card p-4">
              <AnimatePresence mode="wait">
                {showResolveForm ? (
                  <motion.div
                    key="resolve-form"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-2"
                  >
                    <textarea
                      placeholder="Corrective action taken..."
                      value={correctiveAction}
                      onChange={(e) => setCorrectiveAction(e.target.value)}
                      className="h-20 w-full rounded-lg border border-input bg-transparent p-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring resize-none"
                    />
                    <textarea
                      placeholder="Closure notes..."
                      value={closureNotes}
                      onChange={(e) => setClosureNotes(e.target.value)}
                      className="h-20 w-full rounded-lg border border-input bg-transparent p-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring resize-none"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={handleResolve}
                        disabled={!correctiveAction || !closureNotes || resolveMutation.isPending}
                      >
                        <CheckCircle className="size-4" />
                        Confirm Resolution
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowResolveForm(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </motion.div>
                ) : showAssignForm ? (
                  <motion.div
                    key="assign-form"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-2"
                  >
                    <div className="flex items-center gap-2 rounded-lg border border-input bg-transparent px-3 py-2">
                      <UserCircle2 className="size-4 shrink-0 text-muted-foreground" />
                      <select
                        autoFocus
                        value={assigneeId}
                        onChange={(e) => setAssigneeId(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void handleAssign()
                        }}
                        className="w-full cursor-pointer bg-transparent text-sm text-foreground outline-none [&>option]:bg-card"
                      >
                        <option value="" disabled>
                          Select a staff member...
                        </option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.displayName} — {u.title}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={handleAssign}
                        disabled={!assigneeId || assignMutation.isPending}
                      >
                        <UserCircle2 className="size-4" />
                        {assignMutation.isPending ? "Assigning..." : "Confirm Assignment"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowAssignForm(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="actions"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex gap-2"
                  >
                    {canResolve && (incident.status === "open" || incident.status === "investigating") ? (
                      <Button size="sm" onClick={() => setShowResolveForm(true)}>
                        <CheckCircle className="size-4" />
                        Resolve
                      </Button>
                    ) : null}
                    {canAssign && incident.status !== "resolved" && incident.status !== "closed" ? (
                      <Button variant="outline" size="sm" onClick={openAssignForm}>
                        <UserCircle2 className="size-4" />
                        {incident.assignedTo ? "Reassign" : "Assign"}
                      </Button>
                    ) : null}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

export { IncidentDetailDrawer }
export type { IncidentDetailDrawerProps }
