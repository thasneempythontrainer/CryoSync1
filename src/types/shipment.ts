export type ShipmentStatus =
  | 'scheduled'
  | 'in_transit'
  | 'arrived'
  | 'receiving'
  | 'quarantined'
  | 'released'
  | 'rejected'
  | 'returned'

export type TemperatureRegime =
  | 'ambient'
  | 'refrigerated_2_8'
  | 'frozen_minus_20'
  | 'ultra_frozen_minus_80'
  | 'liquid_nitrogen'

export type ProductCategory =
  | 'hybrid_banking'
  | 'univercell_banking'
  | 'cord_blood_unit'
  | 'maternal_sample'
  | 'test_report'
  | 'cellular_therapy_release'

export interface TemperatureReading {
  id: string
  shipmentId: string
  timestamp: string
  temperature: number
  minThreshold: number
  maxThreshold: number
  deviceId: string
  location: string
  excursion: boolean
  excursionDurationMinutes?: number
}

export interface TemperatureLogger {
  id: string
  serialNumber?: string
  model: string
  status: 'connected' | 'uploaded' | 'live'
  connectedAt: string | null
  uploadedAt: string | null
  lastReadingAt: string | null
  readingCount: number
  battery?: number | null
}

export interface TransitSummary {
  minTemp: number | null
  maxTemp: number | null
  durationMinutes: number
  excursionCount: number
  excursionDurationMinutes: number
}

export interface ReceivingChecklistLineItem {
  id: string
  lineNumber: number
  productName: string
  sku: string
  quantityOrdered: number
  quantityReceived: number
  expiryDate: string
  condition: 'excellent' | 'good' | 'fair' | 'damaged'
  photoUrl: string
  checks: {
    sealIntact: boolean
    coolantOk: boolean
    storageLabelMatch: boolean
  }
}

export interface ReceivingChecklist {
  lineItems: ReceivingChecklistLineItem[]
  documents: {
    coa: boolean
    packingList: boolean
    temperatureReport: boolean
    declaration: boolean
  }
  sealIntact: boolean
  coolantOk: boolean
  storageLabelMatch: boolean
  condition: 'excellent' | 'good' | 'fair' | 'damaged'
  notes: string
  completed: boolean
  completedBy: string
  completedAt: string
}

export type DispositionDecision = 'accepted' | 'quarantined' | 'rejected'
export type DispositionReasonCode =
  | 'temperature_excursion'
  | 'missing_coa'
  | 'damaged'
  | 'quantity_mismatch'
  | 'labeling_error'
  | 'other'

export interface Disposition {
  decision: DispositionDecision
  reasonCode: DispositionReasonCode
  reason: string
  notes: string
  decidedBy: string
  decidedAt: string
  notifyQA: boolean
  notifiedQA?: boolean
  notifiedAt?: string
}

export interface ReadingsUploadResult {
  shipment: Shipment
  added: number
  excursions: number
}

export interface Shipment {
  id: string
  shipmentNumber: string
  supplierId: string
  supplierName: string
  origin: string
  destination: string
  facilityId: string
  facilityName: string
  status: ShipmentStatus
  category: ProductCategory
  temperatureRegime: TemperatureRegime
  productCount: number
  lotCount: number
  receivedDate: string
  scheduledDate: string
  shippedDate: string
  estimatedArrival: string
  actualArrival: string | null
  receivingTechnician: string
  carrier: string
  trackingNumber: string
  billOfLading: string
  condition: 'excellent' | 'good' | 'fair' | 'damaged'
  chainOfCustody: boolean
  coaAttached: boolean
  priority: 'standard' | 'expedited' | 'critical'
  temperatureReadings: TemperatureReading[]
  loggers: TemperatureLogger[]
  receivingChecklist: ReceivingChecklist
  disposition: Disposition
  transitSummary: TransitSummary
  storageZone: string
  dockToInventoryMinutes: number
  totalValue: number
  purchaseOrderNumber: string
  purchaseOrderItem: string
  incoterm: string
  transportationMode: 'air' | 'ocean' | 'ground' | 'rail' | 'multimodal'
  containerType: string
  palletCount: number
  grossWeightKg: number
  netWeightKg: number
  volumeCbm: number
  handlingUnitCount: number
  sealNumber: string
  dangerousGoods: boolean
  unNumber: string
  properShippingName: string
  dgClass: string
  notes: string
  createdAt: string
  updatedAt: string
}

export interface ShipmentFlag {
  type: 'temperature_excursion' | 'damaged' | 'missing_coa' | 'missing_coc' | 'near_expiry' | 'hazardous' | 'controlled_substance' | 'high_priority'
  label: string
  severity: 'low' | 'medium' | 'high' | 'critical'
}

export interface ShipmentSummary {
  id: string
  shipmentNumber: string
  supplierName: string
  status: ShipmentStatus
  category: ProductCategory
  temperatureRegime: TemperatureRegime
  receivedDate: string
  priority: 'standard' | 'expedited' | 'critical'
  lotCount: number
  condition: 'excellent' | 'good' | 'fair' | 'damaged'
  purchaseOrderNumber: string
  transportationMode: 'air' | 'ocean' | 'ground' | 'rail' | 'multimodal'
  flags?: ShipmentFlag[]
}
