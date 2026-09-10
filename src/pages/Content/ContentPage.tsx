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
import { Download, RefreshCw, FileText, Eye, Clock } from 'lucide-react'
import { chartTooltipStyle, axisTick, SEMANTIC_COLORS } from '@/components/dashboard/chart-utils'
import { useCbsyncPage, resolveChart } from '@/services/use-cbsync-page'

interface ContentRecord {
  id: string
  title: string
  type: string
  status: string
  author: string
  version: string
  updated: string
  views: number
  downloads: number
  shares: number
  language: string
}

const CONTENT_TYPES = [
  { type: 'Family Guides', count: 48, color: SEMANTIC_COLORS.primary },
  { type: 'SOP Documents', count: 32, color: SEMANTIC_COLORS.info },
  { type: 'Training Materials', count: 24, color: SEMANTIC_COLORS.purple },
  { type: 'Consent Forms', count: 16, color: SEMANTIC_COLORS.warning },
  { type: 'Clinical Protocols', count: 12, color: SEMANTIC_COLORS.success },
]

const USAGE_TREND = [
  { month: 'Sep', views: 1240, downloads: 384, shares: 128 },
  { month: 'Oct', views: 1380, downloads: 420, shares: 142 },
  { month: 'Nov', views: 1290, downloads: 398, shares: 135 },
  { month: 'Dec', views: 1120, downloads: 342, shares: 112 },
  { month: 'Jan', views: 1480, downloads: 456, shares: 158 },
  { month: 'Feb', views: 1560, downloads: 478, shares: 168 },
  { month: 'Mar', views: 1640, downloads: 498, shares: 176 },
  { month: 'Apr', views: 1520, downloads: 468, shares: 162 },
  { month: 'May', views: 1720, downloads: 524, shares: 184 },
  { month: 'Jun', views: 1840, downloads: 556, shares: 196 },
  { month: 'Jul', views: 1780, downloads: 542, shares: 190 },
  { month: 'Aug', views: 920, downloads: 284, shares: 98 },
]

const REVIEW_PIPELINE = [
  { stage: 'Draft', count: 8 },
  { stage: 'In Review', count: 12 },
  { stage: 'Approved', count: 24 },
  { stage: 'Published', count: 88 },
]

const CONTENT_RECORDS: ContentRecord[] = [
  { id: 'DOC-0241', title: 'Cord Blood Collection: A Guide for Families', type: 'Family Guide', status: 'published', author: 'Dr. Angela Torres', updated: '2026-08-15', version: '3.2', views: 2840, downloads: 892, shares: 240, language: 'English' },
  { id: 'DOC-0240', title: 'Temperature Monitoring SOP v4.1', type: 'SOP', status: 'published', author: 'Quality Team', updated: '2026-08-12', version: '4.1', views: 1560, downloads: 342, shares: 96, language: 'English' },
  { id: 'DOC-0239', title: 'Consent Form - Standard Agreement', type: 'Consent Form', status: 'published', author: 'Legal Team', updated: '2026-08-10', version: '2.8', views: 3200, downloads: 1240, shares: 310, language: 'English/Spanish' },
  { id: 'DOC-0238', title: 'Branch Staff Onboarding Checklist', type: 'Training', status: 'published', author: 'HR Team', updated: '2026-08-08', version: '1.4', views: 890, downloads: 256, shares: 44, language: 'English' },
  { id: 'DOC-0237', title: 'Cryostorage Handling Procedures', type: 'SOP', status: 'in_review', author: 'Dr. Michael Park', updated: '2026-08-18', version: '5.0-draft', views: 0, downloads: 0, shares: 0, language: 'English' },
  { id: 'DOC-0236', title: 'What Happens After Collection?', type: 'Family Guide', status: 'published', author: 'Clinical Team', updated: '2026-08-05', version: '2.1', views: 1840, downloads: 568, shares: 152, language: 'English' },
  { id: 'DOC-0235', title: 'HLA Typing Explained for Parents', type: 'Family Guide', status: 'draft', author: 'Dr. Rachel Kim', updated: '2026-08-19', version: '1.0-draft', views: 0, downloads: 0, shares: 0, language: 'English' },
  { id: 'DOC-0234', title: 'Emergency Release Protocol', type: 'Clinical Protocol', status: 'published', author: 'Dr. Angela Torres', updated: '2026-07-28', version: '3.0', views: 680, downloads: 198, shares: 54, language: 'English' },
  { id: 'DOC-0233', title: 'Courier Cold-Chain Requirements', type: 'SOP', status: 'published', author: 'Logistics Team', updated: '2026-07-22', version: '2.3', views: 920, downloads: 278, shares: 61, language: 'English' },
  { id: 'DOC-0232', title: 'Understanding Your CBU Test Results', type: 'Family Guide', status: 'in_review', author: 'Lab Team', updated: '2026-08-17', version: '1.2-review', views: 0, downloads: 0, shares: 0, language: 'English' },
  { id: 'DOC-0231', title: 'Quality Inspection Training Module', type: 'Training', status: 'published', author: 'Quality Team', updated: '2026-07-15', version: '2.0', views: 1240, downloads: 412, shares: 120, language: 'English' },
  { id: 'DOC-0230', title: 'Informed Consent - Research Use', type: 'Consent Form', status: 'approved', author: 'Legal Team', updated: '2026-08-14', version: '1.5', views: 320, downloads: 88, shares: 12, language: 'English' },
]

