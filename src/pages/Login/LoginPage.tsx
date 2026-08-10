import { useState, useCallback } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { PackageOpen, ShieldCheck, UserCog, Loader2, Radar, Snowflake } from 'lucide-react'

import { login } from '@/services'
import { useAuthStore } from '@/store'
import { cn } from '@/lib/utils'
import { BrandMark } from '@/components/brand/BrandMark'

const DEMO_ACCOUNTS = [
  {
    role: 'Dock Receiving Employee',
    username: 'dock',
    password: 'dock123',
    icon: PackageOpen,
    description: 'Receive, scan, and document incoming shipments',
    accent: 'text-cyan-400 bg-cyan-400/10 ring-cyan-400/25 shadow-[0_0_18px_-6px_rgba(34,211,238,0.5)]',
  },
  {
    role: 'Quality Assurance',
    username: 'qa',
    password: 'qa123',
    icon: ShieldCheck,
    description: 'Investigate and resolve compliance incidents',
    accent: 'text-emerald-400 bg-emerald-400/10 ring-emerald-400/25 shadow-[0_0_18px_-6px_rgba(52,211,153,0.5)]',
  },
  {
    role: 'Supervisor / Manager',
    username: 'supervisor',
    password: 'super123',
    icon: UserCog,
    description: 'Full access across all modules',
    accent: 'text-violet-400 bg-violet-400/10 ring-violet-400/25 shadow-[0_0_18px_-6px_rgba(167,139,250,0.5)]',
  },
]

function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  const setSession = useAuthStore((s) => s.setSession)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard'

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (isSubmitting) return
      setError('')
      setIsSubmitting(true)
      try {
        const { token, user: loggedIn } = await login(username.trim(), password)
        setSession(token, loggedIn)
        navigate(from, { replace: true })
      } catch {
        setError('Invalid username or password. Try one of the demo accounts below.')
      } finally {
        setIsSubmitting(false)
      }
    },
    [username, password, isSubmitting, from, setSession, navigate],
  )

  const fillAccount = useCallback((demo: (typeof DEMO_ACCOUNTS)[number]) => {
    setUsername(demo.username)
    setPassword(demo.password)
    setError('')
  }, [])

  if (user) {
    return <Navigate to={from} replace />
  }

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#04060d] px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-grid opacity-30 [mask-image:radial-gradient(ellipse_at_center,black_25%,transparent_78%)]" />
        <div className="absolute -top-40 left-1/4 size-[36rem] rounded-full bg-cyan-500/20 blur-[130px]" />
        <div className="absolute -bottom-24 right-1/5 size-[32rem] rounded-full bg-violet-500/20 blur-[130px]" />
        <div className="absolute left-1/2 top-1/2 size-[22rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-400/10 blur-[110px]" />
      </div>

      <div className="relative z-10 grid w-full max-w-5xl grid-cols-[minmax(0,1fr)] overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_0_80px_-16px_rgba(56,189,248,0.4)] backdrop-blur-2xl lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="relative hidden flex-col justify-between overflow-hidden p-10 text-white lg:flex">
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/25 via-sky-500/15 to-violet-600/30" />
          <div className="absolute -right-20 -top-20 size-64 rounded-full bg-cyan-400/20 blur-3xl" />
          <div className="absolute -bottom-24 -left-12 size-72 rounded-full bg-violet-500/20 blur-3xl" />

          <div className="relative flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-2xl border border-white/20 bg-white/10 shadow-[0_0_24px_-4px_rgba(56,189,248,0.6)] backdrop-blur">
              <BrandMark className="size-7" />
            </div>
            <div className="leading-tight">
              <div className="font-heading text-xl font-bold tracking-tight text-gradient-brand">
                CryoSync
              </div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/70">
                Cold-Chain Intelligence
              </div>
            </div>
          </div>

          <div className="relative space-y-5">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.25em] text-cyan-300/90">
              <Radar className="size-3.5" />
              Pharma Cold Chain · Realtime
            </div>
            <h1 className="font-heading text-4xl font-bold leading-tight tracking-tight">
              Cold-chain operations,{' '}
              <span className="text-gradient-brand">in sync.</span>
            </h1>
            <p className="max-w-md text-sm leading-relaxed text-white/75">
              CryoSync unifies dock receiving, quality assurance, and supervision across the
              pharmaceutical cold chain — with AI-driven insights on demand.
            </p>
          </div>

          <div className="relative flex items-center gap-2 text-xs text-white/60">
            <Snowflake className="size-4 text-cyan-300/80" />
            Role-based account access · Temperature-aware from arrival to release
          </div>
        </div>

        <div className="flex flex-col justify-center border-l border-white/5 bg-gradient-to-br from-cyan-500/10 via-transparent to-violet-600/15 p-8 backdrop-blur sm:p-10 lg:bg-none lg:bg-black/10">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex size-11 items-center justify-center rounded-2xl border border-white/20 bg-white/10 shadow-[0_0_24px_-4px_rgba(56,189,248,0.6)] backdrop-blur">
              <BrandMark className="size-6" />
            </div>
            <div className="leading-tight">
              <div className="font-heading text-lg font-bold tracking-tight text-gradient-brand">
                CryoSync
              </div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/70">
                Cold-Chain Intelligence
              </div>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="font-heading text-2xl font-semibold tracking-tight text-white">
              Sign in
            </h2>
            <p className="mt-1 text-sm text-white/60">
              Choose an account role to continue.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="username" className="text-sm font-medium text-white">
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="e.g. dock, qa, supervisor"
                className="h-10 w-full rounded-lg border border-white/15 bg-white/[0.04] px-3 text-sm text-white outline-none transition-all placeholder:text-white/40 focus:border-ring/60 focus:ring-2 focus:ring-primary/25 focus:shadow-glow-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium text-white">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
                className="h-10 w-full rounded-lg border border-white/15 bg-white/[0.04] px-3 text-sm text-white outline-none transition-all placeholder:text-white/40 focus:border-ring/60 focus:ring-2 focus:ring-primary/25 focus:shadow-glow-sm"
              />
            </div>

            {error && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting || !username || !password}
              className="inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg gradient-brand text-sm font-semibold text-white shadow-[0_0_24px_-6px_rgba(56,189,248,0.65)] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
              {isSubmitting && <Loader2 className="size-4 animate-spin" />}
              {isSubmitting ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <div className="mt-8">
            <div className="mb-3 flex items-center gap-3">
              <span className="text-xs font-medium uppercase tracking-wider text-white/60">
                Demo accounts
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <div className="space-y-2">
              {DEMO_ACCOUNTS.map((demo) => {
                const Icon = demo.icon
                return (
                  <button
                    key={demo.username}
                    type="button"
                    onClick={() => fillAccount(demo)}
                    className={cn(
                      'group flex w-full cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left transition-all hover:border-white/20 hover:bg-white/[0.06] hover:shadow-glow-sm',
                    )}
                  >
                    <div
                      className={cn(
                        'flex size-9 shrink-0 items-center justify-center rounded-lg ring-1 transition-transform group-hover:scale-105',
                        demo.accent,
                      )}
                    >
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-white">{demo.role}</div>
                      <div className="truncate text-xs text-white/60">
                        {demo.description}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-xs font-semibold text-white">{demo.username}</div>
                      <div className="text-[11px] text-white/50">{demo.password}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default LoginPage
