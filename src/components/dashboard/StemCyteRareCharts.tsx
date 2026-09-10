const palette = ['#2dd4bf', '#60a5fa', '#a78bfa', '#f59e0b', '#fb7185']

function RarePanel({ index, title, subtitle, children, col }: { index: string; title: string; subtitle: string; children: React.ReactNode; col: string }) {
  return <section className={`advanced-panel ${col}`}><header><span>{index}</span><div><h3>{title}</h3><p>{subtitle}</p></div></header>{children}</section>
}

/* ── 19 · Chord Diagram ────────────────────────────────────────────────────── */
function ChordDiagram() {
  const facilities = ['Delhi', 'Mumbai', 'Chennai', 'Bangalore', 'Singapore', 'Dubai']
  const n = facilities.length
  const cx = 100, cy = 95, R = 55, arcWidth = 9
  const gap = 0.09

  const transfers = [
    [0, 18, 12, 8, 5, 3],
    [15, 0, 14, 10, 7, 4],
    [11, 13, 0, 16, 6, 2],
    [7, 9, 15, 0, 8, 5],
    [4, 6, 5, 7, 0, 10],
    [3, 4, 2, 4, 9, 0],
  ]

  const totalTransfer = transfers.flat().reduce((a, b) => a + b, 0)
  const outflows = transfers.map(row => row.reduce((a, b) => a + b, 0))
  const arcAngles = outflows.map(o => (o / totalTransfer) * (2 * Math.PI - n * gap))

  const arcs: { start: number; end: number; mid: number }[] = []
  let cumAngle = -Math.PI / 2
  for (let i = 0; i < n; i++) {
    const start = cumAngle
    const end = cumAngle + arcAngles[i]
    arcs.push({ start, end, mid: (start + end) / 2 })
    cumAngle = end + gap
  }

  const chords: { x1: number; y1: number; x2: number; y2: number; color: string; width: number }[] = []
  const offsets = Array.from({ length: n }, () => 0)

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const vi = transfers[i][j], vj = transfers[j][i]
      const total = vi + vj
      const ai = arcs[i], aj = arcs[j]
      const spanI = (vi / outflows[i]) * arcAngles[i]
      const spanJ = (vj / outflows[j]) * arcAngles[j]
      const startI = ai.start + offsets[i]
      const startJ = aj.start + offsets[j]
      offsets[i] += spanI
      offsets[j] += spanJ
      const sx = cx + Math.cos(startI + spanI / 2) * (R - arcWidth / 2)
      const sy = cy + Math.sin(startI + spanI / 2) * (R - arcWidth / 2)
      const ex = cx + Math.cos(startJ + spanJ / 2) * (R - arcWidth / 2)
      const ey = cy + Math.sin(startJ + spanJ / 2) * (R - arcWidth / 2)
      chords.push({ x1: sx, y1: sy, x2: ex, y2: ey, color: palette[i], width: Math.max(2.5, (total / 30) * 6) })
    }
  }

  return (
    <RarePanel index="19" title="Inter-Facility Chord Diagram" subtitle="Bidirectional specimen transfer volume between StemCyte hubs" col="col-3">
        <svg viewBox="0 0 200 200" className="advanced-svg">
        <g transform="translate(0, 4)">
          {arcs.map((arc, i) => {
            const x1 = cx + Math.cos(arc.start) * R, y1 = cy + Math.sin(arc.start) * R
            const x2 = cx + Math.cos(arc.end) * R, y2 = cy + Math.sin(arc.end) * R
            const x3 = cx + Math.cos(arc.end) * (R - arcWidth), y3 = cy + Math.sin(arc.end) * (R - arcWidth)
            const x4 = cx + Math.cos(arc.start) * (R - arcWidth), y4 = cy + Math.sin(arc.start) * (R - arcWidth)
            const largeArc = arc.end - arc.start > Math.PI ? 1 : 0
            const labelR = R + 19
            const lx = cx + Math.cos(arc.mid) * labelR
            const ly = cy + Math.sin(arc.mid) * labelR
            return (
              <g key={i}>
                <path d={`M${x1} ${y1} A${R} ${R} 0 ${largeArc} 1 ${x2} ${y2} L${x3} ${y3} A${R - arcWidth} ${R - arcWidth} 0 ${largeArc} 0 ${x4} ${y4} Z`}
                  fill={palette[i]} fillOpacity=".75" />
                <text x={lx} y={ly + 4} textAnchor="middle" fill="#8fa9b5" fontSize="8">{facilities[i]}</text>
              </g>
            )
          })}

          {chords.map((ch, i) => {
            const mx = (ch.x1 + ch.x2) / 2 + (cx - (ch.x1 + ch.x2) / 2) * 0.35
            const my = (ch.y1 + ch.y2) / 2 + (cy - (ch.y1 + ch.y2) / 2) * 0.35
            return (
              <path key={i}
                d={`M${ch.x1} ${ch.y1} C${mx} ${my} ${mx} ${my} ${ch.x2} ${ch.y2}`}
                stroke={ch.color} strokeWidth={ch.width} strokeOpacity=".3" fill="none" />
            )
          })}

          <circle cx={cx} cy={cy} r="20" fill="#091722" stroke="#2a5461" strokeWidth="1.5" />
          <text x={cx} y={cy - 2} textAnchor="middle" fill="#eaf6f8" fontSize="11" fontWeight="700">487</text>
          <text x={cx} y={cy + 10} textAnchor="middle" fill="#8fa9b5" fontSize="10">transfers</text>
        </g>
      </svg>
      <div className="advanced-note"><b>6 hubs</b><span>15 bidirectional links</span><span>268 specimens/mo</span></div>
    </RarePanel>
  )
}

