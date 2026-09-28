import type { LifecycleStrategy } from '../contracts.ts'
import { resolveReplacementDrivenLifecycle } from '../resolveLifecycle.ts'

export const grade2ReplacementLifecycleStrategy: LifecycleStrategy = {
  profileId: 'grade-2-replacement-2026-27',
  version: 1,
  grade: 'Grade 2',
  schoolYearKey: '2026-27',
  resolve(context) {
    return resolveReplacementDrivenLifecycle({ ...context, testReviewCycles: 1 })
  },
}
