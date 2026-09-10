import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import type { SupplierShare } from '@/types'
import { ChartCard } from './ChartCard'
import { chartTooltipStyle, CHART_PALETTE } from './chart-utils'

interface SupplierShareChartProps {
  data: SupplierShare[]
}

export function SupplierShareChart({ data = [] }: SupplierShareChartProps) {
  return (
    <ChartCard title="Supplier Share" subtitle="Volume share of top suppliers">
      <div className="mx-auto w-full max-w-[240px]">
        <div className="aspect-square">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="supplier"
                cx="50%"
                cy="50%"
                outerRadius={80}
                paddingAngle={2}
                strokeWidth={0}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} fillOpacity={0.9} />
                ))}
              </Pie>
              <Tooltip contentStyle={chartTooltipStyle} formatter={(value) => [value, 'Shipments']} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
        {data.map((item, i) => (
          <div key={item.supplier} className="flex items-center gap-1.5">
            <span
              className="inline-block size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: CHART_PALETTE[i % CHART_PALETTE.length] }}
            />
            <span className="max-w-28 truncate text-xs text-muted-foreground">{item.supplier}</span>
          </div>
        ))}
      </div>
    </ChartCard>
  )
}
