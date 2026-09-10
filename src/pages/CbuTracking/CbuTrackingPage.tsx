import { useState, useMemo } from 'react'
import { PageHeader } from '@/components/common/PageHeader'
import { KpiCard } from '@/components/common/KpiCard'
import { FilterBar, type FilterDef } from '@/components/common/FilterBar'
import { StatusBadge } from '@/components/common/StatusBadge'
import { Button } from '@/components/ui/button'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { Download, RefreshCw } from 'lucide-react'
import { chartTooltipStyle, axisTick, SEMANTIC_COLORS } from '@/components/dashboard/chart-utils'
import { useCbsyncPage, resolveChart } from '@/services/use-cbsync-page'

interface CbuRecord {
  id: string
  family: string
  facility: string
  status: string
  collected: string
  storage: string
  testStatus: string
  volume: string
  cellCount: string
}

const CBU_LIFECYCLE = [
  { stage: 'Collected', count: 1482, fill: SEMANTIC_COLORS.primary },
  { stage: 'Accessioned', count: 1396, fill: SEMANTIC_COLORS.info },
  { stage: 'Processing', count: 1124, fill: SEMANTIC_COLORS.purple },
  { stage: 'Testing', count: 876, fill: SEMANTIC_COLORS.warning },
  { stage: 'Storage', count: 3241, fill: SEMANTIC_COLORS.success },
  { stage: 'Released', count: 684, fill: SEMANTIC_COLORS.orange },
]

const STATUS_DIST = [
  { name: 'In Storage', value: 3241, color: SEMANTIC_COLORS.success },
  { name: 'In Processing', value: 1124, color: SEMANTIC_COLORS.purple },
  { name: 'Awaiting Tests', value: 876, color: SEMANTIC_COLORS.warning },
  { name: 'Released', value: 684, color: SEMANTIC_COLORS.orange },
  { name: 'Quarantine', value: 143, color: SEMANTIC_COLORS.danger },
  { name: 'Disposed', value: 67, color: SEMANTIC_COLORS.neutral },
]

const INTAKE_TREND = [
  { week: 'W1', collected: 78, processed: 72, released: 12 },
  { week: 'W2', collected: 85, processed: 80, released: 15 },
  { week: 'W3', collected: 71, processed: 68, released: 18 },
  { week: 'W4', collected: 92, processed: 88, released: 14 },
  { week: 'W5', collected: 88, processed: 85, released: 22 },
  { week: 'W6', collected: 95, processed: 91, released: 19 },
  { week: 'W7', collected: 82, processed: 79, released: 25 },
  { week: 'W8', collected: 90, processed: 86, released: 21 },
  { week: 'W9', collected: 97, processed: 93, released: 28 },
  { week: 'W10', collected: 104, processed: 98, released: 24 },
  { week: 'W11', collected: 89, processed: 86, released: 30 },
  { week: 'W12', collected: 93, processed: 90, released: 26 },
]

