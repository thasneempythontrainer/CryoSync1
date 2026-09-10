import { useState, useCallback } from "react"
import { AnimatePresence } from "framer-motion"
import { PackagePlus, ClipboardList, Scan, AlertTriangle, Thermometer, PackageX, Eye } from "lucide-react"

import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import { PageHeader } from "@/components/common/PageHeader"
import { ReceivingForm } from "@/components/receiving/ReceivingForm"
import { ReceivingTable } from "@/components/receiving/ReceivingTable"
import { BarcodeScanner } from "@/components/receiving/BarcodeScanner"
import { useShipments } from "@/services"
import { cn } from "@/lib/utils"

const tabs = [
  {
    id: "new-intake",
    label: "New Intake",
    icon: PackagePlus,
    description: "Multi-step form to document incoming cold-chain shipments",
  },
  {
    id: "pending",
    label: "Pending Receiving",
    icon: ClipboardList,
    description: "View and manage shipments awaiting receiving",
  },
  {
    id: "barcode",
    label: "Barcode Scan",
    icon: Scan,
    description: "Scan shipment barcodes for quick lookup",
  },
]

function CriticalAlert({ icon: Icon, label, count, variant }: {
  icon: typeof AlertTriangle
  label: string
  count: number
  variant: "danger" | "warning"
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button type="button" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs cursor-default">
            <Icon className={cn("size-3.5", variant === "danger" ? "text-danger" : "text-warning")} />
            <span className="font-semibold tabular-nums text-foreground">{count}</span>
          </button>
        }
      />
      <TooltipContent side="bottom" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

function ReceivingPage() {
  const [activeTab, setActiveTab] = useState("new-intake")
  const [prefillShipment, setPrefillShipment] = useState("")

  const handleCreateShipment = useCallback((shipmentNumber: string) => {
    setPrefillShipment(shipmentNumber)
    setActiveTab("new-intake")
  }, [])

  const { data: alertData } = useShipments({
    page: 1,
    pageSize: 100,
    status: 'arrived',
  })

  const criticalShipments = (alertData?.data ?? []).filter(s => s.flags && s.flags.length > 0)
  const excursionCount = criticalShipments.filter(s => s.flags?.some(f => f.type === 'temperature_excursion')).length
  const damagedCount = criticalShipments.filter(s => s.flags?.some(f => f.type === 'damaged')).length
  const missingDocCount = criticalShipments.filter(s => s.flags?.some(f => f.type === 'missing_coa' || f.type === 'missing_coc')).length
  const totalFlags = criticalShipments.length

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Receiving Intake"
        description="Document, scan, and manage incoming pharmaceutical cold-chain shipments"
      />

      {totalFlags > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-warning" />
            <span className="text-sm font-semibold text-foreground">
              {totalFlags} shipment{totalFlags > 1 ? 's' : ''} need attention
            </span>
          </div>
          <div className="flex items-center gap-1 ml-auto">
            {excursionCount > 0 && (
              <CriticalAlert icon={Thermometer} label="Temperature excursions" count={excursionCount} variant="danger" />
            )}
            {damagedCount > 0 && (
              <CriticalAlert icon={PackageX} label="Damaged goods" count={damagedCount} variant="danger" />
            )}
            {missingDocCount > 0 && (
              <CriticalAlert icon={Eye} label="Missing documentation" count={missingDocCount} variant="warning" />
            )}
            <button
              type="button"
              onClick={() => setActiveTab('pending')}
              className="rounded-md px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors"
            >
              View all
            </button>
          </div>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList variant="line" className="w-full">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id} className="gap-2">
              <tab.icon className="size-4.5" />
              <span className="hidden sm:inline">{tab.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="mt-6 w-full">
          <AnimatePresence mode="wait">
            {activeTab === "new-intake" && (
              <div key="new-intake" className="w-full">
                <p className="mb-4 text-sm text-muted-foreground">
                  {tabs[0].description}
                </p>
                <ReceivingForm prefillShipment={prefillShipment} />
              </div>
            )}
            {activeTab === "pending" && (
              <div key="pending" className="w-full">
                <p className="mb-4 text-sm text-muted-foreground">
                  {tabs[1].description}
                </p>
                <ReceivingTable defaultStatusFilter="arrived" />
              </div>
            )}
            {activeTab === "barcode" && (
              <div key="barcode" className="w-full">
                <p className="mb-4 text-sm text-muted-foreground">
                  {tabs[2].description}
                </p>
                <BarcodeScanner onCreateShipment={handleCreateShipment} />
              </div>
            )}
          </AnimatePresence>
        </div>
      </Tabs>
    </div>
  )
}

export { ReceivingPage }
export default ReceivingPage
