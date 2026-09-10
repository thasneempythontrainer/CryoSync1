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

interface TxnRecord {
  id: string
  family: string
  plan: string
  amount: string
  method: string
  status: string
  date: string
  milestone: string
}

const REVENUE_TREND = [
  { month: 'Sep', revenue: 284000, target: 270000 },
  { month: 'Oct', revenue: 312000, target: 280000 },
  { month: 'Nov', revenue: 298000, target: 290000 },
  { month: 'Dec', revenue: 341000, target: 300000 },
  { month: 'Jan', revenue: 325000, target: 310000 },
  { month: 'Feb', revenue: 356000, target: 320000 },
  { month: 'Mar', revenue: 378000, target: 330000 },
  { month: 'Apr', revenue: 342000, target: 340000 },
  { month: 'May', revenue: 389000, target: 350000 },
  { month: 'Jun', revenue: 412000, target: 360000 },
  { month: 'Jul', revenue: 395000, target: 370000 },
  { month: 'Aug', revenue: 218000, target: 380000 },
]

const PLAN_DISTRIBUTION = [
  { name: 'Premium Plus', value: 486, color: SEMANTIC_COLORS.primary },
  { name: 'Premium', value: 1284, color: SEMANTIC_COLORS.info },
  { name: 'Standard', value: 1892, color: SEMANTIC_COLORS.neutral },
  { name: 'Basic', value: 674, color: SEMANTIC_COLORS.warning },
]

const PAYMENT_METHODS = [
  { method: 'Credit Card', count: 2841 },
  { method: 'Bank Transfer', count: 1124 },
  { method: 'Insurance', count: 689 },
  { method: 'Installment', count: 432 },
  { method: 'Manual', count: 156 },
]

const TRANSACTIONS: TxnRecord[] = [
  { id: 'TXN-88421', family: 'Martinez, R.', plan: 'Premium Plus', amount: '$4,850.00', method: 'Credit Card', status: 'completed', date: '2026-08-19', milestone: 'Storage Year 2' },
  { id: 'TXN-88420', family: 'Chen, L.', plan: 'Standard', amount: '$2,200.00', method: 'Bank Transfer', status: 'completed', date: '2026-08-19', milestone: 'Processing' },
  { id: 'TXN-88419', family: 'Johnson, A.', plan: 'Premium', amount: '$3,600.00', method: 'Credit Card', status: 'pending', date: '2026-08-18', milestone: 'Collection' },
  { id: 'TXN-88418', family: 'Nguyen, T.', plan: 'Standard', amount: '$2,200.00', method: 'Installment', status: 'completed', date: '2026-08-18', milestone: 'Collection' },
  { id: 'TXN-88417', family: 'Williams, K.', plan: 'Premium', amount: '$3,600.00', method: 'Insurance', status: 'processing', date: '2026-08-17', milestone: 'Release' },
  { id: 'TXN-88416', family: 'Patel, S.', plan: 'Premium Plus', amount: '$4,850.00', method: 'Credit Card', status: 'completed', date: '2026-08-17', milestone: 'Storage Year 3' },
  { id: 'TXN-88415', family: 'Garcia, M.', plan: 'Basic', amount: '$1,400.00', method: 'Bank Transfer', status: 'on_hold', date: '2026-08-16', milestone: 'Collection' },
  { id: 'TXN-88414', family: 'Kim, J.', plan: 'Standard', amount: '$2,200.00', method: 'Credit Card', status: 'completed', date: '2026-08-16', milestone: 'Processing' },
  { id: 'TXN-88413', family: 'Brown, D.', plan: 'Premium', amount: '$3,600.00', method: 'Credit Card', status: 'failed', date: '2026-08-15', milestone: 'Collection' },
  { id: 'TXN-88412', family: 'Davis, E.', plan: 'Standard', amount: '$2,200.00', method: 'Manual', status: 'completed', date: '2026-08-15', milestone: 'Processing' },
  { id: 'TXN-88411', family: 'Wilson, F.', plan: 'Premium', amount: '$3,600.00', method: 'Insurance', status: 'refunded', date: '2026-08-14', milestone: 'Collection' },
  { id: 'TXN-88410', family: 'Anderson, P.', plan: 'Premium Plus', amount: '$4,850.00', method: 'Bank Transfer', status: 'completed', date: '2026-08-14', milestone: 'Storage Year 1' },
]

const filters: FilterDef[] = [
  { key: 'status', label: 'Status', type: 'select', placeholder: 'All Statuses', options: [
    { value: 'completed', label: 'Completed' },
    { value: 'pending', label: 'Pending' },
    { value: 'processing', label: 'Processing' },
    { value: 'on_hold', label: 'On Hold' },
    { value: 'failed', label: 'Failed' },
    { value: 'refunded', label: 'Refunded' },
  ]},
  { key: 'method', label: 'Method', type: 'select', placeholder: 'All Methods', options: [
    { value: 'Credit Card', label: 'Credit Card' },
    { value: 'Bank Transfer', label: 'Bank Transfer' },
    { value: 'Insurance', label: 'Insurance' },
    { value: 'Installment', label: 'Installment' },
    { value: 'Manual', label: 'Manual' },
  ]},
  { key: 'search', label: 'Search', type: 'search', placeholder: 'Search transaction or family…' },
]

