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
import { Download, RefreshCw, Mail } from 'lucide-react'
import { chartTooltipStyle, axisTick, SEMANTIC_COLORS } from '@/components/dashboard/chart-utils'
import { useCbsyncPage, resolveChart } from '@/services/use-cbsync-page'

interface FamilyRecord {
  id: string
  name: string
  email: string
  phone: string
  region: string
  status: string
  consent: string
  cbuId: string
  facility: string
  registered: string
  plan: string
  dueDate: string
}

const REGISTRATION_TREND = [
  { month: 'Sep', registrations: 124, activeFamilies: 1842 },
  { month: 'Oct', registrations: 138, activeFamilies: 1920 },
  { month: 'Nov', registrations: 115, activeFamilies: 1968 },
  { month: 'Dec', registrations: 98, activeFamilies: 1987 },
  { month: 'Jan', registrations: 142, activeFamilies: 2089 },
  { month: 'Feb', registrations: 156, activeFamilies: 2184 },
  { month: 'Mar', registrations: 168, activeFamilies: 2291 },
  { month: 'Apr', registrations: 147, activeFamilies: 2356 },
  { month: 'May', registrations: 172, activeFamilies: 2468 },
  { month: 'Jun', registrations: 189, activeFamilies: 2594 },
  { month: 'Jul', registrations: 164, activeFamilies: 2689 },
  { month: 'Aug', registrations: 82, activeFamilies: 2741 },
]

const CONSENT_STATUS = [
  { name: 'Full Consent', value: 2184, color: SEMANTIC_COLORS.success },
  { name: 'Conditional', value: 312, color: SEMANTIC_COLORS.warning },
  { name: 'Pending', value: 186, color: SEMANTIC_COLORS.info },
  { name: 'Declined', value: 59, color: SEMANTIC_COLORS.danger },
]

const REGIONAL_DIST = [
  { region: 'Texas', families: 684 },
  { region: 'California', families: 512 },
  { region: 'Illinois', families: 398 },
  { region: 'New York', families: 356 },
  { region: 'Georgia', families: 289 },
  { region: 'Florida', families: 268 },
  { region: 'Other', families: 234 },
]

const FAMILY_RECORDS: FamilyRecord[] = [
  { id: 'FAM-08921', name: 'Martinez, Roberto & Ana', email: 'r.martinez@email.com', phone: '(713) 555-0142', region: 'Texas', status: 'active', consent: 'full', cbuId: 'CBU-2026-04821', facility: 'Houston Main', registered: '2026-03-14', plan: 'Premium', dueDate: '2026-08-20' },
  { id: 'FAM-08920', name: 'Chen, Wei & Li', email: 'w.chen@email.com', phone: '(213) 555-0198', region: 'California', status: 'active', consent: 'full', cbuId: 'CBU-2026-04820', facility: 'Los Angeles', registered: '2026-03-12', plan: 'Standard', dueDate: '2026-09-05' },
  { id: 'FAM-08919', name: 'Johnson, Marcus & Sarah', email: 'm.johnson@email.com', phone: '(312) 555-0176', region: 'Illinois', status: 'active', consent: 'full', cbuId: 'CBU-2026-04819', facility: 'Chicago Hub', registered: '2026-03-10', plan: 'Premium', dueDate: '2026-08-15' },
  { id: 'FAM-08918', name: 'Nguyen, Thanh & Mai', email: 't.nguyen@email.com', phone: '(713) 555-0211', region: 'Texas', status: 'active', consent: 'conditional', cbuId: 'CBU-2026-04818', facility: 'Houston Main', registered: '2026-03-08', plan: 'Standard', dueDate: '2026-10-01' },
  { id: 'FAM-08917', name: 'Williams, Karen', email: 'k.williams@email.com', phone: '(404) 555-0133', region: 'Georgia', status: 'completed', consent: 'full', cbuId: 'CBU-2026-04817', facility: 'Atlanta Branch', registered: '2026-02-28', plan: 'Premium', dueDate: '—' },
  { id: 'FAM-08916', name: 'Patel, Sanjay & Priya', email: 's.patel@email.com', phone: '(212) 555-0187', region: 'New York', status: 'active', consent: 'full', cbuId: 'CBU-2026-04816', facility: 'New York Center', registered: '2026-02-25', plan: 'Premium Plus', dueDate: '2026-08-30' },
  { id: 'FAM-08915', name: 'Garcia, Miguel & Rosa', email: 'm.garcia@email.com', phone: '(713) 555-0199', region: 'Texas', status: 'active', consent: 'pending', cbuId: 'CBU-2026-04815', facility: 'Houston Main', registered: '2026-02-22', plan: 'Standard', dueDate: '2026-09-18' },
  { id: 'FAM-08914', name: 'Kim, Joon & Soo', email: 'j.kim@email.com', phone: '(213) 555-0165', region: 'California', status: 'active', consent: 'full', cbuId: 'CBU-2026-04814', facility: 'Los Angeles', registered: '2026-02-18', plan: 'Standard', dueDate: '2026-10-12' },
  { id: 'FAM-08913', name: 'Brown, David & Jennifer', email: 'd.brown@email.com', phone: '(312) 555-0144', region: 'Illinois', status: 'active', consent: 'full', cbuId: 'CBU-2026-04813', facility: 'Chicago Hub', registered: '2026-02-15', plan: 'Premium', dueDate: '2026-08-25' },
  { id: 'FAM-08912', name: 'Davis, Emily', email: 'e.davis@email.com', phone: '(404) 555-0178', region: 'Georgia', status: 'active', consent: 'conditional', cbuId: 'CBU-2026-04812', facility: 'Atlanta Branch', registered: '2026-02-12', plan: 'Standard', dueDate: '2026-09-22' },
  { id: 'FAM-08911', name: 'Wilson, Frank & Linda', email: 'f.wilson@email.com', phone: '(212) 555-0156', region: 'New York', status: 'completed', consent: 'full', cbuId: 'CBU-2026-04811', facility: 'New York Center', registered: '2026-02-08', plan: 'Premium', dueDate: '—' },
  { id: 'FAM-08910', name: 'Anderson, Patricia', email: 'p.anderson@email.com', phone: '(713) 555-0188', region: 'Texas', status: 'active', consent: 'full', cbuId: 'CBU-2026-04810', facility: 'Houston Main', registered: '2026-02-05', plan: 'Premium Plus', dueDate: '2026-08-18' },
]

