import { Component, type ReactNode } from 'react'
import { activityClock } from '../activity/activityLifecycle.ts'

type RecoveryCode = 'ST-RENDER' | 'ST-EVENT' | 'ST-PROMISE'
type Props = { children: ReactNode; onExit: () => void; step: number }
type State = { code: RecoveryCode | null }

/** W1-only safeguard. Retry remounts the teacher from the parent's confirmed
 * position. No checkpoint, answer, raw exception, or handwriting is written. */
export class StrokeTeacherRecovery extends Component<Props, State> {
  state: State = { code: null }

  static getDerivedStateFromError(): State {
    return { code: 'ST-RENDER' }
  }

  componentDidCatch() {
    // Raw exception messages may contain response material. Use a fixed code.
    console.error('Stroke teacher interrupted: ST-RENDER')
  }

  private fail = (code: RecoveryCode) => {
    this.setState((state) => (state.code ? state : { code }))
  }

  private onError = (event: ErrorEvent) => {
    // A missing resource is not a script failure; keep its own audio retry UI.
    if (event instanceof ErrorEvent) this.fail('ST-EVENT')
  }

  private onRejection = () => this.fail('ST-PROMISE')

  componentDidMount() {
    window.addEventListener('error', this.onError)
    window.addEventListener('unhandledrejection', this.onRejection)
  }

  componentWillUnmount() {
    window.removeEventListener('error', this.onError)
    window.removeEventListener('unhandledrejection', this.onRejection)
  }

  render() {
    if (!this.state.code) return this.props.children
    return (
      <section
        className="st-original-stage"
        role="alert"
        aria-label="Tracing needs a retry"
        data-report-activity="Writing stroke teacher interrupted"
        data-report-phase={`teacher-recovery:${this.state.code}`}
        data-report-position={this.props.step + 1}
        style={{ padding: '32px 16px', color: '#fff6dd' }}
      >
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <h1>Let’s get back to tracing.</h1>
          <p>Tracing stopped unexpectedly. Your completed teaching steps have not been reset.</p>
          <p>Try this step again with a clean writing box. The unfinished strokes will be cleared.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, margin: '24px 0' }}>
            <button
              type="button"
              className="primary-button"
              style={{ minHeight: 48, padding: '12px 20px', fontSize: 16 }}
              onClick={() => {
                if (!activityClock.paused) this.setState({ code: null })
              }}
            >
              Try this step again
            </button>
            <button
              type="button"
              style={{
                minHeight: 48,
                padding: '12px 20px',
                fontSize: 16,
                borderRadius: 11,
                background: '#fff6dd',
                color: '#273941',
              }}
              onClick={() => {
                if (!activityClock.paused) this.props.onExit()
              }}
            >
              Return to Dojo
            </button>
          </div>
          <p>Report a problem will include error code {this.state.code}. No screenshot is needed.</p>
        </div>
      </section>
    )
  }
}
