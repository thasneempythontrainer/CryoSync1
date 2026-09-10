import { useState, useMemo } from 'react'
import { PageHeader } from '@/components/common/PageHeader'
import { KpiCard } from '@/components/common/KpiCard'
import { FilterBar, type FilterDef } from '@/components/common/FilterBar'
import { StatusBadge } from '@/components/common/StatusBadge'
import { Button } from '@/components/ui/button'
import {
  BarChart, Bar, LineChart, Line, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { Download, RefreshCw } from 'lucide-react'
import { chartTooltipStyle, axisTick, SEMANTIC_COLORS } from '@/components/dashboard/chart-utils'
import { useCbsyncPage } from '@/services/use-cbsync-page'

interface BranchRecord {
  id: string
  name: string
  manager: string
  region: string
  status: string
  collections: number
  quality: string
  lastAudit: string
  nextAudit: string
  staff: number
  accreditation: string
  readiness: number
}

const REGIONAL_PERFORMANCE = [
  { branch: 'Houston', collections: 186, quality: 96.2, readiness: 98, compliance: 94 },
  { branch: 'Los Angeles', collections: 142, quality: 94.8, readiness: 95, compliance: 92 },
  { branch: 'Chicago', collections: 128, quality: 97.1, readiness: 97, compliance: 96 },
  { branch: 'New York', collections: 112, quality: 93.4, readiness: 92, compliance: 91 },
  { branch: 'Atlanta', collections: 84, quality: 95.6, readiness: 94, compliance: 93 },
]

const RADAR_DATA = [
  { metric: 'Collection Volume', Houston: 186, LA: 142, Chicago: 128 },
  { metric: 'Quality Score', Houston: 96, LA: 95, Chicago: 97 },
  { metric: 'Readiness', Houston: 98, LA: 95, Chicago: 97 },
  { metric: 'Compliance', Houston: 94, LA: 92, Chicago: 96 },
  { metric: 'On-Time Reports', Houston: 92, LA: 89, Chicago: 94 },
  { metric: 'Staff Training', Houston: 95, LA: 91, Chicago: 93 },
]

const COLLECTION_TREND = [
  { month: 'Sep', houston: 42, la: 32, chicago: 28, ny: 24, atlanta: 18 },
  { month: 'Oct', houston: 48, la: 36, chicago: 32, ny: 26, atlanta: 20 },
  { month: 'Nov', houston: 44, la: 34, chicago: 30, ny: 25, atlanta: 19 },
  { month: 'Dec', houston: 36, la: 28, chicago: 24, ny: 20, atlanta: 15 },
  { month: 'Jan', houston: 52, la: 38, chicago: 34, ny: 28, atlanta: 22 },
  { month: 'Feb', houston: 56, la: 42, chicago: 36, ny: 30, atlanta: 24 },
  { month: 'Mar', houston: 60, la: 44, chicago: 38, ny: 32, atlanta: 26 },
  { month: 'Apr', houston: 54, la: 40, chicago: 34, ny: 28, atlanta: 22 },
  { month: 'May', houston: 58, la: 46, chicago: 40, ny: 34, atlanta: 28 },
  { month: 'Jun', houston: 62, la: 48, chicago: 42, ny: 36, atlanta: 30 },
  { month: 'Jul', houston: 58, la: 44, chicago: 38, ny: 32, atlanta: 26 },
  { month: 'Aug', houston: 30, la: 22, chicago: 20, ny: 16, atlanta: 14 },
]

const BRANCH_RECORDS: BranchRecord[] = [
  { id: 'BR-001', name: 'Houston Main', manager: 'Dr. Angela Torres', region: 'Texas', status: 'active', collections: 186, quality: '96.2%', lastAudit: '2026-07-15', nextAudit: '2026-10-15', staff: 24, accreditation: 'AABB', readiness: 98 },
  { id: 'BR-002', name: 'Los Angeles', manager: 'Dr. Michael Park', region: 'California', status: 'active', collections: 142, quality: '94.8%', lastAudit: '2026-06-20', nextAudit: '2026-09-20', staff: 18, accreditation: 'AABB', readiness: 95 },
  { id: 'BR-003', name: 'Chicago Hub', manager: 'Sarah Mitchell, RN', region: 'Illinois', status: 'active', collections: 128, quality: '97.1%', lastAudit: '2026-08-01', nextAudit: '2026-11-01', staff: 16, accreditation: 'AABB', readiness: 97 },
  { id: 'BR-004', name: 'New York Center', manager: 'Dr. Rachel Kim', region: 'New York', status: 'active', collections: 112, quality: '93.4%', lastAudit: '2026-05-10', nextAudit: '2026-08-10', staff: 14, accreditation: 'FACT', readiness: 92 },
  { id: 'BR-005', name: 'Atlanta Branch', manager: 'Patricia Evans, BSN', region: 'Georgia', status: 'under_review', collections: 84, quality: '95.6%', lastAudit: '2026-04-22', nextAudit: '2026-07-22', staff: 10, accreditation: 'AABB', readiness: 94 },
  { id: 'BR-006', name: 'Dallas Satellite', manager: 'TBD', region: 'Texas', status: 'setup', collections: 0, quality: '—', lastAudit: '—', nextAudit: '—', staff: 4, accreditation: 'Pending', readiness: 45 },
  { id: 'BR-007', name: 'Miami Collection Site', manager: 'Dr. Carlos Rivera', region: 'Florida', status: 'active', collections: 68, quality: '94.1%', lastAudit: '2026-06-05', nextAudit: '2026-09-05', staff: 8, accreditation: 'FACT', readiness: 90 },
  { id: 'BR-008', name: 'Seattle Partner', manager: 'Lisa Chen, RN', region: 'Washington', status: 'active', collections: 52, quality: '96.8%', lastAudit: '2026-07-20', nextAudit: '2026-10-20', staff: 6, accreditation: 'AABB', readiness: 96 },
]

const filters: FilterDef[] = [
  { key: 'status', label: 'Status', type: 'select', placeholder: 'All Statuses', options: [
    { value: 'active', label: 'Active' },
    { value: 'under_review', label: 'Under Review' },
    { value: 'setup', label: 'Setup' },
    { value: 'inactive', label: 'Inactive' },
  ]},
  { key: 'region', label: 'Region', type: 'select', placeholder: 'All Regions', options: [
    { value: 'Texas', label: 'Texas' },
    { value: 'California', label: 'California' },
    { value: 'Illinois', label: 'Illinois' },
    { value: 'New York', label: 'New York' },
    { value: 'Georgia', label: 'Georgia' },
    { value: 'Florida', label: 'Florida' },
    { value: 'Washington', label: 'Washington' },
  ]},
  { key: 'search', label: 'Search', type: 'search', placeholder: 'Search branch or manager…' },
]

export default function FranchiseesPage() {
  const [filterValues, setFilterValues] = useState<Record<string, string>>({})
  const [page, setPage] = useState(1)
  const pageSize = 10

  const data = useCbsyncPage('franchisees')
  const liveRecords = data.records as unknown as BranchRecord[]
  const records = liveRecords.length ? liveRecords : BRANCH_RECORDS
  const regionalPerformance = (data.charts.REGIONAL_PERFORMANCE as Array<Record<string, unknown>> | undefined)?.length
    ? (data.charts.REGIONAL_PERFORMANCE as Array<Record<string, unknown>>)
    : REGIONAL_PERFORMANCE
  const radarData = (data.charts.RADAR_DATA as Array<Record<string, unknown>> | undefined)?.length
    ? (data.charts.RADAR_DATA as Array<Record<string, unknown>>)
    : RADAR_DATA
  const collectionTrend = (data.charts.COLLECTION_TREND as Array<Record<string, unknown>> | undefined)?.length
    ? (data.charts.COLLECTION_TREND as Array<Record<string, unknown>>)
    : COLLECTION_TREND

  const filteredData = useMemo(() => {
    return records.filter((row) => {
      if (filterValues.status && row.status !== filterValues.status) return false
      if (filterValues.region && row.region !== filterValues.region) return false
      if (filterValues.search) {
        const q = filterValues.search.toLowerCase()
        if (!row.name.toLowerCase().includes(q) && !row.manager.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [filterValues, records])

  return (
    <div className="flex flex-1 flex-col gap-5 overflow-auto p-5">
      <PageHeader
        title="Collection Branches"
        description="Coordinate branch readiness, collection quality, courier handoff, and laboratory report submission across the operating network."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={data.refresh}><RefreshCw className="size-3.5" /></Button>
            <Button variant="outline" size="sm"><Download className="size-3.5 mr-1.5" /> Export</Button>
          </>
        }
      />

      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        <span className="size-1.5 rounded-full bg-orange-500" /> StemCyte branch network
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Active branches" value="7" trend="neutral" trendPercent={0} icon={<span className="text-xs">🏢</span>} spark={[5,5,5,6,6,6,6,7,7,7]} color={SEMANTIC_COLORS.primary} />
        <KpiCard label="Avg readiness" value="91.7%" trend="up" trendPercent={1.4} icon={<span className="text-xs">📊</span>} spark={[88.2,89.0,89.5,90.0,90.4,90.8,91.0,91.2,91.5,91.7]} color={SEMANTIC_COLORS.success} />
        <KpiCard label="Report feeds" value="6" trend="up" trendPercent={20.0} icon={<span className="text-xs">📡</span>} spark={[3,3,4,4,5,5,5,6,6,6]} color={SEMANTIC_COLORS.info} />
        <KpiCard label="Compliance score" value="93.6%" trend="up" trendPercent={0.8} icon={<span className="text-xs">✅</span>} spark={[91.2,91.8,92.0,92.4,92.8,93.0,93.2,93.4,93.5,93.6]} color={SEMANTIC_COLORS.warning} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="card-premium flex flex-col p-3">
          <h3 className="text-[13px] font-semibold text-foreground">Branch Performance Comparison</h3>
          <p className="mt-px text-[11px] text-muted-foreground">Quality, readiness, and compliance by branch</p>
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                <PolarGrid stroke="var(--border)" />
                <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
                <PolarRadiusAxis tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} domain={[80, 100]} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" iconSize={8} />
                <Radar name="Houston" dataKey="Houston" stroke={SEMANTIC_COLORS.primary} fill={SEMANTIC_COLORS.primary} fillOpacity={0.15} strokeWidth={2} />
                <Radar name="LA" dataKey="LA" stroke={SEMANTIC_COLORS.warning} fill={SEMANTIC_COLORS.warning} fillOpacity={0.1} strokeWidth={2} />
                <Radar name="Chicago" dataKey="Chicago" stroke={SEMANTIC_COLORS.success} fill={SEMANTIC_COLORS.success} fillOpacity={0.1} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card-premium flex flex-col p-3">
          <h3 className="text-[13px] font-semibold text-foreground">Collection Trend by Branch</h3>
          <p className="mt-px text-[11px] text-muted-foreground">Monthly collection volume per branch</p>
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={collectionTrend} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
                <XAxis dataKey="month" tick={axisTick} tickLine={false} axisLine={false} />
                <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" iconSize={8} />
                <Line type="monotone" dataKey="houston" stroke={SEMANTIC_COLORS.primary} strokeWidth={2.5} dot={false} name="Houston" />
                <Line type="monotone" dataKey="la" stroke={SEMANTIC_COLORS.warning} strokeWidth={2} dot={false} name="LA" />
                <Line type="monotone" dataKey="chicago" stroke={SEMANTIC_COLORS.success} strokeWidth={2} dot={false} name="Chicago" />
                <Line type="monotone" dataKey="ny" stroke={SEMANTIC_COLORS.info} strokeWidth={2} dot={false} name="New York" />
                <Line type="monotone" dataKey="atlanta" stroke={SEMANTIC_COLORS.danger} strokeWidth={1.5} dot={false} name="Atlanta" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="card-premium flex flex-col p-3">
        <h3 className="text-[13px] font-semibold text-foreground">Branch Readiness Scores</h3>
        <p className="mt-px text-[11px] text-muted-foreground">Operational readiness by branch</p>
        <div className="mt-3 h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={regionalPerformance} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
              <XAxis dataKey="branch" tick={axisTick} tickLine={false} axisLine={false} />
              <YAxis domain={[80, 100]} tick={axisTick} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={chartTooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" iconSize={8} />
              <Bar dataKey="readiness" fill={SEMANTIC_COLORS.primary} radius={[4, 4, 0, 0]} name="Readiness %" />
              <Bar dataKey="compliance" fill={SEMANTIC_COLORS.success} radius={[4, 4, 0, 0]} name="Compliance %" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Branch Registry</h3>
        <FilterBar filters={filters} values={filterValues} onChange={(k, v) => { setFilterValues((prev) => ({ ...prev, [k]: v })); setPage(1) }} onReset={() => { setFilterValues({}); setPage(1) }} />
        <div className="overflow-x-auto rounded border border-border">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">ID</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Branch</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Manager</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Region</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Collections</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Quality</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Accreditation</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Next Audit</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.slice((page - 1) * pageSize, page * pageSize).map((row, i) => (
                <tr key={row.id} className={`border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors ${i % 2 === 1 ? 'bg-muted/10' : ''}`}>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-foreground">{row.id}</td>
                  <td className="px-3 py-2.5 text-foreground font-medium">{row.name}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{row.manager}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{row.region}</td>
                  <td className="px-3 py-2.5"><StatusBadge status={row.status} size="sm" /></td>
                  <td className="px-3 py-2.5 text-foreground">{row.collections}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{row.quality}</td>
                  <td className="px-3 py-2.5"><StatusBadge status={row.accreditation.toLowerCase()} size="sm" /></td>
                  <td className="px-3 py-2.5 text-muted-foreground">{row.nextAudit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{filteredData.length} branches</span>
          <div className="flex gap-1">
            <Button variant="ghost" size="xs" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <span className="flex items-center px-2">Page {page}</span>
            <Button variant="ghost" size="xs" disabled={page * pageSize >= filteredData.length} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
