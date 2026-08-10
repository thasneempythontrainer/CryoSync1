import type {
  AgentToolDefinition,
  AgentToolHandler,
  AgentToolParameterSchema,
  Shipment,
  ShipmentStatus,
  ShipmentSummary,
  InventoryLot,
  StorageZone,
  ComplianceIncident,
  ComplianceSummary,
  AuditLogEntry,
  DeviationType,
  ComplianceSeverity,
  DashboardData,
  SystemHealth,
  Facility,
  Supplier,
  Product,
  AuthUser,
} from '@/types'
import type {
  ReportIncidentData,
  ResolveIncidentData,
  AssignIncidentData,
  ComplianceListParams,
} from '@/services/compliance-service'
import type { InventoryListParams } from '@/services/inventory-service'
import type { ShipmentListParams } from '@/services/shipment-service'
import type { SystemLogsParams } from '@/services/system-service'
import type { DashboardFilters } from '@/services/dashboard-service'
import type { TempIncidentScanResult, ResolveOpenIncidentsResult } from '@/services/ai-service'
import type { Permission } from '@/lib/permissions'

const DEVIATION_TYPES =
  'temperature_excursion, documentation_gap, quality_deviation, chain_of_custody_break, storage_violation, labeling_error, contamination_suspected, equipment_malfunction, human_error, packaging_failure'

const SHIPMENT_STATUSES = 'scheduled, in_transit, arrived, receiving, quarantined, released, rejected, returned'

const INVENTORY_STATUSES =
  'available, reserved, quarantined, quality_hold, expired, disposed, released'

const TEMPERATURE_REGIMES =
  'ambient, refrigerated_2_8, frozen_minus_20, ultra_frozen_minus_80, liquid_nitrogen'

const PRODUCT_CATEGORIES =
  'pcr_reagents, dna_extraction_kits, rna_isolation_kits, elisa_kits, diagnostic_test_kits, cryogenic_vials, cell_culture_media, monoclonal_antibodies, vaccines, insulin_products, blood_collection_tubes, biologics, laboratory_chemicals, reference_standards, cold_chain_medicines'

const CHART_DATASETS: string[] = [
  'shipment_trends',
  'receiving_volume',
  'temperature_compliance',
  'supplier_performance',
  'inventory_distribution',
  'storage_occupancy',
  'expiry_timeline',
  'cold_chain_excursions',
  'quality_inspection_results',
  'shipments_by_status',
  'inventory_by_status',
  'inventory_by_category',
  'incidents_by_severity',
  'incidents_by_type',
  'storage_utilization',
]

export const AGENT_CHART_TOOL = 'create_chart'

const fn = (
  name: string,
  description: string,
  properties: Record<string, AgentToolParameterSchema>,
  required: string[] = [],
): AgentToolDefinition => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required } },
})

export interface AgentToolsDeps {
  // Shipments
  updateStatus: (id: string, status: ShipmentStatus) => Promise<unknown>
  createShipment: (data: Partial<Shipment>) => Promise<unknown>
  updateShipmentDetails: (id: string, data: Partial<Shipment>) => Promise<unknown>
  lookupShipment: (id: string) => Promise<Shipment | undefined>
  listShipments: (params?: ShipmentListParams) => Promise<{ data: ShipmentSummary[]; total: number }>

  // Inventory
  lookupInventory: (params?: InventoryListParams) => Promise<{ data: InventoryLot[]; total: number }>
  getInventoryLot: (id: string) => Promise<InventoryLot | undefined>
  listStorageZones: (facilityId?: string) => Promise<StorageZone[]>

  // Compliance
  createIncident: (data: ReportIncidentData) => Promise<ComplianceIncident>
  listIncidents: (params?: ComplianceListParams) => Promise<{ data: ComplianceSummary[]; total: number }>
  getIncident: (id: string) => Promise<ComplianceIncident | undefined>
  resolveIncident: (id: string, resolution: ResolveIncidentData) => Promise<ComplianceIncident>
  assignIncident: (id: string, data: AssignIncidentData) => Promise<ComplianceIncident>
  getAuditLog: (incidentId: string) => Promise<AuditLogEntry[]>

  // Dashboard & system
  getDashboard: (filters?: DashboardFilters) => Promise<DashboardData>
  getSystemHealth: () => Promise<SystemHealth>
  getSystemLogs: (params?: SystemLogsParams) => Promise<{ data: Record<string, unknown>[]; total: number }>

  // AI incident detection
  scanTemperatureIncidents: (facilityId?: string) => Promise<TempIncidentScanResult>
  resolveAllOpenIncidents: (data: {
    correctiveAction?: string
    closureNotes?: string
  }) => Promise<ResolveOpenIncidentsResult>

  // Reference data
  listFacilities: () => Promise<Facility[]>
  listSuppliers: () => Promise<Supplier[]>
  listProducts: () => Promise<Product[]>
  listUsers: () => Promise<AuthUser[]>

  // Permission gate for destructive actions (optional; skips checks when omitted)
  can?: (permission: Permission) => boolean
}

