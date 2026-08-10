import type { TemperatureRegime, ProductCategory } from './shipment'

export type InventoryStatus =
  | 'available'
  | 'reserved'
  | 'quarantined'
  | 'quality_hold'
  | 'expired'
  | 'disposed'
  | 'released'

export interface InventoryLot {
  id: string
  lotNumber: string
  productId: string
  productName: string
  category: ProductCategory
  supplierId: string
  supplierName: string
  shipmentId: string
  quantity: number
  lowStockThreshold?: number
  lowStock?: boolean
  unit: string
  status: InventoryStatus
  temperatureRegime: TemperatureRegime
  storageZone: string
  storageLocation: string
  receivedDate: string
  manufacturedDate: string
  expiryDate: string
  daysUntilExpiry: number
  batchNumber: string
  coaReference: string
  coaAttached: boolean
  qualityStatus: 'pending_review' | 'approved' | 'rejected' | 'quarantined'
  lastVerifiedDate: string
  verifiedBy: string
  value: number
  storageType: string
  storageSection: string
  storageBin: string
  warehouseNumber: string
  huNumber: string
  stockType: 'unrestricted' | 'quality_inspection' | 'blocked' | 'returns'
  quantId: string
  notes: string
}

export interface StorageZone {
  id: string
  name: string
  facilityId: string
  facilityName: string
  temperatureRegime: TemperatureRegime
  capacity: number
  utilized: number
  utilizationPercent: number
  status: 'active' | 'maintenance' | 'full'
  lastInventoryDate: string
  warehouseNumber: string
  storageType: string
}
