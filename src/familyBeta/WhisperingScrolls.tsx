import { useEffect, useState } from 'react'
import { activityClock, pauseToFamilyHub } from '../activity/activityLifecycle.ts'
import { gradeAudioProfileFor } from '../audio/gradeAudioProfile.ts'
import { withKindergartenAudio } from '../audio/kindergartenAudio.ts'
import { playCachedWordAudioOnce, playReadingTeachingSequence, stopActiveAudio } from '../audio/promptAudio.ts'
import type { Dataset } from '../domain/contracts.ts'
import { ReadingResponsePanel } from '../readingPractice/ReadingResponsePanel.tsx'
import type { Tier2ReadingTarget } from '../tier2/contracts.ts'
import { familyAcquisitionStore } from './acquisitionRuntime.ts'
import { pendingResults, savePreviewResult } from './runtime.ts'
import { WHISPERING_SCROLLS_MODULE, WHISPERING_SCROLLS_TITLE, whisperingScrollsLesson } from './whisperingScrolls.ts'
import './whisperingScrolls.css'

export function WhisperingScrolls({ datasets, onExit }: { datasets: Dataset[]; onExit: () => void }) {
  const [store] = useState(() => {
    const lesson = whisperingScrollsLesson(datasets)
    const saved = familyAcquisitionStore<Tier2ReadingTarget, 'recording-comparison'>(
      lesson.targetSet,
      lesson.profile.acquisitionStrategy,
      WHISPERING_SCROLLS_MODULE,
      'tier-2',
    )
    if (!saved) throw new Error('Open Whispering Scrolls from your family Dojo.')
    return saved
  })
  const [current, setCurrent] = useState(store.current)
  const [error, setError] = useState('')
  const [reviewPending, setReviewPending] = useState(false)
  // A queued completion is already an immutable score intent. Reopening may
  // retry its confirmation, but must not append answers to the same attempt.
  const [finishing, setFinishing] = useState(() =>
    pendingResults().some((result) => result.id === store.current.sessionId),
  )
  const flow = current.envelope.flow
  const prompt = flow.prompt
  const complete = flow.complete || !prompt || finishing
  const targets = store.context.targetSet.targets
  const scored = current.assessments.filter((assessment) => assessment.countsTowardWeeklyScore)
  const audio = gradeAudioProfileFor(current.envelope.grade)
  const audioTarget = (target: Tier2ReadingTarget) =>
    current.envelope.grade === 'Kindergarten' ? withKindergartenAudio(target) : target
  useEffect(() => () => stopActiveAudio(), [])

  function answer(correct: boolean) {
    if (activityClock.paused) throw new Error('Close the report or return to this activity before saving.')
    // Throw back to the panel: its exact reviewed response stays locked for retry.
    const saved = store.answer(correct, 'recording-comparison')
    setCurrent(saved)
    setError('')
  }
  function finish() {
    if (activityClock.paused || reviewPending) return
    if (scored.length) setFinishing(true)
    try {
      store.assertActive()
      if (scored.length) {
        const saved = store.prepareResult()
        const result = savePreviewResult({
          id: saved.sessionId,
          activity: WHISPERING_SCROLLS_TITLE,
          channel: 'reading',
          datasetIds: [saved.envelope.datasetId],
          schoolYear: saved.envelope.schoolYear,
          correct: scored.filter((assessment) => assessment.correct).length,
          attempted: scored.length,
        })
        if (!result) throw new Error('The Whispering Scrolls score could not be confirmed.')
      }
      stopActiveAudio()
      onExit()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The score could not be saved. Please retry.')
    }
  }

  return (
    <main
      className="whispering-scrolls practice-page"
      data-report-activity={WHISPERING_SCROLLS_TITLE}
      data-report-phase={complete ? 'complete' : `${flow.phase} · ${prompt.kind}`}
      data-report-target={prompt?.word.id}
      data-report-position={flow.targetIndex + 1}
    >
      <div className="practice-top">
        <button
          className="back-button"
          type="button"
          onClick={() => {
            if (!pauseToFamilyHub()) onExit()
          }}
        >
          Pause and return
        </button>
        <button className="secondary-button" type="button" disabled={reviewPending} onClick={finish}>
          Done for today
        </button>
      </div>
      <p className="eyebrow">{current.envelope.grade} · Tier 2 acquisition</p>
      <h1>Whispering Scrolls</h1>
      <p>Unroll each word. Read it aloud, listen to your voice and the model, then check your reading.</p>
      {error && <p role="alert">{error} Your reviewed work is preserved; try Done for today again.</p>}
      <section className="whispering-scroll" aria-label="Reading scroll">
        {complete ? (
          <>
            <h2>{finishing && !flow.complete ? 'Save today’s reading' : 'Scrolls complete'}</h2>
            <p>
              {scored.filter((assessment) => assessment.correct).length} of {scored.length} scored responses marked
              correct.
            </p>
            <button className="primary-button" type="button" onClick={finish}>
              {finishing ? 'Retry saving score' : 'Save and finish'}
            </button>
          </>
        ) : (
          <>
            <p className="prompt-meta">
              <span>{flow.mode === 'dt-practice' ? 'Earned practice' : flow.phase.replace(/-/g, ' ')}</span>
              <span>
                {Math.min(flow.targetIndex + 1, targets.length)} of {targets.length} words · {prompt.timerSeconds}
                -second response
              </span>
            </p>
            <ReadingResponsePanel
              key={prompt.id}
              promptId={prompt.id}
              targetText={prompt.word.text}
              assessed={prompt.kind !== 'show-copy'}
              teachingPrompt={prompt.kind === 'show-copy'}
              responseSeconds={prompt.timerSeconds}
              onPlayReference={() =>
                playCachedWordAudioOnce(audioTarget(prompt.word), { playbackRate: audio.readingRate })
              }
              onPlayTeachingIntroduction={() =>
                playReadingTeachingSequence(audioTarget(prompt.word), {
                  playbackRate: audio.readingRate,
                  sentenceRate: audio.readingRate,
                  instructionRate: audio.instructionRate,
                  pauseMs: audio.segmentGapMs,
                })
              }
              onAnswer={answer}
              onContinue={() => answer(true)}
              onReviewPending={setReviewPending}
            />
          </>
        )}
      </section>
      <p className="practice-footnote">
        Recordings stay only in this visit. Reviewed progress saves after each trial, separately from Read the Words.
        After reopening, repeat only the unfinished recording.
      </p>
    </main>
  )
}