export function allAgentTools(deps: AgentToolsDeps): AgentToolHandler[] {
  const require = (permission: Permission): void => {
    if (deps.can && !deps.can(permission)) {
      throw new Error(
        `You do not have permission to perform this action (requires "${permission}"). Ask a supervisor for help.`,
      )
    }
  }

  const handlers: AgentToolHandler[] = [
    // ----------------------------- Shipments -----------------------------
    {
      definition: fn(
        'list_shipments',
        'List and filter shipments in the cold chain. Supports filters by status, supplier, category, facility, and keyword search.',
        {
          status: { type: 'string', enum: SHIPMENT_STATUSES.split(','), description: 'Filter by shipment status' },
          supplier: { type: 'string', description: 'Filter by supplier name (partial match)' },
          category: { type: 'string', enum: PRODUCT_CATEGORIES.split(','), description: 'Filter by product category' },
          facility: { type: 'string', description: 'Filter by facility id (e.g. FAC-001)' },
          search: { type: 'string', description: 'Keyword search across shipment number, supplier, or origin' },
          pageSize: { type: 'number', description: 'Max rows to return (default 20)' },
        },
      ),
      run: async (args) => {
        const { data, total } = await deps.listShipments({
          status: (args.status as string) || undefined,
          supplier: (args.supplier as string) || undefined,
          category: (args.category as string) || undefined,
          facility: (args.facility as string) || undefined,
          search: (args.search as string) || undefined,
          pageSize: (args.pageSize as number) || undefined,
        })
        if (total === 0) return 'No shipments match the given criteria.'
        const rows = data.slice(0, 50).map((s) => shipmentSummary(s))
        return `Shipments (${total} total, showing ${data.length}): ${JSON.stringify(rows)}`
      },
    },
    {
      definition: fn(
        'get_shipment',
        'Look up full details of a single shipment by id or shipment number.',
        { shipmentId: { type: 'string', description: 'Shipment id or shipment number (e.g. SHP-...)' } },
        ['shipmentId'],
      ),
      run: async (args) => {
        const id = shipmentId(String(args.shipmentId))
        const data = await deps.lookupShipment(id)
        if (!data) return `No shipment found for ${id}.`
        return `Shipment details: ${JSON.stringify(shipmentSummary(data))}`
      },
    },
    {
      definition: fn(
        'update_shipment_status',
        'Change the status of a shipment to one of: scheduled, in_transit, arrived, receiving, quarantined, released, rejected, returned.',
        {
          shipmentId: { type: 'string', description: 'Shipment id or shipment number (e.g. SH-...)' },
          status: { type: 'string', enum: SHIPMENT_STATUSES.split(','), description: 'Target shipment status' },
        },
        ['shipmentId', 'status'],
      ),
      run: async (args) => {
        require('act:update_shipment_status')
        const id = shipmentId(String(args.shipmentId))
        const status = normalizeStatus(String(args.status))
        await deps.updateStatus(id, status)
        return `OK updated shipment ${id} to status "${status}".`
      },
    },
    {
      definition: fn(
        'start_receiving',
        'Begin receiving a shipment by moving it into the "receiving" workflow.',
        { shipmentId: { type: 'string', description: 'Shipment id or shipment number (e.g. SH-...)' } },
        ['shipmentId'],
      ),
      run: async (args) => {
        require('act:update_shipment_status')
        const id = shipmentId(String(args.shipmentId))
        await deps.updateStatus(id, 'receiving')
        return `OK started receiving shipment ${id}.`
      },
    },
    {
      definition: fn(
        'create_shipment',
        'Record a new shipment intake from a supplier. Required: shipmentNumber, carrier, trackingNumber, billOfLading, facilityId, supplierName, origin, category, temperatureRegime, storageZone.',
        {
          shipmentNumber: { type: 'string', description: 'Shipment number (e.g. SHP-20260101-001)' },
          carrier: { type: 'string', description: 'Carrier name (e.g. DHL PharmaTrans)' },
          trackingNumber: { type: 'string', description: 'Carrier tracking number' },
          billOfLading: { type: 'string', description: 'Bill of lading reference' },
          priority: { type: 'string', enum: ['standard', 'expedited', 'critical'], description: 'Shipment priority' },
          facilityId: { type: 'string', description: 'Destination facility id (e.g. FAC-001)' },
          supplierName: { type: 'string', description: 'Supplier name' },
          origin: { type: 'string', description: 'Origin location' },
          category: { type: 'string', enum: PRODUCT_CATEGORIES.split(','), description: 'Product category' },
          temperatureRegime: { type: 'string', enum: TEMPERATURE_REGIMES.split(','), description: 'Temperature regime' },
          productCount: { type: 'number', description: 'Number of products' },
          totalValue: { type: 'number', description: 'Total shipment value in USD' },
          lotCount: { type: 'number', description: 'Number of lots' },
          chainOfCustody: { type: 'boolean', description: 'Chain of custody documentation complete' },
          coaAttached: { type: 'boolean', description: 'Certificate of Analysis attached' },
          condition: { type: 'string', enum: ['excellent', 'good', 'fair', 'damaged'], description: 'Goods condition' },
          storageZone: { type: 'string', description: 'Destination storage zone name' },
          notes: { type: 'string', description: 'Additional receiving notes' },
        },
        ['shipmentNumber', 'carrier', 'trackingNumber', 'billOfLading', 'facilityId', 'supplierName', 'origin', 'category', 'temperatureRegime', 'storageZone'],
      ),
      run: async (args) => {
        require('act:create_shipment')
        const created = await deps.createShipment(args as Partial<Shipment>)
        return `Created shipment: ${JSON.stringify(created)}`
      },
    },
    {
      definition: fn(
        'update_shipment_details',
        'Update editable fields of an existing shipment (e.g. notes, condition, storageZone, priority, carrier, trackingNumber, receivingTechnician, coaAttached, chainOfCustody).',
        {
          shipmentId: { type: 'string', description: 'Shipment id or shipment number (e.g. SH-...)' },
          notes: { type: 'string', description: 'Update the notes field' },
          condition: { type: 'string', enum: ['excellent', 'good', 'fair', 'damaged'], description: 'Update goods condition' },
          storageZone: { type: 'string', description: 'Update destination storage zone' },
          priority: { type: 'string', enum: ['standard', 'expedited', 'critical'], description: 'Update priority' },
          carrier: { type: 'string', description: 'Update carrier' },
          trackingNumber: { type: 'string', description: 'Update tracking number' },
          receivingTechnician: { type: 'string', description: 'Update receiving technician name' },
          coaAttached: { type: 'boolean', description: 'Update COA attached flag' },
          chainOfCustody: { type: 'boolean', description: 'Update chain of custody flag' },
        },
        ['shipmentId'],
      ),
      run: async (args) => {
        require('act:update_shipment_status')
        const id = shipmentId(String(args.shipmentId))
        const fields = new Set(['notes', 'condition', 'storageZone', 'priority', 'carrier', 'trackingNumber', 'receivingTechnician', 'coaAttached', 'chainOfCustody'])
        const updates: Record<string, unknown> = {}
        for (const key of fields) {
          if (args[key] !== undefined) updates[key] = args[key]
        }
        if (Object.keys(updates).length === 0) return 'No updatable fields were provided.'
        await deps.updateShipmentDetails(id, updates as Partial<Shipment>)
        return `OK updated shipment ${id} fields: ${Object.keys(updates).join(', ')}.`
      },
    },

    // ----------------------------- Inventory -----------------------------
    {
      definition: fn(
        'list_inventory',
        'Query inventory lots, optionally filtered by keyword, status, category, or near-expiry.',
        {
          search: { type: 'string', description: 'Keyword to filter lots (product, lot number, supplier)' },
          status: { type: 'string', enum: INVENTORY_STATUSES.split(','), description: 'Filter by lot status' },
          category: { type: 'string', enum: PRODUCT_CATEGORIES.split(','), description: 'Filter by product category' },
          nearExpiry: { type: 'boolean', description: 'Only lots expiring within 30 days' },
          pageSize: { type: 'number', description: 'Max rows to return (default 20)' },
        },
      ),
      run: async (args) => {
        const { data, total } = await deps.lookupInventory({
          search: (args.search as string) || undefined,
          status: (args.status as string) || undefined,
          category: (args.category as string) || undefined,
          nearExpiry: args.nearExpiry === true ? true : undefined,
          pageSize: (args.pageSize as number) || undefined,
        })
        if (total === 0) return 'No inventory lots match the given criteria.'
        const rows = data.slice(0, 50).map((l) => ({
          id: l.id,
          lotNumber: l.lotNumber,
          productName: l.productName,
          quantity: l.quantity,
          unit: l.unit,
          status: l.status,
          storageZone: l.storageZone,
          daysUntilExpiry: l.daysUntilExpiry,
          value: l.value,
        }))
        return `Inventory lots (${total} total, showing ${data.length}): ${JSON.stringify(rows)}`
      },
    },
    {
      definition: fn(
        'get_inventory_lot',
        'Look up a single inventory lot by id.',
        { lotId: { type: 'string', description: 'Inventory lot id (e.g. LOT-...)' } },
        ['lotId'],
      ),
      run: async (args) => {
        const id = String(args.lotId ?? '').trim()
        if (!id) throw new Error('Lot identifier is required.')
        const lot = await deps.getInventoryLot(id)
        if (!lot) return `No inventory lot found for ${id}.`
        return `Inventory lot: ${JSON.stringify(lot)}`
      },
    },
    {
      definition: fn(
        'list_storage_zones',
        'List storage zones and their capacity utilization, optionally filtered by facility.',
        { facilityId: { type: 'string', description: 'Optional facility id (e.g. FAC-001)' } },
      ),
      run: async (args) => {
        const zones = await deps.listStorageZones((args.facilityId as string) || undefined)
        if (zones.length === 0) return 'No storage zones found.'
        const rows = zones.map((z) => ({
          name: z.name,
          facilityName: z.facilityName,
          temperatureRegime: z.temperatureRegime,
          capacity: z.capacity,
          utilized: z.utilized,
          utilizationPercent: z.utilizationPercent,
          status: z.status,
        }))
        return `Storage zones (${zones.length}): ${JSON.stringify(rows)}`
      },
    },

    // ----------------------------- Compliance -----------------------------
    {
      definition: fn(
        'list_compliance_incidents',
        'List compliance, quality, and cold-chain incidents. Supports filters by status, severity, deviation type, and search.',
        {
          status: { type: 'string', enum: ['open', 'investigating', 'resolved', 'closed'], description: 'Filter by incident status' },
          severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], description: 'Filter by severity' },
          type: { type: 'string', enum: DEVIATION_TYPES.split(','), description: 'Filter by deviation type' },
          search: { type: 'string', description: 'Search across incident number, title, or facility' },
          pageSize: { type: 'number', description: 'Max rows to return (default 20)' },
        },
      ),
      run: async (args) => {
        const { data, total } = await deps.listIncidents({
          status: (args.status as string) || undefined,
          severity: (args.severity as string) || undefined,
          type: (args.type as string) || undefined,
          search: (args.search as string) || undefined,
          pageSize: (args.pageSize as number) || undefined,
        })
        if (total === 0) return 'No compliance incidents match the given criteria.'
        const rows = data.slice(0, 50).map((i) => ({
          id: i.id,
          incidentNumber: i.incidentNumber,
          title: i.title,
          deviationType: i.deviationType,
          severity: i.severity,
          status: i.status,
          facilityName: i.facilityName,
          daysOpen: i.daysOpen,
          regulatoryNotifiable: i.regulatoryNotifiable,
        }))
        return `Compliance incidents (${total} total, showing ${data.length}): ${JSON.stringify(rows)}`
      },
    },
    {
      definition: fn(
        'get_compliance_incident',
        'Look up full details of a single compliance incident by id.',
        { incidentId: { type: 'string', description: 'Incident id (e.g. INC-...)' } },
        ['incidentId'],
      ),
      run: async (args) => {
        const id = String(args.incidentId ?? '').trim()
        if (!id) throw new Error('Incident identifier is required.')
        const incident = await deps.getIncident(id)
        if (!incident) return `No compliance incident found for ${id}.`
        return `Compliance incident: ${JSON.stringify(incident)}`
      },
    },
    {
      definition: fn(
        'get_incident_audit_log',
        'Get the audit trail (timeline of actions) for a compliance incident by id.',
        { incidentId: { type: 'string', description: 'Incident id (e.g. INC-...)' } },
        ['incidentId'],
      ),
      run: async (args) => {
        const id = String(args.incidentId ?? '').trim()
        if (!id) throw new Error('Incident identifier is required.')
        const entries = await deps.getAuditLog(id)
        if (entries.length === 0) return 'No audit entries found for this incident.'
        return `Audit log for ${id}: ${JSON.stringify(entries)}`
      },
    },
    {
      definition: fn(
        'create_compliance_incident',
        'Report a new compliance, quality, or cold-chain incident (e.g. temperature excursion, damaged goods, missing COA).',
        {
          title: { type: 'string', description: 'Short title of the incident' },
          description: { type: 'string', description: 'What happened and where' },
          deviationType: { type: 'string', enum: DEVIATION_TYPES.split(','), description: 'Type of deviation' },
          severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], description: 'Incident severity (default medium)' },
          shipmentNumber: { type: 'string', description: 'Optional shipment number (SH-...) the incident relates to' },
          lotNumber: { type: 'string', description: 'Optional lot number' },
          productName: { type: 'string', description: 'Optional product name' },
          facilityId: { type: 'string', description: 'Optional facility identifier' },
          regulatoryNotifiable: { type: 'boolean', description: 'Whether this may be reportable to a regulatory body' },
        },
        ['title', 'description', 'deviationType'],
      ),
      run: async (args) => {
        require('view:report')
        const created = await deps.createIncident({
          title: String(args.title ?? '').trim(),
          description: String(args.description ?? '').trim(),
          deviationType: normalizeDeviationType(String(args.deviationType ?? '')),
          severity: normalizeSeverity(String(args.severity ?? 'medium')),
          shipmentNumber: args.shipmentNumber ? String(args.shipmentNumber) : undefined,
          lotNumber: args.lotNumber ? String(args.lotNumber) : undefined,
          productName: args.productName ? String(args.productName) : undefined,
          facilityId: args.facilityId ? String(args.facilityId) : undefined,
          regulatoryNotifiable: Boolean(args.regulatoryNotifiable),
        })
        return `Created compliance incident ${created.incidentNumber} (severity: ${created.severity}, status: ${created.status}). Title: ${created.title}.`
      },
    },
    {
      definition: fn(
        'resolve_compliance_incident',
        'Resolve an open or investigating compliance incident by id, recording the corrective action taken and closure notes. Incidents that are already resolved or closed are no-ops and will not be resolved again.',
        {
          incidentId: { type: 'string', description: 'Incident id (e.g. INC-...)' },
          correctiveAction: { type: 'string', description: 'Corrective action taken to address the incident' },
          closureNotes: { type: 'string', description: 'Closure notes summarizing the resolution' },
        },
        ['incidentId', 'correctiveAction', 'closureNotes'],
      ),
      run: async (args) => {
        require('act:resolve_incident')
        const id = String(args.incidentId ?? '').trim()
        if (!id) throw new Error('Incident identifier is required.')
        const existing = await deps.getIncident(id)
        if (!existing) return `No compliance incident found for ${id}. Nothing to resolve.`
        if (existing.status === 'resolved' || existing.status === 'closed') {
          return `Incident ${existing.incidentNumber} is already ${existing.status}. No action taken — do not resolve it again.`
        }
        const resolved = await deps.resolveIncident(id, {
          correctiveAction: String(args.correctiveAction ?? '').trim(),
          closureNotes: String(args.closureNotes ?? '').trim(),
        })
        return `OK resolved incident ${resolved.incidentNumber}. Status is now "${resolved.status}".`
      },
    },
    {
      definition: fn(
        'assign_compliance_incident',
        'Assign a compliance incident to a registered staff member for investigation. Provide the staff member by user id (assignedById) or display name (assignedTo) — use list_users to find staff. Optionally move the incident to "investigating" status (the default when it is currently open).',
        {
          incidentId: { type: 'string', description: 'Incident id or incident number (e.g. INC-...)' },
          assignedById: { type: 'string', description: 'User id of the staff member (e.g. USR-DOCK-001). Preferred over name.' },
          assignedTo: { type: 'string', description: 'Display name of the staff member (e.g. Marcus Reed). Used when assignedById is not provided.' },
          status: { type: 'string', enum: ['open', 'investigating'], description: 'Optional target status (default: investigating)' },
        },
        ['incidentId'],
      ),
      run: async (args) => {
        require('act:assign_incident')
        const id = String(args.incidentId ?? '').trim()
        if (!id) throw new Error('Incident identifier is required.')
        const assignedById = String(args.assignedById ?? '').trim()
        const assignedTo = String(args.assignedTo ?? '').trim()
        if (!assignedById && !assignedTo) {
          throw new Error('Provide assignedById or assignedTo (a registered staff member) to assign the incident.')
        }
        const updated = await deps.assignIncident(id, {
          assignedById: assignedById || undefined,
          assignedTo: assignedTo || undefined,
          status: normalizeIncidentStatus(String(args.status ?? 'investigating')),
        })
        return `OK assigned incident ${updated.incidentNumber} to ${updated.assignedTo}. Status is now "${updated.status}".`
      },
    },
    {
      definition: fn(
        'scan_temperature_incidents',
        'Run an automatic AI sweep across shipments to detect temperature excursions and report any newly detected temperature incidents as compliance incidents. Returns how many shipments were scanned, how many had excursions, how many new incidents were created, and how many were already reported.',
        {
          facilityId: { type: 'string', description: 'Optional facility id to scope the scan (e.g. FAC-001)' },
        },
      ),
      run: async (args) => {
        require('view:report')
        const facilityId = (args.facilityId as string) || undefined
        const result = await deps.scanTemperatureIncidents(facilityId)
        const { summary } = result
        if (summary.detected === 0) {
          return `Temperature incident scan complete: scanned ${summary.scanned} shipment(s), no temperature excursions detected.`
        }
        const created = result.createdIncidents.map((i) => ({
          incidentNumber: i.incidentNumber,
          title: i.title,
          severity: i.severity,
          shipmentNumber: i.shipmentNumber,
        }))
        if (summary.created === 0) {
          return `Temperature incident scan complete: ${summary.scanned} shipment(s) scanned, ${summary.detected} with excursions — all already have open incidents (${summary.alreadyReported}).`
        }
        return `Temperature incident scan complete: ${summary.scanned} shipment(s) scanned, ${summary.detected} with excursions, ${summary.created} new incident(s) created, ${summary.alreadyReported} already reported. New incidents: ${JSON.stringify(created)}`
      },
    },
    {
      definition: fn(
        'resolve_all_open_incidents',
        'Resolve every open or investigating compliance incident in one bulk action. Returns how many incidents were resolved. Use this instead of calling resolve_compliance_incident one at a time when the user asks to close, resolve, or clear all open incidents.',
        {
          correctiveAction: { type: 'string', description: 'Optional corrective action to record on each resolved incident (defaults to a bulk-closure note)' },
          closureNotes: { type: 'string', description: 'Optional closure notes to record on each resolved incident' },
        },
      ),
      run: async (args) => {
        require('act:resolve_incident')
        const result = await deps.resolveAllOpenIncidents({
          correctiveAction: args.correctiveAction ? String(args.correctiveAction).trim() : undefined,
          closureNotes: args.closureNotes ? String(args.closureNotes).trim() : undefined,
        })
        if (result.resolved === 0) {
          return 'Bulk resolve complete: there were no open or investigating incidents to resolve.'
        }
        return `Bulk resolve complete: resolved ${result.resolved} open incident(s) (${result.incidents.map((i) => i.incidentNumber).join(', ')}).`
      },
    },

    // ----------------------------- Dashboard & system -----------------------------
    {
      definition: fn(
        'get_dashboard_summary',
        'Get a high-level operational summary: KPIs (active shipments, inventory value, open incidents, compliance rate), temperature compliance, and recent activity.',
        {
          facility: { type: 'string', description: 'Optional facility id to scope the summary (e.g. FAC-001)' },
          dateRange: { type: 'number', description: 'Optional lookback window in days (e.g. 30)' },
        },
      ),
      run: async (args) => {
        const dashboard = await deps.getDashboard({
          facility: (args.facility as string) || undefined,
          dateRange: args.dateRange !== undefined ? String(args.dateRange) : undefined,
        })
        return `Dashboard summary: ${JSON.stringify({
          kpis: dashboard.kpis,
          temperatureCompliance: dashboard.temperatureCompliance,
          recentActivity: dashboard.recentActivity.slice(0, 8),
        })}`
      },
    },
    {
      definition: fn(
        'get_system_health',
        'Get the platform system health: overall status, service-level status (Database, LakeBase), latency, and active alert count.',
        {},
      ),
      run: async () => {
        const health = await deps.getSystemHealth()
        return `System health: ${JSON.stringify(health)}`
      },
    },
    {
      definition: fn(
        'get_system_logs',
        'Read recent platform system logs, optionally filtered by level (info, warning, error) or service.',
        {
          level: { type: 'string', description: 'Filter by log level (info, warning, error)' },
          service: { type: 'string', description: 'Filter by service name' },
          pageSize: { type: 'number', description: 'Max rows to return (default 20)' },
        },
      ),
      run: async (args) => {
        const result = await deps.getSystemLogs({
          level: (args.level as string) || undefined,
          service: (args.service as string) || undefined,
          pageSize: (args.pageSize as number) || 20,
        })
        if (result.data.length === 0) return 'No system logs match the given criteria.'
        return `System logs (${result.total}): ${JSON.stringify(result.data.slice(0, 30))}`
      },
    },

    // ----------------------------- Reference data -----------------------------
    {
      definition: fn(
        'list_facilities',
        'List all facilities (name, location, temperature regimes, storage capacity utilization).',
        {},
      ),
      run: async () => {
        const facilities = await deps.listFacilities()
        if (facilities.length === 0) return 'No facilities found.'
        const rows = facilities.map((f) => ({
          id: f.id,
          name: f.name,
          location: f.location,
          status: f.status,
          temperatureRegimes: f.temperatureRegimes,
          utilizationPercent: f.utilizationPercent,
        }))
        return `Facilities (${facilities.length}): ${JSON.stringify(rows)}`
      },
    },
    {
      definition: fn(
        'list_suppliers',
        'List suppliers with qualification status, tier, and quality/compliance scores.',
        {},
      ),
      run: async () => {
        const suppliers = await deps.listSuppliers()
        if (suppliers.length === 0) return 'No suppliers found.'
        const rows = suppliers.map((s) => ({
          id: s.id,
          name: s.name,
          tier: s.tier,
          qualificationStatus: s.qualificationStatus,
          overallScore: s.overallScore,
          onTimeDelivery: s.onTimeDelivery,
          qualityScore: s.qualityScore,
          complianceScore: s.complianceScore,
          totalShipments: s.totalShipments,
        }))
        return `Suppliers (${suppliers.length}): ${JSON.stringify(rows)}`
      },
    },
    {
      definition: fn(
        'list_products',
        'List products with category, temperature regime, storage requirements, and shelf life.',
        {},
      ),
      run: async () => {
        const products = await deps.listProducts()
        if (products.length === 0) return 'No products found.'
        const rows = products.map((p) => ({
          id: p.id,
          name: p.name,
          category: p.category,
          temperatureRegime: p.temperatureRegime,
          manufacturer: p.manufacturer,
          shelfLifeDays: p.shelfLifeDays,
          requiresCoa: p.requiresCoa,
          hazardous: p.hazardous,
        }))
        return `Products (${products.length}): ${JSON.stringify(rows)}`
      },
    },

    {
      definition: fn(
        'list_users',
        'List registered staff members (id, display name, title, role) available to be assigned to compliance incidents.',
        {},
      ),
      run: async () => {
        const users = await deps.listUsers()
        if (users.length === 0) return 'No staff members found.'
        const rows = users.map((u) => ({
          id: u.id,
          displayName: u.displayName,
          title: u.title,
          role: u.role,
        }))
        return `Staff members (${users.length}): ${JSON.stringify(rows)}`
      },
    },

    // ----------------------------- Risk -----------------------------
    {
      definition: fn(
        'get_risk_overview',
        'Get a compliance risk & stockout overview: counts of critical incidents, regulatory-notifiable incidents, near-expiry lots, and items on hold, plus the most critical incidents and at-risk lots.',
        {},
      ),
      run: async () => {
        const { data: incidents } = await deps.listIncidents({ pageSize: 100 })
        const { data: lots } = await deps.lookupInventory({ pageSize: 100 })
        const critical = incidents.filter(
          (i) => i.severity === 'critical' || i.severity === 'high',
        )
        const regulatory = incidents.filter((i) => i.regulatoryNotifiable)
        const atRiskLots = lots
          .filter((l) => l.daysUntilExpiry <= 30 || l.status === 'quarantined' || l.status === 'quality_hold')
          .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry)
          .slice(0, 10)
          .map((l) => ({
            lotNumber: l.lotNumber,
            productName: l.productName,
            quantity: l.quantity,
            status: l.status,
            daysUntilExpiry: l.daysUntilExpiry,
            storageZone: l.storageZone,
          }))
        return `Risk overview: ${JSON.stringify({
          criticalIncidents: critical.length,
          regulatoryNotifiable: regulatory.length,
          nearExpiryLots: lots.filter((l) => l.daysUntilExpiry > 0 && l.daysUntilExpiry <= 30).length,
          itemsOnHold: lots.filter((l) => l.status === 'quarantined' || l.status === 'quality_hold').length,
          topIncidents: critical.slice(0, 5).map((i) => ({
            incidentNumber: i.incidentNumber,
            title: i.title,
            severity: i.severity,
            status: i.status,
          })),
          atRiskLots,
        })}`
      },
    },

    // ----------------------------- Chart visualization -----------------------------
    {
      definition: fn(
        AGENT_CHART_TOOL,
        'Generate a chart (line, bar, pie, or table) from live platform data for a visual answer. Pick the dataset that matches the question: trends over time use shipment_trends, receiving_volume, expiry_timeline, cold_chain_excursions, or quality_inspection_results; comparisons use temperature_compliance, storage_occupancy, storage_utilization, or supplier_performance; breakdowns of a total use inventory_distribution, shipments_by_status, inventory_by_status, inventory_by_category, incidents_by_severity, or incidents_by_type.',
        {
          dataset: { type: 'string', enum: CHART_DATASETS, description: 'Which live dataset to plot' },
          chartType: { type: 'string', enum: ['line', 'bar', 'pie', 'table'], description: 'Chart style; defaults to the best fit for the dataset' },
          title: { type: 'string', description: 'Optional short chart title' },
          facility: { type: 'string', description: 'Optional facility id to scope data (e.g. FAC-001)' },
        },
        ['dataset'],
      ),
      run: async (args) => {
        const dataset = String(args.dataset ?? '').trim()
        const requestedType = String(args.chartType ?? '').toLowerCase()
        const title = args.title ? String(args.title).trim() : undefined
        const facility = args.facility ? String(args.facility).trim() : undefined

        const perm = CHART_DATASET_PERMISSIONS[dataset]
        if (perm) require(perm)

        const dash = () => deps.getDashboard({ facility, dateRange: undefined })

        const setType = (fallback: 'line' | 'bar' | 'pie' | 'table') => {
          if (requestedType === 'line' || requestedType === 'bar' || requestedType === 'pie' || requestedType === 'table') {
            return requestedType
          }
          return fallback
        }

        let chartType: 'line' | 'bar' | 'pie' | 'table'
        let chartData: Record<string, unknown>[]

        switch (dataset) {
          case 'shipment_trends': {
            const s = await dash()
            chartData = s.shipmentTrends.map((r) => ({ name: r.date, received: r.received, quarantined: r.quarantined, rejected: r.rejected }))
            chartType = setType('line')
            break
          }
          case 'receiving_volume': {
            const s = await dash()
            chartData = s.receivingVolume.map((r) => ({ name: r.month, volume: r.volume, target: r.target }))
            chartType = setType('bar')
            break
          }
          case 'temperature_compliance': {
            const s = await dash()
            chartData = s.temperatureCompliance.map((r) => ({ name: r.category, compliant: r.compliant, excursion: r.excursion }))
            chartType = setType('bar')
            break
          }
          case 'supplier_performance': {
            const s = await dash()
            chartData = s.supplierPerformance.map((r) => ({ name: r.supplierName, shipments: r.shipments, onTime: r.onTime }))
            chartType = setType('bar')
            break
          }
          case 'inventory_distribution': {
            const s = await dash()
            chartData = s.inventoryDistribution.map((r) => ({ name: r.category, value: r.value, percentage: r.percentage }))
            chartType = setType('pie')
            break
          }
          case 'storage_occupancy': {
            const s = await dash()
            chartData = s.storageOccupancy.map((r) => ({ name: r.zone, capacity: r.capacity, utilized: r.utilized }))
            chartType = setType('bar')
            break
          }
          case 'expiry_timeline': {
            const s = await dash()
            chartData = s.expiryTimeline.map((r) => ({ name: r.month, expiring: r.expiring, total: r.total }))
            chartType = setType('bar')
            break
          }
          case 'cold_chain_excursions': {
            const s = await dash()
            chartData = s.coldChainExcursions.map((r) => ({ name: r.date, excursions: r.excursions, criticalExcursions: r.criticalExcursions }))
            chartType = setType('line')
            break
          }
          case 'quality_inspection_results': {
            const s = await dash()
            chartData = s.qualityInspectionResults.map((r) => ({ name: r.month, passed: r.passed, failed: r.failed, pending: r.pending }))
            chartType = setType('bar')
            break
          }
          case 'shipments_by_status': {
            const { data: rows } = await deps.listShipments({ pageSize: 500 })
            const counts = new Map<string, number>()
            for (const r of rows) counts.set(r.status, (counts.get(r.status) ?? 0) + 1)
            chartData = [...counts.entries()]
              .map(([name, value]) => ({ name, value }))
              .sort((a, b) => (b.value as number) - (a.value as number))
              .slice(0, 15)
            chartType = setType('pie')
            break
          }
          case 'inventory_by_status': {
            const { data: rows } = await deps.lookupInventory({ pageSize: 500 })
            const counts = new Map<string, number>()
            for (const r of rows) counts.set(r.status, (counts.get(r.status) ?? 0) + 1)
            chartData = [...counts.entries()]
              .map(([name, value]) => ({ name, value }))
              .sort((a, b) => (b.value as number) - (a.value as number))
              .slice(0, 15)
            chartType = setType('pie')
            break
          }
          case 'inventory_by_category': {
            const { data: rows } = await deps.lookupInventory({ pageSize: 500 })
            const counts = new Map<string, number>()
            for (const r of rows) counts.set(r.category, (counts.get(r.category) ?? 0) + 1)
            chartData = [...counts.entries()]
              .map(([name, value]) => ({ name, value }))
              .sort((a, b) => (b.value as number) - (a.value as number))
              .slice(0, 15)
            chartType = setType('pie')
            break
          }
          case 'incidents_by_severity': {
            const { data: rows } = await deps.listIncidents({ pageSize: 500 })
            const counts = new Map<string, number>()
            for (const r of rows) counts.set(r.severity, (counts.get(r.severity) ?? 0) + 1)
            chartData = [...counts.entries()]
              .map(([name, value]) => ({ name, value }))
              .sort((a, b) => (b.value as number) - (a.value as number))
              .slice(0, 15)
            chartType = setType('pie')
            break
          }
          case 'incidents_by_type': {
            const { data: rows } = await deps.listIncidents({ pageSize: 500 })
            const counts = new Map<string, number>()
            for (const r of rows) counts.set(r.deviationType, (counts.get(r.deviationType) ?? 0) + 1)
            chartData = [...counts.entries()]
              .map(([name, value]) => ({ name, value }))
              .sort((a, b) => (b.value as number) - (a.value as number))
              .slice(0, 15)
            chartType = setType('bar')
            break
          }
          case 'storage_utilization': {
            const zones = await deps.listStorageZones(facility)
            chartData = zones.map((z) => ({ name: z.name, capacity: z.capacity, utilized: z.utilized }))
            chartType = setType('bar')
            break
          }
          default:
            return `Unknown dataset "${dataset}". Available datasets: ${CHART_DATASETS.join(', ')}.`
        }

        if (chartData.length === 0) return 'No data available for that chart.'
        return JSON.stringify({ chartType, title: title ?? null, chartData })
      },
    },
  ]

  const can = deps.can
  return handlers.filter((h) => {
    const required = TOOL_PERMISSIONS[h.definition.function.name]
    return !required || !can || can(required)
  })
}

