import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import type { ShipmentTrend } from '@/types'

interface ShipmentTrendChartProps {
  data: ShipmentTrend[]
}

export function ShipmentTrendChart({ data }: ShipmentTrendChartProps) {
  return (
    <div className="card-premium p-5">
      <h3 className="mb-5 text-sm font-semibold text-foreground">Shipment Trends</h3>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => {
                const d = new Date(v)
                return `${d.getMonth() + 1}/${d.getDate()}`
              }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--popover)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
                fontSize: 12,
                color: 'var(--popover-foreground)',
                boxShadow: 'var(--shadow-elevated)',
              }}
              labelFormatter={(label) => {
                if (!label) return ''
                const d = new Date(label as string)
                return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
              iconType="circle"
              iconSize={8}
            />
            <Line
              type="monotone"
              dataKey="received"
              stroke="#22d3ee"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 5, fill: '#22d3ee', strokeWidth: 0 }}
              name="Received"
            />
            <Line
              type="monotone"
              dataKey="quarantined"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#f59e0b', strokeWidth: 0 }}
              name="Quarantined"
            />
            <Line
              type="monotone"
              dataKey="rejected"
              stroke="#ef4444"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#ef4444', strokeWidth: 0 }}
              name="Rejected"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
