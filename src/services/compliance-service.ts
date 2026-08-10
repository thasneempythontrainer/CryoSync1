import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from './api'
import type { ComplianceIncident, ComplianceSummary, AuditLogEntry, DeviationType, ComplianceSeverity } from '@/types'

export interface ComplianceListParams {
  page?: number
  pageSize?: number
  status?: string
  severity?: string
  type?: string
  facility?: string
  search?: string
}

export interface ResolveIncidentData {
  correctiveAction: string
  closureNotes: string
}

export interface ReportIncidentData {
  title: string
  description: string
  deviationType: DeviationType
  severity: ComplianceSeverity
  facilityId?: string
  shipmentNumber?: string
  lotNumber?: string
  productName?: string
  regulatoryNotifiable?: boolean
  reportedBy?: string
  detectedBy?: string
}

export async function getComplianceIncidents(params?: ComplianceListParams): Promise<{ data: ComplianceSummary[]; total: number }> {
  const queryParams: Record<string, string> = {}
  if (params?.page) queryParams.page = String(params.page)
  if (params?.pageSize) queryParams.pageSize = String(params.pageSize)
  if (params?.status) queryParams.status = params.status
  if (params?.severity) queryParams.severity = params.severity
  if (params?.type) queryParams.type = params.type
  if (params?.facility) queryParams.facility = params.facility
  if (params?.search) queryParams.search = params.search
  return apiClient.get<{ data: ComplianceSummary[]; total: number }>('/compliance/incidents', queryParams)
}

export async function getComplianceIncidentById(id: string): Promise<ComplianceIncident | undefined> {
  return apiClient.get<ComplianceIncident | undefined>(`/compliance/incidents/${id}`)
}

export async function createComplianceIncident(data: ReportIncidentData): Promise<ComplianceIncident> {
  return apiClient.post<ComplianceIncident>('/compliance/incidents', data)
}

export async function resolveIncident(id: string, resolution: ResolveIncidentData): Promise<ComplianceIncident> {
  return apiClient.put<ComplianceIncident>(`/compliance/incidents/${id}/resolve`, resolution)
}

export interface AssignIncidentData {
  assignedTo?: string
  assignedById?: string
  status?: 'open' | 'investigating'
  assignedBy?: string
}

export async function assignIncident(id: string, data: AssignIncidentData): Promise<ComplianceIncident> {
  return apiClient.put<ComplianceIncident>(`/compliance/incidents/${id}/assign`, data)
}

export async function getAuditLog(incidentId: string): Promise<AuditLogEntry[]> {
  return apiClient.get<AuditLogEntry[]>(`/compliance/incidents/${incidentId}/audit-log`)
}

export function useComplianceIncidents(params?: ComplianceListParams) {
  return useQuery({
    queryKey: ['compliance-incidents', params],
    queryFn: () => getComplianceIncidents(params),
  })
}

export function useComplianceIncident(id: string | undefined) {
  return useQuery({
    queryKey: ['compliance-incident', id],
    queryFn: () => getComplianceIncidentById(id!),
    enabled: !!id,
  })
}

export function useResolveIncident() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, resolution }: { id: string; resolution: ResolveIncidentData }) => resolveIncident(id, resolution),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['compliance-incidents'] })
      queryClient.invalidateQueries({ queryKey: ['compliance-incident', data.id] })
    },
  })
}

export function useAssignIncident() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: AssignIncidentData }) => assignIncident(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['compliance-incidents'] })
      queryClient.invalidateQueries({ queryKey: ['compliance-incident', data.id] })
    },
  })
}

export function useCreateComplianceIncident() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: ReportIncidentData) => createComplianceIncident(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance-incidents'] })
    },
  })
}
