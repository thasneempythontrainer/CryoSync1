import { useState, useEffect, useMemo, useCallback } from "react"
import { motion } from "framer-motion"
import { Link } from "react-router-dom"
import { AlertTriangle, ShieldAlert, Clock, PackageX, Thermometer, AlertCircle, Ban, Eye, Siren } from "lucide-react"

import { PageHeader } from "@/components/common/PageHeader"
import { LoadingState } from "@/components/common/LoadingState"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useComplianceIncidents, getComplianceIncidents } from "@/services/compliance-service"
import { useInventoryLots } from "@/services/inventory-service"
import { formatDate, getStatusBg } from "@/utils/formatters"
import { cn } from "@/lib/utils"
import type { ComplianceSummary, InventoryLot } from "@/types"

interface SummaryCardData {
  criticalIncidents: number
  regulatoryNotifiable: number
  nearExpiryItems: number
  itemsOnHold: number
}

function SummaryCard({ icon: Icon, label, value, color }: {
  icon: typeof AlertTriangle
  label: string
  value: number
  color: string
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className={cn("flex size-7 items-center justify-center rounded-lg", color)}>
          <Icon className="size-4" />
        </span>
      </div>
      <span className="text-3xl font-semibold tracking-tight text-foreground">
        {value}
      </span>
    </div>
  )
}

function IncidentRow({ incident }: { incident: ComplianceSummary }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className={cn(
          "flex size-8 items-center justify-center rounded-full",
          incident.severity === "critical" ? "bg-danger/10 text-danger" :
          incident.severity === "high" ? "bg-orange-500/10 text-orange-500" :
          incident.severity === "medium" ? "bg-warning/10 text-warning" :
          "bg-muted text-muted-foreground"
        )}>
          <AlertTriangle className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{incident.title}</p>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{incident.incidentNumber}</span>
            <span>·</span>
            <span>{incident.facilityName}</span>
            <span>·</span>
            <span>{formatDate(incident.detectedDate)}</span>
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Badge className={cn(
          "capitalize",
          incident.severity === "critical" ? "bg-danger/10 text-danger" :
          incident.severity === "high" ? "bg-orange-500/10 text-orange-500" :
          incident.severity === "medium" ? "bg-warning/10 text-warning" :
          "bg-muted text-muted-foreground"
        )}>{incident.severity}</Badge>
        <Badge className={getStatusBg(incident.status)}>{incident.status.replace(/_/g, " ")}</Badge>
        {incident.regulatoryNotifiable && (
          <ShieldAlert className="size-4 text-purple-500" />
        )}
      </div>
    </div>
  )
}

function LotRow({ lot }: { lot: InventoryLot }) {
  const isExpired = lot.daysUntilExpiry <= 0
  const isNearExpiry = lot.daysUntilExpiry > 0 && lot.daysUntilExpiry <= 30

  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className={cn(
          "flex size-8 items-center justify-center rounded-full",
          isExpired ? "bg-danger/10 text-danger" :
          isNearExpiry ? "bg-warning/10 text-warning" :
          "bg-primary/10 text-primary"
        )}>
          {isExpired ? <Ban className="size-4" /> : isNearExpiry ? <Clock className="size-4" /> : <PackageX className="size-4" />}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{lot.productName}</p>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Lot {lot.lotNumber}</span>
            <span>·</span>
            <span>Qty {lot.quantity}</span>
            <span>·</span>
            <span>{lot.storageZone}</span>
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Badge className={getStatusBg(lot.status)}>{lot.status.replace(/_/g, " ")}</Badge>
        <span className={cn(
          "text-xs font-medium tabular-nums",
          isExpired ? "text-danger" : isNearExpiry ? "text-warning" : "text-muted-foreground"
        )}>
          {isExpired ? "Expired" : `${lot.daysUntilExpiry}d`}
        </span>
      </div>
    </div>
  )
}

