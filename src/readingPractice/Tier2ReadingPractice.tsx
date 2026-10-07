import { pauseToFamilyHub } from '../activity/activityLifecycle.ts'
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, Clock3, Headphones, X } from 'lucide-react'
import type {
  AcquisitionAssessment,
  AcquisitionTargetSet,
  EngineAcquisitionFlow,
} from '../acquisition/contracts.ts'
import { revealAcquisition, startAcquisition } from '../acquisition/engine.ts'
import { transitionAcquisition } from '../acquisition/transition.ts'
import type {
  Tier2ReadingPathway,
  Tier2ReadingProfile,
  Tier2ReadingTarget,
} from '../tier2/contracts.ts'
import {
  tier2ReadingAcquisitionTargetSet,
  tier2ReadingPathwayTargets,
} from '../tier2/pathway.ts'
import { ReadingResponsePanel } from './ReadingResponsePanel.tsx'
import {
  playCachedWordAudioOnce,
  playReadingTeachingSequence,
  stopActiveAudio,
} from '../audio/promptAudio.ts'
import { gradeAudioProfileFor } from '../audio/gradeAudioProfile.ts'
import { DeferredTestReview } from '../testReview/DeferredTestReview.tsx'
import { familyAcquisitionStore } from '../familyBeta/acquisitionRuntime.ts'

type ReadingAttempt = {
  readonly promptKind: string
  readonly target: Tier2ReadingTarget
  readonly correct: boolean
  readonly countsTowardScore: boolean
}

type AcquisitionRun = {
  readonly kind: 'acquisition'
  readonly targetSet: AcquisitionTargetSet<Tier2ReadingTarget>
  readonly flow: EngineAcquisitionFlow<Tier2ReadingTarget>
  readonly assessments: AcquisitionAssessment<Tier2ReadingTarget, 'recording-comparison'>[]
}

type QueueRun = {
  readonly kind: 'test-review' | 'mastery'
  readonly queue: Tier2ReadingTarget[]
  readonly index: number
  readonly attempts: ReadingAttempt[]
}

type ReadingRun = AcquisitionRun | QueueRun

export type Tier2ReadingPracticeSummary = {
  readonly sessionId?: string
  readonly kind: Tier2ReadingPathway['kind']
  readonly attempted: number
  readonly correct: number
  readonly diagnostics: number
}

export type ReadingTeachingIntroductionContext = {
  readonly firstPresentationOfNewTarget: boolean
}

export type Tier2ReadingPracticeProps = {
  readonly profile: Tier2ReadingProfile
  readonly pathway: Tier2ReadingPathway
  readonly label: string
  readonly onExit: () => void
  readonly onComplete: (summary: Tier2ReadingPracticeSummary) => void
  readonly onPlayReference?: (target: Tier2ReadingTarget) => Promise<void>
  readonly onPlayTeachingIntroduction?: (
    target: Tier2ReadingTarget,
    context: ReadingTeachingIntroductionContext,
  ) => Promise<void>
  readonly random?: () => number
  readonly sessionNote?: string
  readonly persistAcquisition?: boolean
}

function defaultReadingReference(profile: Tier2ReadingProfile, target: Tier2ReadingTarget) {
  const audio = gradeAudioProfileFor(profile.grade)
  return playCachedWordAudioOnce(target, { playbackRate: audio.readingRate })
}

function defaultTeachingIntroduction(profile: Tier2ReadingProfile, target: Tier2ReadingTarget) {
  const audio = gradeAudioProfileFor(profile.grade)
  return playReadingTeachingSequence(target, {
    playbackRate: audio.readingRate,
    sentenceRate: audio.readingRate,
    instructionRate: audio.instructionRate,
    pauseMs: audio.segmentGapMs,
  })
}

