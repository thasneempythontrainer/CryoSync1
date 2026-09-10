import { useState, useMemo } from 'react'
import { PageHeader } from '@/components/common/PageHeader'
import { KpiCard } from '@/components/common/KpiCard'
import { FilterBar, type FilterDef } from '@/components/common/FilterBar'
import { StatusBadge } from '@/components/common/StatusBadge'
import { Button } from '@/components/ui/button'
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { Download, RefreshCw, AlertTriangle } from 'lucide-react'
import { chartTooltipStyle, axisTick, SEMANTIC_COLORS } from '@/components/dashboard/chart-utils'
import { useCbsyncPage } from '@/services/use-cbsync-page'

interface TankRecord {
  name: string
  capacity: number
  used: number
  temp: string
  status: string
}

const TANK_STATUS: TankRecord[] = [
  { name: 'TX-A3', capacity: 480, used: 412, temp: '-196.2°C', status: 'nominal' },
  { name: 'TX-A2', capacity: 480, used: 398, temp: '-196.4°C', status: 'nominal' },
  { name: 'IL-B1', capacity: 360, used: 334, temp: '-196.1°C', status: 'nominal' },
  { name: 'CA-A2', capacity: 480, used: 367, temp: '-195.8°C', status: 'warning' },
  { name: 'NY-C2', capacity: 360, used: 289, temp: '-196.3°C', status: 'nominal' },
  { name: 'GA-A1', capacity: 240, used: 198, temp: '-196.0°C', status: 'nominal' },
  { name: 'TX-Q1', capacity: 120, used: 43, temp: '-196.5°C', status: 'quarantine' },
]

const CAPACITY_BY_FACILITY = [
  { facility: 'Houston', total: 1080, used: 853, available: 227 },
  { facility: 'Chicago', total: 360, used: 334, available: 26 },
  { facility: 'Los Angeles', total: 480, used: 367, available: 113 },
  { facility: 'New York', total: 360, used: 289, available: 71 },
  { facility: 'Atlanta', total: 240, used: 198, available: 42 },
]

const TEMP_TREND = [
  { time: '00:00', txA3: -196.2, ilB1: -196.1, caA2: -195.9 },
  { time: '02:00', txA3: -196.3, ilB1: -196.0, caA2: -195.8 },
  { time: '04:00', txA3: -196.1, ilB1: -196.2, caA2: -195.7 },
  { time: '06:00', txA3: -196.4, ilB1: -196.1, caA2: -195.6 },
  { time: '08:00', txA3: -196.2, ilB1: -196.3, caA2: -195.8 },
  { time: '10:00', txA3: -196.3, ilB1: -196.2, caA2: -195.9 },
  { time: '12:00', txA3: -196.1, ilB1: -196.0, caA2: -195.8 },
  { time: '14:00', txA3: -196.4, ilB1: -196.1, caA2: -195.7 },
  { time: '16:00', txA3: -196.2, ilB1: -196.2, caA2: -195.8 },
  { time: '18:00', txA3: -196.3, ilB1: -196.3, caA2: -195.9 },
  { time: '20:00', txA3: -196.1, ilB1: -196.1, caA2: -195.8 },
  { time: '22:00', txA3: -196.2, ilB1: -196.2, caA2: -195.8 },
]

const OCCUPANCY_HISTORY = [
  { week: 'W1', occupancy: 87.2 },
  { week: 'W2', occupancy: 87.8 },
  { week: 'W3', occupancy: 88.1 },
  { week: 'W4', occupancy: 88.5 },
  { week: 'W5', occupancy: 89.0 },
  { week: 'W6', occupancy: 89.4 },
  { week: 'W7', occupancy: 89.8 },
  { week: 'W8', occupancy: 90.1 },
  { week: 'W9', occupancy: 90.5 },
  { week: 'W10', occupancy: 90.8 },
  { week: 'W11', occupancy: 91.2 },
  { week: 'W12', occupancy: 91.5 },
]

