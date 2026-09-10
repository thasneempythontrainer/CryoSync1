import { useState, useMemo } from 'react'
import { PageHeader } from '@/components/common/PageHeader'
import { KpiCard } from '@/components/common/KpiCard'
import { FilterBar, type FilterDef } from '@/components/common/FilterBar'
import { StatusBadge } from '@/components/common/StatusBadge'
import { Button } from '@/components/ui/button'
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { Download, RefreshCw } from 'lucide-react'
import { chartTooltipStyle, axisTick, SEMANTIC_COLORS } from '@/components/dashboard/chart-utils'
import { useCbsyncPage, resolveChart } from '@/services/use-cbsync-page'

interface TransplantRecord {
  id: string
  patientId: string
  facility: string
  cbuId: string
  diagnosis: string
  status: string
  requestDate: string
  releaseDate: string
  matchGrade: string
  cellCount: string
  volume: string
  engraftment: string
}

const REQUEST_TREND = [
  { month: 'Sep', requests: 18, completed: 14, inTransit: 3 },
  { month: 'Oct', requests: 22, completed: 18, inTransit: 2 },
  { month: 'Nov', requests: 19, completed: 16, inTransit: 2 },
  { month: 'Dec', requests: 15, completed: 12, inTransit: 2 },
  { month: 'Jan', requests: 24, completed: 20, inTransit: 3 },
  { month: 'Feb', requests: 26, completed: 22, inTransit: 3 },
  { month: 'Mar', requests: 28, completed: 24, inTransit: 3 },
  { month: 'Apr', requests: 21, completed: 18, inTransit: 2 },
  { month: 'May', requests: 30, completed: 26, inTransit: 3 },
  { month: 'Jun', requests: 32, completed: 28, inTransit: 3 },
  { month: 'Jul', requests: 29, completed: 25, inTransit: 3 },
  { month: 'Aug', requests: 14, completed: 10, inTransit: 3 },
]

const OUTCOME_DIST = [
  { name: 'Successful Engraftment', value: 284, color: SEMANTIC_COLORS.success },
  { name: 'Pending Follow-up', value: 42, color: SEMANTIC_COLORS.warning },
  { name: 'Partial Engraftment', value: 18, color: SEMANTIC_COLORS.info },
  { name: 'Did Not Engraft', value: 8, color: SEMANTIC_COLORS.danger },
]

const MATCH_STATS = [
  { criterion: 'HLA 6/6 Match', count: 142 },
  { criterion: 'HLA 5/6 Match', count: 98 },
  { criterion: 'HLA 4/6 Match', count: 56 },
  { criterion: 'UCB Volume ≥120mL', count: 186 },
  { criterion: 'Cell Count ≥8×10⁸', count: 124 },
  { criterion: 'Total Nucleated Cells ≥5×10⁸', count: 168 },
]

