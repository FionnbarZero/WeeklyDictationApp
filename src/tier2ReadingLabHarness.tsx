import { useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowLeft, Check, Clock3, Headphones, RotateCcw, X } from 'lucide-react'
import type { AcquisitionAssessment, AcquisitionTargetSet, EngineAcquisitionFlow } from './acquisition/contracts.ts'
import { revealAcquisition, startAcquisition } from './acquisition/engine.ts'
import { transitionAcquisition } from './acquisition/transition.ts'
import { ReadingResponsePanel } from './readingPractice/ReadingResponsePanel.tsx'
import { readingShowCopyInstruction, type ReadingSpeechSegment } from './readingPractice/contracts.ts'
import './accessibility/typography.css'
import type { Tier2ReadingTarget } from './tier2/contracts.ts'
import type { Tier2ReadingPathway } from './tier2/contracts.ts'
import {
  buildTier2SmokeSnapshot,
  TIER2_SMOKE_GRADES,
  tier2SmokeAcquisitionTargetSet,
  tier2SmokePathwayId,
  tier2SmokePathwayLabel,
  tier2SmokePathways,
  tier2SmokePathwayTargets,
  tier2SmokeScenarioOptions,
  type Tier2SmokeGrade,
} from './tier2Lab/fixtures.ts'
import { browserSpeech, requireCompletedSpeech } from './audio/browserSpeech.ts'

const prototypeBaselineEnabled = import.meta.env.VITE_PROTOTYPE_BASELINE === 'true'

type SmokeAttempt = {
  promptKind: string
  target: Tier2ReadingTarget
  correct: boolean
  countsTowardScore: boolean
}

type AcquisitionRun = {
  kind: 'acquisition'
  pathwayId: string
  label: string
  targetSet: AcquisitionTargetSet<Tier2ReadingTarget>
  flow: EngineAcquisitionFlow<Tier2ReadingTarget>
  assessments: AcquisitionAssessment<Tier2ReadingTarget, 'recording-comparison'>[]
}

type QueueRun = {
  kind: 'test-review' | 'mastery'
  pathwayId: string
  label: string
  queue: Tier2ReadingTarget[]
  index: number
  attempts: SmokeAttempt[]
}

type SmokeRun = AcquisitionRun | QueueRun

function deterministicRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0x100000000
  }
}

function speakSequence(segments: readonly ReadingSpeechSegment[]) {
  return requireCompletedSpeech(
    browserSpeech.play(
      segments.map((segment) => ({
        text: segment.text,
        language: segment.language,
        rate: segment.rate,
      })),
    ),
  )
}

function speak(text: string) {
  return speakSequence([{ text, language: 'zh-CN', rate: 0.55 }])
}

function speakShowCopyInstruction(text: string) {
  return speakSequence(readingShowCopyInstruction(text))
}

function pathwayDescription(pathway: Tier2ReadingPathway) {
  if (!pathway.available) return pathway.unavailableReason || 'No Tier 2 reading targets are available.'
  const targetCount = tier2SmokePathwayTargets(pathway).length
  if (pathway.kind === 'acquisition')
    return `${targetCount} visible reading targets using this grade’s Acquisition sequence.`
  if (pathway.kind === 'mastery')
    return `${targetCount} reading occurrences are eligible for this module’s separate mastery history.`
  if (pathway.reviewGroupId)
    return `${targetCount} targets from ${pathway.cohorts.length} teaching weeks in one cumulative review.`
  return `${targetCount} targets in Test Review ${pathway.cycle || 1}.`
}

function pathwayStage(pathway: Tier2ReadingPathway) {
  if (pathway.kind === 'test-review') return `Review cycle ${pathway.cycle || 1}`
  return pathway.kind === 'acquisition' ? 'Teaching sequence' : 'Mastery eligible'
}

function runSummary(run: SmokeRun) {
  if (run.kind === 'acquisition') {
    const scored = run.assessments.filter((attempt) => attempt.countsTowardWeeklyScore)
    return {
      attempted: scored.length,
      correct: scored.filter((attempt) => attempt.correct).length,
      diagnostics: run.assessments.length - scored.length,
    }
  }
  return {
    attempted: run.attempts.length,
    correct: run.attempts.filter((attempt) => attempt.correct).length,
    diagnostics: 0,
  }
}

