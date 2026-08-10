export type ComplianceSeverity = 'low' | 'medium' | 'high' | 'critical'
export type ComplianceStatus = 'open' | 'investigating' | 'resolved' | 'closed'
export type DeviationType =
  | 'temperature_excursion'
  | 'documentation_gap'
  | 'quality_deviation'
  | 'chain_of_custody_break'
  | 'storage_violation'
  | 'labeling_error'
  | 'contamination_suspected'
  | 'equipment_malfunction'
  | 'human_error'
  | 'packaging_failure'

export interface ComplianceIncident {
  id: string
  incidentNumber: string
  title: string
  description: string
  deviationType: DeviationType
  severity: ComplianceSeverity
  status: ComplianceStatus
  facilityId: string
  facilityName: string
  shipmentId: string | null
  shipmentNumber: string | null
  lotNumber: string | null
  productName: string | null
  supplierName: string | null
  temperatureRegime: string | null
  detectedDate: string
  reportedBy: string
  assignedTo: string
  assignedById?: string | null
  assignedBy?: string | null
  assignedDate?: string | null
  rootCause: string | null
  correctiveAction: string | null
  preventiveAction: string | null
  resolvedDate: string | null
  closureNotes: string | null
  regulatoryNotifiable: boolean
  dueDate?: string | null
  linkedReadingId: string | null
  temperatureAtDeviation: number | null
  thresholdMin: number | null
  thresholdMax: number | null
  createdAt: string
  updatedAt: string
}

export interface ComplianceSummary {
  id: string
  incidentNumber: string
  title: string
  deviationType: DeviationType
  severity: ComplianceSeverity
  status: ComplianceStatus
  facilityName: string
  detectedDate: string
  daysOpen: number
  dueDate?: string | null
  overdue?: boolean
  regulatoryNotifiable: boolean
}

export interface AuditLogEntry {
  id: string
  incidentId: string
  action: string
  performedBy: string
  timestamp: string
  details: string
}
