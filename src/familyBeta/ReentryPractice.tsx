import { writingCharacterGuides } from '../application/writingAcquisition/lesson.ts'
import { reportRepairsPreview } from '../reportRepairs/policy.ts'
import { FIVE_STEP_SEQUENCE } from '../strokeTeacherPrototype/model.ts'
import { StrokeTeacher } from '../strokeTeacherPrototype/StrokeTeacher.tsx'
import { writingCorrectionPreview, writingCorrectionStrategy } from '../writingAcquisition/correctionStrategy.ts'
import { SlayWritingAcquisition } from '../writingAcquisition/SlayWritingAcquisition.tsx'
import '../strokeTeacherPrototype/preview.css'
import { useRef, useState } from 'react'
import { revealAcquisition, startAcquisition } from '../acquisition/engine.ts'
import { grade2AcquisitionStrategy } from '../acquisition/strategies/grade2.ts'
import { grade5AcquisitionStrategy } from '../acquisition/strategies/grade5.ts'
import { kindergartenAcquisitionStrategy } from '../acquisition/strategies/kindergarten.ts'
import { transitionAcquisition } from '../acquisition/transition.ts'
import { withKindergartenAudio } from '../audio/kindergartenAudio.ts'
import {
  playCachedWordAudio,
  playCachedWordAudioOnce,
  playReadingTeachingSequence,
  stopActiveAudio,
} from '../audio/promptAudio.ts'
import type { Dataset, PracticeSession } from '../domain.ts'
import { PracticeView } from '../practice/PracticeView.tsx'
import { Tier2ReadingPractice } from '../readingPractice/Tier2ReadingPractice.tsx'
import type { Tier2ReadingTarget } from '../tier2/contracts.ts'
import { grade2Tier2ReadingProfile } from '../tier2/profiles/grade2.ts'
import { grade5Tier2ReadingProfile } from '../tier2/profiles/grade5.ts'
import { kindergartenTier2ReadingProfile } from '../tier2/profiles/kindergarten.ts'
import { channelWords, type PracticeChannel } from './gamePools.ts'
import { previewProfile, savePreviewResult } from './runtime.ts'

export function readingProfileFor(grade: string) {
  return grade === 'Kindergarten'
    ? kindergartenTier2ReadingProfile
    : grade === 'Grade 2'
      ? grade2Tier2ReadingProfile
      : grade5Tier2ReadingProfile
}

