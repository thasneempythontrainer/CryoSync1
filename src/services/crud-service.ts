import { apiClient } from './api'

export type PageResource =
  | 'cbu-units'
  | 'customers'
  | 'storage'
  | 'transplants'
  | 'payments'
  | 'referrals'
  | 'franchisees'

export interface KpiStat {
  label: string
  value: string
  trend?: string
  trendPercent?: number
}

export interface CbsyncPagePayload {
  records: Record<string, unknown>[]
  charts: Record<string, unknown[]>
  kpis: KpiStat[]
}

export function getPagePayload(resource: PageResource): Promise<CbsyncPagePayload> {
  return apiClient.get<CbsyncPagePayload>(`/pages/${resource}`)
}