const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const numberFormatter = new Intl.NumberFormat('en-US')

const percentFormatter = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})

const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatCurrency(value: number): string {
  return currencyFormatter.format(value)
}

export function formatCompactCurrency(value: number): string {
  if (value >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(1)}B`
  }
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}K`
  }
  return `$${value.toFixed(0)}`
}

export function formatNumber(value: number): string {
  return numberFormatter.format(value)
}

export function formatPercent(value: number): string {
  return percentFormatter.format(value / 100)
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "—"
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return "—"
  return dateFormatter.format(d)
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return "—"
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return "—"
  return dateTimeFormatter.format(d)
}

export function formatTemperature(value: number): string {
  return `${value.toFixed(1)}°C`
}

export function formatMinutes(value: number): string {
  if (value < 60) return `${value}m`
  const hours = Math.floor(value / 60)
  const mins = value % 60
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
}

export function formatDays(value: number): string {
  if (value < 0) return `${Math.abs(value)} days overdue`
  if (value === 0) return 'Today'
  if (value === 1) return '1 day'
  return `${value} days`
}

export function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    healthy: 'text-emerald-500',
    degraded: 'text-amber-500',
    down: 'text-red-500',
    critical: 'text-red-500',
    active: 'text-emerald-500',
    in_transit: 'text-blue-500',
    arrived: 'text-violet-500',
    receiving: 'text-amber-500',
    quarantined: 'text-orange-500',
    released: 'text-emerald-500',
    rejected: 'text-red-500',
    open: 'text-red-500',
    investigating: 'text-amber-500',
    resolved: 'text-emerald-500',
    closed: 'text-slate-500',
    approved: 'text-emerald-500',
    provisional: 'text-amber-500',
    suspended: 'text-red-500',
    pending_audit: 'text-blue-500',
    pending_review: 'text-amber-500',
    available: 'text-emerald-500',
    reserved: 'text-blue-500',
    quality_hold: 'text-amber-500',
    expired: 'text-red-500',
    disposed: 'text-slate-500',
    excellent: 'text-emerald-500',
    good: 'text-blue-500',
    fair: 'text-amber-500',
    damaged: 'text-red-500',
  }
  return map[status] ?? 'text-slate-500'
}

export function getStatusBg(status: string): string {
  const map: Record<string, string> = {
    healthy: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
    degraded: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
    down: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400',
    critical: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400',
    active: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
    in_transit: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
    arrived: 'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-400',
    receiving: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
    quarantined: 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-400',
    released: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
    rejected: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400',
    open: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400',
    investigating: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
    resolved: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
    closed: 'bg-slate-50 text-slate-600 dark:bg-slate-900 dark:text-slate-400',
    approved: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
    provisional: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
    suspended: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400',
    pending_audit: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
    pending_review: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
    available: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
    reserved: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
    quality_hold: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
    expired: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400',
    disposed: 'bg-slate-50 text-slate-600 dark:bg-slate-900 dark:text-slate-400',
    excellent: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
    good: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
    fair: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
    damaged: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400',
  }
  return map[status] ?? 'bg-slate-50 text-slate-700 dark:bg-slate-900 dark:text-slate-400'
}

export function getSeverityColor(severity: string): string {
  const map: Record<string, string> = {
    low: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    medium: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
    high: 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-400',
    critical: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400',
  }
  return map[severity] ?? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
}

export function formatCategory(category: string): string {
  return category
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str
  return str.substring(0, length) + '...'
}
