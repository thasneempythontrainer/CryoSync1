export interface DashboardKpi {
  label: string
  value: string | number
  unit: string
  trend: 'up' | 'down' | 'neutral'
  trendPercent: number
  icon: string
}

export interface ShipmentTrend {
  date: string
  received: number
  quarantined: number
  rejected: number
}

export interface ReceivingVolume {
  month: string
  volume: number
  target: number
}

export interface TemperatureCompliance {
  category: string
  compliant: number
  excursion: number
  complianceRate: number
}

export interface SupplierPerformance {
  supplierName: string
  shipments: number
  onTime: number
  damageRate: number
  complianceRate: number
  score: number
}

export interface InventoryDistribution {
  category: string
  value: number
  percentage: number
}

export interface StorageOccupancy {
  zone: string
  capacity: number
  utilized: number
}

export interface ExpiryTimeline {
  month: string
  expiring: number
  total: number
}

export interface ColdChainExcursion {
  date: string
  excursions: number
  criticalExcursions: number
}

export interface QualityInspectionResult {
  month: string
  passed: number
  failed: number
  pending: number
}

export interface RecentActivity {
  id: string
  type: 'shipment_received' | 'compliance_flagged' | 'lot_released' | 'qa_reviewed' | 'deviation_resolved' | 'transfer_completed'
  title: string
  description: string
  timestamp: string
  severity?: 'info' | 'warning' | 'error' | 'success'
}

export interface DashboardData {
  kpis: DashboardKpi[]
  shipmentTrends: ShipmentTrend[]
  receivingVolume: ReceivingVolume[]
  temperatureCompliance: TemperatureCompliance[]
  supplierPerformance: SupplierPerformance[]
  inventoryDistribution: InventoryDistribution[]
  storageOccupancy: StorageOccupancy[]
  expiryTimeline: ExpiryTimeline[]
  coldChainExcursions: ColdChainExcursion[]
  qualityInspectionResults: QualityInspectionResult[]
  recentActivity: RecentActivity[]
}
