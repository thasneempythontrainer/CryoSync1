import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  type PieLabelRenderProps,
} from 'recharts'
import type { InventoryDistribution } from '@/types'
import { formatCompactCurrency } from '@/utils/formatters'
import { ChartCard } from './ChartCard'
import { CHART_PALETTE, chartTooltipStyle } from './chart-utils'

interface InventoryDistributionChartProps {
  data: InventoryDistribution[]
}



function labelFormatter(cat: string) {
  return cat
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function renderLabel(props: PieLabelRenderProps) {
  const { cx = 0, cy = 0, midAngle = 0, outerRadius = 0, percent = 0 } = props
  if (!percent || percent < 0.04) return null
  const RADIAN = Math.PI / 180
  const radius = Number(outerRadius) + 14
  const x = Number(cx) + radius * Math.cos(-Number(midAngle) * RADIAN)
  const y = Number(cy) + radius * Math.sin(-Number(midAngle) * RADIAN)

  const label = `${(percent * 100).toFixed(0)}%`

  return (
    <text
      x={x}
      y={y}
      textAnchor={x > Number(cx) ? 'start' : 'end'}
      dominantBaseline="central"
      className="fill-foreground"
      fontSize={11}
      fontWeight={600}
    >
      {label}
    </text>
  )
}

export function InventoryDistributionChart({ data }: InventoryDistributionChartProps) {
  const total = data.reduce((sum, item) => sum + item.value, 0)

  return (
    <ChartCard
      title="Inventory Distribution"
      badge={
        <span className="text-sm font-bold tabular-nums text-foreground">
          {formatCompactCurrency(total)}
        </span>
      }
    >
      <div className="mx-auto w-full max-w-[300px]">
        <div className="aspect-square">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart margin={{ top: 28, right: 28, bottom: 28, left: 28 }}>
              <Pie
                data={data}
                dataKey="value"
                nameKey="category"
                cx="50%"
                cy="50%"
                innerRadius={68}
                outerRadius={96}
                paddingAngle={2}
                strokeWidth={0}
                label={renderLabel}
                labelLine={false}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} fillOpacity={0.9} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={chartTooltipStyle}
                formatter={(value, name) =>
                  [formatCompactCurrency(Number(value)), labelFormatter(String(name))]
                }
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-1.5">
        {data.map((item, i) => (
          <div key={item.category} className="flex items-center gap-1.5">
            <span
              className="inline-block size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: CHART_PALETTE[i % CHART_PALETTE.length] }}
            />
            <span className="text-xs text-muted-foreground">{labelFormatter(item.category)}</span>
          </div>
        ))}
      </div>
    </ChartCard>
  )
}
