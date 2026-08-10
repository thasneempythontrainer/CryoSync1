import { useLocation, useNavigate } from 'react-router-dom'
import { ShieldAlert, ArrowLeft } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks'

function AccessDenied() {
  const navigate = useNavigate()
  const location = useLocation()
  const { roleLabel } = useAuth()

  return (
    <div className="flex flex-1 flex-col items-center justify-center py-20 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive ring-1 ring-destructive/20">
        <ShieldAlert className="size-8" />
      </div>
      <h1 className="mt-5 text-xl font-semibold text-foreground">Access restricted</h1>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Your <span className="font-medium text-foreground">{roleLabel ?? 'current'}</span> role
        doesn&rsquo;t have permission to view this section.
      </p>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground/70">
        Requested: <span className="font-mono">{location.pathname}</span>
      </p>
      <Button variant="outline" size="sm" className="mt-6" onClick={() => navigate('/dashboard')}>
        <ArrowLeft className="size-4" />
        Back to Dashboard
      </Button>
    </div>
  )
}

export default AccessDenied
