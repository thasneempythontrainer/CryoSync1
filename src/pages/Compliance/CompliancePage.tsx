import { useState, useEffect, useMemo, useCallback } from "react"
import { motion } from "framer-motion"
import { Link } from "react-router-dom"
import { Siren, Radar, Loader2 } from "lucide-react"
import { PageHeader } from "@/components/common/PageHeader"
import { LoadingState } from "@/components/common/LoadingState"
import { ErrorState } from "@/components/common/ErrorState"
import { Button } from "@/components/ui/button"
import { useComplianceIncidents, getComplianceIncidents } from "@/services/compliance-service"
import { scanTemperatureIncidents } from "@/services/ai-service"
import type { ComplianceSummary } from "@/types"

import { ComplianceFilters } from "@/components/compliance/ComplianceFilters"
import { ComplianceSummaryCards } from "@/components/compliance/ComplianceSummaryCards"
import type { ComplianceSummaryData } from "@/components/compliance/ComplianceSummaryCards"
import { TemperatureExcursionChart } from "@/components/compliance/TemperatureExcursionChart"
import type { ExcursionDataPoint } from "@/components/compliance/TemperatureExcursionChart"
import { ComplianceDataGrid } from "@/components/compliance/ComplianceDataGrid"
import { IncidentDetailDrawer } from "@/components/compliance/IncidentDetailDrawer"

interface FilterValues {
  status: string
  severity: string
  type: string
  facility: string
  search: string
}

const DEFAULT_FILTERS: FilterValues = {
  status: "",
  severity: "",
  type: "",
  facility: "",
  search: "",
}

function CompliancePage() {
  const [filters, setFilters] = useState<FilterValues>(DEFAULT_FILTERS)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [sortBy, setSortBy] = useState<string>("detectedDate")
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc")
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [summaryData, setSummaryData] = useState<ComplianceSummaryData | undefined>()
  const [excursionData, setExcursionData] = useState<ExcursionDataPoint[]>([])
  const [scanning, setScanning] = useState(false)
  const [scanMessage, setScanMessage] = useState<{ text: string; isError: boolean } | null>(null)

  const queryParams = useMemo(() => ({
    page,
    pageSize,
    status: filters.status || undefined,
    severity: filters.severity || undefined,
    type: filters.type || undefined,
    facility: filters.facility || undefined,
    search: filters.search || undefined,
  }), [page, pageSize, filters])

  const { data, isLoading, isError, refetch } = useComplianceIncidents(queryParams)

  const handleRowClick = useCallback((incident: ComplianceSummary) => {
    setSelectedIncidentId(incident.id)
    setDrawerOpen(true)
  }, [])

  const handleSort = useCallback((column: string) => {
    setSortBy((prev) => {
      if (prev === column) {
        setSortOrder((o) => o === "asc" ? "desc" : "asc")
        return prev
      }
      setSortOrder("asc")
      return column
    })
  }, [])

  const handleFilterChange = useCallback((key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
    setPage(1)
  }, [])

  const handleResetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS)
    setPage(1)
  }, [])

  const loadMeta = useCallback(async () => {
    try {
      const all = await getComplianceIncidents({ pageSize: 1000 })
      const incidents = all.data
      const open = incidents.filter((i) => i.status === "open" || i.status === "investigating")
      const critical = incidents.filter((i) => i.severity === "critical")
      const regulatory = incidents.filter((i) => i.regulatoryNotifiable)
      const resolved = incidents.filter((i) => i.status === "resolved" || i.status === "closed")
      const avgDays = resolved.length > 0
        ? resolved.reduce((sum, i) => sum + i.daysOpen, 0) / resolved.length
        : 0

      setSummaryData({
        openIncidents: open.length,
        criticalIncidents: critical.length,
        avgResolutionDays: avgDays,
        regulatoryNotifiable: regulatory.length,
      })

      const tempMap = new Map<string, { excursions: number; criticalExcursions: number }>()
      for (const inc of incidents) {
        if (inc.deviationType === "temperature_excursion" && inc.status !== "closed") {
          const dateKey = inc.detectedDate.split("T")[0]
          const existing = tempMap.get(dateKey) ?? { excursions: 0, criticalExcursions: 0 }
          existing.excursions++
          if (inc.severity === "critical" || inc.severity === "high") {
            existing.criticalExcursions++
          }
          tempMap.set(dateKey, existing)
        }
      }
      const chartData: ExcursionDataPoint[] = Array.from(tempMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, vals]) => ({
          date,
          excursions: vals.excursions,
          criticalExcursions: vals.criticalExcursions,
        }))
      setExcursionData(chartData)
    } catch {
    }
  }, [])

  useEffect(() => {
    loadMeta()
  }, [loadMeta])

  const handleRunScan = useCallback(async () => {
    setScanning(true)
    setScanMessage(null)
    try {
      const result = await scanTemperatureIncidents()
      const { summary } = result
      const text =
        summary.created > 0
          ? `AI scan complete: ${summary.scanned} shipment(s) scanned, ${summary.detected} with excursions — ${summary.created} new incident(s) created (${summary.alreadyReported} already reported).`
          : summary.detected > 0
            ? `AI scan complete: ${summary.detected} shipment(s) with excursions — all already have open incidents.`
            : `AI scan complete: no temperature excursions detected across ${summary.scanned} shipment(s).`
      setScanMessage({ text, isError: false })
      refetch()
      loadMeta()
    } catch (err) {
      setScanMessage({
        text: err instanceof Error ? err.message : "AI scan failed. Please try again.",
        isError: true,
      })
    } finally {
      setScanning(false)
    }
  }, [refetch, loadMeta])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col gap-6 p-4 sm:p-6"
    >
      <PageHeader
        title="Compliance & Cold Chain Monitor"
        description="Track, investigate, and resolve compliance incidents across the cold chain"
        actions={
          <>
            <Button variant="outline" onClick={handleRunScan} disabled={scanning}>
              {scanning ? <Loader2 className="size-4 animate-spin" /> : <Radar className="size-4" />}
              {scanning ? "Scanning..." : "Run AI Scan"}
            </Button>
            <Button render={<Link to="/report" />}>
              <Siren className="size-4" />
              Report Incident
            </Button>
          </>
        }
      />

      {scanMessage && (
        <div
          className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
            scanMessage.isError
              ? "border-danger/40 bg-danger/10 text-danger"
              : "border-success/40 bg-success/10 text-success"
          }`}
        >
          <Radar className="size-4 shrink-0" />
          <span>{scanMessage.text}</span>
        </div>
      )}

      <ComplianceFilters
        values={filters}
        onChange={handleFilterChange}
        onReset={handleResetFilters}
      />

      <section className="w-full">
        <ComplianceSummaryCards data={summaryData} loading={isLoading && !summaryData} />
      </section>

      <section className="w-full">
        <TemperatureExcursionChart
          data={excursionData}
          loading={isLoading && excursionData.length === 0}
        />
      </section>

      {isLoading && !data ? (
        <LoadingState title="Loading incidents..." variant="skeleton" />
      ) : isError ? (
        <ErrorState
          title="Failed to load compliance incidents"
          onRetry={() => refetch()}
        />
      ) : (
        <div>
          <ComplianceDataGrid
            data={data?.data ?? []}
            total={data?.total ?? 0}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onSort={handleSort}
            onRowClick={handleRowClick}
            loading={isLoading}
            sortBy={sortBy}
            sortOrder={sortOrder}
          />
        </div>
      )}

      <IncidentDetailDrawer
        incidentId={selectedIncidentId}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
    </motion.div>
  )
}

export default CompliancePage
