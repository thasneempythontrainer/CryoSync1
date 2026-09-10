import {
  Thermometer,
  Package,
  CircleAlert,
} from "lucide-react"

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Separator } from "@/components/ui/separator"
import { StatusBadge } from "@/components/common/StatusBadge"
import { LoadingState } from "@/components/common/LoadingState"
import { ErrorState } from "@/components/common/ErrorState"
import { TemperatureLoggerPanel } from "@/components/receiving/TemperatureLoggerPanel"
import { useShipment } from "@/services"
import { formatDate, formatCategory, formatMinutes } from "@/utils/formatters"
import { TEMPERATURE_REGIMES } from "@/constants/enterprise"

interface ShipmentDetailDrawerProps {
  shipmentId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
      <div className="text-right text-sm text-foreground">{value}</div>
    </div>
  )
}

function ShipmentDetailDrawer({ shipmentId, open, onOpenChange }: ShipmentDetailDrawerProps) {
  const { data: shipment, isLoading, isError, refetch } = useShipment(shipmentId ?? undefined)

  const regimeInfo = shipment
    ? TEMPERATURE_REGIMES.find((r) => r.id === shipment.temperatureRegime)
    : undefined

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl">
        {isError && (
          <div className="p-4 py-10">
            <ErrorState
              title="Failed to load shipment"
              description="This shipment could not be fetched from the backend."
              onRetry={() => refetch()}
            />
          </div>
        )}

        {!isError && isLoading && (
          <div className="p-4 py-10">
            <LoadingState title="Loading shipment..." />
          </div>
        )}

        {!isError && !isLoading && shipment && (
          <>
            <SheetHeader>
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Package className="size-5" />
                </div>
                <div>
                  <SheetTitle className="font-mono text-lg">
                    {shipment.shipmentNumber}
                  </SheetTitle>
                  <SheetDescription className="text-xs">
                    {shipment.supplierName}
                  </SheetDescription>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <StatusBadge status={shipment.status} />
                <StatusBadge status={shipment.priority} />
              </div>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto">
              <div className="space-y-4 p-4">
                <div className="grid grid-cols-2 gap-x-6">
                  <InfoRow label="Category" value={formatCategory(shipment.category)} />
                  <InfoRow label="Regime" value={regimeInfo?.label ?? shipment.temperatureRegime} />
                  <InfoRow label="Origin" value={shipment.origin || "—"} />
                  <InfoRow label="Destination" value={shipment.destination || "—"} />
                  <InfoRow label="Received" value={formatDate(shipment.receivedDate)} />
                  <InfoRow label="Condition" value={shipment.condition} />
                  <InfoRow label="Carrier" value={shipment.carrier || "—"} />
                  <InfoRow label="Tracking" value={shipment.trackingNumber || "—"} />
                  <InfoRow label="Lots" value={shipment.lotCount} />
                  <InfoRow label="Products" value={shipment.productCount} />
                  <InfoRow
                    label="Dock→Storage"
                    value={shipment.dockToInventoryMinutes ? formatMinutes(shipment.dockToInventoryMinutes) : "—"}
                  />
                  <InfoRow
                    label="Excursions"
                    value={
                      shipment.temperatureReadings.some((r) => r.excursion) ? (
                        <span className="inline-flex items-center gap-1 text-danger">
                          <CircleAlert className="size-3.5" />
                          {shipment.temperatureReadings.filter((r) => r.excursion).length} recorded
                        </span>
                      ) : (
                        <span className="text-success">None</span>
                      )
                    }
                  />
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Thermometer className="size-4" />
                    </span>
                    <p className="text-sm font-semibold text-foreground">Temperature Loggers</p>
                  </div>
                  <TemperatureLoggerPanel shipmentId={shipment.id} />
                </div>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

export { ShipmentDetailDrawer }