const CBU_RECORDS: CbuRecord[] = [
  { id: 'CBU-2026-04821', family: 'Martinez, R.', facility: 'Houston Main', status: 'in_storage', collected: '2026-07-14', storage: 'TX-A3-R12-C07', testStatus: 'complete', volume: '142 mL', cellCount: '8.4×10⁸' },
  { id: 'CBU-2026-04820', family: 'Chen, L.', facility: 'Los Angeles', status: 'testing', collected: '2026-07-13', storage: '—', testStatus: 'pending_hla', volume: '128 mL', cellCount: '7.1×10⁸' },
  { id: 'CBU-2026-04819', family: 'Johnson, A.', facility: 'Chicago Hub', status: 'in_storage', collected: '2026-07-12', storage: 'IL-B1-R08-C03', testStatus: 'complete', volume: '156 mL', cellCount: '9.2×10⁸' },
  { id: 'CBU-2026-04818', family: 'Nguyen, T.', facility: 'Houston Main', status: 'processing', collected: '2026-07-12', storage: '—', testStatus: 'not_started', volume: '134 mL', cellCount: '—' },
  { id: 'CBU-2026-04817', family: 'Williams, K.', facility: 'Atlanta Branch', status: 'released', collected: '2026-07-10', storage: 'DISPATCHED', testStatus: 'complete', volume: '148 mL', cellCount: '8.9×10⁸' },
  { id: 'CBU-2026-04816', family: 'Patel, S.', facility: 'New York Center', status: 'in_storage', collected: '2026-07-09', storage: 'NY-C2-R04-C11', testStatus: 'complete', volume: '139 mL', cellCount: '7.8×10⁸' },
  { id: 'CBU-2026-04815', family: 'Garcia, M.', facility: 'Houston Main', status: 'quarantine', collected: '2026-07-08', storage: 'TX-Q1-R02-C01', testStatus: 'failed_micro', volume: '112 mL', cellCount: '5.2×10⁸' },
  { id: 'CBU-2026-04814', family: 'Kim, J.', facility: 'Los Angeles', status: 'in_storage', collected: '2026-07-07', storage: 'CA-A2-R06-C09', testStatus: 'complete', volume: '161 mL', cellCount: '9.7×10⁸' },
  { id: 'CBU-2026-04813', family: 'Brown, D.', facility: 'Chicago Hub', status: 'testing', collected: '2026-07-06', storage: '—', testStatus: 'pending_flow', volume: '145 mL', cellCount: '—' },
  { id: 'CBU-2026-04812', family: 'Davis, E.', facility: 'Atlanta Branch', status: 'in_storage', collected: '2026-07-05', storage: 'GA-A1-R03-C05', testStatus: 'complete', volume: '137 mL', cellCount: '8.1×10⁸' },
  { id: 'CBU-2026-04811', family: 'Wilson, F.', facility: 'New York Center', status: 'released', collected: '2026-07-04', storage: 'DISPATCHED', testStatus: 'complete', volume: '153 mL', cellCount: '9.0×10⁸' },
  { id: 'CBU-2026-04810', family: 'Anderson, P.', facility: 'Houston Main', status: 'in_storage', collected: '2026-07-03', storage: 'TX-A3-R11-C04', testStatus: 'complete', volume: '126 mL', cellCount: '7.3×10⁸' },
]

const filters: FilterDef[] = [
  { key: 'status', label: 'Status', type: 'select', placeholder: 'All Statuses', options: [
    { value: 'in_storage', label: 'In Storage' },
    { value: 'processing', label: 'Processing' },
    { value: 'testing', label: 'Testing' },
    { value: 'released', label: 'Released' },
    { value: 'quarantine', label: 'Quarantine' },
  ]},
  { key: 'facility', label: 'Facility', type: 'select', placeholder: 'All Facilities', options: [
    { value: 'Houston Main', label: 'Houston Main' },
    { value: 'Los Angeles', label: 'Los Angeles' },
    { value: 'Chicago Hub', label: 'Chicago Hub' },
    { value: 'Atlanta Branch', label: 'Atlanta Branch' },
    { value: 'New York Center', label: 'New York Center' },
  ]},
  { key: 'test', label: 'Test Status', type: 'select', placeholder: 'All Tests', options: [
    { value: 'complete', label: 'Complete' },
    { value: 'pending_hla', label: 'Pending HLA' },
    { value: 'pending_flow', label: 'Pending Flow Cytometry' },
    { value: 'failed_micro', label: 'Failed Micro' },
    { value: 'not_started', label: 'Not Started' },
  ]},
  { key: 'search', label: 'Search', type: 'search', placeholder: 'Search CBU ID or family…' },
]

