import { Component, type ReactNode, type ErrorInfo } from "react"

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-4 p-8">
          <p className="text-sm text-muted-foreground">Something went wrong. Please refresh the page.</p>
          {this.state.error && (
            <details className="max-w-lg text-xs text-muted-foreground">
              <summary className="cursor-pointer font-medium">Error details</summary>
              <pre className="mt-2 overflow-auto rounded border bg-muted p-4">{this.state.error.message}
{this.state.error.stack}</pre>
            </details>
          )}
        </div>
      )
    }
    return this.props.children
  }
}