export default function PaymentsPage() {
  const [filterValues, setFilterValues] = useState<Record<string, string>>({})
  const [page, setPage] = useState(1)
  const pageSize = 10

  const data = useCbsyncPage('payments')
  const liveRecords = data.records as unknown as TxnRecord[]
  const records = liveRecords.length ? liveRecords : TRANSACTIONS
  const revenueTrend = (data.charts.REVENUE_TREND as Array<Record<string, unknown>> | undefined)?.length
    ? (data.charts.REVENUE_TREND as Array<Record<string, unknown>>)
    : REVENUE_TREND
  const planDistribution = resolveChart(data.charts.PLAN_DISTRIBUTION, PLAN_DISTRIBUTION)
  const paymentMethods = (data.charts.PAYMENT_METHODS as Array<Record<string, unknown>> | undefined)?.length
    ? (data.charts.PAYMENT_METHODS as Array<Record<string, unknown>>)
    : PAYMENT_METHODS

  const filteredData = useMemo(() => {
    return records.filter((row) => {
      if (filterValues.status && row.status !== filterValues.status) return false
      if (filterValues.method && row.method !== filterValues.method) return false
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
        title="Plans & Payment Lifecycle"
        description="Follow the commercial events that enable collection, processing, storage, and release without mixing them into custody records."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={data.refresh}><RefreshCw className="size-3.5" /></Button>
            <Button variant="outline" size="sm"><Download className="size-3.5 mr-1.5" /> Export</Button>
          </>
        }
      />

      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        <span className="size-1.5 rounded-full bg-amber-500" /> Commercial operations
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Active plans" value="4,336" trend="up" trendPercent={2.4} icon={<span className="text-xs">💳</span>} spark={[380,388,395,398,405,412,418,424,428,434]} color={SEMANTIC_COLORS.primary} />
        <KpiCard label="Collection holds" value="23" trend="down" trendPercent={-15.2} icon={<span className="text-xs">⏸️</span>} spark={[38,35,32,30,28,26,25,24,23,23]} color={SEMANTIC_COLORS.danger} />
        <KpiCard label="Renewals due" value="186" trend="up" trendPercent={8.7} icon={<span className="text-xs">🔄</span>} spark={[142,148,152,158,162,168,172,178,182,186]} color={SEMANTIC_COLORS.warning} />
        <KpiCard label="Revenue MTD" value="$218K" trend="down" trendPercent={-44.8} icon={<span className="text-xs">💰</span>} spark={[32,35,34,38,36,41,42,39,40,22]} color={SEMANTIC_COLORS.success} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <div className="card-premium flex flex-col p-3">
          <h3 className="text-[13px] font-semibold text-foreground">Revenue Trend</h3>
          <p className="mt-px text-[11px] text-muted-foreground">Monthly revenue vs target</p>
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={revenueTrend} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
                <XAxis dataKey="month" tick={axisTick} tickLine={false} axisLine={false} />
                <YAxis tick={axisTick} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} />
                <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => `$${(Number(v) / 1000).toFixed(0)}K`} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" iconSize={8} />
                <Line type="monotone" dataKey="revenue" stroke={SEMANTIC_COLORS.success} strokeWidth={2.5} dot={false} name="Revenue" />
                <Line type="monotone" dataKey="target" stroke={SEMANTIC_COLORS.neutral} strokeWidth={2} dot={false} strokeDasharray="5 5" name="Target" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card-premium flex flex-col p-3">
          <h3 className="text-[13px] font-semibold text-foreground">Plan Distribution</h3>
          <p className="mt-px text-[11px] text-muted-foreground">Active plans by tier</p>
          <div className="mt-3 h-64 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={planDistribution} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" paddingAngle={2}>
                  {planDistribution.map((entry, i) => (
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
        <h3 className="text-[13px] font-semibold text-foreground">Payment Methods</h3>
        <p className="mt-px text-[11px] text-muted-foreground">Transaction volume by payment method</p>
        <div className="mt-3 h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={paymentMethods} layout="vertical" margin={{ top: 8, right: 32, bottom: 8, left: 16 }}>
              <XAxis type="number" tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="method" tick={axisTick} tickLine={false} axisLine={false} width={100} />
              <Tooltip contentStyle={chartTooltipStyle} />
              <Bar dataKey="count" fill={SEMANTIC_COLORS.primary} radius={[0, 6, 6, 0]} barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Recent Transactions</h3>
        <FilterBar filters={filters} values={filterValues} onChange={(k, v) => { setFilterValues((prev) => ({ ...prev, [k]: v })); setPage(1) }} onReset={() => { setFilterValues({}); setPage(1) }} />
        <div className="overflow-x-auto rounded border border-border">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">TXN ID</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Family</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Plan</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Amount</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Method</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Date</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Milestone</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.slice((page - 1) * pageSize, page * pageSize).map((row, i) => (
                <tr key={row.id} className={`border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors ${i % 2 === 1 ? 'bg-muted/10' : ''}`}>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-foreground">{row.id}</td>
                  <td className="px-3 py-2.5 text-foreground font-medium">{row.family}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{row.plan}</td>
                  <td className="px-3 py-2.5 font-mono text-foreground font-medium">{row.amount}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{row.method}</td>
                  <td className="px-3 py-2.5"><StatusBadge status={row.status} size="sm" /></td>
                  <td className="px-3 py-2.5 text-muted-foreground">{row.date}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{row.milestone}</td>
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