const TOOL_PERMISSIONS: Record<string, Permission | undefined> = {
  list_shipments: 'view:shipments',
  get_shipment: 'view:shipments',
  update_shipment_status: 'act:update_shipment_status',
  start_receiving: 'act:update_shipment_status',
  create_shipment: 'act:create_shipment',
  update_shipment_details: 'act:update_shipment_status',
  list_inventory: undefined,
  get_inventory_lot: undefined,
  list_storage_zones: undefined,
  list_compliance_incidents: 'view:compliance',
  get_compliance_incident: 'view:compliance',
  get_incident_audit_log: 'view:compliance',
  create_compliance_incident: 'view:report',
  scan_temperature_incidents: 'view:report',
  resolve_compliance_incident: 'act:resolve_incident',
  assign_compliance_incident: 'act:assign_incident',
  get_dashboard_summary: undefined,
  get_system_health: 'view:admin',
  get_system_logs: 'view:admin',
  list_facilities: undefined,
  list_suppliers: undefined,
  list_products: undefined,
  list_users: 'act:assign_incident',
  get_risk_overview: 'view:risk',
}

const CHART_DATASET_PERMISSIONS: Record<string, Permission | undefined> = {
  shipments_by_status: 'view:shipments',
  incidents_by_severity: 'view:compliance',
  incidents_by_type: 'view:compliance',
}

