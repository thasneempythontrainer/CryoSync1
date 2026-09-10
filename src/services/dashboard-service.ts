import { useQuery } from '@tanstack/react-query'
import { apiClient } from './api'
import type { DashboardData, DashboardKpi, ShipmentTrend, ReceivingVolume, TemperatureCompliance, SupplierPerformance, InventoryDistribution, StorageOccupancy, ExpiryTimeline, ColdChainExcursion, QualityInspectionResult, RecentActivity } from '@/types'

export interface DashboardFilters {
  facility?: string
  dateRange?: string
  region?: string
  supplier?: string
  custodyStage?: string
  collectionStatus?: string
  qualityState?: string
  testReport?: string
  storageRegime?: string
  priority?: string
  releaseStatus?: string
  referralSource?: string
  dataSource?: string
  assay?: string
}

export async function getDashboardData(filters?: DashboardFilters): Promise<DashboardData> {
  const params: Record<string, string> = {}
  if (filters?.facility) params.facility = filters.facility
  if (filters?.dateRange) params.dateRange = filters.dateRange
  if (filters?.region) params.region = filters.region
  if (filters) {
    for (const [key, value] of Object.entries(filters)) {
      if (value) params[key] = value
    }
  }
  return apiClient.get<DashboardData>('/dashboard', params)
}

export async function refreshDashboard(): Promise<DashboardData> {
  return apiClient.get<DashboardData>('/dashboard', { refresh: 'true' })
}

export function useDashboardData(filters?: DashboardFilters) {
  return useQuery({
    queryKey: ['dashboard', filters],
    queryFn: () => getDashboardData(filters),
    staleTime: 30_000,
  })
}

export function useDashboardKPIs(filters?: DashboardFilters) {
  return useQuery({
    queryKey: ['dashboard', 'kpis', filters?.facility, filters?.dateRange, filters?.region, filters?.supplier],
    queryFn: async () => {
      const data = await getDashboardData(filters)
      return data.kpis
    },
    staleTime: 30_000,
  })
}

export function useDashboardCharts(filters?: DashboardFilters) {
  return useQuery({
    queryKey: ['dashboard', 'charts', filters?.facility, filters?.dateRange, filters?.region, filters?.supplier],
    queryFn: async () => {
      const data = await getDashboardData(filters)
      return {
        shipmentTrends: data.shipmentTrends,
        receivingVolume: data.receivingVolume,
        temperatureCompliance: data.temperatureCompliance,
        supplierPerformance: data.supplierPerformance,
        inventoryDistribution: data.inventoryDistribution,
        storageOccupancy: data.storageOccupancy,
        expiryTimeline: data.expiryTimeline,
        coldChainExcursions: data.coldChainExcursions,
        qualityInspectionResults: data.qualityInspectionResults,
      }
    },
    staleTime: 30_000,
  })
}
