import { apiClient } from './api'
import type { ComplianceIncident } from '@/types'

export interface TempIncidentScanParams {
  facilityId?: string
  reportedBy?: string
}

export interface TempIncidentScanSummary {
  scanned: number
  detected: number
  created: number
  alreadyReported: number
}

export interface TempIncidentScanResult {
  summary: TempIncidentScanSummary
  createdIncidents: ComplianceIncident[]
}

export async function scanTemperatureIncidents(
  params?: TempIncidentScanParams,
): Promise<TempIncidentScanResult> {
  return apiClient.post<TempIncidentScanResult>('/ai/temp-incidents/scan', params ?? {})
}

export interface ResolveOpenIncidentsParams {
  correctiveAction?: string
  closureNotes?: string
  resolvedBy?: string
}

export interface ResolveOpenIncidentsResult {
  resolved: number
  incidents: ComplianceIncident[]
}

export async function resolveAllOpenIncidents(
  params?: ResolveOpenIncidentsParams,
): Promise<ResolveOpenIncidentsResult> {
  return apiClient.post<ResolveOpenIncidentsResult>('/compliance/incidents/resolve-open', params ?? {})
}