export function toHandlerDefinitions(handlers: AgentToolHandler[]): AgentToolDefinition[] {
  return handlers.map((h) => h.definition)
}

export interface AgentChartPayload {
  chartType: 'bar' | 'line' | 'pie' | 'table'
  title?: string
  chartData: Record<string, unknown>[]
}

export function parseChartToolResult(content: string): AgentChartPayload | null {
  try {
    const parsed = JSON.parse(content) as { chartType?: unknown; title?: unknown; chartData?: unknown }
    if (
      parsed &&
      typeof parsed === 'object' &&
      (parsed.chartType === 'bar' ||
        parsed.chartType === 'line' ||
        parsed.chartType === 'pie' ||
        parsed.chartType === 'table') &&
      Array.isArray(parsed.chartData)
    ) {
      return {
        chartType: parsed.chartType,
        title: typeof parsed.title === 'string' ? parsed.title : undefined,
        chartData: parsed.chartData as Record<string, unknown>[],
      }
    }
  } catch {
    // Not a chart payload.
  }
  return null
}

const VALID_STATUSES: ShipmentStatus[] = [
  'scheduled',
  'in_transit',
  'arrived',
  'receiving',
  'quarantined',
  'released',
  'rejected',
  'returned',
]

const VALID_SEVERITIES: ComplianceSeverity[] = ['low', 'medium', 'high', 'critical']

