import { useEffect, useRef, useState } from 'react'
import { revealAcquisition } from '../acquisition/engine.ts'
import { activityClock } from '../activity/activityLifecycle.ts'
import { createWritingLesson, GRADE5_WRITING_POLICY } from '../application/writingAcquisition/lesson.ts'
import {
  createWritingCommand,
  createWritingProgress,
  teachingPosition,
  type WritingCommand,
  type WritingProgress,
} from '../application/writingAcquisition/progress.ts'
import { gradeAudioProfileFor } from '../audio/gradeAudioProfile.ts'
import { playCachedWordAudio, stopActiveAudio } from '../audio/promptAudio.ts'
import type { PracticeSession, Word } from '../domain.ts'
import { withScrollsWrite } from '../familyBeta/scrollsCompletion.ts'
import { openWritingStore } from '../infrastructure/writingProgressStore.ts'
import type { PracticeAnswer } from '../practice/PracticeView.tsx'
import WritingPractice from '../writingAcquisition/Grade2WritingPractice.tsx'
import { PROTOTYPE_OWNER, WRITING_KEY, writingDataset } from './content.ts'

const lesson = createWritingLesson(writingDataset, GRADE5_WRITING_POLICY)
export function WritingTrainer({ onExit }: { onExit: () => void }) {
  const [store, setStore] = useState<ReturnType<typeof openWritingStore> | null>(null)
  const [progress, setProgress] = useState<WritingProgress | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [revealMethod, setRevealMethod] = useState('skip_timer')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const busy = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    void withScrollsWrite(WRITING_KEY, () => {
      if (!mounted.current) return null
      return openWritingStore(localStorage, WRITING_KEY, PROTOTYPE_OWNER, () =>
        createWritingProgress(lesson, PROTOTYPE_OWNER, crypto.randomUUID(), new Date().toISOString()),
      )
    })
      .then((opened) => {
        if (!opened || !mounted.current) return
        if (opened.current.lesson.fingerprint !== lesson.fingerprint)
          throw new Error('This saved prototype uses a different target list. Nothing was overwritten.')
        setStore(opened)
        setProgress(opened.current)
      })
      .catch((failure) => {
        if (mounted.current) setError(String(failure))
      })
    return () => {
      mounted.current = false
      stopActiveAudio()
    }
  }, [])
  function exit() {
    mounted.current = false
    stopActiveAudio()
    onExit()
  }
  async function commit(command: WritingCommand) {
    if (!store || busy.current) throw new Error('A writing save is already in progress.')
    busy.current = true
    setSaving(true)
    try {
      const next = await withScrollsWrite(store.key, () => {
        if (!mounted.current || activityClock.paused)
          throw new Error('Reopen writing or close the report before continuing.')
        return store.apply(command, new Date().toISOString())
      })
      if (mounted.current) {
        setProgress(next)
        setError('')
      }
    } finally {
      busy.current = false
      if (mounted.current) setSaving(false)
    }
  }
  async function answer(value: PracticeAnswer) {
    if (typeof value !== 'boolean') {
      exit()
      return
    }
    if (!progress || !revealed || !progress.acquisition.flow.prompt || busy.current) return
    try {
      await commit(
        createWritingCommand({
          kind: 'answer',
          expectedRevision: progress.revision,
          promptId: progress.acquisition.flow.prompt.id,
          correct: value,
          revealMethod,
        }),
      )
      if (mounted.current) setRevealed(false)
    } catch (failure) {
      if (mounted.current) setError(String(failure))
    }
  }
  function speak(word: Word) {
    const profile = gradeAudioProfileFor('Grade 5')
    return playCachedWordAudio(word, false, {
      playbackRate: profile.dictationRate,
      sentenceRate: profile.dictationRate,
      pauseMs: profile.segmentGapMs,
    })
  }
  const flow = progress?.acquisition.flow
  const position = progress && teachingPosition(progress)
  const session: PracticeSession | null =
    progress && flow
      ? {
          id: progress.attemptId,
          childId: progress.owner,
          grade: 'Grade 5',
          primaryDatasetId: writingDataset.id,
          primaryPhase: 'acquisition',
          segment: 'primary',
          stage: flow.complete ? 'complete' : revealed ? 'review' : 'dictation',
          queue: flow.prompt ? [flow.prompt.word] : [],
          warmupQueue: [],
          primaryQueue: writingDataset.words,
          index: flow.targetIndex,
          startedAt: progress.createdAt,
          warmupAnswers: [],
          primaryAnswers: [],
          warmupCategoryByWordId: {},
          warmupRandomRotationWordIds: [],
          warmupRotationCycleId: 1,
          acquisition: revealed ? revealAcquisition(flow) : flow,
        }
      : null
  return (
    <>
      {progress && session ? (
        <WritingPractice
          progress={progress}
          session={session}
          datasets={[writingDataset]}
          onExit={exit}
          onReplay={() => speak(flow!.prompt!.word)}
          onBeginWarmup={() => undefined}
          onInterstitialComplete={() => undefined}
          onStartReview={() => undefined}
          onDictationComplete={(method = 'timer') => {
            if (!activityClock.paused) {
              setRevealMethod(method)
              setRevealed(true)
            }
          }}
          onAnswer={(value) => {
            void answer(value)
          }}
          onSpeakWord={speak}
          onSpeakReviewInstruction={() => undefined}
          reviewInstruction="Compare the whole word."
          onTeachingStep={async (step) => {
            if (!position || step !== position.step) throw new Error('Reopen writing to resume the confirmed step.')
            await commit(
              createWritingCommand({ kind: 'complete-teaching-step', expectedRevision: progress.revision, position }),
            )
          }}
        />
      ) : (
        <div className="oct23-menu">
          <p>Opening writing…</p>
          <button type="button" onClick={exit}>
            Return to menu
          </button>
        </div>
      )}
      {error && (
        <p className="oct23-error" role="alert">
          {error}
        </p>
      )}
      {saving && (
        <p className="oct23-saving" role="status">
          Saving your place in this browser…
        </p>
      )}
    </>
  )
}
