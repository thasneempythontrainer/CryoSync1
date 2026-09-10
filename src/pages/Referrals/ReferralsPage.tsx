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

interface ReferralRecord {
  id: string
  source: string
  type: string
  region: string
  referrals: number
  conversions: number
  rate: number
  revenue: string
  status: string
  contact: string
}

const REFERRAL_FUNNEL = [
  { stage: 'Inquiries', value: 4820, fill: SEMANTIC_COLORS.primary },
  { stage: 'Consultations', value: 3140, fill: SEMANTIC_COLORS.info },
  { stage: 'Consent Signed', value: 2180, fill: SEMANTIC_COLORS.purple },
  { stage: 'Collection Scheduled', value: 1860, fill: SEMANTIC_COLORS.warning },
  { stage: 'Collection Completed', value: 1640, fill: SEMANTIC_COLORS.success },
]

const SOURCE_DISTRIBUTION = [
  { name: 'Hospital Partners', value: 1480, color: SEMANTIC_COLORS.primary },
  { name: 'Physician Network', value: 1120, color: SEMANTIC_COLORS.info },
  { name: 'Maternity Clinics', value: 890, color: SEMANTIC_COLORS.purple },
  { name: 'Digital Campaign', value: 680, color: SEMANTIC_COLORS.warning },
  { name: 'Referral Program', value: 520, color: SEMANTIC_COLORS.success },
  { name: 'Other', value: 130, color: SEMANTIC_COLORS.neutral },
]

const MONTHLY_CONVERSION = [
  { month: 'Sep', referred: 342, converted: 148, rate: 43.3 },
  { month: 'Oct', referred: 378, converted: 164, rate: 43.4 },
  { month: 'Nov', referred: 356, converted: 158, rate: 44.4 },
  { month: 'Dec', referred: 298, converted: 132, rate: 44.3 },
  { month: 'Jan', referred: 412, converted: 186, rate: 45.1 },
  { month: 'Feb', referred: 445, converted: 202, rate: 45.4 },
  { month: 'Mar', referred: 468, converted: 218, rate: 46.6 },
  { month: 'Apr', referred: 425, converted: 196, rate: 46.1 },
  { month: 'May', referred: 478, converted: 228, rate: 47.7 },
  { month: 'Jun', referred: 512, converted: 248, rate: 48.4 },
  { month: 'Jul', referred: 489, converted: 238, rate: 48.7 },
  { month: 'Aug', referred: 248, converted: 124, rate: 50.0 },
]

const REFERRAL_RECORDS: ReferralRecord[] = [
  { id: 'REF-2481', source: 'Houston Women\'s Hospital', type: 'hospital', region: 'Texas', referrals: 186, conversions: 84, rate: 45.2, revenue: '$312,400', status: 'active', contact: 'Dr. Sarah Mitchell' },
  { id: 'REF-2480', source: 'Dr. James Park, OB/GYN', type: 'physician', region: 'California', referrals: 142, conversions: 68, rate: 47.9, revenue: '$248,800', status: 'active', contact: 'Dr. James Park' },
  { id: 'REF-2479', source: 'Chicago Maternity Center', type: 'maternity', region: 'Illinois', referrals: 128, conversions: 58, rate: 45.3, revenue: '$196,200', status: 'active', contact: 'Lisa Thompson' },
  { id: 'REF-2478', source: 'Google Ads - Stem Cell', type: 'digital', region: 'National', referrals: 342, conversions: 148, rate: 43.3, revenue: '$524,600', status: 'active', contact: 'Marketing Team' },
  { id: 'REF-2477', source: 'Family Referral Program', type: 'referral', region: 'National', referrals: 268, conversions: 132, rate: 49.3, revenue: '$468,000', status: 'active', contact: 'Referral Desk' },
  { id: 'REF-2476', source: 'Dr. Maria Santos', type: 'physician', region: 'Texas', referrals: 96, conversions: 44, rate: 45.8, revenue: '$156,800', status: 'active', contact: 'Dr. Maria Santos' },
  { id: 'REF-2475', source: 'NYC Women\'s Health', type: 'hospital', region: 'New York', referrals: 112, conversions: 52, rate: 46.4, revenue: '$192,400', status: 'active', contact: 'Dr. Rachel Kim' },
  { id: 'REF-2474', source: 'Atlanta Birth Center', type: 'maternity', region: 'Georgia', referrals: 84, conversions: 36, rate: 42.9, revenue: '$124,800', status: 'under_review', contact: 'Patricia Evans' },
  { id: 'REF-2473', source: 'Facebook Campaign Q3', type: 'digital', region: 'National', referrals: 186, conversions: 78, rate: 41.9, revenue: '$276,400', status: 'active', contact: 'Marketing Team' },
  { id: 'REF-2472', source: 'Dr. Robert Chen', type: 'physician', region: 'California', referrals: 78, conversions: 34, rate: 43.6, revenue: '$118,200', status: 'inactive', contact: 'Dr. Robert Chen' },
]