const VALID_DEVIATION_TYPES: DeviationType[] = [
  'temperature_excursion',
  'documentation_gap',
  'quality_deviation',
  'chain_of_custody_break',
  'storage_violation',
  'labeling_error',
  'contamination_suspected',
  'equipment_malfunction',
  'human_error',
  'packaging_failure',
]

function normalizeStatus(input: string): ShipmentStatus {
  const key = input.trim().toLowerCase().replace(/\s+/g, '_')
  if (VALID_STATUSES.includes(key as ShipmentStatus)) {
    return key as ShipmentStatus
  }
  throw new Error(`Invalid shipment status: "${input}".`)
}

function normalizeSeverity(input: string): ComplianceSeverity {
  const key = input.trim().toLowerCase()
  if (VALID_SEVERITIES.includes(key as ComplianceSeverity)) {
    return key as ComplianceSeverity
  }
  throw new Error(`Invalid severity: "${input}". Use low, medium, high, or critical.`)
}

function normalizeDeviationType(input: string): DeviationType {
  const key = input.trim().toLowerCase().replace(/\s+/g, '_')
  if (VALID_DEVIATION_TYPES.includes(key as DeviationType)) {
    return key as DeviationType
  }
  throw new Error(`Invalid deviationType: "${input}".`)
}

function normalizeIncidentStatus(input: string): 'open' | 'investigating' {
  const key = input.trim().toLowerCase()
  if (key === 'open' || key === 'investigating') {
    return key
  }
  throw new Error('Invalid status for assignment: use "open" or "investigating".')
}

function shipmentId(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) throw new Error('Shipment identifier is required.')
  return trimmed
}

function shipmentSummary(shipment: Shipment | ShipmentSummary) {
  return {
    id: shipment.id,
    shipmentNumber: shipment.shipmentNumber,
    supplierName: shipment.supplierName,
    status: shipment.status,
    category: shipment.category,
    temperatureRegime: shipment.temperatureRegime,
    priority: shipment.priority,
    condition: shipment.condition,
    lotCount: shipment.lotCount,
  }
}
