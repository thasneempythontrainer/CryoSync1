import { useId } from 'react'
import { ArrowUpRight, FlaskConical, Gauge, MapPin, ShieldCheck, Snowflake, TestTube2 } from 'lucide-react'
import type { DashboardData, DashboardKpi, RegionalMetric } from '@/types'
import { StemCyteVisualAtlas } from './StemCyteVisualAtlas'
import { StemCyteReferenceBoard } from './StemCyteReferenceBoard'

interface StemCyteCommandSurfaceProps {
  data: DashboardData
}

const DEMO_KPIS: DashboardKpi[] = [
  { label: 'CBUs in custody', value: 1248, unit: 'units', trend: 'up', trendPercent: 8.4, icon: 'package', spark: [42, 48, 44, 59, 62, 66, 71] },
  { label: 'Branch collections today', value: 38, unit: 'CBUs', trend: 'up', trendPercent: 4.1, icon: 'truck', spark: [21, 28, 24, 31, 29, 36, 38] },
  { label: 'Release-ready', value: 96.8, unit: '%', trend: 'up', trendPercent: 2.2, icon: 'shield-check', spark: [91, 93, 92, 95, 94, 97, 97] },
  { label: 'Open quality signals', value: 7, unit: 'review', trend: 'down', trendPercent: 18.2, icon: 'alert-triangle', spark: [14, 12, 13, 10, 11, 8, 7] },
]

const DEMO_REGIONS: RegionalMetric[] = [
  { region: 'West', facility: 'Mumbai Processing Lab', shipments: 38, inventoryValue: 310, excursions: 1, compliance: 98, openIncidents: 2 },
  { region: 'North', facility: 'Delhi Collection Center', shipments: 24, inventoryValue: 190, excursions: 0, compliance: 100, openIncidents: 1 },
  { region: 'South', facility: 'Bangalore Storage Facility', shipments: 31, inventoryValue: 268, excursions: 2, compliance: 96, openIncidents: 4 },
]

const STAGES = [
  { label: 'Collection', detail: 'Consent + maternal record', color: '#ffbd6b' },
  { label: 'Receiving', detail: 'Identity + chain of custody', color: '#73d6c0' },
  { label: 'Processing', detail: 'Separation + viability', color: '#9db7ff' },
  { label: 'Testing', detail: 'Sterility + infectious disease', color: '#d6a7ff' },
  { label: 'Cryostorage', detail: 'Tank position + alarm state', color: '#7bdff2' },
  { label: 'Release', detail: 'Clinical request + QA', color: '#f59bb5' },
]

function safeData(data: DashboardData) {
  return {
    kpis: data.kpis?.length ? data.kpis : DEMO_KPIS,
    regions: data.regionalMetrics?.length ? data.regionalMetrics : DEMO_REGIONS,
    trends: data.shipmentTrends?.length ? data.shipmentTrends : [42, 48, 44, 59, 62, 66, 71].map((value, index) => ({ date: `D${index + 1}`, received: value, quarantined: Math.max(1, index % 3), rejected: index === 2 ? 2 : 0 })),
    quality: data.temperatureCompliance?.length ? data.temperatureCompliance : [
      { category: 'Sterility', compliant: 98, excursion: 2, complianceRate: 98 },
      { category: 'Viability', compliant: 94, excursion: 6, complianceRate: 94 },
      { category: 'Identity', compliant: 100, excursion: 0, complianceRate: 100 },
      { category: 'Temperature', compliant: 97, excursion: 3, complianceRate: 97 },
    ],
  }
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1)
  const min = Math.min(...values)
  const points = values.map((value, index) => `${(index / Math.max(values.length - 1, 1)) * 100},${38 - ((value - min) / Math.max(max - min, 1)) * 30}`).join(' ')
  return <svg viewBox="0 0 100 42" className="h-10 w-24 overflow-visible" aria-hidden="true"><polyline points={points} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