const filters: FilterDef[] = [
  { key: 'facility', label: 'Facility', type: 'select', placeholder: 'All Facilities', options: [
    { value: 'Houston', label: 'Houston' },
    { value: 'Chicago', label: 'Chicago' },
    { value: 'Los Angeles', label: 'Los Angeles' },
    { value: 'New York', label: 'New York' },
    { value: 'Atlanta', label: 'Atlanta' },
  ]},
  { key: 'status', label: 'Status', type: 'select', placeholder: 'All Statuses', options: [
    { value: 'nominal', label: 'Nominal' },
    { value: 'warning', label: 'Warning' },
    { value: 'alarm', label: 'Alarm' },
    { value: 'quarantine', label: 'Quarantine' },
  ]},
  { key: 'search', label: 'Search', type: 'search', placeholder: 'Search tank ID…' },
]

export default function StoragePage() {
  const [filterValues, setFilterValues] = useState<Record<string, string>>({})

  const data = useCbsyncPage('storage')
  const liveRecords = data.records as unknown as TankRecord[]
  const tankStatus = liveRecords.length ? liveRecords : TANK_STATUS
  const capacityByFacility = (data.charts.CAPACITY_BY_FACILITY as Array<Record<string, unknown>> | undefined)?.length
    ? (data.charts.CAPACITY_BY_FACILITY as Array<Record<string, unknown>>)
    : CAPACITY_BY_FACILITY
  const tempTrend = (data.charts.TEMP_TREND as Array<Record<string, unknown>> | undefined)?.length
    ? (data.charts.TEMP_TREND as Array<Record<string, unknown>>)
    : TEMP_TREND
  const occupancyHistory = (data.charts.OCCUPANCY_HISTORY as Array<Record<string, unknown>> | undefined)?.length
    ? (data.charts.OCCUPANCY_HISTORY as Array<Record<string, unknown>>)
    : OCCUPANCY_HISTORY

  const filteredData = useMemo(() => {
    return tankStatus.filter((row) => {
      if (filterValues.status && row.status !== filterValues.status) return false
      if (filterValues.facility && !row.name.toLowerCase().includes(filterValues.facility.toLowerCase())) return false
      if (filterValues.search) {
        if (!row.name.toLowerCase().includes(filterValues.search.toLowerCase())) return false
      }
      return true
    })
  }, [filterValues, tankStatus])

  return (
    <div className="flex flex-1 flex-col gap-5 overflow-auto p-5">
      <PageHeader
        title="Cryostorage Command"
        description="Manage tank, rack, canister, and position-level custody for every preserved cord blood unit."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={data.refresh}><RefreshCw className="size-3.5" /></Button>
            <Button variant="outline" size="sm"><Download className="size-3.5 mr-1.5" /> Export</Button>
          </>
        }
      />

      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        <span className="size-1.5 rounded-full bg-cyan-500" /> Cryogenic custody
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="CBUs in cryostorage" value="2,041" trend="up" trendPercent={1.8} icon={<SnowflakeIcon />} spark={[180,185,188,192,195,198,200,202,203,204]} color={SEMANTIC_COLORS.primary} />
        <KpiCard label="Tank alarms" value="1" trend="down" trendPercent={-66.7} icon={<AlertTriangle className="size-4" />} spark={[4,3,5,3,2,3,1,2,1,1]} color={SEMANTIC_COLORS.danger} />
        <KpiCard label="Positions available" value="479" trend="down" trendPercent={-2.1} icon={<span className="text-xs">📐</span>} spark={[520,515,510,508,505,502,498,495,492,479]} color={SEMANTIC_COLORS.warning} />
        <KpiCard label="Capacity utilization" value="81.0%" trend="up" trendPercent={0.4} icon={<span className="text-xs">📊</span>} spark={[78.2,78.8,79.1,79.5,80.0,80.4,80.8,81.0,81.2,81.0]} color={SEMANTIC_COLORS.success} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="card-premium flex flex-col p-3">
          <h3 className="text-[13px] font-semibold text-foreground">Tank Occupancy</h3>
          <p className="mt-px text-[11px] text-muted-foreground">Used vs available positions per tank</p>
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tankStatus.map((t) => ({ name: t.name, used: t.used, available: t.capacity - t.used }))} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
                <XAxis dataKey="name" tick={axisTick} tickLine={false} axisLine={false} />
                <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" iconSize={8} />
                <Bar dataKey="used" stackId="a" fill={SEMANTIC_COLORS.primary} radius={[0, 0, 0, 0]} name="Used" />
                <Bar dataKey="available" stackId="a" fill={SEMANTIC_COLORS.neutral} radius={[4, 4, 0, 0]} name="Available" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card-premium flex flex-col p-3">
          <h3 className="text-[13px] font-semibold text-foreground">Temperature Profile (24h)</h3>
          <p className="mt-px text-[11px] text-muted-foreground">Continuous monitoring across key tanks</p>
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={tempTrend} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
                <XAxis dataKey="time" tick={axisTick} tickLine={false} axisLine={false} />
                <YAxis domain={[-197, -195]} tick={axisTick} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => `${Number(v).toFixed(1)}°C`} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" iconSize={8} />
                <Line type="monotone" dataKey="txA3" stroke={SEMANTIC_COLORS.primary} strokeWidth={2} dot={false} name="TX-A3" />
                <Line type="monotone" dataKey="ilB1" stroke={SEMANTIC_COLORS.info} strokeWidth={2} dot={false} name="IL-B1" />
                <Line type="monotone" dataKey="caA2" stroke={SEMANTIC_COLORS.danger} strokeWidth={2} dot={false} name="CA-A2" strokeDasharray="5 5" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="card-premium flex flex-col p-3">
          <h3 className="text-[13px] font-semibold text-foreground">Facility Capacity</h3>
          <p className="mt-px text-[11px] text-muted-foreground">Storage positions by facility</p>
          <div className="mt-3 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={capacityByFacility} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
                <XAxis dataKey="facility" tick={axisTick} tickLine={false} axisLine={false} />
                <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" iconSize={8} />
                <Bar dataKey="used" fill={SEMANTIC_COLORS.primary} radius={[4, 4, 0, 0]} name="Used" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card-premium flex flex-col p-3">
          <h3 className="text-[13px] font-semibold text-foreground">Occupancy Trend</h3>
          <p className="mt-px text-[11px] text-muted-foreground">12-week utilization trend</p>
          <div className="mt-3 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={occupancyHistory} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
                <XAxis dataKey="week" tick={axisTick} tickLine={false} axisLine={false} />
                <YAxis domain={[85, 95]} tick={axisTick} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => `${Number(v).toFixed(1)}%`} />
                <Area type="monotone" dataKey="occupancy" stroke={SEMANTIC_COLORS.primary} fill={SEMANTIC_COLORS.primary} fillOpacity={0.15} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Tank Inventory</h3>
        <FilterBar filters={filters} values={filterValues} onChange={(k, v) => { setFilterValues((prev) => ({ ...prev, [k]: v })) }} onReset={() => { setFilterValues({}) }} />
        <div className="overflow-x-auto rounded border border-border">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Tank ID</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Capacity</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Used</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Available</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Utilization</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Temperature</th>
                <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map((row, i) => {
                const util = ((row.used / row.capacity) * 100).toFixed(1)
                return (
                  <tr key={row.name} className={`border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors ${i % 2 === 1 ? 'bg-muted/10' : ''}`}>
                    <td className="px-3 py-2.5 font-mono text-[11px] font-medium text-foreground">{row.name}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{row.capacity}</td>
                    <td className="px-3 py-2.5 text-foreground">{row.used}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{row.capacity - row.used}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${util}%`, backgroundColor: Number(util) > 90 ? SEMANTIC_COLORS.danger : Number(util) > 80 ? SEMANTIC_COLORS.warning : SEMANTIC_COLORS.success }} />
                        </div>
                        <span className="text-muted-foreground">{util}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground">{row.temp}</td>
                    <td className="px-3 py-2.5"><StatusBadge status={row.status} size="sm" /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{filteredData.length} tanks</span>
        </div>
      </div>
    </div>
  )
}

function SnowflakeIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="2" y1="12" x2="22" y2="12" />
      <line x1="12" y1="2" x2="12" y2="22" />
      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
      <line x1="19.07" y1="4.93" x2="4.93" y2="19.07" />
    </svg>
  )
}
