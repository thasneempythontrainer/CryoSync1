import { useEffect, useState } from 'react'
import {
  getPagePayload,
  type CbsyncPagePayload,
  type PageResource,
  type KpiStat,
} from './crud-service'

export interface PageData {
  records: Record<string, unknown>[]
  charts: Record<string, unknown[]>
  kpis: KpiStat[]
  loading: boolean
  error: string | null
  refresh: () => void
}

export function useCbsyncPage(resource: PageResource): PageData {
  const [payload, setPayload] = useState<CbsyncPagePayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getPagePayload(resource)
      .then((data) => {
        if (cancelled) return
        setPayload(data)
        setError(null)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [resource, tick])

  return {
    records: payload?.records ?? [],
    charts: payload?.charts ?? {},
    kpis: payload?.kpis ?? [],
    loading,
    error,
    refresh: () => setTick((t) => t + 1),
  }
}

/**
 * Resolve a chart dataset, overlaying presentational keys (fill/color) from a
 * static fallback schema so backend-driven values keep the intended palette.
 */
export function resolveChart<T extends Record<string, unknown>>(
  backend: unknown[] | undefined,
  fallback: T[],
): (T & Record<string, unknown>)[] {
  if (!backend || backend.length === 0) return fallback
  return backend.map((item) => {
    const row = item as Record<string, unknown>
    const match = fallback.find((f) => {
      const fk = f['name'] ?? f['stage'] ?? f['type'] ?? f['method'] ?? f['criterion'] ?? f['metric']
      const bk = row['name'] ?? row['stage'] ?? row['type'] ?? row['method'] ?? row['criterion'] ?? row['metric']
      return fk === bk
    })
    return { ...(match ?? ({} as T)), ...row }
  })
}