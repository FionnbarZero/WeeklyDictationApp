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
          <h1>Your saved practice is still safe.</h1>
          <p>
            Reload the application to try again. Pending recovery records are kept so an interrupted session can resume
            safely.
          </p>
          <button className="primary-button" type="button" onClick={() => window.location.reload()}>
            Reload application
          </button>
        </section>
      </main>
    )
  }
}
