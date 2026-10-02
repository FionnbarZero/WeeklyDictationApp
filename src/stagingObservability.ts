import { stagingObservabilityEnabled } from './config.ts'
import { firebaseSdkApp } from './firebaseSdkRuntime.ts'

let initialization: Promise<void> | null = null

export function initializeStagingObservability() {
  if (!stagingObservabilityEnabled) return Promise.resolve()
  if (!initialization) {
    initialization = Promise.all([firebaseSdkApp(), import('firebase/performance')]).then(([app, performance]) => {
      performance.getPerformance(app)
    })
  }
  return initialization
}
