import { Activity, Boxes, Microscope, ShieldCheck, Snowflake, Syringe, TestTube2 } from 'lucide-react'
import type { DashboardData } from '@/types'
import { BumpChart, Hexbin, PhasePortrait, PolarRose, RadialTree, Ridgeline, SpiderGraph1, SpiderGraph2, Ternary, Waterfall } from './StemCyteAdvancedVisuals'
import { WorldConnectionMap, CustodyMovementMap, RiskDensityMap } from './StemCyteWorldMaps'
import { ParallelCoordinates, ChordDiagram, Streamgraph, ForceNetwork, VoronoiTreemap, ConnectedScatter, CircularHeatmap, Marimekko, Tanglegram } from './StemCyteRareCharts'

interface StemCyteReferenceBoardProps { data: DashboardData }

const specimen = {
  id: 'SP-23-A8F-0012', accession: 'CBU-IND-2026-004812', bloodGroup: 'O', rh: 'Positive', collection: '2026-08-12 06:43', hospital: 'Apollo Hospital Delhi', family: 'CRM source pending', gestation: '39w 2d', volume: '87.4 mL', nucleated: '4.2 × 10⁹', viability: '98.6%', storage: 'Tank 42 · Rack B04 · 07', preservation: '2026-08-14 08:50', status: 'In cryostorage',
}
const stages = ['Collected', 'Accessioned', 'Processed', 'QA checked', 'Cryopreserved', 'In storage']
const colors = ['#2dd4bf', '#60a5fa', '#c084fc', '#f59e0b', '#fb7185']

function Panel({ index, title, subtitle, children, className = '', col }: { index: string; title: string; subtitle?: string; children: React.ReactNode; className?: string; col?: string }) {
  return <section className={`ref-panel ${col ?? ''} ${className}`}><div className="ref-panel-head"><div><span className="ref-index">{index}.</span><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><span className="ref-panel-dot" /></div>{children}</section>
}

function SpecimenTwin() {
  return <Panel index="01" title="Specimen Digital Twin" subtitle="CBU identity / maternal record / storage custody" col="col-1"><div className="twin-layout"><div className="tube-wrap"><div className="tube-cap" /><div className="tube"><div className="tube-liquid"><span /></div><div className="tube-code">CBU<br />4812</div></div><div className="tube-temp">-196.1°C<br /><small>LN₂</small></div></div><div className="specimen-facts">{[['Specimen ID', specimen.id], ['Accession', specimen.accession], ['Blood group / Rh', `${specimen.bloodGroup} ${specimen.rh}`], ['Collection date', specimen.collection], ['Source hospital', specimen.hospital], ['Gestation', specimen.gestation], ['Volume / TNC', `${specimen.volume} / ${specimen.nucleated}`], ['Viability', specimen.viability], ['Preservation', specimen.preservation], ['Location', specimen.storage], ['Status', specimen.status]].map(([label, value]) => <div key={label}><span>{label}</span><strong className={label === 'Blood group / Rh' ? 'accent-text' : ''}>{value}</strong></div>)}</div></div><div className="twin-tabs"><span><ShieldCheck /> Identity verified</span><span><Activity /> Custody history</span><span><Microscope /> Assays</span><span><Boxes /> Storage audit</span></div></Panel>
}