/* ── 20 · Parallel Coordinates ──────────────────────────────────────────────── */
function ParallelCoordinates() {
  const axes = ['DNA integrity', 'RNA quality', 'Protein yield', 'Viability', 'Sterility', 'TNC count']
  const nAxes = axes.length
  const left = 30, right = 178, top = 18, bottom = 140
  const step = (right - left) / (nAxes - 1)

  const batches = [
    { values: [92, 88, 76, 95, 99, 82], color: '#2dd4bf' },
    { values: [85, 72, 88, 91, 96, 74], color: '#60a5fa' },
    { values: [78, 94, 82, 88, 91, 68], color: '#a78bfa' },
    { values: [96, 90, 71, 97, 100, 89], color: '#f59e0b' },
    { values: [68, 65, 94, 82, 88, 91], color: '#fb7185' },
    { values: [88, 82, 85, 90, 94, 78], color: '#2dd4bf' },
    { values: [72, 78, 68, 75, 82, 62], color: '#60a5fa' },
    { values: [90, 86, 90, 93, 97, 85], color: '#a78bfa' },
  ]

  const getY = (val: number) => bottom - (val / 100) * (bottom - top)

  return (
    <RarePanel index="20" title="Parallel Coordinates QC" subtitle="Multivariate quality profile across six assay dimensions per batch" col="col-1">
      <svg viewBox="0 0 210 190" className="advanced-svg">
        <g transform="translate(0, 2)">
          <rect x={left - 2} y={getY(100)} width={right - left + 4} height={getY(70) - getY(100)} fill="#2dd4bf" fillOpacity=".04" rx="2" />

          {axes.map((label, i) => {
            const x = left + i * step
            return (
              <g key={i}>
                <line x1={x} y1={top} x2={x} y2={bottom} stroke="#365262" strokeWidth="1" />
                {[0, 25, 50, 75, 100].map(v => (
                  <g key={v}>
                    <line x1={x - 3} y1={getY(v)} x2={x + 3} y2={getY(v)} stroke="#365262" strokeWidth=".5" />
                    {i === 0 && <text x={left - 7} y={getY(v) + 3} textAnchor="end" fill="#8fa9b5" fontSize="10">{v}</text>}
                  </g>
                ))}
                <text x={x} y={bottom + 14} textAnchor="middle" fill="#8fa9b5" fontSize="8.5" transform={`rotate(-32 ${x} ${bottom + 14})`}>{label}</text>
              </g>
            )
          })}

          {batches.map((batch, bi) => {
            const points = batch.values.map((v, i) => `${left + i * step},${getY(v)}`).join(' ')
            return (
              <g key={bi}>
                <polyline points={points} fill="none" stroke={batch.color} strokeWidth="1.5" strokeOpacity=".55" />
                {batch.values.map((v, i) => (
                  <circle key={i} cx={left + i * step} cy={getY(v)} r="2.5" fill={batch.color} />
                ))}
              </g>
            )
          })}

          <text x={right + 5} y={getY(85)} fill="#2dd4bf" fontSize="9">PASS</text>
        </g>
      </svg>
      <div className="advanced-note"><b>8 batches</b><span>6 dimensions</span><span>all within ±2σ</span></div>
    </RarePanel>
  )
}

