const palette = ['#2dd4bf', '#60a5fa', '#a78bfa', '#f59e0b', '#fb7185']

function AdvancedPanel({ index, title, subtitle, children, col }: { index: string; title: string; subtitle: string; children: React.ReactNode; col: string }) {
  return <section className={`advanced-panel ${col}`}><header><span>{index}</span><div><h3>{title}</h3><p>{subtitle}</p></div></header>{children}</section>
}

function SpiderGraph1() {
  const axes = ['Collection rate', 'Processing speed', 'QA pass rate', 'Custody integrity', 'Release readiness', 'Storage utilization']
  const cx = 165, cy = 108, radius = 72
  const current = [88, 76, 97, 98, 92, 62]
  const target = [95, 85, 99, 99, 96, 75]
  const n = axes.length
  const toXY = (angle: number, r: number) => ({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r })
  const angleAt = (i: number) => -Math.PI / 2 + i * Math.PI * 2 / n
  const polyPoints = (values: number[]) => values.map((v, i) => { const { x, y } = toXY(angleAt(i), radius * v / 100); return `${x},${y}` }).join(' ')
  return (
    <AdvancedPanel index="09" title="Operational Spider" subtitle="Current vs target across six performance axes" col="col-2">
      <svg viewBox="0 0 330 220" className="advanced-svg">
        {[.33, .66, 1].map((s) => <polygon key={s} points={axes.map((_, i) => { const { x, y } = toXY(angleAt(i), radius * s); return `${x},${y}` }).join(' ')} fill="none" stroke="#365262" strokeWidth=".7" />)}
        {axes.map((label, i) => { const { x, y } = toXY(angleAt(i), radius); const lx = cx + Math.cos(angleAt(i)) * (radius + 24); const ly = cy + Math.sin(angleAt(i)) * (radius + 24); const anchor = Math.abs(Math.sin(angleAt(i))) > 0.9 ? 'middle' : Math.cos(angleAt(i)) > 0 ? 'start' : 'end'; const dy = Math.sin(angleAt(i)) < -0.9 ? 9 : Math.sin(angleAt(i)) > 0.7 ? 14 : -6; return <g key={label}><line x1={cx} y1={cy} x2={x} y2={y} stroke="#365262" strokeWidth=".6" /><text x={lx} y={ly + dy} textAnchor={anchor} fill="#8fa9b5" fontSize="10">{label}</text></g> })}
        <polygon points={polyPoints(target)} fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4 3" strokeOpacity=".7" />
        <polygon points={polyPoints(current)} fill="#2dd4bf" fillOpacity=".15" stroke="#2dd4bf" strokeWidth="2" />
        {current.map((v, i) => { const { x, y } = toXY(angleAt(i), radius * v / 100); return <circle key={i} cx={x} cy={y} r="3" fill="#2dd4bf" /> })}
      </svg>
      <div className="advanced-note"><b>current</b><span style={{ color: '#f59e0b' }}>--- target</span><span>6 axes · 0.91 composite</span></div>
    </AdvancedPanel>
  )
}

function SpiderGraph2() {
  const axes = ['Delhi', 'Mumbai', 'Bangalore', 'Chennai', 'Singapore', 'Dubai']
  const cx = 165, cy = 108, radius = 68
  const branchMetrics = [88, 76, 64, 48, 28, 22]
  const qaMetrics = [96, 92, 88, 82, 78, 70]
  const n = axes.length
  const toXY = (angle: number, r: number) => ({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r })
  const angleAt = (i: number) => -Math.PI / 2 + i * Math.PI * 2 / n
  const polyPoints = (values: number[]) => values.map((v, i) => { const { x, y } = toXY(angleAt(i), radius * v / 100); return `${x},${y}` }).join(' ')
  return (
    <AdvancedPanel index="17" title="Branch Performance Spider" subtitle="Volume index vs quality score by location" col="col-3">
      <svg viewBox="0 0 330 220" className="advanced-svg">
        {[.33, .66, 1].map((s) => <polygon key={s} points={axes.map((_, i) => { const { x, y } = toXY(angleAt(i), radius * s); return `${x},${y}` }).join(' ')} fill="none" stroke="#365262" strokeWidth=".7" />)}
        {axes.map((label, i) => { const { x, y } = toXY(angleAt(i), radius); const lx = cx + Math.cos(angleAt(i)) * (radius + 24); const ly = cy + Math.sin(angleAt(i)) * (radius + 24); const anchor = Math.abs(Math.sin(angleAt(i))) > 0.9 ? 'middle' : Math.cos(angleAt(i)) > 0 ? 'start' : 'end'; const dy = Math.sin(angleAt(i)) < -0.9 ? 9 : Math.sin(angleAt(i)) > 0.7 ? 14 : -6; return <g key={label}><line x1={cx} y1={cy} x2={x} y2={y} stroke="#365262" strokeWidth=".6" /><text x={lx} y={ly + dy} textAnchor={anchor} fill="#8fa9b5" fontSize="10">{label}</text></g> })}
        <polygon points={polyPoints(qaMetrics)} fill="#a78bfa" fillOpacity=".12" stroke="#a78bfa" strokeWidth="1.5" />
        <polygon points={polyPoints(branchMetrics)} fill="#60a5fa" fillOpacity=".12" stroke="#60a5fa" strokeWidth="1.5" />
        {branchMetrics.map((v, i) => { const { x, y } = toXY(angleAt(i), radius * v / 100); return <circle key={i} cx={x} cy={y} r="2.5" fill="#60a5fa" /> })}
      </svg>
      <div className="advanced-note"><b style={{ color: '#60a5fa' }}>volume</b><span style={{ color: '#a78bfa' }}>quality</span><span>6 locations</span></div>
    </AdvancedPanel>
  )
}

