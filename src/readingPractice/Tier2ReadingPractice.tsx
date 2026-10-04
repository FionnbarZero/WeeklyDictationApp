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
import { readingShowCopyInstruction, type ReadingSpeechSegment } from './contracts.ts'

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
  readonly kind: Tier2ReadingPathway['kind']
  readonly attempted: number
  readonly correct: number
  readonly diagnostics: number
}

export type Tier2ReadingPracticeProps = {
  readonly profile: Tier2ReadingProfile
  readonly pathway: Tier2ReadingPathway
  readonly label: string
  readonly onExit: () => void
  readonly onComplete: (summary: Tier2ReadingPracticeSummary) => void
  readonly onPlayReference?: (target: Tier2ReadingTarget) => Promise<void>
  readonly random?: () => number
  readonly sessionNote?: string
}

function speakSegment(segment: ReadingSpeechSegment): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!segment.text || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
      reject(new Error('Mandarin speech playback is unavailable.'))
      return
    }
    const utterance = new SpeechSynthesisUtterance(segment.text)
    utterance.lang = segment.language
    utterance.rate = segment.rate
    let settled = false
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      if (error) reject(error)
      else resolve()
    }
    const timeout = window.setTimeout(() => finish(new Error('Mandarin speech playback timed out.')), 10_000)
    utterance.onend = () => finish()
    utterance.onerror = () => finish(new Error('Mandarin speech playback failed.'))
    window.speechSynthesis.speak(utterance)
  })
}

async function speakSequence(segments: readonly ReadingSpeechSegment[]) {
  window.speechSynthesis.cancel()
  for (const segment of segments) await speakSegment(segment)
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

export function Tier2ReadingPractice({
  profile,
  pathway,
  label,
  onExit,
  onComplete,
  onPlayReference,
  random = Math.random,
  sessionNote = 'Your recording is temporary and is never saved or uploaded.',
}: Tier2ReadingPracticeProps) {
  const randomRef = useRef(random)
  const [run, setRun] = useState<ReadingRun>(() => initialRun(profile, pathway, randomRef.current))

  useEffect(() => () => window.speechSynthesis?.cancel(), [])

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
    window.speechSynthesis?.cancel()
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
  const promptId = acquisitionPrompt?.id
    || `${pathway.kind}:${run.kind === 'acquisition' ? run.flow.trialNumber : run.index}:${target?.id || 'complete'}`
  const promptPhase = run.kind === 'acquisition'
    ? `${run.flow.phase} · ${acquisitionPrompt?.kind}`
    : run.kind === 'test-review'
      ? `Test Review ${pathway.cycle || 1}`
      : 'Mastery reading'
  const summary = summaryFor(run)

  return <div className="reading-practice-page practice-page">
    <div className="practice-top">
      <button className="back-button" type="button" onClick={exit}><X size={18} /> Exit reading</button>
      <span className="practice-count">{label}<span>{complete ? ' · complete' : ` · ${position} of ${total}`}</span></span>
    </div>
    <div className="practice-progress"><span style={{ width: `${progress}%` }} /></div>
    <section className={`prompt-card ${complete ? 'complete-card' : ''}`} aria-live="polite">
      {complete ? <>
        <span className="complete-mark"><Check size={27} /></span>
        <p className="eyebrow">{profile.grade} · Tier 2 reading</p>
        <h1>Reading path complete</h1>
        <p className="review-instruction">{summary.correct} of {summary.attempted} assessed reading responses were marked correct.</p>
        {summary.diagnostics > 0 && <p className="practice-helper">{summary.diagnostics} Familiar-DT diagnostic response{summary.diagnostics === 1 ? '' : 's'} stayed outside the official target count.</p>}
        <button className="primary-button review-start-button" type="button" onClick={() => onComplete(summary)}>Done <ArrowLeft size={18} /></button>
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
          onPlayReference={() => onPlayReference
            ? onPlayReference(target)
            : speakSequence([{ text: target.text, language: 'zh-CN', rate: 0.55 }])}
          onPlayTeachingIntroduction={() => speakSequence(readingShowCopyInstruction(target.text))}
          onAnswer={(correct) => run.kind === 'acquisition' ? answerAcquisition(correct) : answerQueue(correct)}
          onContinue={() => answerAcquisition(true)}
        />
      </> : <p className="error-banner">This reading pathway has no available targets.</p>}
    </section>
    <p className="practice-footnote"><Headphones size={14} /> {sessionNote}</p>
  </div>
}
