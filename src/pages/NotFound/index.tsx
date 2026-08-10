import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

function NotFound() {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <span className="text-6xl font-bold text-muted-foreground/20">404</span>
      <h1 className="mt-4 text-xl font-semibold text-foreground">Page not found</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <Button variant="outline" size="sm" className="mt-6" onClick={() => navigate('/dashboard')}>
        <ArrowLeft className="size-4" />
        Back to Dashboard
      </Button>
    </div>
  )
}

export default NotFound