/* ── 21 · Streamgraph ───────────────────────────────────────────────────────── */
function Streamgraph() {
  const stages = ['Collected', 'Processing', 'Testing', 'Cryo-stored', 'Released']
  const colors = ['#2dd4bf', '#60a5fa', '#a78bfa', '#f59e0b', '#fb7185']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const n = months.length
  const left = 40, right = 390, top = 8, bottom = 142
  const midY = (top + bottom) / 2

  const layerData = stages.map((_, si) =>
    months.map((_, mi) => 8 + si * 4 + Math.sin(mi * 0.8 + si * 1.2) * 6 + (mi > 4 && mi < 9 ? 4 : 0) + ((si * 7 + mi * 3) % 5))
  )
  const totals = months.map((_, mi) => layerData.reduce((sum, layer) => sum + layer[mi], 0))
  const upperLayers: number[][] = []
  const lowerLayers: number[][] = []

  for (let si = 0; si < stages.length; si++) {
    upperLayers[si] = months.map((_, mi) => midY - (totals[mi] / 2) + layerData.slice(0, si).reduce((sum, l) => sum + l[mi], 0))
    lowerLayers[si] = months.map((_, mi) => midY - (totals[mi] / 2) + layerData.slice(0, si + 1).reduce((sum, l) => sum + l[mi], 0))
  }

  const getX = (i: number) => left + (i / (n - 1)) * (right - left)

  const makePath = (upper: number[], lower: number[]) => {
    let d = `M${getX(0)} ${upper[0]}`
    for (let i = 1; i < n; i++) {
      const cpx1 = getX(i - 1) + (getX(i) - getX(i - 1)) * 0.5
      const cpx2 = getX(i) - (getX(i) - getX(i - 1)) * 0.5
      d += ` C${cpx1} ${upper[i - 1]} ${cpx2} ${upper[i]} ${getX(i)} ${upper[i]}`
    }
    for (let i = n - 1; i >= 0; i--) {
      if (i < n - 1) {
        const cpx1 = getX(i + 1) - (getX(i + 1) - getX(i)) * 0.5
        const cpx2 = getX(i) + (getX(i + 1) - getX(i)) * 0.5
        d += ` C${cpx1} ${lower[i + 1]} ${cpx2} ${lower[i]} ${getX(i)} ${lower[i]}`
      }
    }
    return d + 'Z'
  }

  return (
    <RarePanel index="21" title="Custody Streamgraph" subtitle="Specimen volume flow through processing stages over 12 months" col="col-2">
      <svg viewBox="0 0 420 190" className="advanced-svg">
        <g transform="translate(0, 2)">
          <line x1={left} y1={midY} x2={right} y2={midY} stroke="#365262" strokeWidth=".5" strokeDasharray="3 3" />

          {stages.map((_, si) => (
            <path key={si} d={makePath(upperLayers[si], lowerLayers[si])}
              fill={colors[si]} fillOpacity=".5" stroke={colors[si]} strokeWidth=".5" strokeOpacity=".3" />
          ))}

          {months.map((m, i) => (
            <text key={m} x={getX(i)} y={bottom + 14} textAnchor="middle" fill="#8fa9b5" fontSize="10">{m}</text>
          ))}

          {stages.map((s, i) => (
            <g key={s} transform={`translate(${40 + i * 76}, ${bottom + 28})`}>
              <rect width="8" height="6" rx="1" fill={colors[i]} fillOpacity=".7" />
              <text x="10" y="-1" fill="#8fa9b5" fontSize="10">{s}</text>
            </g>
          ))}
        </g>
      </svg>
      <div className="advanced-note"><b>5 stages</b><span>12-month window</span><span>wiggle-minimised baseline</span></div>
    </RarePanel>
  )
}