const filters: FilterDef[] = [
  { key: 'type', label: 'Type', type: 'select', placeholder: 'All Types', options: [
    { value: 'Family Guide', label: 'Family Guide' },
    { value: 'SOP', label: 'SOP' },
    { value: 'Training', label: 'Training' },
    { value: 'Consent Form', label: 'Consent Form' },
    { value: 'Clinical Protocol', label: 'Clinical Protocol' },
  ]},
  { key: 'status', label: 'Status', type: 'select', placeholder: 'All Statuses', options: [
    { value: 'published', label: 'Published' },
    { value: 'in_review', label: 'In Review' },
    { value: 'approved', label: 'Approved' },
    { value: 'draft', label: 'Draft' },
  ]},
  { key: 'search', label: 'Search', type: 'search', placeholder: 'Search title or author…' },
]

export default function ContentPage() {
  const [filterValues, setFilterValues] = useState<Record<string, string>>({})
  const [page, setPage] = useState(1)
  const pageSize = 10

  const data = useCbsyncPage('content')
  const liveRecords = data.records as unknown as ContentRecord[]
  const records = liveRecords.length ? liveRecords : CONTENT_RECORDS
  const usageTrend = (data.charts.USAGE_TREND as Array<Record<string, unknown>> | undefined)?.length
    ? (data.charts.USAGE_TREND as Array<Record<string, unknown>>)
    : USAGE_TREND
  const contentTypes = resolveChart(data.charts.CONTENT_TYPES, CONTENT_TYPES)
  const reviewPipeline = resolveChart(data.charts.REVIEW_PIPELINE, REVIEW_PIPELINE)

  const filteredData = useMemo(() => {
    return records.filter((row) => {
      if (filterValues.type && row.type !== filterValues.type) return false
      if (filterValues.status && row.status !== filterValues.status) return false
      if (filterValues.search) {
        const q = filterValues.search.toLowerCase()
        if (!row.title.toLowerCase().includes(q) && !row.author.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [filterValues, records])

  return (
    <div className="flex flex-1 flex-col gap-5 overflow-auto p-5">
      <PageHeader
        title="StemCyte Knowledge Hub"
        description="Organize approved family education, collection guidance, laboratory explanations, and clinical release material."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={data.refresh}><RefreshCw className="size-3.5" /></Button>
            <Button variant="outline" size="sm"><Download className="size-3.5 mr-1.5" /> Export</Button>
          </>
        }
      />

      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        <span className="size-1.5 rounded-full bg-indigo-500" /> Family education and trust
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Approved guides" value="132" trend="up" trendPercent={5.6} icon={<FileText className="size-4" />} spark={[108,112,115,118,120,122,124,126,128,132]} color={SEMANTIC_COLORS.primary} />
        <KpiCard label="Branch assets" value="88" trend="up" trendPercent={3.5} icon={<span className="text-xs">📁</span>} spark={[72,74,76,78,80,82,84,85,86,88]} color={SEMANTIC_COLORS.info} />
        <KpiCard label="Review items" value="12" trend="up" trendPercent={20.0} icon={<Clock className="size-4" />} spark={[6,8,7,9,8,10,9,10,11,12]} color={SEMANTIC_COLORS.warning} />
        <KpiCard label="Monthly views" value="17.8K" trend="up" trendPercent={8.2} icon={<Eye className="size-4" />} spark={[12.4,13.8,12.9,11.2,14.8,15.6,16.4,15.2,17.2,17.8]} color={SEMANTIC_COLORS.success} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="card-premium flex flex-col p-3">
          <h3 className="text-[13px] font-semibold text-foreground">Usage Trend</h3>
          <p className="mt-px text-[11px] text-muted-foreground">Views, downloads, and shares over time</p>
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={usageTrend} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
                <XAxis dataKey="month" tick={axisTick} tickLine={false} axisLine={false} />
                <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" iconSize={8} />
                <Line type="monotone" dataKey="views" stroke={SEMANTIC_COLORS.primary} strokeWidth={2.5} dot={false} name="Views" />
                <Line type="monotone" dataKey="downloads" stroke={SEMANTIC_COLORS.info} strokeWidth={2} dot={false} name="Downloads" />
                <Line type="monotone" dataKey="shares" stroke={SEMANTIC_COLORS.success} strokeWidth={2} dot={false} name="Shares" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card-premium flex flex-col p-3">
          <h3 className="text-[13px] font-semibold text-foreground">Content by Type</h3>
          <p className="mt-px text-[11px] text-muted-foreground">Distribution of content across categories</p>
          <div className="mt-3 h-64 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={contentTypes} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="count" paddingAngle={2}>
                  {contentTypes.map((entry, i) => (
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
        <h3 className="text-[13px] font-semibold text-foreground">Review Pipeline</h3>
        <p className="mt-px text-[11px] text-muted-foreground">Documents by workflow stage</p>
        <div className="mt-3 h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={REVIEW_PIPELINE} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
              <XAxis dataKey="stage" tick={axisTick} tickLine={false} axisLine={false} />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={chartTooltipStyle} />
              <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={32}>
                {reviewPipeline.map((entry, i) => (
                  <Cell key={i} fill={[SEMANTIC_COLORS.warning, SEMANTIC_COLORS.info, SEMANTIC_COLORS.success, SEMANTIC_COLORS.primary][i]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Content Library</h3>
        <FilterBar filters={filters} values={filterValues} onChange={(k, v) => { setFilterValues((prev) => ({ ...prev, [k]: v })); setPage(1) }} onReset={() => { setFilterValues({}); setPage(1) }} />
        <div className="overflow-x-auto rounded border border-border">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">ID</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Title</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Type</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Author</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Version</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Updated</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Views</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Language</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.slice((page - 1) * pageSize, page * pageSize).map((row, i) => (
                <tr key={row.id} className={`border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors ${i % 2 === 1 ? 'bg-muted/10' : ''}`}>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-foreground">{row.id}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <FileText className="size-3.5 text-muted-foreground shrink-0" />
                      <span className="text-foreground font-medium truncate max-w-[280px]">{row.title}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5"><StatusBadge status={row.type.toLowerCase().replace(' ', '_')} size="sm" /></td>
                  <td className="px-3 py-2.5"><StatusBadge status={row.status} size="sm" /></td>
                  <td className="px-3 py-2.5 text-muted-foreground">{row.author}</td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground">{row.version}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{row.updated}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{row.views.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{row.language}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{filteredData.length} documents</span>
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
