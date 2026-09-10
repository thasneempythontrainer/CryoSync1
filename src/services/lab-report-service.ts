import { apiClient } from './api'

export interface LabReport {
  id: string
  reportId: string
  unitNumber: string | null
  cordBloodUnitId: string | null
  sampleReference: string | null
  testType: string | null
  testName: string | null
  testMethod: string | null
  instrument: string | null
  performedAt: string | null
  performedBy: string | null
  resultValue: string | number | null
  resultUnit: string | null
  resultText: string | null
  referenceLow: string | number | null
  referenceHigh: string | number | null
  referenceText: string | null
  status: string
  reviewedBy: string | null
  reviewedAt: string | null
  reviewNotes: string | null
  batchId: string
  sourceFilename: string
  sourceRow: number | null
  details: Record<string, string | number | null>
  createdAt: string
  updatedAt: string
}

export interface LabReportListResult {
  data: LabReport[]
  total: number
  page: number
  pageSize: number
}

export interface UploadError {
  sourceRow: number
  error: string
}

export interface UploadResult {
  batchId: string
  filename: string
  status: 'completed' | 'partial' | 'failed'
  totalRows: number
  successfulRows: number
  failedRows: number
  errors: UploadError[]
  warnings: string[]
}

export interface ImportBatch {
  id: string
  filename: string
  fileSizeBytes: number
  importedBy: string
  totalRows: number
  successfulRows: number
  failedRows: number
  status: string
  errors: UploadError[]
  startedAt: string
  completedAt: string
  metadata: Record<string, unknown>
}

export interface ImportBatchListResult {
  data: ImportBatch[]
  total: number
  page: number
  pageSize: number
}

export interface LabReportFilters {
  page?: number
  pageSize?: number
  search?: string
  testType?: string
  status?: string
  batchId?: string
}

export function getLabReports(params: LabReportFilters = {}): Promise<LabReportListResult> {
  const qs: Record<string, string> = {}
  if (params.page) qs.page = String(params.page)
  if (params.pageSize) qs.pageSize = String(params.pageSize)
  if (params.search) qs.search = params.search
  if (params.testType) qs.testType = params.testType
  if (params.status) qs.status = params.status
  if (params.batchId) qs.batchId = params.batchId
  return apiClient.get<LabReportListResult>('/lab-reports', qs)
}

export function getLabReport(id: string): Promise<LabReport> {
  return apiClient.get<LabReport>(`/lab-reports/${encodeURIComponent(id)}`)
}

export function getLabReportBatches(params: { page?: number; pageSize?: number } = {}): Promise<ImportBatchListResult> {
  const qs: Record<string, string> = {}
  if (params.page) qs.page = String(params.page)
  if (params.pageSize) qs.pageSize = String(params.pageSize)
  return apiClient.get<ImportBatchListResult>('/lab-reports/batches', qs)
}

export function uploadLabReports(file: File): Promise<UploadResult> {
  const form = new FormData()
  form.append('file', file)
  return apiClient.upload<UploadResult>('/lab-reports/upload', form)
}

export interface PreviewRecord {
  id: string
  reportId: string
  unitNumber: string | null
  cordBloodUnitId: string | null
  sampleReference: string | null
  testType: string | null
  testName: string | null
  testMethod: string | null
  instrument: string | null
  performedAt: string | null
  performedBy: string | null
  resultValue: string | number | null
  resultUnit: string | null
  resultText: string | null
  referenceLow: string | number | null
  referenceHigh: string | number | null
  referenceText: string | null
  status: string
  reviewedBy: string | null
  reviewedAt: string | null
  reviewNotes: string | null
  batchId: string
  sourceFilename: string
  sourceRow: number | null
  details: Record<string, string | number | null>
  createdAt: string
  updatedAt: string
}

export interface PreviewResult {
  filename: string
  totalRows: number
  successfulRows: number
  failedRows: number
  linkedCbuCount: number
  records: PreviewRecord[]
  errors: UploadError[]
  warnings: string[]
}

export function previewLabReports(file: File): Promise<PreviewResult> {
  const form = new FormData()
  form.append('file', file)
  return apiClient.upload<PreviewResult>('/lab-reports/preview', form)
}

export interface ConfirmPayload {
  records: PreviewRecord[]
  filename: string
  batchId?: string
  fileSizeBytes?: number
}

export function confirmLabReports(payload: ConfirmPayload): Promise<UploadResult> {
  return apiClient.post<UploadResult>('/lab-reports/confirm', payload)
}