/* ── 22 · Force-Directed Network Graph ──────────────────────────────────────── */
function ForceNetwork() {
  const nodes = [
    { x: 100, y: 95, r: 20, label: 'CBU\nRelease', color: '#2dd4bf' },
    { x: 55, y: 40, r: 13, label: 'ABO/Rh', color: '#60a5fa' },
    { x: 145, y: 40, r: 13, label: 'HLA Typing', color: '#60a5fa' },
    { x: 45, y: 150, r: 11, label: 'HIV Screen', color: '#a78bfa' },
    { x: 85, y: 168, r: 11, label: 'HBV PCR', color: '#a78bfa' },
    { x: 125, y: 168, r: 11, label: 'HCV Ab', color: '#a78bfa' },
    { x: 165, y: 150, r: 11, label: 'CMV IgG', color: '#a78bfa' },
    { x: 45, y: 80, r: 10, label: 'Cell Count', color: '#f59e0b' },
    { x: 155, y: 80, r: 10, label: 'Viability', color: '#f59e0b' },
    { x: 27, y: 118, r: 8, label: 'Sterility', color: '#fb7185' },
    { x: 173, y: 118, r: 8, label: 'Mycoplasma', color: '#fb7185' },
  ]

  const edges = [
    [0, 1, 3], [0, 2, 3], [0, 7, 2], [0, 8, 2],
    [1, 7, 1.5], [2, 8, 1.5], [3, 9, 1], [4, 9, 1],
    [5, 9, 1], [6, 10, 1], [7, 8, 1.2],
    [3, 4, .8], [4, 5, .8], [5, 6, .8],
    [1, 3, .6], [2, 6, .6],
  ]

  return (
    <RarePanel index="22" title="Assay Dependency Network" subtitle="Co-occurrence and sequential release-gate relationships" col="col-3">
      <svg viewBox="0 0 200 190" className="advanced-svg">
        <g transform="translate(0, 2)">
          {edges.map(([from, to, weight], i) => {
            const a = nodes[from], b = nodes[to]
            const dx = b.x - a.x, dy = b.y - a.y
            const dist = Math.sqrt(dx * dx + dy * dy)
            const sx = a.x + (dx / dist) * a.r
            const sy = a.y + (dy / dist) * a.r
            const ex = b.x - (dx / dist) * b.r
            const ey = b.y - (dy / dist) * b.r
            const mx = (sx + ex) / 2 + (dy / dist) * 8
            const my = (sy + ey) / 2 - (dx / dist) * 8
            return (
              <path key={i}
                d={`M${sx} ${sy} Q${mx} ${my} ${ex} ${ey}`}
                stroke="#3a5c6e" strokeWidth={weight * 1.1} strokeOpacity=".45" fill="none" />
            )
          })}

          {nodes.map((node, i) => (
            <g key={i}>
              <circle cx={node.x} cy={node.y} r={node.r + 4} fill={node.color} fillOpacity=".07" />
              <circle cx={node.x} cy={node.y} r={node.r} fill="#0b1a24" stroke={node.color} strokeWidth="1.5" />
              {node.label.split('\n').map((line, li, arr) => (
                <text key={li} x={node.x} y={node.y + (li - (arr.length - 1) / 2) * 9 + 3}
                  textAnchor="middle" fill={node.color} fontSize="8">
                  {line}
                </text>
              ))}
            </g>
          ))}
        </g>
      </svg>
      <div className="advanced-note"><b>11 nodes</b><span>16 edges</span><span>centrality: CBU Release</span></div>
    </RarePanel>
  )
}

/* ── 23 · Voronoi Treemap ───────────────────────────────────────────────────── */
function VoronoiTreemap() {
  const cells = [
    { path: 'M5 8 L68 5 L77 52 L9 49 Z', fill: '#2dd4bf', label: 'Tank 42', value: '86%' },
    { path: 'M79 3 L142 6 L138 46 L77 50 Z', fill: '#60a5fa', label: 'Tank 18', value: '74%' },
    { path: 'M144 4 L195 9 L192 41 L140 44 Z', fill: '#a78bfa', label: 'Tank 07', value: '62%' },
    { path: 'M7 54 L72 57 L74 98 L10 95 Z', fill: '#f59e0b', label: 'Tank 03', value: '41%' },
    { path: 'M76 52 L134 50 L130 94 L78 96 Z', fill: '#fb7185', label: 'Tank 11', value: '38%' },
    { path: 'M136 46 L194 43 L190 90 L132 93 Z', fill: '#2dd4bf', label: 'Tank 24', value: '55%' },
    { path: 'M9 100 L73 102 L70 132 L12 130 Z', fill: '#60a5fa', label: 'Tank 30', value: '29%' },
    { path: 'M74 100 L132 98 L128 130 L72 132 Z', fill: '#a78bfa', label: 'Tank 15', value: '33%' },
    { path: 'M134 95 L192 92 L188 128 L130 130 Z', fill: '#f59e0b', label: 'Tank 09', value: '47%' },
  ]

  return (
    <RarePanel index="23" title="Storage Voronoi Treemap" subtitle="Hierarchical space partitioning by specimen density and utilisation" col="col-1">
      <svg viewBox="0 0 200 190" className="advanced-svg">
        <g transform="translate(2, 2)">
          {cells.map((cell, i) => {
            const nums = cell.path.match(/[\d.]+/g)!.map(Number)
            const cellCx = (nums[0] + nums[2] + nums[4] + nums[6]) / 4
            const cellCy = (nums[1] + nums[3] + nums[5] + nums[7]) / 4
            return (
              <g key={i}>
                <path d={cell.path} fill={cell.fill} fillOpacity=".2" stroke={cell.fill} strokeWidth="1" strokeOpacity=".5" />
                <text x={cellCx} y={cellCy - 4} textAnchor="middle" fill={cell.fill} fontSize="10">{cell.label}</text>
                <text x={cellCx} y={cellCy + 10} textAnchor="middle" fill="#eaf6f8" fontSize="11" fontWeight="700">{cell.value}</text>
              </g>
            )
          })}
        </g>
      </svg>
      <div className="advanced-note"><b>9 tanks</b><span>1,247,890 specimens</span><span>62.4% avg utilisation</span></div>
    </RarePanel>
  )
}

