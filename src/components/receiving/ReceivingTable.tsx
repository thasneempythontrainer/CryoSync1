import { useState, useCallback } from "react"
import { motion } from "framer-motion"
import {
  Search,
  ArrowUpDown,
  Eye,
  Trash2,
  XCircle,
  ClipboardCheck,
  RotateCcw,
  AlertTriangle,
  Thermometer,
  PackageX,
  FileX,
  ShieldX,
  ShieldAlert,
  PackageCheck,
  Skull,
  AlertOctagon,
  type LucideIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/components/ui/toast"
import { ShipmentDetailDrawer } from "@/components/receiving/ShipmentDetailDrawer"
import { useShipments, useUpdateShipmentStatus, useDeleteShipment, useFacilities } from "@/services"
import { useAuth } from "@/hooks"
import { formatDate, getStatusBg, formatCategory } from "@/utils/formatters"
import { PRODUCT_CATEGORIES } from "@/constants/enterprise"
import type { ShipmentStatus, ShipmentFlag } from "@/types"

type SortField = "shipmentNumber" | "supplierName" | "receivedDate" | "priority" | "status"
type SortDir = "asc" | "desc"

const statusFilters: { label: string; value: string }[] = [
  { label: "All Statuses", value: "" },
  { label: "Arrived", value: "arrived" },
  { label: "Receiving", value: "receiving" },
  { label: "Quarantined", value: "quarantined" },
  { label: "Released", value: "released" },
  { label: "Rejected", value: "rejected" },
]

type StatusAction = {
  status: ShipmentStatus
  label: string
  title: string
  icon: LucideIcon
  destructive?: boolean
}

const STAGE_ACTIONS: Partial<Record<ShipmentStatus, StatusAction[]>> = {
  scheduled: [{ status: "arrived", label: "Mark Arrived", title: "Mark shipment as arrived", icon: PackageCheck }],
  in_transit: [{ status: "arrived", label: "Mark Arrived", title: "Mark shipment as arrived", icon: PackageCheck }],
  arrived: [{ status: "receiving", label: "Start Receiving", title: "Start receiving", icon: ClipboardCheck }],
  receiving: [
    { status: "released", label: "Release", title: "Release shipment", icon: PackageCheck },
    { status: "quarantined", label: "Quarantine", title: "Quarantine shipment", icon: ShieldAlert },
    { status: "rejected", label: "Reject", title: "Reject shipment", icon: XCircle, destructive: true },
  ],
  quarantined: [
    { status: "released", label: "Release", title: "Release shipment", icon: PackageCheck },
    { status: "rejected", label: "Reject", title: "Reject shipment", icon: XCircle, destructive: true },
  ],
}

function ReceivingTable({ defaultStatusFilter = "" }: { defaultStatusFilter?: string }) {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState(defaultStatusFilter)
  const [facilityFilter, setFacilityFilter] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("")
  const [sortField, setSortField] = useState<SortField>("receivedDate")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; shipmentNumber: string } | null>(null)
  const pageSize = 10

  const { data, isLoading, isError } = useShipments({
    page,
    pageSize,
    status: statusFilter || undefined,
    facility: facilityFilter || undefined,
    category: categoryFilter || undefined,
    search: search || undefined,
    sortBy: sortField,
    sortOrder: sortDir,
  })

  const updateStatus = useUpdateShipmentStatus()
  const deleteShipment = useDeleteShipment()
  const { data: facilities } = useFacilities()
  const { can } = useAuth()
  const canUpdateStatus = can("act:update_cbu_status")
  const canDelete = can("act:update_cbu_status")

  const shipments = data?.data ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"))
      } else {
        setSortField(field)
        setSortDir("asc")
      }
    },
    [sortField],
  )

  const handleStatusChange = useCallback(
    (id: string, status: ShipmentStatus, label: string) => {
      updateStatus.mutate(
        { id, status },
        {
          onSuccess: () => {
            toast.add({
              title: "Status Updated",
              description: `Shipment status changed to ${label}.`,
              type: "success",
            })
          },
          onError: () => {
            toast.add({
              title: "Error",
              description: "Failed to update shipment status.",
              type: "error",
            })
          },
        },
      )
    },
    [updateStatus],
  )

  const handleConfirmDelete = useCallback(() => {
    if (!confirmDelete) return
    const { id, shipmentNumber } = confirmDelete
    deleteShipment.mutate(id, {
      onSuccess: () => {
        toast.add({
          title: "Shipment Deleted",
          description: `${shipmentNumber} was permanently removed.`,
          type: "success",
        })
        if (selectedId === id) setSelectedId(null)
        setConfirmDelete(null)
      },
      onError: () => {
        toast.add({
          title: "Error",
          description: "Failed to delete shipment.",
          type: "error",
        })
        setConfirmDelete(null)
      },
    })
  }, [confirmDelete, deleteShipment, selectedId])

  const SortHeader = useCallback(
    ({ field, children }: { field: SortField; children: React.ReactNode }) => (
      <TableHead>
        <button
          onClick={() => handleSort(field)}
          className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
        >
          {children}
          <ArrowUpDown className="size-3" />
        </button>
      </TableHead>
    ),
    [handleSort],
  )

  if (isError) {
    return (
      <Card size="sm" className="border-border/60 shadow-sm">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <XCircle className="mb-3 size-10 text-destructive" />
          <p className="text-sm font-medium text-foreground">Failed to load shipments</p>
          <p className="mt-1 text-xs text-muted-foreground">Please try again later.</p>
          <Button
            variant="outline"
            size="lg"
            className="mt-4"
            onClick={() => window.location.reload()}
          >
            <RotateCcw className="size-4" />
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card size="sm" className="border-border/60 shadow-sm">
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-lg font-semibold">Pending Receiving</CardTitle>
            <CardDescription>
              {total} shipment{total !== 1 ? "s" : ""} found
            </CardDescription>
          </div>
        </div>

        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              placeholder="Search shipments..."
              className="h-11 pl-8"
            />
          </div>
          <div className="grid gap-2 sm:flex sm:flex-wrap">
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v ?? ""); setPage(1) }}>
              <SelectTrigger className="h-11 w-full sm:w-[130px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {statusFilters.map((sf) => (
                  <SelectItem key={sf.value} value={sf.value}>
                    {sf.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={facilityFilter} onValueChange={(v) => { setFacilityFilter(v ?? ""); setPage(1) }}>
              <SelectTrigger className="h-11 w-full sm:w-[160px]">
                <SelectValue placeholder="Facility" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Facilities</SelectItem>
                {(facilities ?? []).map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v ?? ""); setPage(1) }}>
              <SelectTrigger className="h-11 w-full sm:w-[150px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Categories</SelectItem>
                {PRODUCT_CATEGORIES.map((pc) => (
                  <SelectItem key={pc.id} value={pc.id}>
                    {pc.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : shipments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <ClipboardCheck className="mb-3 size-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-foreground">No shipments found</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {search || statusFilter || facilityFilter || categoryFilter
                ? "Try adjusting your filters."
                : "No shipments are pending receiving."}
            </p>
          </div>
        ) : (
          <>
          <div className="hidden lg:block">
            <Table>
            <TableHeader>
              <TableRow>
                <SortHeader field="shipmentNumber">Shipment</SortHeader>
                <SortHeader field="supplierName">Supplier</SortHeader>
                <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Category
                </TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Temperature
                </TableHead>
                <SortHeader field="priority">Priority</SortHeader>
                <SortHeader field="status">Status</SortHeader>
                <SortHeader field="receivedDate">Received</SortHeader>
                <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Condition
                </TableHead>
                <TableHead className="w-16 text-center text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Flags
                </TableHead>
                <TableHead className="text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shipments.map((shipment, idx) => (
                <motion.tr
                  key={shipment.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  className="border-b transition-colors hover:bg-muted/50"
                >
                  <TableCell>
                    <span className="font-mono text-xs font-medium text-foreground">
                      {shipment.shipmentNumber}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-foreground">{shipment.supplierName}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {formatCategory(shipment.category)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <TempBadge regime={shipment.temperatureRegime} />
                  </TableCell>
                  <TableCell>
                    <PriorityBadge priority={shipment.priority} />
                  </TableCell>
                  <TableCell>
                    <Badge className={getStatusBg(shipment.status)}>
                      {shipment.status.replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(shipment.receivedDate)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <ConditionBadge condition={shipment.condition} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-1">
                      {shipment.flags && shipment.flags.length > 0 ? (
                        shipment.flags.slice(0, 3).map((flag, fi) => (
                          <FlagIcon key={fi} flag={flag} />
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground/40">—</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {canUpdateStatus &&
                        (STAGE_ACTIONS[shipment.status] ?? []).map((action) => (
                          <Button
                            key={action.status}
                            variant="ghost"
                            size="icon"
                            title={action.title}
                            className={action.destructive ? "text-destructive hover:text-destructive" : undefined}
                            onClick={() =>
                              handleStatusChange(shipment.id, action.status, action.label)
                            }
                          >
                            <action.icon className="size-4" />
                          </Button>
                        ))}
                      <Button
                        variant="ghost"
                        size="icon"
                        title="View shipment"
                        onClick={() => setSelectedId(shipment.id)}
                      >
                        <Eye className="size-4" />
                      </Button>
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Delete shipment"
                          className="text-destructive hover:text-destructive"
                          onClick={() =>
                            setConfirmDelete({
                              id: shipment.id,
                              shipmentNumber: shipment.shipmentNumber,
                            })
                          }
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </motion.tr>
              ))}
            </TableBody>
            </Table>
          </div>

          <div className="divide-y divide-border lg:hidden">
            {shipments.map((shipment, idx) => (
              <motion.div
                key={shipment.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03 }}
                className="flex flex-col gap-3 p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-sm font-semibold text-foreground">
                    {shipment.shipmentNumber}
                  </span>
                  <Badge className={getStatusBg(shipment.status)}>
                    {shipment.status.replace(/_/g, " ")}
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate font-medium text-foreground">{shipment.supplierName}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatCategory(shipment.category)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <PriorityBadge priority={shipment.priority} />
                  <TempBadge regime={shipment.temperatureRegime} />
                  <ConditionBadge condition={shipment.condition} />
                  {shipment.flags && shipment.flags.length > 0 && (
                    <span className="ml-1 inline-flex items-center gap-1">
                      {shipment.flags.slice(0, 3).map((flag, fi) => (
                        <FlagIcon key={fi} flag={flag} />
                      ))}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  Received {formatDate(shipment.receivedDate)}
                </div>
                <div className="flex flex-wrap gap-2">
                  {canUpdateStatus &&
                    (STAGE_ACTIONS[shipment.status] ?? []).map((action) => (
                      <Button
                        key={action.status}
                        variant={action.destructive ? "ghost" : "default"}
                        size="xl"
                        className={
                          action.destructive
                            ? "flex-1 text-destructive hover:text-destructive"
                            : "flex-1"
                        }
                        onClick={() => handleStatusChange(shipment.id, action.status, action.label)}
                      >
                        <action.icon className="size-4" />
                        {action.label}
                      </Button>
                    ))}
                  <Button variant="outline" size="xl" className="flex-1" onClick={() => setSelectedId(shipment.id)}>
                    <Eye className="size-4" />
                    View
                  </Button>
                  {canDelete && (
                    <Button
                      variant="outline"
                      size="xl"
                      className="flex-1 text-destructive hover:text-destructive"
                      onClick={() =>
                        setConfirmDelete({
                          id: shipment.id,
                          shipmentNumber: shipment.shipmentNumber,
                        })
                      }
                    >
                      <Trash2 className="size-4" />
                      Delete
                    </Button>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
          </>
        )}
      </CardContent>

      {totalPages > 1 && (
        <CardFooter className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="lg"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="lg"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </CardFooter>
      )}

      <ShipmentDetailDrawer
        shipmentId={selectedId}
        open={selectedId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null)
        }}
      />

      <Dialog
        open={confirmDelete !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete shipment?</DialogTitle>
            <DialogDescription>
              "{confirmDelete?.shipmentNumber}" and all of its associated data will be permanently
              removed. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button variant="destructive" onClick={handleConfirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function TempBadge({ regime }: { regime: string }) {
  const colors: Record<string, string> = {
    ambient: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    refrigerated_2_8: "bg-info/10 text-info",
    frozen_minus_20: "bg-info/10 text-info",
    ultra_frozen_minus_80: "bg-purple-500/10 text-purple-500",
    liquid_nitrogen: "bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-400",
  }

  const labels: Record<string, string> = {
    ambient: "Ambient",
    refrigerated_2_8: "2-8°C",
    frozen_minus_20: "-20°C",
    ultra_frozen_minus_80: "-80°C",
    liquid_nitrogen: "LN₂",
  }

  return (
    <Badge variant="outline" className={colors[regime] ?? ""}>
      {labels[regime] ?? regime}
    </Badge>
  )
}

function PriorityBadge({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    standard: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    expedited: "bg-warning/10 text-warning",
    critical: "bg-danger/10 text-danger",
  }

  return (
    <Badge variant="outline" className={colors[priority] ?? ""}>
      {priority}
    </Badge>
  )
}

const FLAG_ICONS: Record<ShipmentFlag['type'], { icon: typeof AlertTriangle; color: string }> = {
  temperature_excursion: { icon: Thermometer, color: 'text-danger' },
  damaged: { icon: PackageX, color: 'text-danger' },
  missing_coa: { icon: FileX, color: 'text-warning' },
  missing_coc: { icon: ShieldX, color: 'text-warning' },
  near_expiry: { icon: AlertTriangle, color: 'text-orange-500' },
  hazardous: { icon: Skull, color: 'text-orange-500' },
  controlled_substance: { icon: AlertOctagon, color: 'text-purple-500' },
  high_priority: { icon: AlertTriangle, color: 'text-danger' },
}

function FlagIcon({ flag }: { flag: ShipmentFlag }) {
  const { icon: Icon, color } = FLAG_ICONS[flag.type] ?? { icon: AlertTriangle, color: 'text-muted-foreground' }
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button type="button" className="inline-flex cursor-default">
            <Icon className={`size-3.5 ${color}`} />
          </button>
        }
      />
      <TooltipContent side="top" sideOffset={4}>
        <span className="text-xs">{flag.label}</span>
      </TooltipContent>
    </Tooltip>
  )
}

function ConditionBadge({ condition }: { condition: string }) {
  const colors: Record<string, string> = {
    excellent: "bg-success/10 text-success",
    good: "bg-info/10 text-info",
    fair: "bg-warning/10 text-warning",
    damaged: "bg-danger/10 text-danger",
  }

  return (
    <Badge variant="outline" className={colors[condition] ?? ""}>
      {condition}
    </Badge>
  )
}

export { ReceivingTable }