const TRANSPLANT_RECORDS: TransplantRecord[] = [
  { id: 'TRX-0284', patientId: 'PAT-14821', facility: 'MD Anderson', cbuId: 'CBU-2025-03214', diagnosis: 'AML - M2', status: 'completed', requestDate: '2026-07-15', releaseDate: '2026-07-28', matchGrade: '6/6 HLA', cellCount: '9.2×10⁸', volume: '156 mL', engraftment: 'Day +18' },
  { id: 'TRX-0283', patientId: 'PAT-14819', facility: 'Memorial Sloan Kettering', cbuId: 'CBU-2025-03198', diagnosis: 'Thalassemia Major', status: 'in_transit', requestDate: '2026-08-02', releaseDate: '2026-08-18', matchGrade: '5/6 HLA', cellCount: '7.8×10⁸', volume: '139 mL', engraftment: '—' },
  { id: 'TRX-0282', patientId: 'PAT-14816', facility: 'Children\'s National', cbuId: 'CBU-2025-03187', diagnosis: 'Sickle Cell Disease', status: 'qa_review', requestDate: '2026-08-10', releaseDate: '—', matchGrade: '6/6 HLA', cellCount: '8.9×10⁸', volume: '148 mL', engraftment: '—' },
  { id: 'TRX-0281', patientId: 'PAT-14812', facility: 'City of Hope', cbuId: 'CBU-2025-03174', diagnosis: 'AML - M5', status: 'completed', requestDate: '2026-06-28', releaseDate: '2026-07-10', matchGrade: '4/6 HLA', cellCount: '7.1×10⁸', volume: '128 mL', engraftment: 'Day +22' },
  { id: 'TRX-0280', patientId: 'PAT-14808', facility: 'Fred Hutchinson', cbuId: 'CBU-2025-03162', diagnosis: 'Diamond-Blackfan Anemia', status: 'completed', requestDate: '2026-06-15', releaseDate: '2026-06-28', matchGrade: '5/6 HLA', cellCount: '8.4×10⁸', volume: '142 mL', engraftment: 'Day +16' },
  { id: 'TRX-0279', patientId: 'PAT-14804', facility: 'Duke University', cbuId: 'CBU-2025-03151', diagnosis: 'AML - M3', status: 'pending', requestDate: '2026-08-14', releaseDate: '—', matchGrade: '6/6 HLA', cellCount: '9.7×10⁸', volume: '161 mL', engraftment: '—' },
  { id: 'TRX-0278', patientId: 'PAT-14801', facility: 'Johns Hopkins', cbuId: 'CBU-2025-03138', diagnosis: 'Kostmann Syndrome', status: 'completed', requestDate: '2026-05-20', releaseDate: '2026-06-02', matchGrade: '5/6 HLA', cellCount: '8.1×10⁸', volume: '137 mL', engraftment: 'Day +19' },
  { id: 'TRX-0277', patientId: 'PAT-14798', facility: 'Cincinnati Children\'s', cbuId: 'CBU-2025-03126', diagnosis: 'Neuroblastoma', status: 'cancelled', requestDate: '2026-05-08', releaseDate: '—', matchGrade: '4/6 HLA', cellCount: '5.2×10⁸', volume: '112 mL', engraftment: '—' },
  { id: 'TRX-0276', patientId: 'PAT-14795', facility: 'MD Anderson', cbuId: 'CBU-2025-03114', diagnosis: 'AML - M4', status: 'completed', requestDate: '2026-04-22', releaseDate: '2026-05-05', matchGrade: '6/6 HLA', cellCount: '9.0×10⁸', volume: '153 mL', engraftment: 'Day +15' },
  { id: 'TRX-0275', patientId: 'PAT-14791', facility: 'Stanford Medical', cbuId: 'CBU-2025-03102', diagnosis: 'Aplastic Anemia', status: 'completed', requestDate: '2026-04-10', releaseDate: '2026-04-24', matchGrade: '5/6 HLA', cellCount: '7.3×10⁸', volume: '126 mL', engraftment: 'Day +21' },
]

const filters: FilterDef[] = [
  { key: 'status', label: 'Status', type: 'select', placeholder: 'All Statuses', options: [
    { value: 'completed', label: 'Completed' },
    { value: 'in_transit', label: 'In Transit' },
    { value: 'qa_review', label: 'QA Review' },
    { value: 'pending', label: 'Pending' },
    { value: 'cancelled', label: 'Cancelled' },
  ]},
  { key: 'facility', label: 'Facility', type: 'select', placeholder: 'All Facilities', options: [
    { value: 'MD Anderson', label: 'MD Anderson' },
    { value: 'Memorial Sloan Kettering', label: 'Memorial Sloan Kettering' },
    { value: 'Children\'s National', label: "Children's National" },
    { value: 'City of Hope', label: 'City of Hope' },
    { value: 'Fred Hutchinson', label: 'Fred Hutchinson' },
    { value: 'Duke University', label: 'Duke University' },
    { value: 'Johns Hopkins', label: 'Johns Hopkins' },
  ]},
  { key: 'search', label: 'Search', type: 'search', placeholder: 'Search patient or CBU ID…' },
]