function initialRun(
  profile: Tier2ReadingProfile,
  pathway: Tier2ReadingPathway,
  random: () => number,
): ReadingRun {
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

function summaryFor(run: ReadingRun): Tier2ReadingPracticeSummary {
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

export function Tier2ReadingPractice(props: Tier2ReadingPracticeProps) {
  if (props.pathway.kind === 'test-review') {
    const targets = tier2ReadingPathwayTargets(props.pathway)
    return <DeferredTestReview
      mode="reading"
      targets={targets}
      activityLabel={props.label}
      onPlayReference={(target) => props.onPlayReference
        ? props.onPlayReference(target)
        : defaultReadingReference(props.profile, target)}
      onDiscard={props.onExit}
      onComplete={(completion) => props.onComplete({
        kind: 'test-review',
        attempted: completion.attempted,
        correct: completion.correct,
        diagnostics: 0,
      })}
      exitLabel="Exit reading"
      sessionNote={props.sessionNote}
    />
  }
  return <ImmediateTier2ReadingPractice {...props} />
}

function ImmediateTier2ReadingPractice({
  profile,
  pathway,
  label,
  onExit,
  onComplete,
  onPlayReference,
  onPlayTeachingIntroduction,
  random = Math.random,
  sessionNote = 'Your recording is temporary and is never saved or uploaded.',
  persistAcquisition = true,
}: Tier2ReadingPracticeProps) {
  const randomRef = useRef(random)
  const [savedStore] = useState(() => pathway.kind === 'acquisition' && persistAcquisition
    ? familyAcquisitionStore<Tier2ReadingTarget, 'recording-comparison'>(
      tier2ReadingAcquisitionTargetSet(pathway), profile.acquisitionStrategy, 'reading-dojo', 'tier-2')
    : null)
  const [saveError, setSaveError] = useState('')
  const [run, setRun] = useState<ReadingRun>(() => savedStore
    ? { kind: 'acquisition', targetSet: savedStore.context.targetSet,
      flow: savedStore.current.envelope.flow, assessments: savedStore.current.assessments }
    : initialRun(profile, pathway, randomRef.current))

  useEffect(() => () => stopActiveAudio(), [])

  function answerAcquisition(correct: boolean) {
    if (savedStore && run.kind === 'acquisition') {
      try {
        const saved = savedStore.answer(correct, 'recording-comparison')
        setRun({ ...run, flow: saved.envelope.flow, assessments: saved.assessments })
        setSaveError('')
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : 'Response could not be saved. Please retry.')
      }
      return
    }
    setRun((current) => {
      if (current.kind !== 'acquisition' || !current.flow.prompt) return current
      const transition = transitionAcquisition(
        revealAcquisition(current.flow),
        current.targetSet,
        profile.acquisitionStrategy,
        { correct, revealMethod: 'recording-comparison' as const },
        randomRef.current,
      )
      return {
        ...current,
        flow: transition.nextFlow,
        assessments: transition.assessment
          ? [...current.assessments, transition.assessment]
          : current.assessments,
      }
    })
  }

  function answerQueue(correct: boolean) {
    setRun((current) => {
      if (current.kind === 'acquisition') return current
      const target = current.queue[current.index]
      if (!target) return current
      return {
        ...current,
        index: current.index + 1,
        attempts: [...current.attempts, {
          promptKind: current.kind,
          target,
          correct,
          countsTowardScore: true,
        }],
      }
    })
  }

  function exit() {
    stopActiveAudio()
    onExit()
  }

  const acquisitionPrompt = run.kind === 'acquisition' ? run.flow.prompt : null
  const queueTarget = run.kind === 'acquisition' ? null : run.queue[run.index]
  const target = acquisitionPrompt?.word || queueTarget || null
  const complete = run.kind === 'acquisition'
    ? run.flow.complete || !run.flow.prompt
    : run.index >= run.queue.length
  const total = run.kind === 'acquisition' ? run.targetSet.targets.length : run.queue.length
  const position = run.kind === 'acquisition'
    ? Math.min(run.flow.targetIndex + 1, total)
    : Math.min(run.index + 1, total)
  const progressPosition = run.kind === 'acquisition' ? run.flow.targetIndex : run.index
  const progress = complete ? 100 : Math.round((progressPosition / Math.max(total, 1)) * 100)
  const showContinue = run.kind === 'acquisition' && acquisitionPrompt?.kind === 'show-copy'
  const firstPresentationOfNewTarget = showContinue
    && run.kind === 'acquisition'
    && run.flow.phase === 'introduction'
    && run.flow.correctionRole === undefined
  const promptId = acquisitionPrompt?.id
    || `${pathway.kind}:${run.kind === 'acquisition' ? run.flow.trialNumber : run.index}:${target?.id || 'complete'}`
  const promptPhase = run.kind === 'acquisition'
    ? `${run.flow.phase} · ${acquisitionPrompt?.kind}`
    : run.kind === 'test-review'
      ? `Test Review ${pathway.cycle || 1}`
      : 'Mastery reading'
  const summary = { ...summaryFor(run), ...(savedStore ? { sessionId: savedStore.current.sessionId } : {}) }
  function finish() {
    try { savedStore?.assertActive(); onComplete(summary) }
    catch (error) { setSaveError(error instanceof Error ? error.message : 'This attempt cannot be submitted.') }
  }

  return <div className="reading-practice-page practice-page" data-report-activity="Reading practice" data-report-phase={complete ? 'complete' : promptPhase} data-report-target={complete ? undefined : target?.id} data-report-position={position}>
    <div className="practice-top">
      <button className="back-button" type="button" onClick={() => { if (!pauseToFamilyHub()) exit() }}><X size={18} /> Exit reading</button>
      {savedStore && !complete && <button type="button" className="secondary-button" onClick={finish}>Done for today</button>}
      <span className="practice-count">{label}<span>{complete ? ' · complete' : ` · ${position} of ${total}`}</span></span>
    </div>
    <div className="practice-progress" role="progressbar" aria-label="Reading practice progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div>
    <section className={`prompt-card ${complete ? 'complete-card' : ''}`} aria-live="polite">
      {saveError && <p role="alert">{saveError} Exit and reopen to retry the unfinished prompt.</p>}
      {complete ? <>
        <span className="complete-mark"><Check size={27} /></span>
        <p className="eyebrow">{profile.grade} · Tier 2 reading</p>
        <h1>Reading path complete</h1>
        <p className="review-instruction">{summary.correct} of {summary.attempted} assessed reading responses were marked correct.</p>
        {summary.diagnostics > 0 && <p className="practice-helper">{summary.diagnostics} Familiar-DT diagnostic response{summary.diagnostics === 1 ? '' : 's'} stayed outside the official target count.</p>}
        <button className="primary-button review-start-button" type="button" onClick={finish}>Done <ArrowLeft size={18} /></button>
      </> : target ? <>
        <div className="prompt-meta">
          <span className={`set-chip chip-${run.kind === 'mastery' ? 'warmup' : run.kind}`}>{promptPhase}</span>
          {acquisitionPrompt && <span className="timer"><Clock3 size={15} /> {acquisitionPrompt.timerSeconds}-second pattern</span>}
        </div>
        <ReadingResponsePanel
          key={promptId}
          promptId={promptId}
          targetText={target.text}
          assessed={!showContinue}
          teachingPrompt={showContinue}
          allowSkipTimer={run.kind === 'mastery'}
          onPlayReference={() => onPlayReference
            ? onPlayReference(target)
            : defaultReadingReference(profile, target)}
          onPlayTeachingIntroduction={() => onPlayTeachingIntroduction
            ? onPlayTeachingIntroduction(target, { firstPresentationOfNewTarget })
            : defaultTeachingIntroduction(profile, target)}
          onAnswer={(correct) => run.kind === 'acquisition' ? answerAcquisition(correct) : answerQueue(correct)}
          onContinue={() => answerAcquisition(true)}
        />
      </> : <p className="error-banner">This reading pathway has no available targets.</p>}
    </section>
    <p className="practice-footnote"><Headphones size={14} /> {sessionNote}</p>
  </div>
}