function RiskPage() {
  const [summaryData, setSummaryData] = useState<SummaryCardData | undefined>()

  const { data: incidentsData, isLoading: incidentsLoading, isError: incidentsError, refetch: refetchIncidents } =
    useComplianceIncidents({ page: 1, pageSize: 100 })
  const { data: lotsData, isLoading: lotsLoading, isError: lotsError, refetch: refetchLots } =
    useInventoryLots({ page: 1, pageSize: 100 })

  const incidents = incidentsData?.data ?? []
  const lots = lotsData?.data ?? []

  useEffect(() => {
    if (incidents.length > 0 || lots.length > 0) {
      const critical = incidents.filter((i: ComplianceSummary) => i.severity === "critical")
      const regulatory = incidents.filter((i: ComplianceSummary) => i.regulatoryNotifiable)
      const nearExpiry = lots.filter((l: InventoryLot) => l.daysUntilExpiry > 0 && l.daysUntilExpiry <= 30)
      const onHold = lots.filter((l: InventoryLot) =>
        l.status === "quarantined" || l.status === "quality_hold"
      )

      setSummaryData({
        criticalIncidents: critical.length,
        regulatoryNotifiable: regulatory.length,
        nearExpiryItems: nearExpiry.length,
        itemsOnHold: onHold.length,
      })
    }
  }, [incidents, lots])

  const criticalIncidentsList = useMemo(() =>
    incidents
      .filter((i: ComplianceSummary) => i.severity === "critical" || i.severity === "high")
      .slice(0, 5),
    [incidents]
  )

  const atRiskLots = useMemo(() =>
    lots
      .filter((l: InventoryLot) =>
        l.daysUntilExpiry <= 30 ||
        l.status === "quarantined" ||
        l.status === "quality_hold"
      )
      .sort((a: InventoryLot, b: InventoryLot) => a.daysUntilExpiry - b.daysUntilExpiry)
      .slice(0, 10),
    [lots]
  )

  const isLoading = incidentsLoading || lotsLoading
  const isError = incidentsError || lotsError

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col gap-6 p-4 sm:p-6"
    >
      <PageHeader
        title="Compliance Risk & Stockout Monitor"
        description="Real-time visibility into compliance risks, near-expiry inventory, and items on hold"
        actions={
          <Button render={<Link to="/report" />}>
            <Siren className="size-4" />
            Report Issue
          </Button>
        }
      />

      {isLoading && !summaryData ? (
        <LoadingState title="Loading risk data..." variant="skeleton" />
      ) : isError ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-card p-12 text-center">
          <AlertCircle className="mb-3 size-10 text-danger" />
          <p className="text-sm font-medium text-foreground">Failed to load risk data</p>
          <p className="mt-1 text-xs text-muted-foreground">Please try again later.</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => { refetchIncidents(); refetchLots() }}
          >
            Retry
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <SummaryCard
              icon={AlertTriangle}
              label="Critical Incidents"
              value={summaryData?.criticalIncidents ?? 0}
              color="bg-danger/10 text-danger"
            />
            <SummaryCard
              icon={ShieldAlert}
              label="Regulatory Notifiable"
              value={summaryData?.regulatoryNotifiable ?? 0}
              color="bg-purple-500/10 text-purple-500"
            />
            <SummaryCard
              icon={Clock}
              label="Near-Expiry Items (≤30d)"
              value={summaryData?.nearExpiryItems ?? 0}
              color="bg-warning/10 text-warning"
            />
            <SummaryCard
              icon={PackageX}
              label="Items on Hold"
              value={summaryData?.itemsOnHold ?? 0}
              color="bg-orange-500/10 text-orange-500"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Thermometer className="size-4 text-danger" />
                <h2 className="text-sm font-semibold text-foreground">Critical & High Compliance Incidents</h2>
              </div>
              {criticalIncidentsList.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-card p-8 text-center">
                  <ShieldAlert className="mb-2 size-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">No critical or high-severity incidents</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {criticalIncidentsList.map((incident: ComplianceSummary) => (
                    <IncidentRow key={incident.id} incident={incident} />
                  ))}
                </div>
              )}
            </section>

            <section className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Clock className="size-4 text-warning" />
                <h2 className="text-sm font-semibold text-foreground">At-Risk Inventory</h2>
              </div>
              {atRiskLots.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-card p-8 text-center">
                  <PackageX className="mb-2 size-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">No at-risk inventory items</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {atRiskLots.map((lot: InventoryLot) => (
                    <LotRow key={lot.id} lot={lot} />
                  ))}
                </div>
              )}
            </section>
          </div>

          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Eye className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">Full Compliance Incident Log</h2>
            </div>
            {incidents.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-card p-12 text-center">
                <AlertTriangle className="mb-2 size-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No compliance incidents recorded</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {incidents.slice(0, 10).map((incident: ComplianceSummary) => (
                  <IncidentRow key={incident.id} incident={incident} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </motion.div>
  )
}

export default RiskPage