function RadialTree() {
  const leaves = ['ABO/Rh', 'HLA', 'HIV', 'HBV', 'HCV', 'HTLV', 'CMV', 'Syphilis']
  return <AdvancedPanel index="10" title="Assay Dependency Tree" subtitle="Release gate evidence hierarchy" col="col-2"><svg viewBox="0 0 430 190" className="advanced-svg"><path d="M50 95H128M128 95L210 45M128 95L210 145" stroke="#527081" fill="none" />{leaves.map((leaf, i) => { const x = 210 + (i % 4) * 52; const y = i < 4 ? 35 + i * 18 : 112 + (i - 4) * 18; return <g key={leaf}><path d={`M${i < 4 ? 210 : 210} ${i < 4 ? 45 : 145}L${x} ${y}`} stroke={palette[i % palette.length]} strokeOpacity=".6" fill="none" /><circle cx={x} cy={y} r="4" fill={palette[i % palette.length]} /><text x={x + 7} y={y + 3} fontSize="10">{leaf}</text></g>})}<circle cx="50" cy="95" r="22" fill="#0a1824" stroke="#2dd4bf" strokeWidth="2" /><text x="50" y="92" textAnchor="middle" fontSize="10" fill="#eaf6f8">CBU</text><text x="50" y="104" textAnchor="middle" fontSize="10" fill="#eaf6f8">release</text><circle cx="128" cy="95" r="10" fill="#172b38" stroke="#60a5fa" /><text x="128" y="99" textAnchor="middle" fontSize="10" fill="#eaf6f8">QA</text></svg></AdvancedPanel>
}

function Ridgeline() {
  return <AdvancedPanel index="11" title="Branch Ridgeline" subtitle="Collection arrival distribution by hour" col="col-3"><svg viewBox="0 0 430 190" className="advanced-svg">{['Delhi', 'Mumbai', 'Bangalore', 'Chennai', 'Hyderabad'].map((name, row) => <g key={name}><text x="4" y={30 + row * 30} fontSize="10">{name}</text><path d={`M70 ${30 + row * 30} C110 ${15 + row * 30} 125 ${42 + row * 30} 160 ${30 + row * 30} S220 ${8 + row * 30} 250 ${30 + row * 30} S330 ${48 + row * 30} 400 ${30 + row * 30}`} fill={palette[row]} fillOpacity=".17" stroke={palette[row]} strokeWidth="2" /><line x1="70" y1={30 + row * 30} x2="400" y2={30 + row * 30} stroke="#294654" /></g>)}<text x="70" y="184" fontSize="10">06:00</text><text x="365" y="184" fontSize="10">22:00</text></svg></AdvancedPanel>
}

function PhasePortrait() {
  return <AdvancedPanel index="12" title="Temperature Phase Portrait" subtitle="Excursion dynamics, not just threshold breaches" col="col-3"><svg viewBox="0 0 300 190" className="advanced-svg"><path d="M34 160V22M34 160H280" stroke="#527081" /><text x="150" y="184" textAnchor="middle" fontSize="10">temperature drift</text><text x="10" y="95" transform="rotate(-90 10 95)" fontSize="10">recovery rate</text>{Array.from({ length: 90 }, (_, i) => { const x = 42 + (i * 29) % 225; const y = 42 + (i * 53) % 102; return <circle key={i} cx={x} cy={y} r={i % 13 === 0 ? 4 : 2} fill={palette[i % palette.length]} opacity=".8" />})}<path d="M45 137 C95 115 120 75 155 88 S220 120 266 49" fill="none" stroke="#f59e0b" strokeWidth="2" /></svg></AdvancedPanel>
}

function Hexbin() {
  return <AdvancedPanel index="13" title="Collection Density Hexbin" subtitle="Branch volume × report completeness" col="col-1"><svg viewBox="0 0 430 190" className="advanced-svg">{Array.from({ length: 42 }, (_, i) => { const col = i % 7; const row = Math.floor(i / 7); const x = 55 + col * 48 + (row % 2) * 24; const y = 32 + row * 25; return <polygon key={i} points={`${x},${y - 11} ${x + 20},${y - 5} ${x + 20},${y + 7} ${x},${y + 13} ${x - 20},${y + 7} ${x - 20},${y - 5}`} fill={palette[(i + row) % palette.length]} fillOpacity={.18 + (i % 6) / 10} />})}<path d="M35 160H395M35 160V20" stroke="#527081" /><text x="190" y="184" textAnchor="middle" fontSize="10">collection volume</text><text x="13" y="95" transform="rotate(-90 13 95)" fontSize="10">report completeness</text></svg></AdvancedPanel>
}

