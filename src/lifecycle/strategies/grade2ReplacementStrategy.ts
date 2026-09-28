import type { LifecycleStrategy } from '../contracts.ts'
import { resolveReplacementDrivenLifecycle } from '../resolveLifecycle.ts'

export const grade2ReplacementLifecycleStrategy: LifecycleStrategy = {
  id: 'grade-2-replacement-driven-v1',
  grade: 'Grade 2',
  resolve(scope, sets) {
    return resolveReplacementDrivenLifecycle({ scope, sets, testReviewCycles: 1 })
  },
}