function CbuJourney({ values }: { values: number[] }) {
  const pathId = useId()
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-[#101a25] p-5 text-white shadow-xl">
      <div className="relative z-10 flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#9ec5d3]">CBU journey / live state</p>
          <h2 className="mt-1 font-heading text-xl font-semibold tracking-tight">From cord collection to clinical release</h2>
          <p className="mt-1 max-w-xl text-xs text-[#a9bbc4]">One operational thread across every branch, lab, test report, tank position, and release decision.</p>
        </div>
        <div className="hidden items-center gap-2 rounded-full border border-[#35515e] bg-[#172934] px-3 py-1.5 text-[11px] text-[#cbe9ee] sm:flex"><span className="size-1.5 animate-pulse rounded-full bg-[#73d6c0]" /> Live command view</div>
      </div>
      <svg viewBox="0 0 1000 265" className="mt-5 h-auto w-full" role="img" aria-label="CBU lifecycle from collection through release">
        <defs>
          <linearGradient id={pathId} x1="0" x2="1"><stop stopColor="#ffbd6b" /><stop offset=".35" stopColor="#73d6c0" /><stop offset=".7" stopColor="#9db7ff" /><stop offset="1" stopColor="#f59bb5" /></linearGradient>
          <filter id={`${pathId}-glow`}><feGaussianBlur stdDeviation="5" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        <path d="M30 154 C145 42 220 222 340 124 S540 48 635 135 S820 220 970 79" fill="none" stroke="#243d49" strokeWidth="18" strokeLinecap="round" />
        <path d="M30 154 C145 42 220 222 340 124 S540 48 635 135 S820 220 970 79" fill="none" stroke={`url(#${pathId})`} strokeWidth="5" strokeLinecap="round" filter={`url(#${pathId}-glow)`} />
        {STAGES.map((stage, index) => {
          const x = [30, 205, 370, 535, 700, 970][index]
          const y = [154, 91, 145, 84, 154, 79][index]
          return <g key={stage.label}><circle cx={x} cy={y} r="15" fill="#101a25" stroke={stage.color} strokeWidth="3" /><circle cx={x} cy={y} r="5" fill={stage.color} /><text x={x} y={y + 38} textAnchor={index === 0 ? 'start' : index === STAGES.length - 1 ? 'end' : 'middle'} fill="white" fontSize="13" fontWeight="600">{stage.label}</text><text x={x} y={y + 55} textAnchor={index === 0 ? 'start' : index === STAGES.length - 1 ? 'end' : 'middle'} fill="#91aab5" fontSize="10">{stage.detail}</text></g>
        })}
        <text x="370" y="26" fill="#b9cbd2" fontSize="11" letterSpacing="2">CHAIN OF IDENTITY</text>
        <text x="700" y="235" fill="#b9cbd2" fontSize="11" letterSpacing="2">CLINICAL READINESS</text>
      </svg>
      <div className="relative z-10 grid grid-cols-3 gap-3 border-t border-[#28414d] pt-3 text-xs text-[#9fb4bd] sm:grid-cols-6">
        {STAGES.map((stage, index) => <div key={stage.label}><span className="font-semibold text-white">{values[index] ?? Math.max(8, 42 - index * 4)}</span><span className="ml-1">CBUs</span></div>)}
      </div>
    </div>
  )
}

function BranchMatrix({ regions }: { regions: RegionalMetric[] }) {
  const rows = regions.slice(0, 6)
  const metrics = [{ key: 'shipments', label: 'Intake' }, { key: 'compliance', label: 'QA pass' }, { key: 'excursions', label: 'Alerts' }, { key: 'openIncidents', label: 'Open' }] as const
  return <div className="rounded-2xl border border-border/70 bg-card p-5"><div className="flex items-start justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Branch pulse matrix</p><h3 className="mt-1 font-heading text-lg font-semibold">Where attention moves next</h3></div><MapPin className="size-5 text-muted-foreground" /></div><div className="mt-5 space-y-3">{rows.map((row) => <div key={row.facility ?? row.region} className="grid grid-cols-[minmax(120px,1.4fr)_repeat(4,1fr)] items-center gap-2 text-xs"><div className="truncate font-medium text-foreground">{row.facility ?? row.region}</div>{metrics.map((metric) => { const raw = row[metric.key]; const score = metric.key === 'compliance' ? raw : metric.key === 'excursions' || metric.key === 'openIncidents' ? Math.max(0, 100 - raw * 20) : Math.min(100, raw * 2); return <div key={metric.key} className="group relative"><div className="h-7 rounded-md bg-muted/60 p-1"><div className="h-full rounded bg-foreground/80" style={{ width: `${Math.max(8, score)}%`, opacity: 0.35 + score / 180 }} /></div><span className="absolute inset-0 flex items-center justify-center font-semibold tabular-nums text-foreground">{raw}{metric.key === 'compliance' ? '%' : ''}</span></div>})}</div>)}<div className="grid grid-cols-[minmax(120px,1.4fr)_repeat(4,1fr)] gap-2 pt-1 text-[9px] uppercase tracking-wider text-muted-foreground"><span />{metrics.map((metric) => <span key={metric.key} className="text-center">{metric.label}</span>)}</div></div></div>
}