export default function TransplantsPage() {
  const [filterValues, setFilterValues] = useState<Record<string, string>>({})
  const [page, setPage] = useState(1)
  const pageSize = 10

  const data = useCbsyncPage('transplants')
  const liveRecords = data.records as unknown as TransplantRecord[]
  const records = liveRecords.length ? liveRecords : TRANSPLANT_RECORDS
  const requestTrend = (data.charts.REQUEST_TREND as Array<Record<string, unknown>> | undefined)?.length
    ? (data.charts.REQUEST_TREND as Array<Record<string, unknown>>)
    : REQUEST_TREND
  const outcomeDist = resolveChart(data.charts.OUTCOME_DIST, OUTCOME_DIST)
  const matchStats = (data.charts.MATCH_STATS as Array<Record<string, unknown>> | undefined)?.length
    ? (data.charts.MATCH_STATS as Array<Record<string, unknown>>)
    : MATCH_STATS

  const filteredData = useMemo(() => {
    return records.filter((row) => {
      if (filterValues.status && row.status !== filterValues.status) return false
      if (filterValues.facility && row.facility !== filterValues.facility) return false
      if (filterValues.search) {
        const q = filterValues.search.toLowerCase()
        if (!row.id.toLowerCase().includes(q) && !row.patientId.toLowerCase().includes(q) && !row.cbuId.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [filterValues, records])

  return (
    <div className="flex flex-1 flex-col gap-5 overflow-auto p-5">
      <PageHeader
        title="CBU Release & Transplant"
        description="Coordinate clinical requests, QA release, courier handoff, destination confirmation, and post-release traceability."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={data.refresh}><RefreshCw className="size-3.5" /></Button>
            <Button variant="outline" size="sm"><Download className="size-3.5 mr-1.5" /> Export</Button>
          </>
        }
      />

      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        <span className="size-1.5 rounded-full bg-rose-500" /> Clinical release
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Clinical requests" value="287" trend="up" trendPercent={7.4} icon={<span className="text-xs">🏥</span>} spark={[18,22,19,15,24,26,28,21,30,32]} color={SEMANTIC_COLORS.primary} />
        <KpiCard label="Release reviews" value="12" trend="down" trendPercent={-14.3} icon={<span className="text-xs">🔍</span>} spark={[14,12,16,11,18,15,14,12,13,12]} color={SEMANTIC_COLORS.warning} />
        <KpiCard label="In transit" value="3" trend="neutral" trendPercent={0} icon={<span className="text-xs">✈️</span>} spark={[2,3,2,2,3,3,3,2,3,3]} color={SEMANTIC_COLORS.info} />
        <KpiCard label="Success rate" value="93.8%" trend="up" trendPercent={1.2} icon={<span className="text-xs">✅</span>} spark={[91.2,91.8,92.1,92.4,92.8,93.0,93.2,93.4,93.6,93.8]} color={SEMANTIC_COLORS.success} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="card-premium flex flex-col p-3">
          <h3 className="text-[13px] font-semibold text-foreground">Request Trend</h3>
          <p className="mt-px text-[11px] text-muted-foreground">Monthly clinical requests and completions</p>
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={requestTrend} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
                <XAxis dataKey="month" tick={axisTick} tickLine={false} axisLine={false} />
                <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" iconSize={8} />
                <Bar dataKey="requests" fill={SEMANTIC_COLORS.primary} radius={[4, 4, 0, 0]} name="Requests" />
                <Bar dataKey="completed" fill={SEMANTIC_COLORS.success} radius={[4, 4, 0, 0]} name="Completed" />
                <Bar dataKey="inTransit" fill={SEMANTIC_COLORS.info} radius={[4, 4, 0, 0]} name="In Transit" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card-premium flex flex-col p-3">
          <h3 className="text-[13px] font-semibold text-foreground">Engraftment Outcomes</h3>
          <p className="mt-px text-[11px] text-muted-foreground">Post-transplant outcome distribution</p>
          <div className="mt-3 h-64 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={outcomeDist} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" paddingAngle={2}>
                  {outcomeDist.map((entry, i) => (
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
        <h3 className="text-[13px] font-semibold text-foreground">Match Criteria Distribution</h3>
        <p className="mt-px text-[11px] text-muted-foreground">Number of releases by match criterion</p>
        <div className="mt-3 h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={matchStats} layout="vertical" margin={{ top: 8, right: 32, bottom: 8, left: 16 }}>
              <XAxis type="number" tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="criterion" tick={axisTick} tickLine={false} axisLine={false} width={160} />
              <Tooltip contentStyle={chartTooltipStyle} />
              <Bar dataKey="count" fill={SEMANTIC_COLORS.primary} radius={[0, 6, 6, 0]} barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Transplant Registry</h3>
        <FilterBar filters={filters} values={filterValues} onChange={(k, v) => { setFilterValues((prev) => ({ ...prev, [k]: v })); setPage(1) }} onReset={() => { setFilterValues({}); setPage(1) }} />
        <div className="overflow-x-auto rounded border border-border">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">TRX ID</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Patient</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Facility</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Diagnosis</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Match</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Cell Count</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Release Date</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Engraftment</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.slice((page - 1) * pageSize, page * pageSize).map((row, i) => (
                <tr key={row.id} className={`border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors ${i % 2 === 1 ? 'bg-muted/10' : ''}`}>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-foreground">{row.id}</td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-foreground">{row.patientId}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{row.facility}</td>
                  <td className="px-3 py-2.5 text-foreground">{row.diagnosis}</td>
                  <td className="px-3 py-2.5"><StatusBadge status={row.status} size="sm" /></td>
                  <td className="px-3 py-2.5 text-muted-foreground">{row.matchGrade}</td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground">{row.cellCount}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{row.releaseDate}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{row.engraftment}</td>
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
