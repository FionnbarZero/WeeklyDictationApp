import { Component, type ErrorInfo, type ReactNode } from 'react'

type AppErrorBoundaryProps = {
  children: ReactNode
}

type AppErrorBoundaryState = {
  error: Error | null
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('The application UI failed.', error, errorInfo)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <main className="app-error-shell" role="alert">
        <section className="app-error-card">
          <p className="eyebrow">Something went wrong</p>
          <h1>Reload to continue.</h1>
          <p>
            Reloading does not intentionally clear saved progress or pending recovery records. An interrupted or
            session-only activity may need to be restarted.
          </p>
          <button className="primary-button" type="button" onClick={() => window.location.reload()}>
            Reload application
          </button>
        </section>
      </main>
    )
  }
}
