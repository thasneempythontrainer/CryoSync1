import { useMemo, useState } from 'react'
import { Download, RefreshCw } from 'lucide-react'

import { useDashboardData } from '@/services'
import { ErrorState, LoadingState } from '@/components/common'
import { Button } from '@/components/ui/button'
import { StemCyteCommandSurface } from '@/components/dashboard/StemCyteCommandSurface'
import type { DashboardFilters } from '@/services/dashboard-service'

export default function DashboardPage() {
  const [filters, setFilters] = useState<DashboardFilters>({})
  const filterGroups = useMemo(() => [
    { key: 'facility', label: 'Branch', options: [{ value: 'mumbai', label: 'Mumbai Processing Lab' }, { value: 'delhi', label: 'Delhi Collection Center' }, { value: 'bangalore', label: 'Bangalore Storage Facility' }] },
    { key: 'region', label: 'Region', options: ['North', 'South', 'East', 'West'].map((value) => ({ value, label: value })) },
    { key: 'dateRange', label: 'Window', options: [{ value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }, { value: '365', label: 'Last year' }] },
    { key: 'custodyStage', label: 'Custody stage', options: ['Collection', 'Receiving', 'Processing', 'Testing', 'Cryostorage', 'Release'].map((value) => ({ value, label: value })) },
    { key: 'collectionStatus', label: 'Collection state', options: ['Scheduled', 'Collected', 'Received', 'Exception'].map((value) => ({ value, label: value })) },
    { key: 'qualityState', label: 'Quality state', options: ['Within limits', 'Under review', 'Critical'].map((value) => ({ value, label: value })) },
    { key: 'testReport', label: 'Test report', options: ['Missing', 'Pending review', 'Approved', 'Rejected'].map((value) => ({ value, label: value })) },
    { key: 'storageRegime', label: 'Storage regime', options: ['Liquid nitrogen', '-80°C', '-20°C', '2–8°C'].map((value) => ({ value, label: value })) },
    { key: 'priority', label: 'Priority', options: ['Standard', 'Expedited', 'Critical'].map((value) => ({ value, label: value })) },
    { key: 'releaseStatus', label: 'Release status', options: ['Not requested', 'QA review', 'Ready', 'Dispatched'].map((value) => ({ value, label: value })) },
    { key: 'referralSource', label: 'Referral source', options: ['Hospital', 'Physician', 'Maternity partner', 'Direct'].map((value) => ({ value, label: value })) },
    { key: 'dataSource', label: 'Data source', options: ['CRM', 'ERP', 'Branch CSV', 'Telemetry'].map((value) => ({ value, label: value })) },
    { key: 'assay', label: 'Assay', options: ['Sterility', 'Viability', 'Identity', 'Infectious disease'].map((value) => ({ value, label: value })) },
  ] as const, [])
  const { data, isLoading, error, refetch } = useDashboardData(filters)

  function exportSnapshot() {
    if (!data) return
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `stemcyte-command-snapshot-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="stemcyte-dashboard flex h-full flex-col overflow-hidden bg-muted">
      <header className="flex min-h-14 shrink-0 items-center gap-3 border-b border-border/70 bg-background/90 px-4 backdrop-blur sm:px-6">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">StemCyte operations</p>
          <h1 className="truncate font-heading text-lg font-semibold tracking-tight">Cell custody command center</h1>
        </div>
        <span className="hidden rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-700 md:inline-flex">Source health 98.4%</span>
        <Button variant="ghost" size="icon-sm" onClick={() => refetch()} disabled={isLoading} title="Refresh command center"><RefreshCw className={isLoading ? 'animate-spin' : ''} /></Button>
        <Button variant="ghost" size="icon-sm" onClick={exportSnapshot} disabled={!data} title="Export snapshot"><Download /></Button>
      </header>
      <div className="shrink-0 border-b border-border/70 bg-background/60 px-3 py-2 sm:px-5">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="mr-1 shrink-0 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Filters</span>
          {filterGroups.map((group) => <select key={group.key} value={filters[group.key] ?? ''} onChange={(event) => setFilters((current) => ({ ...current, [group.key]: event.target.value || undefined }))} className="h-8 min-w-28 shrink-0 rounded-md border border-border bg-background px-2 text-[11px] text-foreground outline-none focus:border-teal-500"><option value="">{group.label}</option>{group.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>)}
          {Object.values(filters).some(Boolean) && <button type="button" onClick={() => setFilters({})} className="shrink-0 px-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground">Clear all</button>}
        </div>
        <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground"><span className="size-1.5 rounded-full bg-teal-500" /> 13 dimensions available <span className="text-muted-foreground/40">|</span> Filters persist for this command view</div>
      </div>
      <main className="min-h-0 flex-1 overflow-auto">
        {isLoading ? <div className="flex h-full items-center justify-center"><LoadingState title="Assembling CBU custody picture..." variant="spinner" /></div> : error ? <div className="flex h-full items-center justify-center p-8"><ErrorState title="Command center unavailable" description={error instanceof Error ? error.message : 'Unable to read StemCyte operations data.'} onRetry={() => refetch()} /></div> : data ? <StemCyteCommandSurface data={data} /> : null}
      </main>
    </div>
  )
}
