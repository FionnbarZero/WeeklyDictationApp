import { useEffect, useRef, useState } from 'react'
import { activityClock, pauseToFamilyHub } from '../activity/activityLifecycle.ts'
import { gradeAudioProfileFor } from '../audio/gradeAudioProfile.ts'
import { withKindergartenAudio } from '../audio/kindergartenAudio.ts'
import { playCachedWordAudioOnce, playReadingTeachingSequence, stopActiveAudio } from '../audio/promptAudio.ts'
import type { Dataset } from '../domain/contracts.ts'
import { ReadingResponsePanel } from '../readingPractice/ReadingResponsePanel.tsx'
import type { Tier2ReadingTarget } from '../tier2/contracts.ts'
import { familyAcquisitionStore } from './acquisitionRuntime.ts'
import { pendingResults, previewProfile, savePreviewResult } from './runtime.ts'
import { assertScrollsAnswerOpen, ScrollsAttemptClosedError, withScrollsWrite } from './scrollsCompletion.ts'
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
  const [closedElsewhere, setClosedElsewhere] = useState(false)
  const saving = useRef(false)
  const activeVisit = useRef(true)
  const [savingScore, setSavingScore] = useState(false)
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
  useEffect(() => {
    activeVisit.current = true
    return () => {
      activeVisit.current = false
      stopActiveAudio()
    }
  }, [])

  function exit() {
    // Invalidate synchronously, before React unmounts or a queued lock resolves.
    activeVisit.current = false
    stopActiveAudio()
    onExit()
  }

  function assertWritable() {
    if (!activeVisit.current) throw new Error('This visit has ended. Reviewed saved work is preserved.')
    if (activityClock.paused) throw new Error('Close the report or return to this activity before saving.')
    const profile = previewProfile()
    if (profile?.id !== store.current.envelope.childId || profile.grade !== store.current.envelope.grade)
      throw new Error('The child profile changed. Your saved work is preserved.')
    store.assertActive()
  }
  async function answer(correct: boolean) {
    // Throw back to the panel: its exact reviewed response stays locked for retry.
    try {
      const saved = await withScrollsWrite(store.key, () => {
        assertWritable()
        assertScrollsAnswerOpen(localStorage, store.current.sessionId)
        return store.answer(correct, 'recording-comparison')
      })
      if (!activeVisit.current) return
      setCurrent(saved)
      setError('')
    } catch (failure) {
      if (activeVisit.current && failure instanceof ScrollsAttemptClosedError) setClosedElsewhere(true)
      throw failure
    }
  }
  async function finish() {
    if (!activeVisit.current || activityClock.paused || reviewPending || saving.current) return
    saving.current = true
    setSavingScore(true)
    if (scored.length) setFinishing(true)
    try {
      await withScrollsWrite(store.key, () => {
        assertWritable()
        if (scored.length) {
          const saved = store.prepareResult()
          const facts = saved.assessments.filter((assessment) => assessment.countsTowardWeeklyScore)
          const result = savePreviewResult({
            id: saved.sessionId,
            activity: WHISPERING_SCROLLS_TITLE,
            channel: 'reading',
            datasetIds: [saved.envelope.datasetId],
            schoolYear: saved.envelope.schoolYear,
            correct: facts.filter((assessment) => assessment.correct).length,
            attempted: facts.length,
          })
          if (!result) throw new Error('The Whispering Scrolls score could not be confirmed.')
        }
      })
      if (activeVisit.current) exit()
    } catch (failure) {
      if (activeVisit.current)
        setError(failure instanceof Error ? failure.message : 'The score could not be saved. Please retry.')
    } finally {
      saving.current = false
      if (activeVisit.current) setSavingScore(false)
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
            if (!pauseToFamilyHub()) exit()
          }}
        >
          Pause and return
        </button>
        <button className="secondary-button" type="button" disabled={reviewPending || savingScore} onClick={finish}>
          Done for today
        </button>
      </div>
      <p className="eyebrow">{current.envelope.grade} · Tier 2 acquisition</p>
      <h1>Whispering Scrolls</h1>
      <p>Unroll each word. Read it aloud, listen to your voice and the model, then check your reading.</p>
      {error && <p role="alert">{error} Your reviewed work is preserved; try Done for today again.</p>}
      {closedElsewhere && (
        <section aria-label="Finished in another tab">
          <p>
            Your earlier score and teaching progress are safe. Return to the Dojo and reopen Scrolls to repeat only this
            unfinished response in a new visit. The temporary recording will be released when you leave.
          </p>
          <button type="button" className="primary-button" onClick={exit}>
            Return to Dojo
          </button>
        </section>
      )}
      <section className="whispering-scroll" aria-label="Reading scroll">
        {complete ? (
          <>
            <h2>{finishing && !flow.complete ? 'Save today’s reading' : 'Scrolls complete'}</h2>
            <p>
              {scored.filter((assessment) => assessment.correct).length} of {scored.length} scored responses marked
              correct.
            </p>
            <button className="primary-button" type="button" disabled={savingScore} onClick={finish}>
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