/* ── 24 · Connected Scatterplot ─────────────────────────────────────────────── */
function ConnectedScatter() {
  const left = 32, right = 185, top = 16, bottom = 152
  const getX = (v: number) => left + (v / 100) * (right - left)
  const getY = (v: number) => bottom - (v / 100) * (bottom - top)

  const trajectory1 = [
    [20, 90], [28, 85], [35, 78], [42, 68], [48, 55], [52, 42], [54, 35],
    [50, 38], [44, 50], [38, 62], [32, 72], [28, 80], [25, 86], [22, 89],
    [20, 91], [19, 92], [18, 93], [18, 92], [19, 91], [20, 90],
  ]
  const trajectory2 = [
    [55, 88], [60, 82], [65, 74], [68, 65], [70, 58], [72, 52], [73, 48],
    [72, 50], [70, 55], [67, 60], [63, 66], [60, 72], [58, 76], [56, 80],
    [55, 82], [54, 84], [54, 85], [55, 84], [56, 83], [55, 82],
  ]

  return (
    <RarePanel index="24" title="Temperature Phase Portrait" subtitle="Excursion dynamics: drift velocity × recovery rate over time" col="col-3">
      <svg viewBox="0 0 200 190" className="advanced-svg">
        <g transform="translate(0, 4)">
          <line x1={left} y1={top} x2={left} y2={bottom} stroke="#527081" />
          <line x1={left} y1={bottom} x2={right} y2={bottom} stroke="#527081" />
          <text x={(left + right) / 2} y={bottom + 20} textAnchor="middle" fill="#8fa9b5" fontSize="9">drift (°C/hr)</text>
          <text x="8" y={(top + bottom) / 2} textAnchor="middle" fill="#8fa9b5" fontSize="9" transform={`rotate(-90 8 ${(top + bottom) / 2})`}>recovery</text>

          {[20, 40, 60, 80].map(v => (
            <g key={v}>
              <line x1={getX(v)} y1={top} x2={getX(v)} y2={bottom} stroke="#2b4656" strokeWidth=".4" />
              <line x1={left} y1={getY(v)} x2={right} y2={getY(v)} stroke="#2b4656" strokeWidth=".4" />
            </g>
          ))}

          <rect x={getX(50)} y={top} width={right - getX(50)} height={getY(60) - top} fill="#fb7185" fillOpacity=".05" rx="2" />
          <text x={getX(68)} y={top + 12} textAnchor="middle" fill="#fb7185" fillOpacity=".6" fontSize="8">EXCURSION</text>

          {[trajectory1, trajectory2].map((traj, ti) => {
            const pts = traj.map(p => `${getX(p[0])},${getY(p[1])}`).join(' ')
            const arrowIdx = Math.floor(traj.length * 0.4)
            return (
              <g key={ti}>
                <polyline points={pts} fill="none" stroke={ti === 0 ? '#2dd4bf' : '#f59e0b'} strokeWidth="2" strokeOpacity=".65" />
                {traj.map((p, i) => (
                  <circle key={i} cx={getX(p[0])} cy={getY(p[1])} r={i === 0 ? 4 : i === traj.length - 1 ? 3.5 : 1.8}
                    fill={i === 0 ? '#2dd4bf' : i === traj.length - 1 ? '#fb7185' : ti === 0 ? '#2dd4bf' : '#f59e0b'}
                    fillOpacity={i === 0 || i === traj.length - 1 ? 1 : .6} />
                ))}
                {(() => {
                  const p1 = traj[arrowIdx], p2 = traj[arrowIdx + 1]
                  const mx = getX((p1[0] + p2[0]) / 2), my = getY((p1[1] + p2[1]) / 2)
                  const angle = Math.atan2(getY(p2[1]) - getY(p1[1]), getX(p2[0]) - getX(p1[0]))
                  return <polygon points="0,-3 6,0 0,3" fill={ti === 0 ? '#2dd4bf' : '#f59e0b'}
                    transform={`translate(${mx},${my}) rotate(${angle * 180 / Math.PI})`} />
                })()}
              </g>
            )
          })}

          <text x={getX(trajectory1[0][0]) - 8} y={getY(trajectory1[0][1]) - 8} textAnchor="end" fill="#2dd4bf" fontSize="8">T₁</text>
          <text x={getX(trajectory1[trajectory1.length - 1][0]) + 5} y={getY(trajectory1[trajectory1.length - 1][1]) + 5} fill="#fb7185" fontSize="8">✓</text>
          <text x={getX(trajectory2[0][0]) + 6} y={getY(trajectory2[0][1]) - 5} fill="#f59e0b" fontSize="8">T₂</text>
          <text x={getX(trajectory2[trajectory2.length - 1][0]) - 6} y={getY(trajectory2[trajectory2.length - 1][1]) + 10} textAnchor="end" fill="#fb7185" fontSize="8">✓</text>
        </g>
      </svg>
      <div className="advanced-note"><b>2 excursions</b><span>20 time-steps each</span><span>directional arrows</span></div>
    </RarePanel>
  )
}

