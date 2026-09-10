import { apiClient } from './api'

export interface CbuDetailsPayment {
  txnNumber?: string | null
  planType?: string | null
  amount?: number | null
  method?: string | null
  milestone?: string | null
  status?: string | null
  paidAt?: string | null
}

export interface CbuDetails {
  resolvedId?: string
  unit: {
    id?: string
    unitNumber?: string | null
    collectAccession?: string | null
    collectedAt?: string | null
    collectionVolumeMl?: number | null
    processingMethod?: string | null
    processedBy?: string | null
    preProcessTnc?: number | null
    postProcessTnc?: number | null
    tncRecoveryPct?: number | null
    preProcessCd34?: number | null
    postProcessCd34?: number | null
    viabilityPct?: number | null
    volumeMl?: number | null
    storageStatus?: string | null
    storageTankId?: string | null
    storageTemperatureC?: number | null
    cryopreservedAt?: string | null
    aboRh?: string | null
    hlaTyping?: string | null
    infectiousDiseaseResults?: string | null
    sterilityResult?: string | null
    cfuResult?: string | null
    transplantCount?: number | null
    lastTransplantAt?: string | null
    publicBankAccess?: boolean | null
    nmdpId?: string | null
    notes?: string | null
  }
  tank?: {
    id?: string
    tankId?: string | null
    facility?: string | null
    tankType?: string | null
    capacityUnits?: number | null
    currentUnits?: number | null
    temperatureC?: number | null
    ln2LevelPct?: number | null
    status?: string | null
    lastInspectionAt?: string | null
    nextInspectionAt?: string | null
  } | null
  kit?: {
    id?: string
    kitNumber?: string | null
    barcode?: string | null
    anticoagulant?: string | null
    collectedAt?: string | null
    collectorName?: string | null
    collectorCredentials?: string | null
    hospitalName?: string | null
    hospitalAddress?: string | null
    deliveryCourier?: string | null
    trackingNumber?: string | null
    status?: string | null
    rejectionReason?: string | null
  } | null
  enrollment?: {
    id?: string
    enrollmentNumber?: string | null
    planType?: string | null
    processingMethod?: string | null
    storagePlan?: string | null
    status?: string | null
    contractSignedAt?: string | null
    paymentPlan?: string | null
    totalAmount?: number | null
    amountPaid?: number | null
    expectedDueDate?: string | null
    referralCode?: string | null
  } | null
  family?: {
    id?: string
    firstName?: string | null
    lastName?: string | null
    email?: string | null
    phone?: string | null
    address?: string | null
  } | null
  latestTests?: Record<string, unknown>[]
  payments?: CbuDetailsPayment[]
  paymentTotals?: {
    count?: number
    sum?: number
    byMilestone?: { milestone?: string; count?: number; sum?: number }[]
  }
  transplants?: Record<string, unknown>[]
}

export async function getCbuDetails(unit: string): Promise<CbuDetails | undefined> {
  return apiClient.get<CbuDetails | undefined>('/cbu-details', { unit })
}

export async function getCbuUnits(search?: string, limit = 50): Promise<{ data: Record<string, unknown>[]; total: number }> {
  const params: Record<string, string> = { limit: String(limit) }
  if (search) params.search = search
  return apiClient.get<{ data: Record<string, unknown>[]; total: number }>('/cbu-units', params)
}