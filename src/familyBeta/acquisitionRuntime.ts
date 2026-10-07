import type { AcquisitionStrategy, AcquisitionTarget, AcquisitionTargetSet } from '../acquisition/contracts.ts'
import { openAcquisitionStore } from './acquisitionStore.ts'
import { familyPreview, previewProfile, previewResults } from './runtime.ts'
import { rememberFamilyLesson } from './lessonLaunchRuntime.ts'

export function familyAcquisitionStore<T extends AcquisitionTarget, R extends string>(
  targetSet: AcquisitionTargetSet<T>,
  strategy: AcquisitionStrategy<T>,
  activityModule: string,
  tier: 'tier-1' | 'tier-2',
) {
  if (!familyPreview) return null
  const profile = previewProfile()
  if (!profile) throw new Error('Choose a child profile before starting acquisition.')
  const store = openAcquisitionStore<T, R>(localStorage, {
    identity: {
      childId: profile.id,
      grade: profile.grade,
      datasetId: targetSet.id,
      schoolYear: '2026-27',
      activityModule,
      tier,
    },
    lifecycleStage: { kind: 'acquisition' },
    applicationVersion: import.meta.env?.VITE_GIT_REVISION || 'family-beta-checkpoint-v1',
    targetSet,
    strategy,
  })
  // Recover a close/reload between confirming a result and opening a new visit.
  if (previewResults().some((result) => result.id === store.current.sessionId)) store.finishSession()
  rememberFamilyLesson(store.current.envelope)
  return {
    ...store,
    get current() {
      return store.current
    },
    get context() { return store.context },
    answer(correct: boolean, revealMethod: R) {
      const saved = store.answer(correct, revealMethod)
      window.parent.postMessage({ type: 'family-beta-result-ready' }, window.location.origin)
      return saved
    },
  }
}
