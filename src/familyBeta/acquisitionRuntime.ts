import type { AcquisitionStrategy, AcquisitionTarget, AcquisitionTargetSet } from '../acquisition/contracts.ts'
import { openAcquisitionStore } from './acquisitionStore.ts'
import { familyPreview, previewProfile, previewResults } from './runtime.ts'
import { rememberFamilyLesson } from './lessonLaunchRuntime.ts'
import { deviceWriter } from './deviceWriter.ts'
import type { NativeWritingAdapter } from './nativeWritingCheckpoint.ts'
import type { WritingCommand } from '../application/writingAcquisition/progress.ts'
import { acquisitionProgressionId } from '../acquisition/persistence/identity.ts'
import { currentAcquisitionContext } from './acquisitionRetirement.ts'
import { withScrollsWrite } from './scrollsCompletion.ts'
import { activityClock } from '../activity/activityLifecycle.ts'

export async function familyWritingStore<T extends AcquisitionTarget, R extends string>(
  targetSet: AcquisitionTargetSet<T>, strategy: AcquisitionStrategy<T>, writing: NativeWritingAdapter<T>, isCurrent: () => boolean,
) {
  if (!familyPreview) return null
  const profile = previewProfile()
  if (!profile) throw new Error('Choose a child profile before starting writing.')
  const context = currentAcquisitionContext(localStorage, {
    identity: { childId: profile.id, grade: profile.grade, datasetId: targetSet.id, schoolYear: '2026-27', activityModule: 'writing-dojo', tier: 'tier-1' },
    lifecycleStage: { kind: 'acquisition' }, applicationVersion: 'native-writing-launch', targetSet, strategy,
  })
  const id = acquisitionProgressionId(context.identity)
  return withScrollsWrite(`family-beta-acquisition-v1:${id}`, () => {
    if (!isCurrent() || activityClock.paused || previewProfile()?.id !== profile.id || previewProfile()?.grade !== profile.grade ||
        acquisitionProgressionId(currentAcquisitionContext(localStorage, context).identity) !== id)
      throw new Error('The writing launch changed. Reopen the lesson; no progress was replaced.')
    // Opening includes migration and confirmed-result recovery, so it must use
    // the very same lock as teacher, answer and completion transactions.
    return familyAcquisitionStore<T, R>(targetSet, strategy, 'writing-dojo', 'tier-1', writing)
  })
}

export function familyAcquisitionStore<T extends AcquisitionTarget, R extends string>(
  targetSet: AcquisitionTargetSet<T>,
  strategy: AcquisitionStrategy<T>,
  activityModule: string,
  tier: 'tier-1' | 'tier-2',
  writing?: NativeWritingAdapter<T>,
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
  }, { writerId: deviceWriter(localStorage), writing })
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
    completeTeachingStep(command: WritingCommand) {
      const saved = store.completeTeachingStep(command)
      window.parent.postMessage({ type: 'family-beta-result-ready' }, window.location.origin)
      return saved
    },
  }
}