/* ── 25 · Circular Heatmap (Calendar) ───────────────────────────────────────── */
function CircularHeatmap() {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const cx = 100, cy = 95
  const innerR = 30, outerR = 72
  const ringWidth = (outerR - innerR) / days.length

  const intensities = [
    [72, 85, 68, 90, 78, 32, 18],
    [65, 80, 74, 88, 82, 28, 15],
    [78, 92, 82, 95, 88, 35, 22],
    [82, 88, 78, 92, 85, 30, 20],
    [88, 95, 85, 98, 92, 38, 25],
    [85, 90, 82, 96, 90, 34, 22],
    [80, 86, 78, 90, 85, 30, 18],
    [75, 82, 72, 86, 80, 26, 16],
    [70, 78, 68, 82, 76, 24, 14],
    [82, 90, 80, 94, 88, 36, 24],
    [86, 94, 84, 98, 90, 40, 28],
    [78, 88, 76, 92, 85, 33, 20],
  ]

  const getColor = (val: number) => {
    if (val > 90) return '#2dd4bf'
    if (val > 80) return '#60a5fa'
    if (val > 65) return '#a78bfa'
    if (val > 40) return '#f59e0b'
    return '#fb7185'
  }

  const cellAngle = (Math.PI * 2) / 12
  const labelR = outerR + 14

  return (
    <RarePanel index="25" title="Circular Collection Heatmap" subtitle="Year-round intake intensity by month and day-of-week" col="col-1">
      <svg viewBox="0 0 200 190" className="advanced-svg">
        <g transform="translate(0, 0)">
          {months.map((_, mi) => {
            const startAngle = mi * cellAngle - Math.PI / 2
            const endAngle = startAngle + cellAngle
            return days.map((_, di) => {
              const r1 = innerR + di * ringWidth
              const r2 = r1 + ringWidth - 1
              const x1 = cx + Math.cos(startAngle) * r1, y1 = cy + Math.sin(startAngle) * r1
              const x2 = cx + Math.cos(startAngle) * r2, y2 = cy + Math.sin(startAngle) * r2
              const x3 = cx + Math.cos(endAngle) * r2, y3 = cy + Math.sin(endAngle) * r2
              const x4 = cx + Math.cos(endAngle) * r1, y4 = cy + Math.sin(endAngle) * r1
              return (
                <path key={`${mi}-${di}`}
                  d={`M${x1} ${y1} L${x2} ${y2} A${r2} ${r2} 0 0 1 ${x3} ${y3} L${x4} ${y4} A${r1} ${r1} 0 0 0 ${x1} ${y1} Z`}
                  fill={getColor(intensities[mi][di])} fillOpacity={0.2 + (intensities[mi][di] / 100) * 0.6} />
              )
            })
          })}

          {months.map((m, i) => {
            const angle = (i + 0.5) * cellAngle - Math.PI / 2
            const lx = cx + Math.cos(angle) * labelR
            const ly = cy + Math.sin(angle) * labelR
            return <text key={m} x={lx} y={ly + 3} textAnchor="middle" fill="#8fa9b5" fontSize="10">{m}</text>
          })}

          <circle cx={cx} cy={cy} r={innerR - 4} fill="#091722" stroke="#2a5461" strokeWidth="1" />
          <text x={cx} y={cy - 2} textAnchor="middle" fill="#eaf6f8" fontSize="11" fontWeight="700">4,812</text>
          <text x={cx} y={cy + 10} textAnchor="middle" fill="#8fa9b5" fontSize="10">collections</text>

          {[
            { label: 'Mon', ring: 0 },
            { label: 'Thu', ring: 3 },
            { label: 'Sun', ring: 6 },
          ].map(({ label, ring }) => {
            const r = innerR + ring * ringWidth + ringWidth / 2
            return <text key={label} x={cx + 3} y={cy - r + 4} fill="#8fa9b5" fontSize="10">{label}</text>
          })}
        </g>
      </svg>
      <div className="advanced-note"><b>12 months × 7 days</b><span>peak: Thu</span><span>trough: Sun</span></div>
    </RarePanel>
  )
}

