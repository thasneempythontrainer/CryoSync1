import { useState, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { PackagePlus, ClipboardList, Scan, AlertTriangle, Thermometer, PackageX, Eye } from "lucide-react"

import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import { Separator } from "@/components/ui/separator"
import { ReceivingForm } from "@/components/receiving/ReceivingForm"
import { ReceivingTable } from "@/components/receiving/ReceivingTable"
import { BarcodeScanner } from "@/components/receiving/BarcodeScanner"
import { useShipments } from "@/services"
import type { ShipmentFlag } from "@/types"

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

function CriticalAlert({ icon: Icon, label, count, color }: {
  icon: typeof AlertTriangle
  label: string
  count: number
  color: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button type="button" className="inline-flex items-center gap-1 rounded-md p-1.5 text-xs cursor-default">
            <Icon className={`size-3.5 ${color}`} />
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
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="flex w-full flex-1 flex-col gap-6 px-4 py-6"
    >
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <PackagePlus className="size-5" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Receiving Intake
            </h1>
          </div>
          <p className="ml-12 text-sm text-muted-foreground">
            Document, scan, and manage incoming pharmaceutical cold-chain shipments
          </p>
        </div>
      </div>

      {totalFlags > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2.5 dark:border-amber-800 dark:bg-amber-950/30">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
            <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              {totalFlags} shipment{totalFlags > 1 ? 's' : ''} need attention
            </span>
          </div>
          <div className="flex items-center gap-1 ml-auto">
            {excursionCount > 0 && (
              <CriticalAlert icon={Thermometer} label="Temperature excursions" count={excursionCount} color="text-red-500" />
            )}
            {damagedCount > 0 && (
              <CriticalAlert icon={PackageX} label="Damaged goods" count={damagedCount} color="text-red-500" />
            )}
            {missingDocCount > 0 && (
              <CriticalAlert icon={Eye} label="Missing documentation" count={missingDocCount} color="text-amber-500" />
            )}
            <button
              type="button"
              onClick={() => setActiveTab('pending')}
              className="rounded-md px-2.5 py-1.5 text-xs font-semibold text-amber-700 underline underline-offset-2 hover:bg-amber-100/70 hover:text-amber-800 dark:text-amber-400 dark:hover:bg-amber-900/40 dark:hover:text-amber-300"
            >
              View all
            </button>
          </div>
        </div>
      )}

      <Separator />

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
              <motion.div
                key="new-intake"
                className="w-full"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
              >
                <div className="mb-4">
                  <p className="text-sm text-muted-foreground">
                    {tabs[0].description}
                  </p>
                </div>
                <ReceivingForm prefillShipment={prefillShipment} />
              </motion.div>
            )}
            {activeTab === "pending" && (
              <motion.div
                key="pending"
                className="w-full"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
              >
                <div className="mb-4">
                  <p className="text-sm text-muted-foreground">
                    {tabs[1].description}
                  </p>
                </div>
                <ReceivingTable defaultStatusFilter="arrived" />
              </motion.div>
            )}
            {activeTab === "barcode" && (
              <motion.div
                key="barcode"
                className="w-full"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
              >
                <div className="mb-4">
                  <p className="text-sm text-muted-foreground">
                    {tabs[2].description}
                  </p>
                </div>
                <BarcodeScanner onCreateShipment={handleCreateShipment} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Tabs>
    </motion.div>
  )
}

export { ReceivingPage }
export default ReceivingPage
