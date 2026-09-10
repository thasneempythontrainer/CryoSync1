import { useMemo } from 'react'
import { geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import type { RegionalMetric } from '@/types'
import { ChartCard } from './ChartCard'
import { SEMANTIC_COLORS } from './chart-utils'

import usTopologyJson from '@/assets/us-states-10m.json'

interface RegionalMapChartProps {
  data: RegionalMetric[]
}

interface UsTopology {
  type: 'Topology'
  objects: {
    states: {
      type: 'GeometryCollection'
      geometries: Array<{ type: string; id?: string; properties?: { name?: string }; arcs?: unknown }>
    }
  }
  arcs: unknown[]
}

interface GeoFeatureLike {
  id?: unknown
  properties?: { name?: string }
}

const FIPS: Record<string, string> = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO', '09': 'CT',
  '10': 'DE', '11': 'DC', '12': 'FL', '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL',
  '18': 'IN', '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME', '24': 'MD',
  '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS', '29': 'MO', '30': 'MT', '31': 'NE',
  '32': 'NV', '33': 'NH', '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND',
  '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI', '45': 'SC', '46': 'SD',
  '47': 'TN', '48': 'TX', '49': 'UT', '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV',
  '55': 'WI', '56': 'WY',
}

const REGION_BY_STATE: Record<string, string> = {
  CT: 'Northeast', ME: 'Northeast', MA: 'Northeast', NH: 'Northeast', RI: 'Northeast',
  VT: 'Northeast', NJ: 'Northeast', NY: 'Northeast', PA: 'Northeast',
  IL: 'Midwest', IN: 'Midwest', MI: 'Midwest', OH: 'Midwest', WI: 'Midwest',
  IA: 'Midwest', KS: 'Midwest', MN: 'Midwest', MO: 'Midwest', NE: 'Midwest', ND: 'Midwest', SD: 'Midwest',
  DE: 'South', DC: 'South', FL: 'South', GA: 'South', MD: 'South', NC: 'South', SC: 'South',
  VA: 'South', WV: 'South', AL: 'South', KY: 'South', MS: 'South', TN: 'South',
  AR: 'South', LA: 'South', OK: 'South', TX: 'South',
  AK: 'West', AZ: 'West', CA: 'West', CO: 'West', HI: 'West', ID: 'West', MT: 'West',
  NV: 'West', NM: 'West', OR: 'West', UT: 'West', WA: 'West', WY: 'West',
}

const REGION_COLORS: Record<string, string> = {
  Northeast: SEMANTIC_COLORS.primary,
  Midwest: SEMANTIC_COLORS.purple,
  South: SEMANTIC_COLORS.success,
  West: SEMANTIC_COLORS.warning,
}

const FACILITY_PINS: Record<string, { facility: string; city: string }> = {
  MA: { facility: 'Boston DC', city: 'Boston' },
  TX: { facility: 'Austin Lab', city: 'Austin' },
  CO: { facility: 'Denver Distribution', city: 'Denver' },
}

export function RegionalMapChart({ data = [] }: RegionalMapChartProps) {
  const max = Math.max(1, ...data.map((d) => d.shipments))
  const total = data.reduce((sum, d) => sum + d.shipments, 0)

  const metricByRegion = useMemo(() => {
    const map = new Map<string, RegionalMetric>()
    for (const d of data) map.set(d.region, d)
    return map
  }, [data])

  const activeFacilities = useMemo(() => new Set(data.map((d) => d.facility).filter(Boolean)), [data])

  const { stateShapes, pins } = useMemo(() => {
    const topo = usTopologyJson as unknown as UsTopology
    const geo = geoPath()
    const collection = feature(topo as never, topo.objects.states as never) as unknown as {
      features: GeoFeatureLike[]
    }
    const shapes: Array<{ key: string; d: string; abbrev?: string; region?: string }> = []
    const pinsOut: Array<{ x: number; y: number; facility: string; city: string }> = []

    for (const f of collection.features) {
      const id = String(f.id ?? '')
      const abbrev = FIPS[id]
      const region = abbrev ? REGION_BY_STATE[abbrev] : undefined
      const d = geo(f as never)
      if (!d) continue
      shapes.push({ key: id || f.properties?.name || 'x', d, abbrev, region })
      const pin = abbrev ? FACILITY_PINS[abbrev] : undefined
      if (pin) {
        const [x, y] = geo.centroid(f as never)
        pinsOut.push({ x, y, ...pin })
      }
    }
    return { stateShapes: shapes, pins: pinsOut }
  }, [])

  return (
    <ChartCard
      title="Regional Operations Map"
      subtitle={`${total.toLocaleString()} shipments · ${data.length} regions`}
    >
      <div className="h-map relative">
        <svg viewBox="0 0 960 600" className="h-full w-full" preserveAspectRatio="xMidYMid meet">
          <defs>
            <pattern id="mapGrid" width="28" height="28" patternUnits="userSpaceOnUse">
              <path
                d="M28 0H0V28"
                fill="none"
                stroke="currentColor"
                strokeOpacity="0.05"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect x="0" y="0" width="960" height="600" fill="url(#mapGrid)" rx="10" />
          <g className="text-foreground">
            {stateShapes.map((s) => {
              const metric = s.region ? metricByRegion.get(s.region) : undefined
              const opacity = metric ? 0.3 + (metric.shipments / max) * 0.6 : 0.07
              return (
                <path
                  key={s.key}
                  d={s.d}
                  fill={s.region ? REGION_COLORS[s.region] : SEMANTIC_COLORS.neutral}
                  fillOpacity={opacity}
                  stroke="#0b1120"
                  strokeWidth={0.9}
                  strokeLinejoin="round"
                >
                  <title>
                    {`${s.abbrev ?? '—'} · ${s.region ?? 'No region'}${metric ? ` · ${metric.shipments.toLocaleString()} shipments · ${metric.compliance}% compliance` : ''}`}
                  </title>
                </path>
              )
            })}
            {pins.map((p) =>
              activeFacilities.has(p.facility) ? (
                <g key={p.facility}>
                  <circle cx={p.x} cy={p.y} r={12} fill="none" stroke="#0ea5e9" strokeOpacity={0.45} />
                  <circle cx={p.x} cy={p.y} r={5.5} fill="#e0f2fe" stroke="#075985" strokeWidth={1.5}>
                    <title>{`${p.facility} · ${p.city}`}</title>
                  </circle>
                  <text x={p.x + 13} y={p.y + 4} fill="#7dd3fc" fontSize={15} fontWeight={600}>
                    {p.city}
                  </text>
                </g>
              ) : null,
            )}
          </g>
        </svg>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        {data.map((d) => (
          <div key={d.region} className="flex items-center gap-1.5 text-xs">
            <span
              className="inline-block size-2.5 rounded-sm"
              style={{
                backgroundColor: REGION_COLORS[d.region] ?? SEMANTIC_COLORS.primary,
                opacity: 0.3 + (d.shipments / max) * 0.6,
              }}
            />
            <span className="text-muted-foreground">{d.region}</span>
            <span className="font-medium tabular-nums">{d.shipments.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </ChartCard>
  )
}