function Sankey() {
  return <Panel index="02" title="Cell-Population Sankey" subtitle="Collected volume → processed fractions → release state" col="col-2"><svg viewBox="0 0 520 210" className="ref-svg"><text x="5" y="14">SOURCE FRACTION</text><text x="220" y="14">PROCESSING OUTPUT</text><text x="430" y="14">FUNCTIONAL STATE</text>{['Mononuclear', 'CD34+ cells', 'Plasma', 'RBC depleted'].map((label, i) => <g key={label}><rect x="5" y={30 + i * 40} width="94" height="17" rx="3" fill={colors[i]} fillOpacity=".8" /><text x="12" y={42 + i * 40} fill="#061019" fontSize="10">{label}</text></g>)}{['TNC isolate', 'CD34 fraction', 'Plasma bank', 'Reserve aliquot'].map((label, i) => <g key={label}><rect x="210" y={38 + i * 35} width="100" height="17" rx="3" fill="#152b3b" stroke={colors[i]} /><text x="218" y={50 + i * 35} fill="#d9f7ff" fontSize="10">{label}</text></g>)}{['Viable', 'QA review', 'Cryostored', 'Released'].map((label, i) => <g key={label}><rect x="420" y={30 + i * 40} width="92" height="17" rx="3" fill={colors[i]} fillOpacity=".7" /><text x="428" y={42 + i * 40} fill="#061019" fontSize="10">{label}</text></g>)}{[0,1,2,3].flatMap((i) => [<path key={`a${i}`} d={`M99 ${38 + i * 40} C145 ${38 + i * 40} 160 ${46 + i * 35} 210 ${46 + i * 35}`} stroke={colors[i]} strokeWidth="8" strokeOpacity=".4" fill="none" />, <path key={`b${i}`} d={`M310 ${46 + i * 35} C355 ${46 + i * 35} 370 ${38 + i * 40} 420 ${38 + i * 40}`} stroke={colors[i]} strokeWidth="7" strokeOpacity=".4" fill="none" />])}</svg><div className="ref-footer-metric"><span>Processed cells</span><strong>1.284M</strong><span>Functional recovery</span><strong className="accent-text">96.8%</strong></div></Panel>
}

function TankSunburst() {
  return <Panel index="03" title="Cryogenic Tank Sunburst" subtitle="Capacity, utilization, and alarm state" col="col-1"><div className="sunburst-wrap"><svg viewBox="0 0 220 220" className="sunburst"><circle cx="110" cy="110" r="82" fill="none" stroke="#122b3a" strokeWidth="34" />{Array.from({ length: 24 }, (_, i) => { const start = i * 15; const color = colors[Math.floor(i / 5) % colors.length]; return <path key={i} d={`M110 110 L${110 + Math.cos((start - 90) * Math.PI / 180) * 82} ${110 + Math.sin((start - 90) * Math.PI / 180) * 82} A82 82 0 0 1 ${110 + Math.cos((start + 13 - 90) * Math.PI / 180) * 82} ${110 + Math.sin((start + 13 - 90) * Math.PI / 180) * 82} Z`} fill={color} fillOpacity=".72" stroke="#061019" strokeWidth="1" /> })}<circle cx="110" cy="110" r="44" fill="#091722" stroke="#29475a" /><text x="110" y="106" textAnchor="middle" fill="white" fontSize="18" fontWeight="700">62%</text><text x="110" y="122" textAnchor="middle" fill="#9db7c5" fontSize="9">USED</text></svg><div className="tank-list"><strong>1,247,890</strong><span>specimens in storage</span>{['Tank 42 · 86%', 'Tank 18 · 74%', 'Tank 07 · 62%', 'Tank 03 · 41%'].map((tank, i) => <p key={tank}><i className="dot" style={{ background: colors[i] }} />{tank}</p>)}</div></div></Panel>
}

function Timeline() {
  return <Panel index="04" title="Collection-to-Cryopreservation Flow" subtitle="Median operational time by custody event" col="col-1"><div className="timeline-flow">{stages.map((stage, i) => <div key={stage} className="timeline-stage"><div className="timeline-icon">{i === 0 ? <Syringe /> : i === 4 ? <Snowflake /> : i === 5 ? <Boxes /> : <TestTube2 />}</div><div className="timeline-info"><strong>{stage}</strong><small>{['Day 0 · 06:43', 'Day 0 · 14:20', 'Day 1 · 09:15', 'Day 1 · 18:30', 'Day 2 · 08:50', 'Day 2 · 09:20'].at(i)}</small></div>{i < stages.length - 1 && <span className="timeline-line" />}</div>)}</div><div className="timeline-total">Total turnaround time <strong>50h 07m</strong></div></Panel>
}