/* ── 26 · Marimekko / Mosaic Plot ───────────────────────────────────────────── */
function Marimekko() {
  const carriers = [
    { name: 'FedEx', share: 34, outcomes: [78, 14, 8] },
    { name: 'DHL', share: 26, outcomes: [82, 12, 6] },
    { name: 'UPS', share: 18, outcomes: [74, 18, 8] },
    { name: 'BlueDart', share: 14, outcomes: [68, 20, 12] },
    { name: 'Other', share: 8, outcomes: [62, 24, 14] },
  ]

  const outcomeColors = ['#2dd4bf', '#f59e0b', '#fb7185']
  const outcomeLabels = ['On-time', 'Delayed', 'Failed']

  const left = 50, right = 390, top = 20, bottom = 152
  const totalWidth = right - left
  const height = bottom - top

  let xOffset = left

  return (
    <RarePanel index="26" title="Carrier Marimekko Plot" subtitle="Market share × delivery outcome distribution (variable-width mosaic)" col="col-2">
      <svg viewBox="0 0 420 200" className="advanced-svg">
        <g transform="translate(0, 2)">
          <line x1={left} y1={bottom} x2={right} y2={bottom} stroke="#527081" />
          <line x1={left} y1={top} x2={left} y2={bottom} stroke="#527081" />

          {[0, 25, 50, 75, 100].map(v => (
            <g key={v}>
              <line x1={left - 3} y1={bottom - (v / 100) * height} x2={left} y2={bottom - (v / 100) * height} stroke="#527081" />
              <text x={left - 6} y={bottom - (v / 100) * height + 3} textAnchor="end" fill="#8fa9b5" fontSize="10">{v}%</text>
            </g>
          ))}

          {carriers.map((carrier, ci) => {
            const colWidth = (carrier.share / 100) * totalWidth
            const colX = xOffset
            xOffset += colWidth
            let yAccum = 0
            return (
              <g key={ci}>
                {carrier.outcomes.map((pct, oi) => {
                  const segHeight = (pct / 100) * height
                  const y = bottom - yAccum - segHeight
                  yAccum += segHeight
                  return (
                    <rect key={oi} x={colX + 1} y={y} width={colWidth - 2} height={segHeight}
                      fill={outcomeColors[oi]} fillOpacity=".6"
                      stroke="#091722" strokeWidth=".5" />
                  )
                })}
                <text x={colX + colWidth / 2} y={bottom + 16} textAnchor="middle" fill="#8fa9b5" fontSize="10">{carrier.name}</text>
                <text x={colX + colWidth / 2} y={bottom + 28} textAnchor="middle" fill="#8fa9b5" fontSize="10" fillOpacity=".6">{carrier.share}%</text>
                {carrier.outcomes.map((pct, oi) => {
                  const segH = (pct / 100) * height
                  let segY = bottom
                  for (let j = 0; j <= oi; j++) segY -= (carrier.outcomes[j] / 100) * height
                  if (segH > 18 && colWidth > 40) {
                    return <text key={oi} x={colX + colWidth / 2} y={segY + segH / 2 + 4} textAnchor="middle" fill="white" fontSize="10" fillOpacity=".85">{pct}%</text>
                  }
                  return null
                })}
              </g>
            )
          })}

          {outcomeLabels.map((l, i) => (
            <g key={l} transform={`translate(${left + i * 65}, ${bottom + 40})`}>
              <rect width="8" height="6" rx="1" fill={outcomeColors[i]} fillOpacity=".7" />
              <text x="10" y="-1" fill="#8fa9b5" fontSize="10">{l}</text>
            </g>
          ))}
        </g>
      </svg>
      <div className="advanced-note"><b>5 carriers</b><span>width = market share</span><span>height = outcome split</span></div>
    </RarePanel>
  )
}

