import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, Clock3, Headphones, X } from 'lucide-react'
import { revealAcquisition, startAcquisition } from '../acquisition/engine.ts'
import { transitionAcquisition } from '../acquisition/transition.ts'
import type { Tier2ReadingPathway, Tier2ReadingProfile } from '../tier2/contracts.ts'
import { tier2ReadingAcquisitionTargetSet, tier2ReadingPathwayTargets } from '../tier2/pathway.ts'
import { ReadingResponsePanel } from './ReadingResponsePanel.tsx'
import {
  readingShowCopyInstruction,
  TIER2_READING_PROGRESS_CONTRACT_ID,
  TIER2_READING_PROGRESS_SCHEMA_VERSION,
  type ReadingSpeechSegment,
  type Tier2ReadingPersistence,
  type Tier2ReadingPracticeSummary,
  type Tier2ReadingProgressRecord,
  type Tier2ReadingRun,
} from './contracts.ts'
import { browserSpeech, requireCompletedSpeech } from '../audio/browserSpeech.ts'

export type { Tier2ReadingPracticeSummary } from './contracts.ts'

export type Tier2ReadingPracticeProps = {
  readonly profile: Tier2ReadingProfile
  readonly pathway: Tier2ReadingPathway
  readonly label: string
  readonly onExit: () => void
  readonly onComplete: (summary: Tier2ReadingPracticeSummary, progress?: Tier2ReadingProgressRecord) => void
  readonly random?: () => number
  readonly sessionNote?: string
  readonly persistence?: Tier2ReadingPersistence
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

function initialRun(profile: Tier2ReadingProfile, pathway: Tier2ReadingPathway, random: () => number): Tier2ReadingRun {
  if (!pathway.available) throw new Error(pathway.unavailableReason || 'This Tier 2 reading pathway is unavailable.')
  if (pathway.kind === 'acquisition') {
    const targetSet = tier2ReadingAcquisitionTargetSet(pathway)
    return {
      kind: 'acquisition',
      targetSet,
      flow: startAcquisition(targetSet, profile.acquisitionStrategy, random),
      assessments: [],
    }
  }
  return {
    kind: pathway.kind,
    queue: tier2ReadingPathwayTargets(pathway),
    index: 0,
    attempts: [],
  }
}

function summaryFor(run: Tier2ReadingRun): Tier2ReadingPracticeSummary {
  if (run.kind === 'acquisition') {
    const scored = run.assessments.filter((attempt) => attempt.countsTowardWeeklyScore)
    return {
      kind: run.kind,
      attempted: scored.length,
      correct: scored.filter((attempt) => attempt.correct).length,
      diagnostics: run.assessments.length - scored.length,
    }
  }
  return {
    kind: run.kind,
    attempted: run.attempts.length,
    correct: run.attempts.filter((attempt) => attempt.correct).length,
    diagnostics: 0,
  }
}

function pathwayTargetIds(pathway: Tier2ReadingPathway) {
  return tier2ReadingPathwayTargets(pathway).map((target) => target.id)
}

function savedProgressMatches(
  progress: Tier2ReadingProgressRecord | undefined,
  profile: Tier2ReadingProfile,
  pathway: Tier2ReadingPathway,
) {
  if (!progress || progress.status !== 'in-progress') return false
  if (
    progress.contractId !== TIER2_READING_PROGRESS_CONTRACT_ID ||
    progress.schemaVersion !== TIER2_READING_PROGRESS_SCHEMA_VERSION ||
    progress.profileId !== profile.id ||
    progress.profileVersion !== profile.version ||
    progress.grade !== profile.grade ||
    progress.activityModule !== profile.activityModule ||
    progress.pathwayKind !== pathway.kind ||
    progress.reviewCycle !== pathway.cycle ||
    progress.reviewGroupId !== pathway.reviewGroupId
  )
    return false
  const expectedCohorts = pathway.cohorts.map((cohort) => cohort.datasetId)
  const expectedTargets = pathwayTargetIds(pathway)
  return (
    progress.cohortIds.length === expectedCohorts.length &&
    progress.cohortIds.every((id, index) => id === expectedCohorts[index]) &&
    progress.targetOccurrenceIds.length === expectedTargets.length &&
    progress.targetOccurrenceIds.every((id, index) => id === expectedTargets[index]) &&
    progress.run.kind === pathway.kind
  )
}

export function Tier2ReadingPractice({
  profile,
  pathway,
  label,
  onExit,
  onComplete,
  random = Math.random,
  sessionNote = 'Your recording is temporary and is never saved or uploaded.',
  persistence,
}: Tier2ReadingPracticeProps) {
  const randomRef = useRef(random)
  const restored = savedProgressMatches(persistence?.savedProgress, profile, pathway)
    ? persistence?.savedProgress
    : undefined
  const progressRef = useRef<Tier2ReadingProgressRecord | undefined>(restored)
  const [run, setRun] = useState<Tier2ReadingRun>(
    () => restored?.run || initialRun(profile, pathway, randomRef.current),
  )

  useEffect(() => () => browserSpeech.cancel(), [])

  function checkpoint(nextRun: Tier2ReadingRun) {
    if (!persistence) return
    const timestamp = new Date().toISOString()
    const current = progressRef.current
    const progress: Tier2ReadingProgressRecord = {
      schemaVersion: TIER2_READING_PROGRESS_SCHEMA_VERSION,
      contractId: TIER2_READING_PROGRESS_CONTRACT_ID,
      id: persistence.sessionId,
      childId: persistence.childId,
      grade: profile.grade,
      schoolYear: persistence.schoolYear,
      activityModule: profile.activityModule,
      profileId: profile.id,
      profileVersion: profile.version,
      pathwayKind: pathway.kind,
      ...(pathway.cycle ? { reviewCycle: pathway.cycle } : {}),
      ...(pathway.reviewGroupId ? { reviewGroupId: pathway.reviewGroupId } : {}),
      cohortIds: pathway.cohorts.map((cohort) => cohort.datasetId),
      targetOccurrenceIds: pathwayTargetIds(pathway),
      revision: (current?.revision || 0) + 1,
      status: 'in-progress',
      run: nextRun,
      startedAt: current?.startedAt || persistence.startedAt,
      updatedAt: timestamp,
    }
    progressRef.current = progress
    persistence.onCheckpoint(progress)
  }

  function answerAcquisition(correct: boolean) {
    setRun((current) => {
      if (current.kind !== 'acquisition' || !current.flow.prompt) return current
      const transition = transitionAcquisition(
        revealAcquisition(current.flow),
        current.targetSet,
        profile.acquisitionStrategy,
        { correct, revealMethod: 'recording-comparison' as const },
        randomRef.current,
      )
      const next: Tier2ReadingRun = {
        ...current,
        flow: transition.nextFlow,
        assessments: transition.assessment ? [...current.assessments, transition.assessment] : current.assessments,
      }
      checkpoint(next)
      return next
    })
  }

  function answerQueue(correct: boolean) {
    setRun((current) => {
      if (current.kind === 'acquisition') return current
      const target = current.queue[current.index]
      if (!target) return current
      const next: Tier2ReadingRun = {
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
      checkpoint(next)
      return next
    })
  }

  function exit() {
    browserSpeech.cancel()
    onExit()
  }

  const acquisitionPrompt = run.kind === 'acquisition' ? run.flow.prompt : null
  const queueTarget = run.kind === 'acquisition' ? null : run.queue[run.index]
  const target = acquisitionPrompt?.word || queueTarget || null
  const complete = run.kind === 'acquisition' ? run.flow.complete || !run.flow.prompt : run.index >= run.queue.length
  const total = run.kind === 'acquisition' ? run.targetSet.targets.length : run.queue.length
  const position =
    run.kind === 'acquisition' ? Math.min(run.flow.targetIndex + 1, total) : Math.min(run.index + 1, total)
  const progressPosition = run.kind === 'acquisition' ? run.flow.targetIndex : run.index
  const progress = complete ? 100 : Math.round((progressPosition / Math.max(total, 1)) * 100)
  const showContinue = run.kind === 'acquisition' && acquisitionPrompt?.kind === 'show-copy'
  const promptId =
    acquisitionPrompt?.id ||
    `${pathway.kind}:${run.kind === 'acquisition' ? run.flow.trialNumber : run.index}:${target?.id || 'complete'}`
  const promptPhase =
    run.kind === 'acquisition'
      ? `${run.flow.phase} · ${acquisitionPrompt?.kind}`
      : run.kind === 'test-review'
        ? `Test Review ${pathway.cycle || 1}`
        : 'Mastery reading'
  const summary = summaryFor(run)

  return (
    <div className="reading-practice-page practice-page">
      <div className="practice-top">
        <button className="back-button" type="button" onClick={exit}>
          <X size={18} /> Exit reading
        </button>
        <span className="practice-count">
          {label}
          <span>{complete ? ' · complete' : ` · ${position} of ${total}`}</span>
        </span>
      </div>
      <div
        className="practice-progress"
        role="progressbar"
        aria-label="Reading activity progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
      >
        <span style={{ width: `${progress}%` }} />
      </div>
      <section className={`prompt-card ${complete ? 'complete-card' : ''}`} aria-live="polite">
        {complete ? (
          <>
            <span className="complete-mark">
              <Check size={27} />
            </span>
            <p className="eyebrow">{profile.grade} · Tier 2 reading</p>
            <h1>Reading path complete</h1>
            <p className="review-instruction">
              {summary.correct} of {summary.attempted} assessed reading responses were marked correct.
            </p>
            {summary.diagnostics > 0 && (
              <p className="practice-helper">
                {summary.diagnostics} Familiar-DT diagnostic response{summary.diagnostics === 1 ? '' : 's'} stayed
                outside the official target count.
              </p>
            )}
            <button
              className="primary-button review-start-button"
              type="button"
              onClick={() => onComplete(summary, progressRef.current)}
            >
              Done <ArrowLeft size={18} />
            </button>
          </>
        ) : target ? (
          <>
            <div className="prompt-meta">
              <span className={`set-chip chip-${run.kind === 'mastery' ? 'warmup' : run.kind}`}>{promptPhase}</span>
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
              onPlayReference={() => speakSequence([{ text: target.text, language: 'zh-CN', rate: 0.55 }])}
              onPlayTeachingIntroduction={() => speakSequence(readingShowCopyInstruction(target.text))}
              onAnswer={(correct) => (run.kind === 'acquisition' ? answerAcquisition(correct) : answerQueue(correct))}
              onContinue={() => answerAcquisition(true)}
            />
          </>
        ) : (
          <p className="error-banner">This reading pathway has no available targets.</p>
        )}
      </section>
      <p className="practice-footnote">
        <Headphones size={14} /> {sessionNote}
      </p>
    </div>
  )
}