function Fingerprint() {
  const rows = ['North Branch', 'West Branch', 'South Branch', 'Regional Lab', 'Partner Lab']
  const cols = ['Genomic identity', 'RNA quality', 'Protein integrity', 'Contamination', 'Sample yield', 'Turnaround']
  return <Panel index="05" title="Facility Fingerprint Matrix" subtitle="Operational and test-report signature by facility" col="col-2"><div className="fingerprint"><div /><>{cols.map((col) => <span key={col}>{col}</span>)}</>{rows.map((row, ri) => <div key={row} className="finger-row"><span>{row}</span>{cols.map((_, ci) => <i key={ci} style={{ background: colors[(ri + ci) % colors.length], opacity: .32 + ((ri * 19 + ci * 13) % 62) / 100 }} />)}</div>)}</div><div className="matrix-scale"><span>Low signal</span><b /><span>High signal</span></div></Panel>
}

function ControlChart() {
  return <Panel index="06" title="Multivariate QC Control Chart" subtitle="Live quality-control z-scores across incoming reports" col="col-1"><div className="control-chart">{['DNA integrity', 'RNA integrity', 'Protein yield', 'Contamination', 'Temperature', 'Freezer alarm'].map((label, row) => <div className="control-row" key={label}><span>{label}</span><strong className={row === 3 ? 'warn' : ''}>{row === 3 ? '0.15' : ['-0.42', '0.78', '-1.12', '0.15', '-0.65', '-0.08'][row]}</strong><svg viewBox="0 0 300 28"><path d="M0 14H300" stroke="#2b4b5d" strokeDasharray="4 4" />{Array.from({ length: 18 }, (_, i) => <circle key={i} cx={i * 17 + 5} cy={14 - (((i * (row + 3) * 7) % 15) - 7)} r="2" fill={colors[row % colors.length]} />)}<path d={`M0 ${11 + row % 3} C50 ${18 - row} 90 ${5 + row} 140 14 S220 ${20 - row} 300 ${12 + row}`} fill="none" stroke={colors[row % colors.length]} strokeWidth="1.5" /></svg></div>)}</div><div className="control-key"><span>−3σ</span><span>control limits</span><span>+3σ</span></div></Panel>
}

function Capacity() {
  return <Panel index="07" title="Cryogenic Capacity Forecast" subtitle="Historical occupancy and forecast runway" col="col-3"><div className="capacity-top"><div><span>Total capacity</span><strong>2,000,000</strong><small>specimens</small></div><div><span>Current use</span><strong>1,247,890</strong><small>62.4% utilized</small></div></div><svg viewBox="0 0 360 130" className="ref-svg"><path d="M12 112 C70 94 100 83 150 70 S250 37 345 22" stroke="#2dd4bf" fill="none" strokeWidth="2" /><path d="M12 112 C70 94 100 83 150 70 S250 37 345 22" stroke="#f59e0b" fill="none" strokeWidth="1" strokeDasharray="5 4" transform="translate(0 18)" /><path d="M240 8V120" stroke="#fb7185" strokeDasharray="3 3" /><text x="246" y="22" fill="#fb7185" fontSize="10">capacity limit</text><text x="10" y="128" fill="#9db7c5" fontSize="10">Aug 26</text><text x="300" y="128" fill="#9db7c5" fontSize="10">Nov 26</text></svg><div className="capacity-footer"><span>Projected full <b>Nov 2026</b></span><span>At risk date <b className="danger-text">Aug 2026</b></span><span>Recommended action <b className="accent-text">Add 1 tank</b></span></div></Panel>
}

