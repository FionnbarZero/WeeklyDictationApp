import { useLayoutEffect, useRef, useState } from 'react'
import type { AcquisitionTarget } from '../acquisition/contracts.ts'
import { activityClock } from '../activity/activityLifecycle.ts'
import {
  createWritingCommand,
  teachingPosition,
  type WritingCommand,
} from '../application/writingAcquisition/progress.ts'
import type { SavedAcquisition } from '../familyBeta/acquisitionStore.ts'
import { previewProfile } from '../familyBeta/runtime.ts'
import { assertScrollsAnswerOpen, withScrollsWrite } from '../familyBeta/scrollsCompletion.ts'
import { PracticeView, type PracticeViewProps } from '../practice/PracticeView.tsx'
import Grade2WritingPractice from './Grade2WritingPractice.tsx'
import './nativeWritingIntegration.css'

type NativeStore = {
  key: string
  current: SavedAcquisition<AcquisitionTarget, string>
  assertActive: () => void
  completeTeachingStep: (command: WritingCommand) => SavedAcquisition<AcquisitionTarget, string>
}

/** The native grade remains the owner of answers, completion and Warmup.
 * Only the approved presentation/teacher is shared with the Grade 2 pilot. */
export default function NativeWritingPractice({ store, ...props }: PracticeViewProps & { store: NativeStore }) {
  const [, refresh] = useState(0)
  const [error, setError] = useState('')
  const busy = useRef(false)
  const activity = useRef<{ active: boolean; sessionId: string } | null>(null)
  useLayoutEffect(() => {
    const visit = { active: true, sessionId: props.session.id }
    activity.current = visit
    return () => {
      visit.active = false
    }
  }, [store, props.session.id])
  const progress = store.current.writing
  if (!progress) throw new Error('The combined writing checkpoint is unavailable.')

  function assertWritable() {
    const profile = previewProfile()
    if (activityClock.paused || profile?.id !== progress!.owner || profile.grade !== progress!.lesson.dataset.grade)
      throw new Error('Return to this child’s activity before saving. Progress was preserved.')
    store.assertActive()
  }

  async function transact(operation: () => void, completedAllowed = false) {
    if (busy.current) throw new Error('Wait for the current writing save to finish.')
    const visit = activity.current
    const isCurrent = () => visit?.active && activity.current === visit
    busy.current = true
    try {
      await withScrollsWrite(store.key, () => {
        // Exit/replacement may occur while this callback waits for another tab.
        // Check the original mounted visit before invoking a native handler.
        if (!isCurrent() || store.current.sessionId !== visit!.sessionId)
          throw new Error('This writing activity has ended. No response was saved.')
        assertWritable()
        if (!completedAllowed) assertScrollsAnswerOpen(localStorage, store.current.sessionId)
        operation()
      })
      if (isCurrent()) {
        refresh((value) => value + 1)
        setError('')
      }
    } catch (failure) {
      if (isCurrent()) {
        setError(failure instanceof Error ? failure.message : 'Writing could not be saved. Please retry.')
        window.parent.postMessage({ type: 'family-beta-save-error' }, window.location.origin)
      }
      throw failure
    } finally {
      busy.current = false
    }
  }

  function exit() {
    // Invalidate synchronously, before React's unmount or another launch.
    if (activity.current) activity.current.active = false
    props.onExit()
  }

  if (props.session.segment !== 'primary') return <PracticeView {...props} onExit={exit} />
  return (
    <div className="native-writing-integration">
      {error && (
        <p className="native-writing-error" role="alert">
          {error}
        </p>
      )}
      <Grade2WritingPractice
        {...props}
        onExit={exit}
        progress={progress}
        onTeachingStep={async (step) => {
          const position = teachingPosition(progress)
          if (!position || position.step !== step) throw new Error('This teaching step is no longer current.')
          const command = createWritingCommand({
            kind: 'complete-teaching-step',
            expectedRevision: progress.revision,
            position,
          })
          await transact(() => {
            store.completeTeachingStep(command)
          })
        }}
        onAnswer={(answer) => {
          // Warmup/test controls keep their native paths; only acquisition writes
          // share the same completion lock as the guided teacher.
          if (props.session.segment !== 'primary') {
            props.onAnswer(answer)
            return
          }
          void transact(() => props.onAnswer(answer), answer === 'done').catch(() => undefined)
        }}
      />
    </div>
  )
}