export default function CbuTrackingPage() {
  const [filterValues, setFilterValues] = useState<Record<string, string>>({})
  const [page, setPage] = useState(1)
  const pageSize = 10

  const data = useCbsyncPage('cbu-units')
  const liveRecords = data.records as unknown as CbuRecord[]
  const records = liveRecords.length ? liveRecords : CBU_RECORDS
  const lifecycle = resolveChart(data.charts.CBU_LIFECYCLE, CBU_LIFECYCLE)
  const statusDist = resolveChart(data.charts.STATUS_DIST, STATUS_DIST)
  const intakeTrend = (data.charts.INTAKE_TREND as Array<Record<string, unknown>> | undefined)?.length
    ? (data.charts.INTAKE_TREND as Array<Record<string, unknown>>)
    : INTAKE_TREND

  const filteredData = useMemo(() => {
    return records.filter((row) => {
      if (filterValues.status && row.status !== filterValues.status) return false
      if (filterValues.facility && row.facility !== filterValues.facility) return false
      if (filterValues.test && row.testStatus !== filterValues.test) return false
      if (filterValues.search) {
        const q = filterValues.search.toLowerCase()
        if (!row.id.toLowerCase().includes(q) && !row.family.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [filterValues, records])

  return (
    <div className="flex flex-1 flex-col gap-5 overflow-auto p-5">
      <PageHeader
        title="CBU Tracking"
        description="Trace each cord blood unit from collection accession through receiving, processing, test-report review, cryostorage, and clinical release."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={data.refresh}><RefreshCw className="size-3.5" /></Button>
            <Button variant="outline" size="sm"><Download className="size-3.5 mr-1.5" /> Export</Button>
          </>
        }
      />

      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        <span className="size-1.5 rounded-full bg-emerald-500" /> CBU identity and custody
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Units in journey" value="7,813" trend="up" trendPercent={4.2} icon={<span className="text-xs">🧬</span>} spark={[320,335,328,342,358,361,375,382,390,398]} color={SEMANTIC_COLORS.primary} />
        <KpiCard label="Awaiting test reports" value="876" trend="up" trendPercent={2.1} icon={<span className="text-xs">🔬</span>} spark={[72,78,85,81,88,92,87,85,90,88]} color={SEMANTIC_COLORS.warning} />
        <KpiCard label="Custody exceptions" value="143" trend="down" trendPercent={-8.3} icon={<span className="text-xs">⚠️</span>} spark={[28,25,30,22,19,24,18,16,15,14]} color={SEMANTIC_COLORS.danger} />
        <KpiCard label="Released this month" value="684" trend="up" trendPercent={11.5} icon={<span className="text-xs">✅</span>} spark={[42,48,55,52,60,58,65,62,68,64]} color={SEMANTIC_COLORS.success} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="card-premium flex flex-col p-3">
          <h3 className="text-[13px] font-semibold text-foreground">CBU Lifecycle Flow</h3>
          <p className="mt-px text-[11px] text-muted-foreground">Volume at each custody stage</p>
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={lifecycle} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
                <XAxis dataKey="stage" tick={axisTick} tickLine={false} axisLine={false} />
                <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {lifecycle.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card-premium flex flex-col p-3">
          <h3 className="text-[13px] font-semibold text-foreground">Status Distribution</h3>
          <p className="mt-px text-[11px] text-muted-foreground">Current CBU inventory by status</p>
          <div className="mt-3 h-64 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusDist} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" paddingAngle={2}>
                  {statusDist.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={chartTooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" iconSize={8} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="card-premium flex flex-col p-3">
        <h3 className="text-[13px] font-semibold text-foreground">Weekly Intake Trend</h3>
        <p className="mt-px text-[11px] text-muted-foreground">Collected vs processed vs released per week</p>
        <div className="mt-3 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={intakeTrend} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
              <XAxis dataKey="week" tick={axisTick} tickLine={false} axisLine={false} />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={chartTooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" iconSize={8} />
              <Line type="monotone" dataKey="collected" stroke={SEMANTIC_COLORS.primary} strokeWidth={2.5} dot={false} name="Collected" />
              <Line type="monotone" dataKey="processed" stroke={SEMANTIC_COLORS.info} strokeWidth={2} dot={false} name="Processed" />
              <Line type="monotone" dataKey="released" stroke={SEMANTIC_COLORS.success} strokeWidth={2} dot={false} name="Released" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">CBU Registry</h3>
        <FilterBar filters={filters} values={filterValues} onChange={(k, v) => { setFilterValues((prev) => ({ ...prev, [k]: v })); setPage(1) }} onReset={() => { setFilterValues({}); setPage(1) }} />
        <div className="overflow-x-auto rounded border border-border">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">CBU ID</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Family</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Facility</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Collected</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Storage</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Test</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Volume</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Cell Count</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.slice((page - 1) * pageSize, page * pageSize).map((row, i) => (
                <tr key={row.id} className={`border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors ${i % 2 === 1 ? 'bg-muted/10' : ''}`}>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-foreground">{row.id}</td>
                  <td className="px-3 py-2.5 text-foreground">{row.family}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{row.facility}</td>
                  <td className="px-3 py-2.5"><StatusBadge status={row.status} size="sm" /></td>
                  <td className="px-3 py-2.5 text-muted-foreground">{row.collected}</td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground">{row.storage}</td>
                  <td className="px-3 py-2.5"><StatusBadge status={row.testStatus} size="sm" /></td>
                  <td className="px-3 py-2.5 text-muted-foreground">{row.volume}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{row.cellCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{filteredData.length} records</span>
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