const filters: FilterDef[] = [
  { key: 'status', label: 'Status', type: 'select', placeholder: 'All Statuses', options: [
    { value: 'active', label: 'Active' },
    { value: 'completed', label: 'Completed' },
    { value: 'inactive', label: 'Inactive' },
  ]},
  { key: 'consent', label: 'Consent', type: 'select', placeholder: 'All Consent', options: [
    { value: 'full', label: 'Full Consent' },
    { value: 'conditional', label: 'Conditional' },
    { value: 'pending', label: 'Pending' },
    { value: 'declined', label: 'Declined' },
  ]},
  { key: 'region', label: 'Region', type: 'select', placeholder: 'All Regions', options: [
    { value: 'Texas', label: 'Texas' },
    { value: 'California', label: 'California' },
    { value: 'Illinois', label: 'Illinois' },
    { value: 'New York', label: 'New York' },
    { value: 'Georgia', label: 'Georgia' },
  ]},
  { key: 'search', label: 'Search', type: 'search', placeholder: 'Search family name…' },
]

export default function CustomersPage() {
  const [filterValues, setFilterValues] = useState<Record<string, string>>({})
  const [page, setPage] = useState(1)
  const pageSize = 10

  const data = useCbsyncPage('customers')
  const liveRecords = data.records as unknown as FamilyRecord[]
  const records = liveRecords.length ? liveRecords : FAMILY_RECORDS
  const registrationTrend = (data.charts.REGISTRATION_TREND as Array<Record<string, unknown>> | undefined)?.length
    ? (data.charts.REGISTRATION_TREND as Array<Record<string, unknown>>)
    : REGISTRATION_TREND
  const consentStatus = resolveChart(data.charts.CONSENT_STATUS, CONSENT_STATUS)
  const regionalDist = (data.charts.REGIONAL_DIST as Array<Record<string, unknown>> | undefined)?.length
    ? (data.charts.REGIONAL_DIST as Array<Record<string, unknown>>)
    : REGIONAL_DIST

  const filteredData = useMemo(() => {
    return records.filter((row) => {
      if (filterValues.status && row.status !== filterValues.status) return false
      if (filterValues.consent && row.consent !== filterValues.consent) return false
      if (filterValues.region && row.region !== filterValues.region) return false
      if (filterValues.search) {
        const q = filterValues.search.toLowerCase()
        if (!row.name.toLowerCase().includes(q) && !row.id.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [filterValues, records])

  return (
    <div className="flex flex-1 flex-col gap-5 overflow-auto p-5">
      <PageHeader
        title="Families & Care Coordination"
        description="Connect parent records, consent, collection appointments, and clinical communication around each CBU."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={data.refresh}><RefreshCw className="size-3.5" /></Button>
            <Button variant="outline" size="sm"><Download className="size-3.5 mr-1.5" /> Export</Button>
          </>
        }
      />

      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        <span className="size-1.5 rounded-full bg-blue-500" /> Family and care network
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Active families" value="2,741" trend="up" trendPercent={3.8} icon={<span className="text-xs">👨‍👩‍👧</span>} spark={[218,225,232,228,240,248,256,262,268,274]} color={SEMANTIC_COLORS.primary} />
        <KpiCard label="Consent exceptions" value="245" trend="down" trendPercent={-5.2} icon={<span className="text-xs">📋</span>} spark={[32,30,28,31,29,26,25,24,24,25]} color={SEMANTIC_COLORS.warning} />
        <KpiCard label="Upcoming collections" value="86" trend="up" trendPercent={12.4} icon={<span className="text-xs">📅</span>} spark={[6,7,8,7,9,8,10,9,11,9]} color={SEMANTIC_COLORS.info} />
        <KpiCard label="Active agreements" value="2,384" trend="up" trendPercent={4.1} icon={<span className="text-xs">📄</span>} spark={[198,205,210,215,218,222,228,232,236,238]} color={SEMANTIC_COLORS.success} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="card-premium flex flex-col p-3">
          <h3 className="text-[13px] font-semibold text-foreground">Registration Trend</h3>
          <p className="mt-px text-[11px] text-muted-foreground">New family registrations and active family count</p>
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={registrationTrend} margin={{ top: 8, right: 32, bottom: 8, left: -16 }}>
                <XAxis dataKey="month" tick={axisTick} tickLine={false} axisLine={false} />
                <YAxis yAxisId="left" tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis yAxisId="right" orientation="right" tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" iconSize={8} />
                <Line yAxisId="left" type="monotone" dataKey="registrations" stroke={SEMANTIC_COLORS.primary} strokeWidth={2.5} dot={false} name="Registrations" />
                <Line yAxisId="right" type="monotone" dataKey="activeFamilies" stroke={SEMANTIC_COLORS.success} strokeWidth={2} dot={false} name="Active Families" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card-premium flex flex-col p-3">
          <h3 className="text-[13px] font-semibold text-foreground">Consent Status</h3>
          <p className="mt-px text-[11px] text-muted-foreground">Distribution of consent across all families</p>
          <div className="mt-3 h-64 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={consentStatus} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" paddingAngle={2}>
                  {consentStatus.map((entry, i) => (
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
        <h3 className="text-[13px] font-semibold text-foreground">Regional Distribution</h3>
        <p className="mt-px text-[11px] text-muted-foreground">Family count by region</p>
        <div className="mt-3 h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={regionalDist} layout="vertical" margin={{ top: 8, right: 32, bottom: 8, left: 16 }}>
              <XAxis type="number" tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="region" tick={axisTick} tickLine={false} axisLine={false} width={80} />
              <Tooltip contentStyle={chartTooltipStyle} />
              <Bar dataKey="families" fill={SEMANTIC_COLORS.primary} radius={[0, 6, 6, 0]} barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Family Registry</h3>
        <FilterBar filters={filters} values={filterValues} onChange={(k, v) => { setFilterValues((prev) => ({ ...prev, [k]: v })); setPage(1) }} onReset={() => { setFilterValues({}); setPage(1) }} />
        <div className="overflow-x-auto rounded border border-border">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Family ID</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Name</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Contact</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Region</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Consent</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">CBU</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Plan</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Due Date</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.slice((page - 1) * pageSize, page * pageSize).map((row, i) => (
                <tr key={row.id} className={`border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors ${i % 2 === 1 ? 'bg-muted/10' : ''}`}>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-foreground">{row.id}</td>
                  <td className="px-3 py-2.5 text-foreground font-medium">{row.name}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="size-3" /> <span className="truncate max-w-[140px]">{row.email}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{row.region}</td>
                  <td className="px-3 py-2.5"><StatusBadge status={row.status} size="sm" /></td>
                  <td className="px-3 py-2.5"><StatusBadge status={row.consent} size="sm" /></td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground">{row.cbuId}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{row.plan}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{row.dueDate}</td>
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
