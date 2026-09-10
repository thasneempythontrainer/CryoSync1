export interface DashboardKpi {
  label: string
  value: string | number
  unit: string
  trend: 'up' | 'down' | 'neutral'
  trendPercent: number
  icon: string
  spark?: number[]
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

export interface NamedCount {
  name: string
  count: number
}

export interface ShipmentStatusBreakdown {
  status: string
  count: number
}

export interface ShipmentCategoryBreakdown {
  category: string
  count: number
}

export interface ShipmentModeBreakdown {
  mode: string
  count: number
}

export interface ShipmentPriorityBreakdown {
  priority: string
  count: number
}

export interface DockToInventoryPoint {
  date: string
  minutes: number
}

export interface TransitTimePoint {
  week: string
  days: number
}

export interface OnTimeDeliveryPoint {
  week: string
  rate: number
}

export interface HourlyThroughputPoint {
  hour: string
  shipments: number
}

export interface RegimeTemperatureSpread {
  regime: string
  min: number
  avg: number
  max: number
}

export interface DailyTemperatureProfile {
  hour: string
  refrigerated: number
  frozen: number
  ultraFrozen: number
}

export interface ExcursionDurationDistribution {
  bucket: string
  count: number
}

export interface ExcursionSeverityBreakdown {
  severity: string
  count: number
}

export interface FirstPassYield {
  month: string
  value: number
}

export interface DeviationRatePoint {
  month: string
  rate: number
}

export interface SupplierShare {
  supplier: string
  value: number
}

export interface SupplierScoreTrendPoint {
  month: string
  [supplier: string]: string | number
}

export interface OnTimeBySupplier {
  supplier: string
  rate: number
}

export interface ComplianceScoreTrend {
  month: string
  rate: number
}

export interface InventoryByZone {
  zone: string
  quantity: number
}

export interface InventoryByStatus {
  status: string
  count: number
}

export interface InventoryByFacility {
  facility: string
  value: number
}

export interface LotAgeDistribution {
  bucket: string
  count: number
}

export interface CategoryExpiryRisk {
  category: string
  avgDays: number
}

export interface LowStockTrend {
  month: string
  count: number
}

export interface InventoryValueTrend {
  month: string
  value: number
}

export interface IncidentsByType {
  type: string
  count: number
}

export interface IncidentsBySeverity {
  severity: string
  count: number
}

export interface IncidentsByFacility {
  facility: string
  open: number
  resolved: number
}

export interface IncidentsTrendPoint {
  month: string
  created: number
  resolved: number
}

export interface ResolutionTimeByType {
  type: string
  days: number
}

export interface RegulatoryNotifiableTrend {
  month: string
  count: number
}

export interface CapacityUtilization {
  zone: string
  utilized: number
  capacity: number
  pct: number
}

export interface FacilityComparisonPoint {
  metric: string
  [facility: string]: string | number
}

export interface RegionalMetric {
  region: string
  facility: string | null
  shipments: number
  inventoryValue: number
  excursions: number
  compliance: number
  openIncidents: number
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
  shipmentStatusBreakdown: ShipmentStatusBreakdown[]
  shipmentCategoryBreakdown: ShipmentCategoryBreakdown[]
  shipmentModeBreakdown: ShipmentModeBreakdown[]
  shipmentPriorityBreakdown: ShipmentPriorityBreakdown[]
  dockToInventoryTrend: DockToInventoryPoint[]
  transitTimeTrend: TransitTimePoint[]
  onTimeDeliveryTrend: OnTimeDeliveryPoint[]
  hourlyThroughput: HourlyThroughputPoint[]
  regimeTemperatureSpread: RegimeTemperatureSpread[]
  dailyTemperatureProfile: DailyTemperatureProfile[]
  excursionDurationDistribution: ExcursionDurationDistribution[]
  excursionSeverityBreakdown: ExcursionSeverityBreakdown[]
  receivingFirstPassYield: FirstPassYield[]
  deviationRateTrend: DeviationRatePoint[]
  supplierShare: SupplierShare[]
  supplierScoreTrend: SupplierScoreTrendPoint[]
  onTimeBySupplier: OnTimeBySupplier[]
  complianceScoreTrend: ComplianceScoreTrend[]
  inventoryByZone: InventoryByZone[]
  inventoryByStatus: InventoryByStatus[]
  inventoryByFacility: InventoryByFacility[]
  lotAgeDistribution: LotAgeDistribution[]
  categoryExpiryRisk: CategoryExpiryRisk[]
  lowStockTrend: LowStockTrend[]
  inventoryValueTrend: InventoryValueTrend[]
  incidentsByType: IncidentsByType[]
  incidentsBySeverity: IncidentsBySeverity[]
  incidentsByFacility: IncidentsByFacility[]
  incidentsTrend: IncidentsTrendPoint[]
  resolutionTimeByType: ResolutionTimeByType[]
  regulatoryNotifiableTrend: RegulatoryNotifiableTrend[]
  capacityUtilization: CapacityUtilization[]
  facilityComparison: FacilityComparisonPoint[]
  regionalMetrics: RegionalMetric[]
}