function QualityConstellation({ quality }: { quality: Array<{ category: string; complianceRate: number }> }) {
  const axes = quality.slice(0, 5)
  const cx = 150
  const cy = 128
  const radius = 88
  const polygon = axes.map((item, index) => { const angle = -Math.PI / 2 + (index * Math.PI * 2) / axes.length; const r = radius * item.complianceRate / 100; return `${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}` }).join(' ')
  return <div className="rounded-2xl border border-border/70 bg-card p-5"><div className="flex items-start justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Quality constellation</p><h3 className="mt-1 font-heading text-lg font-semibold">Release confidence</h3></div><ShieldCheck className="size-5 text-emerald-500" /></div><div className="mt-1 flex items-center gap-4"><svg viewBox="0 0 300 255" className="h-56 w-2/3" role="img" aria-label="Quality release confidence by test domain">{[.33, .66, 1].map((scale) => <polygon key={scale} points={axes.map((_, index) => { const angle = -Math.PI / 2 + (index * Math.PI * 2) / axes.length; return `${cx + Math.cos(angle) * radius * scale},${cy + Math.sin(angle) * radius * scale}` }).join(' ')} fill="none" stroke="currentColor" strokeOpacity=".12" />)}{axes.map((item, index) => { const angle = -Math.PI / 2 + (index * Math.PI * 2) / axes.length; return <line key={item.category} x1={cx} y1={cy} x2={cx + Math.cos(angle) * radius} y2={cy + Math.sin(angle) * radius} stroke="currentColor" strokeOpacity=".12" /> })}<polygon points={polygon} fill="#73d6c0" fillOpacity=".24" stroke="#43b99d" strokeWidth="3" />{axes.map((item, index) => { const angle = -Math.PI / 2 + (index * Math.PI * 2) / axes.length; const x = cx + Math.cos(angle) * radius * item.complianceRate / 100; const y = cy + Math.sin(angle) * radius * item.complianceRate / 100; return <g key={item.category}><circle cx={x} cy={y} r="4" fill="#d6fff5" stroke="#43b99d" strokeWidth="2" /><text x={cx + Math.cos(angle) * 108} y={cy + Math.sin(angle) * 108} textAnchor="middle" fontSize="10" fill="currentColor">{item.category}</text></g>})}</svg><div className="space-y-2 text-xs">{axes.map((item) => <div key={item.category} className="flex items-center justify-between gap-4"><span className="text-muted-foreground">{item.category}</span><span className="font-semibold tabular-nums">{item.complianceRate}%</span></div>)}</div></div></div>
}

export function StemCyteCommandSurface({ data }: StemCyteCommandSurfaceProps) {
  return <StemCyteReferenceBoard data={data} />
  /* Legacy atlas retained below while the specimen board becomes the primary command surface. */
  /*
  const view = safeData(data)
  const journeyValues = view.kpis.slice(0, 4).map((kpi) => Number(kpi.value) || 0)
  return <div className="space-y-4 p-4 sm:p-5"><CbuJourney values={journeyValues} /><div className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]"><div className="grid grid-cols-2 gap-3">{view.kpis.map((kpi) => <div key={kpi.label} className="rounded-2xl border border-border/70 bg-card p-4"><div className="flex items-start justify-between gap-2"><div className="flex size-9 items-center justify-center rounded-xl bg-muted text-foreground">{kpi.icon === 'package' ? <TestTube2 className="size-4" /> : kpi.icon === 'truck' ? <MapPin className="size-4" /> : kpi.icon === 'shield-check' ? <ShieldCheck className="size-4" /> : <Gauge className="size-4" />}</div><ArrowUpRight className="size-4 text-emerald-500" /></div><p className="mt-4 text-xs text-muted-foreground">{kpi.label}</p><div className="mt-0.5 flex items-end justify-between gap-2"><p className="font-heading text-2xl font-semibold tabular-nums">{kpi.value}<span className="ml-1 text-xs font-normal text-muted-foreground">{kpi.unit}</span></p>{kpi.spark && <span className="text-emerald-500"><Sparkline values={kpi.spark} /></span>}</div></div>)}</div><BranchMatrix regions={view.regions} /></div><div className="grid gap-4 lg:grid-cols-[.95fr_1.05fr]"><QualityConstellation quality={view.quality} /><div className="rounded-2xl border border-border/70 bg-card p-5"><div className="flex items-start justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Branch intake velocity</p><h3 className="mt-1 font-heading text-lg font-semibold">Collection rhythm</h3></div><Snowflake className="size-5 text-sky-500" /></div><div className="mt-6 flex h-44 items-end gap-2">{view.trends.slice(-12).map((point, index) => { const height = Math.max(8, (point.received / Math.max(...view.trends.map((item) => item.received), 1)) * 100); return <div key={`${point.date}-${index}`} className="group flex h-full flex-1 flex-col justify-end"><div className="relative rounded-t-md bg-gradient-to-t from-sky-500 to-teal-300 transition-all duration-500 group-hover:from-amber-400 group-hover:to-rose-300" style={{ height: `${height}%` }}><span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-semibold opacity-0 transition-opacity group-hover:opacity-100">{point.received}</span></div><span className="mt-2 truncate text-center text-[9px] text-muted-foreground">{point.date}</span></div>})}</div><div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><FlaskConical className="size-3.5" /> Test-report readiness can be attached here when branch CSV ingestion is enabled.</div></div></div><StemCyteVisualAtlas data={data} /></div>
  */
}
