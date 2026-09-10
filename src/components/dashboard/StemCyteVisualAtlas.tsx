import { Activity, Atom, CircleDot, GitBranch, Map, Network, Orbit, ShieldAlert, Sparkles, Target, Waves } from 'lucide-react'
import { RegionalMapChart } from './RegionalMapChart'
import type { DashboardData } from '@/types'

interface StemCyteVisualAtlasProps { data: DashboardData }

const demo = [18, 24, 21, 31, 27, 39, 35, 43, 41, 48, 46, 54]
const colors = ['#73d6c0', '#9db7ff', '#ffbd6b', '#d6a7ff', '#f59bb5']

function Panel({ title, subtitle, icon: Icon, children }: { title: string; subtitle: string; icon: typeof Activity; children: React.ReactNode }) {
  return <section className="min-h-[190px] overflow-hidden rounded-2xl border border-border/70 bg-card p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{subtitle}</p><h3 className="mt-1 font-heading text-sm font-semibold">{title}</h3></div><Icon className="size-4 text-muted-foreground" /></div><div className="mt-3">{children}</div></section>
}

function MiniBars({ values = demo, color = '#73d6c0' }: { values?: number[]; color?: string }) {
  const maximum = Math.max(...values, 1)
  return <div className="flex h-28 items-end gap-1">{values.map((value, index) => <div key={`${value}-${index}`} className="group relative flex-1"><span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] font-semibold tabular-nums text-muted-foreground">{value}</span><div className="rounded-t-sm transition-all group-hover:opacity-70" style={{ height: `${Math.max(8, value / maximum * 100)}%`, background: color }} /><span className="mt-1 block text-center text-[8px] text-muted-foreground">{index + 1}</span></div>)}</div>
}

function MiniLine({ values = demo, color = '#9db7ff' }: { values?: number[]; color?: string }) {
  const maximum = Math.max(...values, 1)
  const points = values.map((value, index) => `${index / (values.length - 1) * 100},${100 - value / maximum * 86}`).join(' ')
  return <div className="relative"><svg viewBox="0 0 100 100" className="h-28 w-full overflow-visible" preserveAspectRatio="none"><path d="M0 96H100" stroke="currentColor" strokeOpacity=".12" /><polyline points={points} fill="none" stroke={color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" /><polygon points={`0,100 ${points} 100,100`} fill={color} fillOpacity=".12" /></svg><span className="absolute left-0 top-0 text-[8px] text-muted-foreground">{maximum}</span><span className="absolute bottom-0 left-0 text-[8px] text-muted-foreground">0</span></div>
}

function Ring({ value, label, color }: { value: number; label: string; color: string }) {
  const circumference = 2 * Math.PI * 38
  return <div className="flex items-center gap-3"><svg viewBox="0 0 100 100" className="size-24 -rotate-90"><circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" strokeOpacity=".1" strokeWidth="9" /><circle cx="50" cy="50" r="38" fill="none" stroke={color} strokeWidth="9" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - value / 100)} strokeLinecap="round" /></svg><div><p className="font-heading text-xl font-semibold">{value}%</p><p className="text-[11px] text-muted-foreground">{label}</p></div></div>
}

function Spiral({ color = '#d6a7ff' }: { color?: string }) {
  const points = Array.from({ length: 90 }, (_, index) => { const angle = index / 90 * Math.PI * 8; const radius = index / 90 * 42; return `${50 + Math.cos(angle) * radius},${50 + Math.sin(angle) * radius}` }).join(' ')
  return <svg viewBox="0 0 100 100" className="h-28 w-full"><polyline points={points} fill="none" stroke={color} strokeWidth="1.5" /><circle cx="50" cy="50" r="3" fill={color} /></svg>
}

function Sankey() {
  return <svg viewBox="0 0 300 120" className="h-28 w-full"><path d="M8 28 C90 28 100 48 170 48 S230 30 292 30" fill="none" stroke="#73d6c0" strokeWidth="14" strokeOpacity=".7" /><path d="M8 55 C80 55 108 52 170 60 S230 77 292 76" fill="none" stroke="#9db7ff" strokeWidth="10" strokeOpacity=".7" /><path d="M8 82 C90 82 104 67 170 64 S230 42 292 42" fill="none" stroke="#ffbd6b" strokeWidth="7" strokeOpacity=".7" /><text x="8" y="114" fontSize="9" fill="currentColor">branch intake</text><text x="126" y="114" fontSize="9" fill="currentColor">QA gates</text><text x="246" y="114" fontSize="9" fill="currentColor">release</text></svg>
}

function Swarm() {
  return <svg viewBox="0 0 300 120" className="h-28 w-full">{Array.from({ length: 80 }, (_, index) => { const x = (index * 47) % 285 + 8; const y = 12 + ((index * 71) % 90); const color = colors[index % colors.length]; return <circle key={index} cx={x} cy={y} r={index % 7 === 0 ? 3.5 : 2} fill={color} fillOpacity=".75"><title>{`CBU sample ${index + 1}`}</title></circle> })}</svg>
}

function WaveField() {
  return <svg viewBox="0 0 300 120" className="h-28 w-full">{Array.from({ length: 8 }, (_, index) => <path key={index} d={`M0 ${18 + index * 12} C45 ${index % 2 ? 2 : 34} 85 ${40 + index * 8} 130 ${18 + index * 12} S220 ${index % 2 ? 2 : 34} 300 ${18 + index * 12}`} fill="none" stroke={colors[index % colors.length]} strokeOpacity=".7" strokeWidth="1.5" />)}</svg>
}

function Matrix() {
  return <div><div className="grid grid-cols-12 gap-1">{Array.from({ length: 72 }, (_, index) => <span key={index} className="aspect-square rounded-[2px]" style={{ background: colors[index % colors.length], opacity: .18 + ((index * 17) % 70) / 100 }} />)}</div><div className="mt-2 flex justify-between text-[8px] uppercase tracking-wider text-muted-foreground"><span>low evidence</span><span>high evidence</span></div></div>
}

function Glyph() {
  return <svg viewBox="0 0 300 120" className="h-28 w-full"><path d="M20 95L56 62 86 78 119 28 155 64 190 45 226 74 276 20" fill="none" stroke="#f59bb5" strokeWidth="2" /><path d="M20 95L56 62 86 78 119 28 155 64 190 45 226 74 276 20" fill="none" stroke="#f59bb5" strokeWidth="10" strokeOpacity=".08" /><circle cx="119" cy="28" r="6" fill="#f59bb5" /><text x="124" y="24" fontSize="9" fill="currentColor">highest release friction</text></svg>
}

export function StemCyteVisualAtlas({ data }: StemCyteVisualAtlasProps) {
  const regions = data.regionalMetrics?.length ? data.regionalMetrics : [{ region: 'West', facility: 'Mumbai Processing Lab', shipments: 38, inventoryValue: 310, excursions: 1, compliance: 98, openIncidents: 2 }]
  const temperature = data.temperatureCompliance?.map((item) => item.complianceRate) ?? [98, 94, 100, 97]
  return <div className="space-y-4"><div className="flex items-end justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Operational visual atlas</p><h2 className="font-heading text-xl font-semibold">Twenty-four ways to see the same custody truth</h2></div><span className="hidden text-xs text-muted-foreground sm:block">Native SVG / no chart library</span></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"> <Panel title="Collection pulse" subtitle="01 · branch rhythm" icon={Activity}><MiniBars /></Panel><Panel title="Custody velocity" subtitle="02 · time trace" icon={Waves}><MiniLine /></Panel><Panel title="QA readiness" subtitle="03 · release gate" icon={Target}><Ring value={97} label="all gates" color="#73d6c0" /></Panel><Panel title="Tank atmosphere" subtitle="04 · cryogenic state" icon={Orbit}><Spiral color="#7bdff2" /></Panel><Panel title="Identity handoff" subtitle="05 · event flow" icon={GitBranch}><Sankey /></Panel><Panel title="CBU constellation" subtitle="06 · unit population" icon={Sparkles}><Swarm /></Panel><Panel title="Branch weather" subtitle="07 · anomaly field" icon={Waves}><WaveField /></Panel><Panel title="Assay lattice" subtitle="08 · test completeness" icon={Atom}><Matrix /></Panel><Panel title="Release friction" subtitle="09 · bottleneck glyph" icon={ShieldAlert}><Glyph /></Panel><Panel title="Sterility confidence" subtitle="10 · assay score" icon={ShieldAlert}><Ring value={temperature[0] ?? 98} label="sterility" color="#d6a7ff" /></Panel><Panel title="Viability confidence" subtitle="11 · assay score" icon={CircleDot}><Ring value={temperature[1] ?? 94} label="viability" color="#ffbd6b" /></Panel><Panel title="Identity confidence" subtitle="12 · assay score" icon={ShieldAlert}><Ring value={temperature[2] ?? 100} label="identity" color="#73d6c0" /></Panel><Panel title="Temperature integrity" subtitle="13 · cold chain" icon={Waves}><MiniLine values={temperature} color="#7bdff2" /></Panel><Panel title="Branch intake mix" subtitle="14 · source shape" icon={Map}><MiniBars values={regions.map((region) => region.shipments)} color="#9db7ff" /></Panel><Panel title="CBU risk radar" subtitle="15 · risk contour" icon={Target}><MiniLine values={[10, 24, 18, 31, 16, 12, 22]} color="#f59bb5" /></Panel><Panel title="Release readiness orbit" subtitle="16 · clinical queue" icon={Orbit}><Spiral color="#73d6c0" /></Panel><Panel title="Test-report density" subtitle="17 · branch uploads" icon={Network}><Matrix /></Panel><Panel title="Custody signal swarm" subtitle="18 · event integrity" icon={Sparkles}><Swarm /></Panel><Panel title="Cryotank resonance" subtitle="19 · telemetry" icon={Waves}><WaveField /></Panel><Panel title="Collection to release" subtitle="20 · flow geometry" icon={GitBranch}><Sankey /></Panel><Panel title="Exception topology" subtitle="21 · quality signals" icon={ShieldAlert}><Glyph /></Panel><Panel title="Branch performance" subtitle="22 · comparative bars" icon={Activity}><MiniBars values={[91, 74, 86, 68, 95, 82]} color="#ffbd6b" /></Panel><Panel title="Clinical readiness" subtitle="23 · service level" icon={Target}><Ring value={89} label="on-time release" color="#f59bb5" /></Panel><Panel title="Operations map" subtitle="24 · geographic view" icon={Map}><div className="-mx-2 h-28 overflow-hidden"><RegionalMapChart data={regions} /></div></Panel></div></div>
}
