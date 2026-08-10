import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import type { ExpiryTimeline } from '@/types'

interface ExpiryTimelineChartProps {
  data: ExpiryTimeline[]
}

export function ExpiryTimelineChart({ data }: ExpiryTimelineChartProps) {
  return (
    <div className="card-premium p-5">
      <h3 className="mb-5 text-sm font-semibold text-foreground">Expiry Timeline</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => {
                const d = new Date(v + '-01')
                return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
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
              labelFormatter={(v) => {
                const d = new Date(v + '-01')
                return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
              iconType="circle"
              iconSize={8}
            />
            <Area
              type="monotone"
              dataKey="total"
              stroke="var(--muted-foreground)"
              fill="var(--muted-foreground)"
              fillOpacity={0.08}
              strokeWidth={1.5}
              name="Total Lots"
            />
            <Area
              type="monotone"
              dataKey="expiring"
              stroke="#ef4444"
              fill="#ef4444"
              fillOpacity={0.12}
              strokeWidth={2.5}
              name="Expiring Lots"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
