import type { CSSProperties } from 'react'

export const CHART_PALETTE = [
  '#4a90a4',
  '#6b7fb8',
  '#8b9dc3',
  '#a8b5c8',
  '#5a9e7c',
  '#c49074',
  '#b8945a',
  '#7a8fad',
  '#6aad85',
  '#a082b8',
  '#c49940',
  '#c47070',
]

export const SEMANTIC_COLORS = {
  primary: '#4a90a4',
  success: '#5a9e7c',
  warning: '#c49940',
  danger: '#c47070',
  info: '#6b7fb8',
  neutral: '#8b9dc3',
  purple: '#a082b8',
  orange: '#c49074',
} as const

export const chartTooltipStyle: CSSProperties = {
  backgroundColor: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  fontSize: 12,
  color: 'var(--popover-foreground)',
  boxShadow: 'var(--shadow-elevated)',
}

export const axisTick = { fontSize: 11, fill: 'var(--muted-foreground)' }

export function labelFormatter(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function formatShortMonth(value: string): string {
  const d = new Date(`${value}-01`)
  return d.toLocaleDateString('en-US', { month: 'short' })
}

export function formatDay(value: string): string {
  const d = new Date(value)
  return `${d.getMonth() + 1}/${d.getDate()}`
}
