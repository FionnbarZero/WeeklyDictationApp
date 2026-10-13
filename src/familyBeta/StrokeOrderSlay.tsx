import { useEffect, useRef, useState } from 'react'
import type { AcquisitionTarget } from '../acquisition/contracts.ts'
import { activityClock, pauseToFamilyHub } from '../activity/activityLifecycle.ts'
import { stopActiveAudio } from '../audio/promptAudio.ts'
import type { Dataset } from '../domain/contracts.ts'
import { familyAcquisitionStore } from './acquisitionRuntime.ts'
import { pendingResults, previewProfile, savePreviewResult } from './runtime.ts'
import { StrokeOrderResponse, type StrokeReveal } from './StrokeOrderResponse.tsx'
// Keep the existing lock namespace: both activities use the reviewed D1
// completion boundary, with keys scoped by their separate module identities.
import { assertScrollsAnswerOpen, ScrollsAttemptClosedError, withScrollsWrite } from './scrollsCompletion.ts'
import { STROKE_ORDER_MODULE, STROKE_ORDER_TITLE, strokeOrderGuide, strokeOrderLesson } from './strokeOrderSlay.ts'
import './strokeOrderSlay.css'

export function StrokeOrderSlay({ datasets, onExit }: { datasets: Dataset[]; onExit: () => void }) {
  const [store] = useState(() => {
    const lesson = strokeOrderLesson(datasets)
    const saved = familyAcquisitionStore<AcquisitionTarget, StrokeReveal>(
      lesson.targetSet,
      lesson.strategy,
      STROKE_ORDER_MODULE,
      'tier-1',
    )
    if (!saved) throw new Error('Open Stroke Order Slay from your family Dojo.')
    // Validate the pinned lesson too: a newly supported source must never
    // silently replace or remove a saved target whose guide is unavailable.
    for (const target of [...saved.context.targetSet.targets, ...saved.context.strategy.familiarDtTargets])
      strokeOrderGuide(target)
    return saved
  })
  const [current, setCurrent] = useState(store.current)
  const [error, setError] = useState('')
  const [reviewPending, setReviewPending] = useState(false)
  const [closedElsewhere, setClosedElsewhere] = useState(false)
  const saving = useRef(false)
  const [savingScore, setSavingScore] = useState(false)
  const [finishing, setFinishing] = useState(() =>
    pendingResults().some((result) => result.id === store.current.sessionId),
  )
  const flow = current.envelope.flow
  const prompt = flow.prompt
  const complete = flow.complete || !prompt || finishing
  const scored = current.assessments.filter((item) => item.countsTowardWeeklyScore)
  const total = (datasets[0].vocabulary?.tier1 || datasets[0].words).length
  const selected = store.context.targetSet.targets.length
  useEffect(() => () => stopActiveAudio(), [])

  function assertWritable() {
    if (activityClock.paused) throw new Error('Close the report or return to this activity before saving.')
    const profile = previewProfile()
    if (profile?.id !== store.current.envelope.childId || profile.grade !== store.current.envelope.grade)
      throw new Error('The child profile changed. Your saved work is preserved.')
    store.assertActive()
  }
  async function answer(correct: boolean, method: StrokeReveal) {
    try {
      const saved = await withScrollsWrite(store.key, () => {
        assertWritable()
        assertScrollsAnswerOpen(localStorage, store.current.sessionId)
        return store.answer(correct, method)
      })
      setCurrent(saved)
      setError('')
    } catch (failure) {
      if (failure instanceof ScrollsAttemptClosedError) setClosedElsewhere(true)
      throw failure
    }
  }
  async function finish() {
    if (activityClock.paused || reviewPending || saving.current) return
    saving.current = true
    setSavingScore(true)
    if (scored.length) setFinishing(true)
    try {
      await withScrollsWrite(store.key, () => {
        assertWritable()
        if (scored.length) {
          const saved = store.prepareResult()
          const facts = saved.assessments.filter((item) => item.countsTowardWeeklyScore)
          const result = savePreviewResult({
            id: saved.sessionId,
            activity: STROKE_ORDER_TITLE,
            channel: 'writing',
            datasetIds: [saved.envelope.datasetId],
            schoolYear: saved.envelope.schoolYear,
            correct: facts.filter((item) => item.correct).length,
            attempted: facts.length,
          })
          if (!result) throw new Error('The Stroke Order Slay score could not be confirmed.')
        }
      })
      stopActiveAudio()
      onExit()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The score could not be saved. Please retry.')
    } finally {
      saving.current = false
      setSavingScore(false)
    }
  }
  return (
    <main
      className="stroke-acquisition practice-page"
      data-report-activity={STROKE_ORDER_TITLE}
      data-report-phase={complete ? 'complete' : `${flow.phase} · ${prompt.kind}`}
      data-report-target={prompt?.word.id}
      data-report-position={flow.targetIndex + 1}
    >
      <div className="practice-top">
        <button
          onClick={() => {
            if (!pauseToFamilyHub()) onExit()
          }}
        >
          Pause and return
        </button>
        <button disabled={reviewPending || savingScore} onClick={finish}>
          Done for today
        </button>
      </div>
      <p className="eyebrow">{current.envelope.grade} · Tier 1 acquisition</p>
      <h1>Stroke Order Slay</h1>
      <p>Learn through your grade’s writing sequence. Progress saves separately from ordinary writing.</p>
      <p>
        {selected} of {total} writing targets have guides for this saved lesson.
        {selected < total ? ' Other targets remain available in ordinary writing.' : ''}
      </p>
      {error && <p role="alert">{error} Your reviewed work is preserved; try Done for today again.</p>}
      {closedElsewhere ? (
        <section aria-label="Finished in another tab">
          <p>
            Your earlier score and teaching progress are safe. Return to the Dojo and reopen Stroke Order Slay to repeat
            only this unfinished response in a new visit.
          </p>
          <button
            onClick={() => {
              stopActiveAudio()
              onExit()
            }}
          >
            Return to Dojo
          </button>
        </section>
      ) : complete ? (
        <section>
          <h2>{finishing && !flow.complete ? 'Save today’s writing' : 'Teaching sequence complete'}</h2>
          <p>
            {scored.filter((item) => item.correct).length} of {scored.length} scored responses marked correct.
          </p>
          <p>Return for ongoing familiar and earned practice.</p>
          <button disabled={savingScore} onClick={finish}>
            {finishing ? 'Retry saving score' : 'Save and finish'}
          </button>
        </section>
      ) : (
        <StrokeOrderResponse
          key={prompt.id}
          prompt={prompt}
          grade={current.envelope.grade}
          onAnswer={answer}
          onPending={setReviewPending}
        />
      )}
    </main>
  )
}