const filters: FilterDef[] = [
  { key: 'type', label: 'Source Type', type: 'select', placeholder: 'All Types', options: [
    { value: 'hospital', label: 'Hospital Partner' },
    { value: 'physician', label: 'Physician' },
    { value: 'maternity', label: 'Maternity Clinic' },
    { value: 'digital', label: 'Digital Campaign' },
    { value: 'referral', label: 'Referral Program' },
  ]},
  { key: 'region', label: 'Region', type: 'select', placeholder: 'All Regions', options: [
    { value: 'Texas', label: 'Texas' },
    { value: 'California', label: 'California' },
    { value: 'Illinois', label: 'Illinois' },
    { value: 'New York', label: 'New York' },
    { value: 'Georgia', label: 'Georgia' },
    { value: 'National', label: 'National' },
  ]},
  { key: 'search', label: 'Search', type: 'search', placeholder: 'Search source or contact…' },
]

export default function ReferralsPage() {
  const [filterValues, setFilterValues] = useState<Record<string, string>>({})
  const [page, setPage] = useState(1)
  const pageSize = 10

  const data = useCbsyncPage('referrals')
  const liveRecords = data.records as unknown as ReferralRecord[]
  const records = liveRecords.length ? liveRecords : REFERRAL_RECORDS
  const referralFunnel = resolveChart(data.charts.REFERRAL_FUNNEL, REFERRAL_FUNNEL)
  const sourceDistribution = resolveChart(data.charts.SOURCE_DISTRIBUTION, SOURCE_DISTRIBUTION)
  const monthlyConversion = (data.charts.MONTHLY_CONVERSION as Array<Record<string, unknown>> | undefined)?.length
    ? (data.charts.MONTHLY_CONVERSION as Array<Record<string, unknown>>)
    : MONTHLY_CONVERSION

  const filteredData = useMemo(() => {
    return records.filter((row) => {
      if (filterValues.type && row.type !== filterValues.type) return false
      if (filterValues.region && row.region !== filterValues.region) return false
      if (filterValues.search) {
        const q = filterValues.search.toLowerCase()
        if (!row.source.toLowerCase().includes(q) && !row.contact.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [filterValues, records])

  return (
    <div className="flex flex-1 flex-col gap-5 overflow-auto p-5">
      <PageHeader
        title="Referral & Partner Network"
        description="Track hospital, physician, maternity, and branch referral flows into a verified collection pathway."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={data.refresh}><RefreshCw className="size-3.5" /></Button>
            <Button variant="outline" size="sm"><Download className="size-3.5 mr-1.5" /> Export</Button>
          </>
        }
      />

      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        <span className="size-1.5 rounded-full bg-violet-500" /> Growth and branch network
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Partner sources" value="4,820" trend="up" trendPercent={6.2} icon={<span className="text-xs">🏥</span>} spark={[342,378,356,298,412,445,468,425,478,482]} color={SEMANTIC_COLORS.primary} />
        <KpiCard label="Conversion rate" value="34.0%" trend="up" trendPercent={1.8} icon={<span className="text-xs">📈</span>} spark={[30.2,30.8,31.2,31.8,32.1,32.5,33.0,33.2,33.6,34.0]} color={SEMANTIC_COLORS.success} />
        <KpiCard label="Active referrals" value="1,864" trend="up" trendPercent={3.4} icon={<span className="text-xs">🤝</span>} spark={[152,158,162,155,168,172,178,175,182,186]} color={SEMANTIC_COLORS.info} />
        <KpiCard label="Revenue attributed" value="$2.62M" trend="up" trendPercent={8.1} icon={<span className="text-xs">💵</span>} spark={[1.8,1.9,2.0,2.1,2.2,2.3,2.35,2.42,2.52,2.62]} color={SEMANTIC_COLORS.warning} />
      </div>

      <div className="card-premium flex flex-col p-3">
        <h3 className="text-[13px] font-semibold text-foreground">Referral Funnel</h3>
        <p className="mt-px text-[11px] text-muted-foreground">Pipeline from initial inquiry to completed collection</p>
        <div className="mt-3 h-64 flex items-center justify-center">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={referralFunnel} layout="vertical" margin={{ top: 8, right: 32, bottom: 8, left: 16 }}>
              <XAxis type="number" tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="stage" tick={axisTick} tickLine={false} axisLine={false} width={120} />
              <Tooltip contentStyle={chartTooltipStyle} />
              <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={24}>
                {referralFunnel.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="card-premium flex flex-col p-3">
          <h3 className="text-[13px] font-semibold text-foreground">Monthly Conversion Trend</h3>
          <p className="mt-px text-[11px] text-muted-foreground">Referrals vs conversions over time</p>
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyConversion} margin={{ top: 8, right: 32, bottom: 8, left: -16 }}>
                <XAxis dataKey="month" tick={axisTick} tickLine={false} axisLine={false} />
                <YAxis yAxisId="left" tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis yAxisId="right" orientation="right" tick={axisTick} tickLine={false} axisLine={false} tickFormatter={(v: string | number | (string | number)[]) => `${v}%`} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" iconSize={8} />
                <Line yAxisId="left" type="monotone" dataKey="referred" stroke={SEMANTIC_COLORS.primary} strokeWidth={2} dot={false} name="Referred" />
                <Line yAxisId="left" type="monotone" dataKey="converted" stroke={SEMANTIC_COLORS.success} strokeWidth={2} dot={false} name="Converted" />
                <Line yAxisId="right" type="monotone" dataKey="rate" stroke={SEMANTIC_COLORS.warning} strokeWidth={2} dot={false} strokeDasharray="5 5" name="Rate %" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card-premium flex flex-col p-3">
          <h3 className="text-[13px] font-semibold text-foreground">Source Distribution</h3>
          <p className="mt-px text-[11px] text-muted-foreground">Referral volume by source type</p>
          <div className="mt-3 h-64 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={sourceDistribution} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" paddingAngle={2}>
                  {sourceDistribution.map((entry, i) => (
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

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Partner Registry</h3>
        <FilterBar filters={filters} values={filterValues} onChange={(k, v) => { setFilterValues((prev) => ({ ...prev, [k]: v })); setPage(1) }} onReset={() => { setFilterValues({}); setPage(1) }} />
        <div className="overflow-x-auto rounded border border-border">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">ID</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Source</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Type</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Region</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Referrals</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Conversions</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Rate</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Revenue</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.slice((page - 1) * pageSize, page * pageSize).map((row, i) => (
                <tr key={row.id} className={`border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors ${i % 2 === 1 ? 'bg-muted/10' : ''}`}>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-foreground">{row.id}</td>
                  <td className="px-3 py-2.5">
                    <div>
                      <span className="text-foreground font-medium">{row.source}</span>
                      <span className="block text-[11px] text-muted-foreground">{row.contact}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5"><StatusBadge status={row.type} size="sm" /></td>
                  <td className="px-3 py-2.5 text-muted-foreground">{row.region}</td>
                  <td className="px-3 py-2.5 text-foreground font-medium">{row.referrals.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-foreground">{row.conversions}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{row.rate}%</td>
                  <td className="px-3 py-2.5 font-mono text-foreground">{row.revenue}</td>
                  <td className="px-3 py-2.5"><StatusBadge status={row.status} size="sm" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{filteredData.length} sources</span>
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
