import { useQuery } from '@tanstack/react-query'
import { apiClient } from './api'
import type { SystemHealth } from '@/types'

export interface SystemLogsParams {
  page?: number
  pageSize?: number
  level?: string
  service?: string
}

export async function getSystemHealth(): Promise<SystemHealth> {
  return apiClient.get<SystemHealth>('/system/health')
}

export async function getSystemLogs(params?: SystemLogsParams): Promise<{ data: any[]; total: number }> {
  const queryParams: Record<string, string> = {}
  if (params?.page) queryParams.page = String(params.page)
  if (params?.pageSize) queryParams.pageSize = String(params.pageSize)
  if (params?.level) queryParams.level = params.level
  if (params?.service) queryParams.service = params.service
  return apiClient.get<{ data: any[]; total: number }>('/system/logs', queryParams)
}

export function useSystemHealth() {
  return useQuery({
    queryKey: ['system-health'],
    queryFn: getSystemHealth,
    refetchInterval: 60_000,
  })
}

export function useSystemLogs(params?: SystemLogsParams) {
  return useQuery({
    queryKey: ['system-logs', params],
    queryFn: () => getSystemLogs(params),
  })
}
