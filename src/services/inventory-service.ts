import { useQuery } from '@tanstack/react-query'
import { apiClient } from './api'
import type { InventoryLot, StorageZone } from '@/types'

export interface InventoryListParams {
  page?: number
  pageSize?: number
  status?: string
  facility?: string
  category?: string
  search?: string
  nearExpiry?: boolean
}

export async function getInventoryLots(params?: InventoryListParams): Promise<{ data: InventoryLot[]; total: number }> {
  const queryParams: Record<string, string> = {}
  if (params?.page) queryParams.page = String(params.page)
  if (params?.pageSize) queryParams.pageSize = String(params.pageSize)
  if (params?.status) queryParams.status = params.status
  if (params?.facility) queryParams.facility = params.facility
  if (params?.category) queryParams.category = params.category
  if (params?.search) queryParams.search = params.search
  if (params?.nearExpiry) queryParams.nearExpiry = 'true'
  return apiClient.get<{ data: InventoryLot[]; total: number }>('/inventory/lots', queryParams)
}

export async function getInventoryLotById(id: string): Promise<InventoryLot | undefined> {
  return apiClient.get<InventoryLot | undefined>(`/inventory/lots/${id}`)
}

export async function getStorageZones(facilityId?: string): Promise<StorageZone[]> {
  const params = facilityId ? { facilityId } : undefined
  return apiClient.get<StorageZone[]>('/inventory/storage-zones', params)
}

export function useInventoryLots(params?: InventoryListParams) {
  return useQuery({
    queryKey: ['inventory-lots', params],
    queryFn: () => getInventoryLots(params),
  })
}

export function useStorageZones(facilityId?: string) {
  return useQuery({
    queryKey: ['storage-zones', facilityId],
    queryFn: () => getStorageZones(facilityId),
  })
}
