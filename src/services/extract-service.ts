import { apiClient } from './api'

export type ExtractedSection = 'shipment' | 'parties' | 'product' | 'compliance'

export interface ExtractedField {
  key: string
  label: string
  section: ExtractedSection
  type: 'string' | 'number' | 'boolean' | 'enum'
  options?: string[] | null
  value: string | number | boolean | null
  confidence: number
  evidence?: string | null
  needsReview?: boolean
  verified?: boolean
}

export interface ExtractFormParams {
  fileName?: string
  mimeType: string
  dataBase64: string
  precisionMode?: boolean
  documentType?: string
}

export interface ExtractionMetrics {
  elapsedMs?: number
  renderMs?: number
  modelMs?: number
  pages?: number
  fieldsTotal?: number
  fieldsFound?: number
  needsReview?: number
  verifiedFields?: number
  corrections?: number
  confidenceBuckets?: { high: number; medium: number; low: number }
  evidenceChecked?: number
  evidenceVerified?: number
  fieldPages?: Record<string, number>
}

export interface ExtractFormResult {
  documentType: string
  mode: 'standard' | 'precision'
  model: string
  pages?: number
  overallConfidence: number
  fields: ExtractedField[]
  warnings: string[]
  metrics?: ExtractionMetrics
}

export async function extractFormData(params: ExtractFormParams): Promise<ExtractFormResult> {
  return apiClient.post<ExtractFormResult>('/ai/extract-form', params)
}

export interface ModeValueDifference {
  key: string
  label: string
  standard: string | number | boolean | null
  precision: string | number | boolean | null
}

export interface ExtractModeComparison {
  standard: ExtractFormResult & { elapsedMs?: number }
  precision: ExtractFormResult & { elapsedMs?: number }
  valueDifferences: ModeValueDifference[]
}

export async function compareExtractModes(
  params: ExtractFormParams,
): Promise<ExtractModeComparison> {
  return apiClient.post<ExtractModeComparison>('/ai/extract-compare', params)
}

export const EXTRACT_PREFILL_KEY = 'cryosync.ai-extract-prefill'

/**
 * Flatten extracted fields into a partial receiving-form payload and stage it
 * in sessionStorage so the Receiving intake form can pick it up on mount.
 */
export function stageReceivingPrefill(result: ExtractFormResult, values: Record<string, unknown>): void {
  const prefill: Record<string, unknown> = {}
  for (const field of result.fields) {
    if (values[field.key] !== undefined && values[field.key] !== '') {
      prefill[field.key] = values[field.key]
    }
  }
  sessionStorage.setItem(EXTRACT_PREFILL_KEY, JSON.stringify(prefill))
}