function Risk() {
  const items = ['Temperature excursion', 'Inventory discrepancy', 'Sample degradation', 'Workflow delay', 'Data integrity', 'Supply chain'];
  return <Panel index="08" title="Operational Risk Constellation" subtitle="Weighted risk signals across the StemCyte operating model" col="col-3"><svg viewBox="0 0 330 220" className="ref-svg risk-constellation"><polygon points="165,28 275,78 250,178 80,178 55,78" fill="none" stroke="#6b5b21" strokeOpacity=".7" />{items.map((item, i) => { const angle = -Math.PI / 2 + i * Math.PI * 2 / items.length; const x = 165 + Math.cos(angle) * 92; const y = 108 + Math.sin(angle) * 76; return <g key={item}><line x1="165" y1="108" x2={x} y2={y} stroke="#6b5b21" /><circle cx={x} cy={y} r="10" fill={colors[i % colors.length]} /><text x={x} y={y + 25} fill="#d5e4e8" fontSize="10" textAnchor="middle">{item}</text><text x={x} y={y + 37} fill={colors[i % colors.length]} fontSize="10" textAnchor="middle">0.{37 + i * 9}</text></g>})}<circle cx="165" cy="108" r="32" fill="#17212b" stroke="#f59e0b" /><text x="165" y="105" fill="#fbd38d" fontSize="10" textAnchor="middle">Overall</text><text x="165" y="118" fill="white" fontSize="13" fontWeight="700" textAnchor="middle">MEDIUM</text></svg></Panel>
}

export function StemCyteReferenceBoard({ data: _data }: StemCyteReferenceBoardProps) {
  return (
    <div className="reference-board">
      <div className="reference-board-title">
        <div><span>STEMCYTE / SPECIMEN INTELLIGENCE FABRIC</span><h1>CBU operations observatory</h1></div>
        <div className="board-status"><i /> DATA FABRIC ONLINE <b>2026-08-20 · 14:32 UTC</b></div>
      </div>
      <div className="reference-board-grid">
        {/* Row 1: col-1 SpecimenTwin, col-2 Sankey, col-3 Capacity */}
        <SpecimenTwin />
        <Sankey />
        <Capacity />
        {/* Row 2: col-1 TankSunburst, col-2 WorldConnectionMap, col-3 Risk */}
        <TankSunburst />
        <WorldConnectionMap />
        <Risk />
        {/* Row 3: col-1 Timeline, col-2 CustodyMovementMap, col-3 Ridgeline */}
        <Timeline />
        <CustodyMovementMap />
        <Ridgeline />
        {/* Row 4: col-1 ControlChart, col-2 RiskDensityMap, col-3 PhasePortrait */}
        <ControlChart />
        <RiskDensityMap />
        <PhasePortrait />
        {/* Row 5: col-1 Hexbin, col-2 Fingerprint, col-3 BumpChart */}
        <Hexbin />
        <Fingerprint />
        <BumpChart />
        {/* Row 6: col-1 Ternary, col-2 SpiderGraph1, col-3 SpiderGraph2 */}
        <Ternary />
        <SpiderGraph1 />
        <SpiderGraph2 />
        {/* Row 7: col-1 Waterfall, col-2 RadialTree, col-3 PolarRose */}
        <Waterfall />
        <RadialTree />
        <PolarRose />
        {/* Row 8: col-1 ParallelCoordinates, col-2 Tanglegram, col-3 ChordDiagram */}
        <ParallelCoordinates />
        <Tanglegram />
        <ChordDiagram />
        {/* Row 9: col-1 VoronoiTreemap, col-2 Streamgraph, col-3 ConnectedScatter */}
        <VoronoiTreemap />
        <Streamgraph />
        <ConnectedScatter />
        {/* Row 10: col-1 CircularHeatmap, col-2 Marimekko, col-3 ForceNetwork */}
        <CircularHeatmap />
        <Marimekko />
        <ForceNetwork />
      </div>
    </div>
  )
}
