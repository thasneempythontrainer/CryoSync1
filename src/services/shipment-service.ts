import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from './api'
import type { Shipment, ShipmentSummary, ShipmentStatus, ReadingsUploadResult } from '@/types'

export interface ShipmentListParams {
  page?: number
  pageSize?: number
  status?: string
  supplier?: string
  category?: string
  facility?: string
  search?: string
  sortBy?: string
  sortOrder?: string
}

export interface LoggerInput {
  loggerId: string
  model?: string
}

export interface RawTemperatureReading {
  timestamp?: string
  temperature: number
  location?: string
}

export interface ReadingsUploadInput {
  loggerId?: string
  readings: RawTemperatureReading[]
}

export async function getShipments(params?: ShipmentListParams): Promise<{ data: ShipmentSummary[]; total: number }> {
  const queryParams: Record<string, string> = {}
  if (params?.page) queryParams.page = String(params.page)
  if (params?.pageSize) queryParams.pageSize = String(params.pageSize)
  if (params?.status) queryParams.status = params.status
  if (params?.supplier) queryParams.supplier = params.supplier
  if (params?.category) queryParams.category = params.category
  if (params?.facility) queryParams.facility = params.facility
  if (params?.search) queryParams.search = params.search
  if (params?.sortBy) queryParams.sortBy = params.sortBy
  if (params?.sortOrder) queryParams.sortOrder = params.sortOrder
  return apiClient.get<{ data: ShipmentSummary[]; total: number }>('/shipments', queryParams)
}

export async function getShipmentById(id: string): Promise<Shipment | undefined> {
  return apiClient.get<Shipment | undefined>(`/shipments/${id}`)
}

export async function createShipment(data: Partial<Shipment>): Promise<Shipment> {
  return apiClient.post<Shipment>('/shipments', data)
}

export async function updateShipmentStatus(id: string, status: ShipmentStatus): Promise<Shipment> {
  return apiClient.put<Shipment>(`/shipments/${id}/status`, { status })
}

export async function updateShipment(id: string, data: Partial<Shipment>): Promise<Shipment> {
  return apiClient.put<Shipment>(`/shipments/${id}`, data)
}

export async function addShipmentLogger(id: string, data: LoggerInput): Promise<Shipment> {
  return apiClient.post<Shipment>(`/shipments/${id}/loggers`, data)
}

export async function uploadShipmentReadings(id: string, data: ReadingsUploadInput): Promise<ReadingsUploadResult> {
  return apiClient.post<ReadingsUploadResult>(`/shipments/${id}/readings`, data)
}

export async function deleteShipment(id: string): Promise<unknown> {
  return apiClient.delete(`/shipments/${id}`)
}

export function useShipments(params?: ShipmentListParams) {
  return useQuery({
    queryKey: ['shipments', params],
    queryFn: () => getShipments(params),
  })
}

export function useShipment(id: string | undefined) {
  return useQuery({
    queryKey: ['shipment', id],
    queryFn: () => getShipmentById(id!),
    enabled: !!id,
  })
}

export function useCreateShipment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Shipment>) => createShipment(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipments'] })
    },
  })
}

export function useUpdateShipmentStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ShipmentStatus }) => updateShipmentStatus(id, status),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['shipments'] })
      queryClient.invalidateQueries({ queryKey: ['shipment', data.id] })
    },
  })
}

export function useUpdateShipment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Shipment> }) => updateShipment(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['shipments'] })
      queryClient.invalidateQueries({ queryKey: ['shipment', data.id] })
    },
  })
}

export function useAddShipmentLogger() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: LoggerInput }) => addShipmentLogger(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['shipment', data.id] })
      queryClient.invalidateQueries({ queryKey: ['shipments'] })
    },
  })
}

export function useUploadShipmentReadings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ReadingsUploadInput }) => uploadShipmentReadings(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['shipment', data.shipment.id] })
      queryClient.invalidateQueries({ queryKey: ['shipments'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useDeleteShipment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteShipment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipments'] })
      queryClient.invalidateQueries({ queryKey: ['shipment'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}