export function ReentryPractice({
  datasets,
  channel,
  onExit,
}: {
  datasets: Dataset[]
  channel: PracticeChannel
  onExit: () => void
}) {
  const grade = datasets[0].grade
  const strategy =
    grade === 'Kindergarten'
      ? kindergartenAcquisitionStrategy
      : grade === 'Grade 2'
        ? reportRepairsPreview && writingCorrectionPreview
          ? writingCorrectionStrategy
          : grade2AcquisitionStrategy
        : grade5AcquisitionStrategy
  const profile = readingProfileFor(grade)
  const targetSet = useRef({ id: datasets[0].id, targets: datasets.flatMap((d) => channelWords(d, channel)) }).current
  const sessionId = useRef(crypto.randomUUID()).current
  const [flow, setFlow] = useState(() => startAcquisition(targetSet, strategy, Math.random))
  const [totals, setTotals] = useState({ correct: 0, attempted: 0 })
  const [error, setError] = useState('')
  const [taught, setTaught] = useState<string[]>([])
  const [character, setCharacter] = useState(0)
  const revealMethod = useRef<'timer' | 'skip_timer'>('timer')
  const audioWord = <T extends Parameters<typeof withKindergartenAudio>[0]>(word: T) =>
    grade === 'Kindergarten' ? withKindergartenAudio(word) : word
  function finish(correct: number, attempted: number) {
    try {
      savePreviewResult({
        id: sessionId,
        activity: `Reenter the Dojo · ${channel}`,
        channel,
        datasetIds: datasets.map((d) => d.id),
        schoolYear: datasets[0].schoolYear,
        correct,
        attempted,
      })
      stopActiveAudio()
      onExit()
    } catch {
      setError('This result could not be saved. Keep this activity open and try Done again.')
    }
  }
  const prompt = flow.prompt
  const session: PracticeSession = {
    id: sessionId,
    childId: previewProfile()?.id || 'preview',
    grade,
    primaryDatasetId: targetSet.id,
    primaryPhase: 'acquisition',
    segment: 'primary',
    stage: !prompt || flow.complete ? 'complete' : prompt.revealed ? 'review' : 'dictation',
    queue: [...targetSet.targets],
    primaryQueue: [...targetSet.targets],
    warmupQueue: [],
    index: flow.targetIndex,
    startedAt: new Date().toISOString(),
    warmupAnswers: [],
    primaryAnswers: [],
    warmupCategoryByWordId: {},
    warmupRandomRotationWordIds: [],
    warmupRotationCycleId: 1,
    acquisition: flow,
  }
  const target = targetSet.targets[flow.targetIndex]
  const WritingView = reportRepairsPreview ? SlayWritingAcquisition : PracticeView
  if (reportRepairsPreview && channel === 'writing' && target && !taught.includes(target.id)) {
    const guides = writingCharacterGuides(target.text)
    return (
      <div className="grade2-writing-pilot report-reentry">
        <div className="st-original-stage">
          <main className="st-original-content">
            <StrokeTeacher
              key={`${target.id}:${character}`}
              grade={grade}
              targetId={target.id}
              word={target.text}
              character={[...target.text][character]}
              characterIndex={character}
              strokes={guides[character]}
              sequence={FIVE_STEP_SEQUENCE}
              onExit={onExit}
              onComplete={() => {
                if (character + 1 < guides.length) setCharacter((value) => value + 1)
                else {
                  setTaught((value) => [...value, target.id])
                  setCharacter(0)
                }
              }}
            />
          </main>
        </div>
      </div>
    )
  }
  return (
    <div className={reportRepairsPreview && channel === 'writing' ? 'grade2-writing-pilot report-reentry' : undefined}>
      {!reportRepairsPreview && (
        <p>Reenter the Dojo · Restarting the whole {channel} set. Earlier completed scores are unchanged.</p>
      )}
      {error && <p role="alert">{error}</p>}
      {channel === 'reading' ? (
        <Tier2ReadingPractice
          persistAcquisition={false}
          profile={profile}
          label="Reenter the Dojo · Reading"
          pathway={{
            kind: 'acquisition',
            available: true,
            cohorts: datasets.map((d) => ({
              datasetId: d.id,
              available: channelWords(d, 'reading').length > 0,
              targets: channelWords(d, 'reading') as Tier2ReadingTarget[],
            })),
          }}
          onPlayReference={(word) => playCachedWordAudioOnce(audioWord(word))}
          onPlayTeachingIntroduction={(word) => playReadingTeachingSequence(audioWord(word))}
          onExit={onExit}
          onComplete={(summary) => finish(summary.correct, summary.attempted)}
        />
      ) : (
        <WritingView
          session={session}
          datasets={datasets}
          onExit={onExit}
          onReplay={() => (prompt ? playCachedWordAudio(audioWord(prompt.word)) : undefined)}
          onBeginWarmup={() => undefined}
          onInterstitialComplete={() => undefined}
          onStartReview={() => undefined}
          onDictationComplete={(method) => {
            revealMethod.current = method || 'timer'
            setFlow((current) => revealAcquisition(current))
          }}
          onSpeakWord={(word) => playCachedWordAudio(audioWord(word))}
          onSpeakReviewInstruction={() => undefined}
          reviewInstruction="Compare your writing."
          onAnswer={(answer) => {
            if (answer === 'done') {
              finish(totals.correct, totals.attempted)
              return
            }
            if (typeof answer !== 'boolean') return
            const next = transitionAcquisition(
              flow,
              targetSet,
              strategy,
              { correct: answer, revealMethod: revealMethod.current },
              Math.random,
            )
            if (next.assessment?.countsTowardWeeklyScore)
              setTotals((value) => ({ correct: value.correct + Number(answer), attempted: value.attempted + 1 }))
            setFlow(next.nextFlow)
          }}
        />
      )}
    </div>
  )
}