function BumpChart() {
  const names = ['Mumbai', 'Delhi', 'Bangalore', 'Chennai', 'Hyderabad']
  return <AdvancedPanel index="14" title="Branch Rank Bump Chart" subtitle="Quality-adjusted operating rank over six periods" col="col-3"><svg viewBox="0 0 430 190" className="advanced-svg">{[0,1,2,3,4].map((row) => <polyline key={row} points={[0,1,2,3,4,5].map((x) => `${60 + x * 70},${28 + ((row + x * (row + 2)) % 5) * 28}`).join(' ')} fill="none" stroke={palette[row]} strokeWidth="3" />)}{names.map((name, i) => <text key={name} x="4" y={34 + i * 28} fontSize="10">{name}</text>)}{[1,2,3,4,5,6].map((period, i) => <text key={period} x={60 + i * 70} y="180" textAnchor="middle" fontSize="10">P{period}</text>)}</svg></AdvancedPanel>
}

function PolarRose() {
  return <AdvancedPanel index="18" title="Collection Hour Polar Rose" subtitle="Arrival intensity by hour and branch" col="col-3"><svg viewBox="0 0 250 190" className="advanced-svg"><g transform="translate(125 92)">{Array.from({ length: 24 }, (_, i) => { const angle = i * Math.PI * 2 / 24; const length = 28 + (i * 17) % 56; return <path key={i} d={`M0 0L${Math.cos(angle - .05) * length} ${Math.sin(angle - .05) * length}L${Math.cos(angle + .05) * length} ${Math.sin(angle + .05) * length}Z`} fill={palette[i % palette.length]} fillOpacity=".65" />})}<circle r="24" fill="#091722" stroke="#2a5461" /><text y="3" textAnchor="middle" fill="white" fontSize="10">24h</text></g><text x="125" y="182" textAnchor="middle" fontSize="10">peak intake window · 06:00–10:00</text></svg></AdvancedPanel>
}

function Ternary() {
  return <AdvancedPanel index="15" title="CBU Suitability Ternary" subtitle="Viability / TNC / contamination trade-off" col="col-1"><svg viewBox="0 0 300 190" className="advanced-svg"><polygon points="150,20 30,160 270,160" fill="none" stroke="#527081" /><text x="150" y="14" textAnchor="middle" fontSize="10">viability</text><text x="25" y="176" fontSize="10">TNC yield</text><text x="275" y="176" textAnchor="end" fontSize="10">cleanliness</text>{Array.from({ length: 55 }, (_, i) => { const a = (i * 31) % 100; const b = (i * 17) % (100 - a); const c = 100 - a - b; const x = (150 * a + 30 * b + 270 * c) / 100; const y = (20 * a + 160 * b + 160 * c) / 100; return <circle key={i} cx={x} cy={y} r="2.5" fill={palette[i % palette.length]} />})}<circle cx="150" cy="92" r="6" fill="#fff" /><text x="160" y="96" fill="#dceaf0" fontSize="10">selected CBU</text></svg></AdvancedPanel>
}

function Waterfall() {
  const steps = [{ label: 'Collected', value: 100 }, { label: 'Identity', value: -3 }, { label: 'Processing', value: -8 }, { label: 'Testing', value: -4 }, { label: 'Cryo', value: -1 }, { label: 'Release', value: 84 }]
  let running = 0
  return <AdvancedPanel index="16" title="Custody Yield Waterfall" subtitle="Where units leave the operating funnel" col="col-1"><svg viewBox="0 0 430 190" className="advanced-svg"><line x1="25" y1="160" x2="410" y2="160" stroke="#527081" />{steps.map((step, i) => { const start = running; running += step.value; const height = Math.abs(step.value) * 1.05; const x = 35 + i * 64; const y = step.value > 0 ? 160 - height : 160 - start * 1.05; return <g key={step.label}><rect x={x} y={y} width="36" height={height} fill={step.value < 0 ? '#fb7185' : '#2dd4bf'} fillOpacity=".75" /><text x={x + 18} y="178" textAnchor="middle" fontSize="10">{step.label}</text><text x={x + 18} y={y - 5} textAnchor="middle" fontSize="10">{step.value > 0 ? `${step.value}%` : step.value}</text></g>})}</svg></AdvancedPanel>
}

export function StemCyteAdvancedVisuals() {
  return <><SpiderGraph1 /><RadialTree /><Ridgeline /><PhasePortrait /><Hexbin /><BumpChart /><SpiderGraph2 /><Ternary /><Waterfall /><PolarRose /></>
}

export { SpiderGraph1, RadialTree, Ridgeline, PhasePortrait, Hexbin, BumpChart, SpiderGraph2, Ternary, Waterfall, PolarRose }