/* ── 27 · Tanglegram ────────────────────────────────────────────────────────── */
function Tanglegram() {
  const leftX = [88, 132, 172]
  const rightX = [248, 288, 332]
  const cx = 210

  const leftTree = [
    { label: 'Total (100)', y: 88, depth: 0 },
    { label: 'Group A (42)', y: 42, depth: 1 },
    { label: 'Group B (58)', y: 134, depth: 1 },
    { label: 'A-α (22)', y: 26, depth: 2 },
    { label: 'A-β (20)', y: 56, depth: 2 },
    { label: 'B-α (34)', y: 120, depth: 2 },
    { label: 'B-β (24)', y: 150, depth: 2 },
  ]

  const rightTree = [
    { label: 'Released (84)', y: 88, depth: 0 },
    { label: 'Cryostored (52)', y: 42, depth: 1 },
    { label: 'QA Review (32)', y: 134, depth: 1 },
    { label: 'CD34+ (18)', y: 26, depth: 2 },
    { label: 'TNC (34)', y: 56, depth: 2 },
    { label: 'Pass (28)', y: 120, depth: 2 },
    { label: 'Hold (4)', y: 150, depth: 2 },
  ]

  const connections = [
    { from: { x: 172, y: 26 }, to: { x: 248, y: 26 }, color: '#2dd4bf' },
    { from: { x: 172, y: 56 }, to: { x: 248, y: 56 }, color: '#60a5fa' },
    { from: { x: 172, y: 120 }, to: { x: 248, y: 120 }, color: '#a78bfa' },
    { from: { x: 172, y: 150 }, to: { x: 248, y: 150 }, color: '#f59e0b' },
  ]

  return (
    <RarePanel index="27" title="Processing Tanglegram" subtitle="Pre- vs post-processing hierarchy mapping" col="col-2">
      <svg viewBox="0 0 420 190" className="advanced-svg">
        <g transform="translate(0, 2)">
          <line x1={leftX[0]} y1={88} x2={leftX[1]} y2={88} stroke="#527081" />
          <line x1={leftX[1]} y1={42} x2={leftX[1]} y2={134} stroke="#527081" />
          <line x1={leftX[1]} y1={42} x2={leftX[2]} y2={26} stroke="#527081" />
          <line x1={leftX[1]} y1={42} x2={leftX[2]} y2={56} stroke="#527081" />
          <line x1={leftX[1]} y1={134} x2={leftX[2]} y2={120} stroke="#527081" />
          <line x1={leftX[1]} y1={134} x2={leftX[2]} y2={150} stroke="#527081" />

          {leftTree.map((n, i) => (
            <g key={i}>
              <circle cx={leftX[n.depth]} cy={n.y} r="3" fill={palette[i % palette.length]} />
              <text x={leftX[n.depth] - 6} y={n.y + 3} textAnchor="end" fill="#8fa9b5" fontSize="10">{n.label}</text>
            </g>
          ))}

          <line x1={rightX[0]} y1={88} x2={rightX[1]} y2={88} stroke="#527081" />
          <line x1={rightX[1]} y1={42} x2={rightX[1]} y2={134} stroke="#527081" />
          <line x1={rightX[1]} y1={42} x2={rightX[2]} y2={26} stroke="#527081" />
          <line x1={rightX[1]} y1={42} x2={rightX[2]} y2={56} stroke="#527081" />
          <line x1={rightX[1]} y1={134} x2={rightX[2]} y2={120} stroke="#527081" />
          <line x1={rightX[1]} y1={134} x2={rightX[2]} y2={150} stroke="#527081" />

          {rightTree.map((n, i) => (
            <g key={i}>
              <circle cx={rightX[n.depth]} cy={n.y} r="3" fill={palette[i % palette.length]} />
              <text x={rightX[n.depth] + 6} y={n.y + 3} fill="#8fa9b5" fontSize="10">{n.label}</text>
            </g>
          ))}

          {connections.map((c, i) => (
            <path key={i}
              d={`M${c.from.x} ${c.from.y} C${cx} ${c.from.y} ${cx} ${c.to.y} ${c.to.x} ${c.to.y}`}
              stroke={c.color} strokeWidth="1.5" strokeOpacity=".4" fill="none" />
          ))}

          <text x={cx} y={14} textAnchor="middle" fill="#8fa9b5" fontSize="10" fillOpacity=".5">PRE-PROCESS</text>
          <text x={cx} y={180} textAnchor="middle" fill="#8fa9b5" fontSize="10" fillOpacity=".5">POST-PROCESS</text>
        </g>
      </svg>
      <div className="advanced-note"><b>7 left / 7 right nodes</b><span>4 cross-links</span><span>yield: 84%</span></div>
    </RarePanel>
  )
}

export function StemCyteRareCharts() {
  return <><ParallelCoordinates /><ChordDiagram /><Streamgraph /><ForceNetwork /><VoronoiTreemap /><ConnectedScatter /><CircularHeatmap /><Marimekko /><Tanglegram /></>
}

export { ParallelCoordinates, ChordDiagram, Streamgraph, ForceNetwork, VoronoiTreemap, ConnectedScatter, CircularHeatmap, Marimekko, Tanglegram }
