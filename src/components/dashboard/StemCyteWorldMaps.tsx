import { geoNaturalEarth1, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import worldTopology from 'world-atlas/countries-110m.json'

type Point = { name: string; lon: number; lat: number; value: number; kind: 'branch' | 'lab' | 'clinic' }
type WorldTopology = { type: 'Topology'; objects: { countries: unknown }; arcs: unknown[] }

const LOCATIONS: Point[] = [
  { name: 'Delhi', lon: 77.21, lat: 28.61, value: 88, kind: 'branch' },
  { name: 'Mumbai', lon: 72.88, lat: 19.08, value: 76, kind: 'lab' },
  { name: 'Bangalore', lon: 77.59, lat: 12.97, value: 64, kind: 'lab' },
  { name: 'Chennai', lon: 80.27, lat: 13.08, value: 48, kind: 'branch' },
  { name: 'Singapore', lon: 103.82, lat: 1.35, value: 28, kind: 'clinic' },
  { name: 'Dubai', lon: 55.27, lat: 25.2, value: 22, kind: 'clinic' },
  { name: 'London', lon: -0.12, lat: 51.5, value: 15, kind: 'clinic' },
  { name: 'Toronto', lon: -79.38, lat: 43.65, value: 12, kind: 'clinic' },
  { name: 'Houston', lon: -95.37, lat: 29.76, value: 9, kind: 'clinic' },
]

const NETWORK_ARCS: Array<[number, number, number]> = [
  [0, 1, 76], [0, 3, 48], [1, 2, 64], [2, 4, 28],
  [1, 5, 22], [0, 6, 15], [2, 7, 12], [1, 8, 9],
]

const CUSTODY_ROUTES: Array<[number, number, number, string]> = [
  [0, 1, 82, 'primary'], [1, 2, 64, 'primary'], [2, 4, 38, 'export'],
  [0, 5, 26, 'export'], [1, 6, 18, 'export'], [2, 7, 14, 'secondary'],
  [3, 1, 52, 'primary'], [0, 8, 11, 'secondary'],
]

const LABEL_POS: Array<{ x: number; y: number; anchor: 'start' | 'end' }> = [
  { x: 432, y: 56, anchor: 'start' },   // Delhi
  { x: 364, y: 94, anchor: 'end' },     // Mumbai
  { x: 388, y: 124, anchor: 'end' },    // Bangalore
  { x: 474, y: 72, anchor: 'start' },   // Chennai
  { x: 478, y: 140, anchor: 'start' },  // Singapore
  { x: 420, y: 108, anchor: 'start' },  // Dubai
  { x: 322, y: 16, anchor: 'start' },   // London
  { x: 208, y: 14, anchor: 'start' },   // Toronto
  { x: 150, y: 92, anchor: 'end' },     // Houston
]

function PointDots({ projection, radius, color }: { projection: ReturnType<typeof geoNaturalEarth1>; radius: (p: Point, idx: number) => number; color: (p: Point) => string }) {
  return <>{LOCATIONS.map((p, i) => {
    const proj = projection([p.lon, p.lat])
    if (!proj) return null
    const [x, y] = proj
    const r = radius(p, i)
    const c = color(p)
    const lp = LABEL_POS[i]
    const lx = lp.anchor === 'end' ? lp.x - 4 : lp.x + 4
    return (
      <g key={p.name}>
        <line x1={x} y1={y} x2={lx} y2={lp.y + 3} stroke={c} strokeOpacity=".4" strokeWidth=".8" />
        <text x={lp.x} y={lp.y} textAnchor={lp.anchor} fill="currentColor" fontSize="10">{p.name}</text>
        <circle cx={x} cy={y} r={r + 5} fill={c} fillOpacity=".12" />
        <circle cx={x} cy={y} r={r} fill={c} />
      </g>
    )
  })}</>
}

function getFeatures() {
  const topo = worldTopology as unknown as WorldTopology
  return feature(topo as never, topo.objects.countries as never) as unknown as {
    features: Array<{ id?: string; geometry?: unknown; properties?: unknown }>
  }
}

function WorldBase({ projection }: { projection: ReturnType<typeof geoNaturalEarth1> }) {
  const path = geoPath(projection)
  return (
    <g>
      {getFeatures().features.map((c, i) => {
        const d = path(c as never)
        return d ? <path key={c.id ?? i} d={d} className="map-country" strokeWidth=".45" /> : null
      })}
    </g>
  )
}

function Panel({ index, title, subtitle, children, col }: { index: string; title: string; subtitle: string; children: React.ReactNode; col: string }) {
  return (
    <section className={`ref-panel ${col}`}>
      <div className="ref-panel-head">
        <div><span className="ref-index">{index}.</span><h2>{title}</h2><p>{subtitle}</p></div>
        <span className="ref-panel-dot" />
      </div>
      {children}
    </section>
  )
}

const NETWORK_DEGREE = [3, 4, 3, 1, 1, 1, 1, 1, 1]

function WorldConnectionMap() {
  const projection = geoNaturalEarth1().fitSize([640, 220], getFeatures() as never)
  const nodeColor = (p: Point) => (p.kind === 'branch' ? '#2dd4bf' : p.kind === 'lab' ? '#60a5fa' : '#f59e0b')
  return (
    <Panel index="G1" title="Global Branch-to-Clinic Network" subtitle="Bidirectional branch-to-lab → clinic connections; node size = link count" col="col-2">
      <svg viewBox="0 0 640 220" className="world-map-svg">
        <WorldBase projection={projection} />
        {NETWORK_ARCS.map(([fi, ti, val], i) => {
          const s = projection([LOCATIONS[fi].lon, LOCATIONS[fi].lat])
          const e = projection([LOCATIONS[ti].lon, LOCATIONS[ti].lat])
          if (!s || !e) return null
          const [x1, y1] = s; const [x2, y2] = e
          const curve = Math.max(14, Math.min(56, Math.abs(x2 - x1) * .2))
          return <path key={i} d={`M${x1} ${y1} Q${(x1 + x2) / 2} ${Math.min(y1, y2) - curve} ${x2} ${y2}`} fill="none" stroke="#8aa7b6" strokeWidth={Math.max(1, val / 22)} strokeOpacity=".45" />
        })}
        <PointDots projection={projection} radius={(p, idx) => 3.5 + NETWORK_DEGREE[idx] * 1.5} color={nodeColor} />
      </svg>
      <div className="ref-legend">
        <span><i className="dot teal" /> branch hub</span>
        <span><i className="dot" style={{ background: '#60a5fa' }} /> processing lab</span>
        <span><i className="dot" style={{ background: '#f59e0b' }} /> clinical partner</span>
      </div>
    </Panel>
  )
}

function CustodyMovementMap() {
  const projection = geoNaturalEarth1().fitSize([640, 220], getFeatures() as never)
  return (
    <Panel index="G3" title="Specimen Custody Movement" subtitle="Directed CBU handoffs along the collection → lab → clinic custody chain" col="col-2">
      <svg viewBox="0 0 640 220" className="world-map-svg">
        <defs>
          <marker id="arrow-teal" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#2dd4bf" /></marker>
          <marker id="arrow-purple" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#a78bfa" /></marker>
          <marker id="arrow-blue" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#60a5fa" /></marker>
        </defs>
        <WorldBase projection={projection} />
        {CUSTODY_ROUTES.map(([fi, ti, val, kind], i) => {
          const s = projection([LOCATIONS[fi].lon, LOCATIONS[fi].lat])
          const e = projection([LOCATIONS[ti].lon, LOCATIONS[ti].lat])
          if (!s || !e) return null
          const [x1, y1] = s; const [x2, y2] = e
          const curve = Math.max(12, Math.min(52, Math.abs(x2 - x1) * .22))
          const cx = (x1 + x2) / 2
          const cy = Math.min(y1, y2) - curve
          const entry = [-Math.PI / 2, Math.PI / 2, 1.0, 0.3, -0.5, -1.4, Math.PI / 2, -2.3][i]
          const back = (LOCATIONS[ti].kind === 'clinic' ? 4 : 5) + 4
          const ex = x2 + Math.cos(entry) * back
          const ey = y2 + Math.sin(entry) * back
          const color = kind === 'primary' ? '#2dd4bf' : kind === 'export' ? '#a78bfa' : '#60a5fa'
          const arrow = kind === 'primary' ? 'arrow-teal' : kind === 'export' ? 'arrow-purple' : 'arrow-blue'
          return <path key={i} d={`M${x1} ${y1} Q${cx} ${cy} ${ex} ${ey}`} fill="none" stroke={color} strokeWidth={Math.max(1, val / 14)} strokeOpacity=".55" strokeDasharray={kind === 'secondary' ? '3 3' : undefined} markerEnd={`url(#${arrow})`} />
        })}
        <PointDots projection={projection} radius={(p) => p.kind === 'clinic' ? 4 : 5} color={(p) => p.kind === 'clinic' ? '#f59e0b' : '#2dd4bf'} />
      </svg>
      <div className="ref-footer-metric">
        <span>Median handoff</span><strong>9h 37m</strong>
        <span>Custody integrity</span><strong className="accent-text">98.4%</strong>
      </div>
    </Panel>
  )
}

function RiskDensityMap() {
  const projection = geoNaturalEarth1().fitSize([640, 220], getFeatures() as never)
  const riskValues = [42, 38, 56, 24, 12, 18, 8, 6, 4]
  return (
    <Panel index="G2" title="Operational Risk Density" subtitle="Risk index concentration across global facilities" col="col-2">
      <svg viewBox="0 0 640 220" className="world-map-svg">
        <WorldBase projection={projection} />
        {LOCATIONS.map((p, i) => {
          const proj = projection([p.lon, p.lat])
          if (!proj) return null
          const [x, y] = proj
          const risk = riskValues[i]
          const radius = 6 + risk / 10
          const color = risk > 40 ? '#fb7185' : risk > 20 ? '#f59e0b' : '#2dd4bf'
          const lp = LABEL_POS[i]
          const lx = lp.anchor === 'end' ? lp.x - 4 : lp.x + 4
          return (
            <g key={p.name}>
              <line x1={x} y1={y} x2={lx} y2={lp.y + 4} stroke={color} strokeOpacity=".55" strokeWidth=".9" />
              <circle cx={x} cy={y} r={radius} fill={color} fillOpacity=".08" stroke={color} strokeOpacity=".25" strokeDasharray="2 2" />
              <circle cx={x} cy={y} r={Math.max(3, radius * .42)} fill={color} fillOpacity=".65" />
              <text x={lp.x} y={lp.y} textAnchor={lp.anchor} fill="currentColor" fontSize="10">{p.name}</text>
              <text x={lp.x} y={lp.y + 12} textAnchor={lp.anchor} fill={color} fontSize="11" fontWeight="700">risk {risk}</text>
            </g>
          )
        })}
      </svg>
      <div className="ref-legend">
        <span><i className="dot" style={{ background: '#2dd4bf' }} /> low (0-20)</span>
        <span><i className="dot" style={{ background: '#f59e0b' }} /> review (20-40)</span>
        <span><i className="dot pink" /> intervention (40+)</span>
      </div>
    </Panel>
  )
}

export { WorldConnectionMap, CustodyMovementMap, RiskDensityMap }
