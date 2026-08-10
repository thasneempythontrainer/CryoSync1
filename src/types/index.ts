export * from './shipment'
export * from './inventory'
export * from './compliance'
export * from './dashboard'
export * from './genie'
export * from './agent'
export * from './auth'

export type Facility = {
  id: string
  name: string
  location: string
  type: 'warehouse' | 'laboratory' | 'distribution_center' | 'manufacturing'
  status: 'active' | 'maintenance' | 'inactive'
  temperatureRegimes: string[]
  storageZones: number
  totalCapacity: number
  utilizedCapacity: number
  utilizationPercent: number
}

export type Supplier = {
  id: string
  name: string
  tier: 'platinum' | 'gold' | 'silver' | 'bronze'
  category: string[]
  location: string
  country: string
  qualificationStatus: 'approved' | 'provisional' | 'suspended' | 'pending_audit'
  lastAuditDate: string
  nextAuditDate: string
  overallScore: number
  onTimeDelivery: number
  qualityScore: number
  complianceScore: number
  activeContracts: number
  totalShipments: number
  contactName: string
  contactEmail: string
  contactPhone: string
}

export type Product = {
  id: string
  name: string
  category: string
  temperatureRegime: string
  manufacturer: string
  storageRequirements: string
  shelfLifeDays: number
  requiresCoa: boolean
  hazardous: boolean
  controlledSubstance: boolean
  unitOfMeasure: string
  listPrice: number
}

export interface SystemMetric {
  name: string
  status: 'healthy' | 'degraded' | 'down'
  latency: number
  uptime: number
  lastChecked: string
  details: string
}

export interface SystemHealth {
  overall: 'healthy' | 'degraded' | 'critical'
  services: SystemMetric[]
  activeAlerts: number
  lastUpdated: string
}