function Tier2ReadingSmokeLab() {
  const [grade, setGrade] = useState<Tier2SmokeGrade>('Grade 2')
  const [scenarioId, setScenarioId] = useState('current-week')
  const [run, setRun] = useState<SmokeRun | null>(null)
  const random = useRef<() => number>(deterministicRandom(2))
  const scenarioOptions = tier2SmokeScenarioOptions(grade)
  const snapshot = useMemo(() => buildTier2SmokeSnapshot(grade, scenarioId), [grade, scenarioId])
  const pathways = tier2SmokePathways(snapshot)

  function selectGrade(nextGrade: Tier2SmokeGrade) {
    setGrade(nextGrade)
    setScenarioId(tier2SmokeScenarioOptions(nextGrade)[0].id)
    setRun(null)
    browserSpeech.cancel()
  }

  function selectScenario(nextScenario: string) {
    setScenarioId(nextScenario)
    setRun(null)
    browserSpeech.cancel()
  }

  function startPathway(pathway: Tier2ReadingPathway) {
    if (!pathway.available) return
    const pathwayId = tier2SmokePathwayId(pathway)
    const label = tier2SmokePathwayLabel(pathway)
    if (pathway.kind === 'acquisition') {
      const targetSet = tier2SmokeAcquisitionTargetSet(pathway)
      random.current = deterministicRandom(grade === 'Kindergarten' ? 1 : grade === 'Grade 2' ? 2 : 5)
      setRun({
        kind: 'acquisition',
        pathwayId,
        label,
        targetSet,
        flow: startAcquisition(targetSet, snapshot.profile.acquisitionStrategy, random.current),
        assessments: [],
      })
      return
    }
    setRun({
      kind: pathway.kind,
      pathwayId,
      label,
      queue: tier2SmokePathwayTargets(pathway),
      index: 0,
      attempts: [],
    })
  }

  function answerAcquisition(correct: boolean) {
    setRun((current) => {
      if (!current || current.kind !== 'acquisition' || !current.flow.prompt) return current
      const revealed = revealAcquisition(current.flow)
      const transition = transitionAcquisition(
        revealed,
        current.targetSet,
        snapshot.profile.acquisitionStrategy,
        { correct, revealMethod: 'recording-comparison' as const },
        random.current,
      )
      return {
        ...current,
        flow: transition.nextFlow,
        assessments: transition.assessment ? [...current.assessments, transition.assessment] : current.assessments,
      }
    })
  }

  function answerQueue(correct: boolean) {
    setRun((current) => {
      if (!current || current.kind === 'acquisition') return current
      const target = current.queue[current.index]
      if (!target) return current
      return {
        ...current,
        index: current.index + 1,
        attempts: [
          ...current.attempts,
          {
            promptKind: current.kind,
            target,
            correct,
            countsTowardScore: true,
          },
        ],
      }
    })
  }

  function closeRun() {
    browserSpeech.cancel()
    setRun(null)
  }

  if (run) {
    const acquisitionPrompt = run.kind === 'acquisition' ? run.flow.prompt : null
    const queueTarget = run.kind !== 'acquisition' ? run.queue[run.index] : null
    const target = acquisitionPrompt?.word || queueTarget || null
    const complete = run.kind === 'acquisition' ? run.flow.complete || !run.flow.prompt : run.index >= run.queue.length
    const summary = runSummary(run)
    const showContinue = run.kind === 'acquisition' && acquisitionPrompt?.kind === 'show-copy'
    const position =
      run.kind === 'acquisition'
        ? Math.min(run.flow.targetIndex + 1, run.targetSet.targets.length)
        : Math.min(run.index + 1, run.queue.length)
    const total = run.kind === 'acquisition' ? run.targetSet.targets.length : run.queue.length
    const attempts =
      run.kind === 'acquisition'
        ? run.assessments.map((assessment) => ({
            promptKind: assessment.kind,
            target: assessment.target,
            correct: assessment.correct,
            countsTowardScore: assessment.countsTowardWeeklyScore,
          }))
        : run.attempts

    const promptId =
      acquisitionPrompt?.id ||
      `${run.pathwayId}:${run.kind === 'acquisition' ? run.flow.trialNumber : run.index}:${target?.id || 'complete'}`
    const progress = complete
      ? 100
      : Math.round(((run.kind === 'acquisition' ? run.flow.targetIndex : run.index) / Math.max(total, 1)) * 100)
    const promptPhase = run.kind === 'acquisition' ? `${run.flow.phase} · ${acquisitionPrompt?.kind}` : run.kind

    return (
      <main className="t2-shell t2-practice-shell">
        <p className="t2-safety">
          Development smoke test · Recordings stay in this prompt and are never saved or uploaded
        </p>
        <div className="practice-page">
          <div className="practice-top">
            <button className="back-button" type="button" onClick={closeRun}>
              <X size={18} /> Exit practice
            </button>
            <span className="practice-count">
              {run.label}
              <span>{complete ? ' · complete' : ` · ${position} of ${total}`}</span>
            </span>
          </div>
          <div className="practice-progress">
            <span style={{ width: `${progress}%` }} />
          </div>
          <section className={`prompt-card ${complete ? 'complete-card' : ''}`} aria-live="polite">
            {complete ? (
              <>
                <span className="complete-mark">
                  <Check size={27} />
                </span>
                <p className="eyebrow">{grade} · Tier 2 reading</p>
                <h1>Reading path complete</h1>
                <p className="review-instruction">
                  {summary.correct} of {summary.attempted} assessed reading responses were marked correct.
                </p>
                {summary.diagnostics > 0 && (
                  <p className="practice-helper">
                    {summary.diagnostics} Familiar-DT diagnostic response{summary.diagnostics === 1 ? '' : 's'} remained
                    outside the official target count.
                  </p>
                )}
                <button
                  className="primary-button review-start-button"
                  type="button"
                  onClick={() => {
                    const pathway = pathways.find((candidate) => tier2SmokePathwayId(candidate) === run.pathwayId)
                    if (pathway) startPathway(pathway)
                  }}
                >
                  <RotateCcw size={18} /> Run it again
                </button>
                <button className="replay-button" type="button" onClick={closeRun}>
                  <ArrowLeft size={18} /> Back to pathways
                </button>
              </>
            ) : (
              target && (
                <>
                  <div className="prompt-meta">
                    <span className={`set-chip chip-${run.kind === 'mastery' ? 'warmup' : run.kind}`}>
                      {promptPhase}
                    </span>
                    {acquisitionPrompt && (
                      <span className="timer">
                        <Clock3 size={15} /> {acquisitionPrompt.timerSeconds}-second pattern
                      </span>
                    )}
                  </div>
                  <ReadingResponsePanel
                    key={promptId}
                    promptId={promptId}
                    targetText={target.text}
                    assessed={!showContinue}
                    teachingPrompt={showContinue}
                    onPlayReference={() => speak(target.text)}
                    onPlayTeachingIntroduction={() => speakShowCopyInstruction(target.text)}
                    onAnswer={(correct) =>
                      run.kind === 'acquisition' ? answerAcquisition(correct) : answerQueue(correct)
                    }
                    onContinue={() => answerAcquisition(true)}
                  />
                </>
              )
            )}
          </section>
          <p className="practice-footnote">
            <Headphones size={14} /> Your recording is temporary · Nothing is saved or uploaded
          </p>
          <details className="t2-debug">
            <summary>View smoke-test trace</summary>
            <p>Completed responses: {attempts.length}. This trace exists only in memory.</p>
            <ol>
              {attempts.slice(-8).map((attempt, index) => (
                <li key={`${attempt.target.id}-${index}`}>
                  <span>{attempt.promptKind}</span> · <strong>{attempt.target.text}</strong> ·{' '}
                  {attempt.correct ? 'correct' : 'needs help'}
                  {attempt.countsTowardScore ? '' : ' · diagnostic'}
                </li>
              ))}
            </ol>
          </details>
        </div>
      </main>
    )
  }

  return (
    <main className="t2-shell">
      <p className="t2-safety">
        Development-only Tier 2 reading lab · Fixture data · Ephemeral microphone recording · No production activation,
        account data, or persistence
      </p>
      <header className="t2-hero">
        <p className="t2-eyebrow">Tier 2 reading smoke test</p>
        <h1>Follow each grade’s real learning path.</h1>
        <p>
          Reading keeps the target visible and follows the selected grade’s Acquisition, Test Review, and Mastery
          lifecycle pattern.
        </p>
      </header>

      <nav className="t2-grade-tabs" aria-label="Choose a grade">
        {TIER2_SMOKE_GRADES.map((option) => (
          <button
            className={option === grade ? 'active' : ''}
            type="button"
            key={option}
            aria-pressed={option === grade}
            onClick={() => selectGrade(option)}
          >
            {option}
          </button>
        ))}
      </nav>

      <section className="t2-snapshot-panel">
        <div>
          <p className="t2-eyebrow">Lifecycle snapshot · {snapshot.currentDateKey}</p>
          <h2>{snapshot.label}</h2>
          <p>{snapshot.description}</p>
        </div>
        {scenarioOptions.length > 1 && (
          <label>
            Choose lifecycle moment
            <select value={snapshot.id} onChange={(event) => selectScenario(event.target.value)}>
              {scenarioOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>

      <section className="t2-pathway-grid" aria-label={`${grade} Tier 2 pathways`}>
        {pathways.map((pathway) => {
          const label = tier2SmokePathwayLabel(pathway)
          const targetCount = tier2SmokePathwayTargets(pathway).length
          return (
            <article className={`t2-pathway t2-${pathway.kind}`} key={tier2SmokePathwayId(pathway)}>
              <p className="t2-eyebrow">{pathwayStage(pathway)}</p>
              <h2>{label}</h2>
              <p>{pathwayDescription(pathway)}</p>
              <div className="t2-cohort-list">
                {pathway.cohorts.length > 0 ? (
                  pathway.cohorts.map((cohort) => (
                    <span key={cohort.datasetId}>
                      {cohort.datasetId.replace(`${grade.toLowerCase().replace(' ', '')}-smoke-`, '')} ·{' '}
                      {cohort.targets.length} targets
                    </span>
                  ))
                ) : (
                  <span>No cohort in this snapshot</span>
                )}
              </div>
              <button
                className="t2-primary"
                type="button"
                disabled={!pathway.available || targetCount === 0}
                onClick={() => startPathway(pathway)}
              >
                {pathway.available && targetCount > 0 ? `Smoke test ${label}` : 'Unavailable in this snapshot'}
              </button>
            </article>
          )
        })}
      </section>

      <details className="t2-debug t2-boundary-details">
        <summary>What this screen proves</summary>
        <ul>
          <li>
            The grade-owned lifecycle selects the reading cohorts; this lab does not calculate a second lifecycle.
          </li>
          <li>Acquisition runs the shared engine with a separate Tier 2 strategy and visible reading targets.</li>
          <li>
            Kindergarten preserves cumulative review, Grade 2 preserves one review, and Grade 5 preserves two reviews.
          </li>
          <li>
            Mastery terms remain separate from Tier 1 writing. Microphone recordings are prompt-local and ephemeral;
            durable queues, official scores, and cloud persistence are not connected here.
          </li>
        </ul>
      </details>
    </main>
  )
}

function Tier2ReadingLabEntry() {
  if (!import.meta.env.DEV && !prototypeBaselineEnabled)
    return (
      <main className="t2-shell">
        <p className="t2-safety">This Tier 2 smoke-test page is available only from the local development server.</p>
      </main>
    )
  return <Tier2ReadingSmokeLab />
}

const rootElement = document.getElementById('tier2-reading-lab-root')
if (!rootElement) throw new Error('Missing Tier 2 reading lab root.')
createRoot(rootElement).render(<Tier2ReadingLabEntry />)
