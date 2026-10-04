import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { SheetsWorkbookPayload, WeeklyDatasetCandidate } from './curriculum/model.ts'
import { inspectKindergartenWorkbook } from './kindergartenSheetsImporter.ts'
import { activePracticeWord, type Dataset, type PracticeSession, type SessionAnswer, type Word } from './domain.ts'
import {
  answerKindergartenAcquisitionLab,
  kindergartenCandidateIsUsableInLab,
  kindergartenWritingDatasetForLab,
  revealKindergartenAcquisitionLab,
  startKindergartenAcquisitionLab,
  type KindergartenAcquisitionLabState,
  type KindergartenLabRevealMethod,
} from './kindergartenLab/acquisitionLab.ts'
import {
  ListeningLilyPads,
  MasteryWarmup,
  MemoryLanterns,
  NinjaRecord,
  type KindergartenScoreRecord,
} from './kindergartenLab/games.tsx'
import { kindergartenLearningHubView, type KindergartenHubActivityKind, type KindergartenHubLaunch } from './kindergartenLab/learningHub.ts'
import { kindergartenCurrentSourceWeek } from './kindergartenLab/currentWeek.ts'
import { kindergartenWritingLabProfile } from './kindergartenLab/practiceProfile.ts'
import {
  kindergartenCompletedUnitPoolForLab,
  kindergartenNinjaUnitPoolsForLab,
  kindergartenUnitPoolForLab,
  type KindergartenCumulativePoolLab,
} from './kindergartenLab/unitReview.ts'
import {
  kindergartenReadingAcquisitionPathway,
  kindergartenReadingMasteryPathway,
  kindergartenReadingReviewPathway,
} from './kindergartenLab/readingPractice.ts'
import { LearningHub } from './learningHub/LearningHub.tsx'
import type { LearningHubLaunchContext } from './learningHub/contracts.ts'
import { PracticeView, type PracticeAnswer } from './practice/PracticeView.tsx'
import { Tier2ReadingPractice } from './readingPractice/Tier2ReadingPractice.tsx'
import type { ReadingTeachingIntroductionContext } from './readingPractice/Tier2ReadingPractice.tsx'
import { SkyWriting } from './skywriting/index.ts'
import { DeferredTestReview } from './testReview/DeferredTestReview.tsx'
import { tier2ReadingPathwayTargets } from './tier2/pathway.ts'
import type { Tier2ReadingPathway, Tier2ReadingTarget } from './tier2/contracts.ts'
import { kindergartenTier2ReadingProfile } from './tier2/profiles/kindergarten.ts'
import { kindergartenWritingPracticeProfile } from './practice/profiles/kindergarten.ts'
import type { WarmupLifecycleSnapshot, WarmupResultEvidence } from './warmup/contracts.ts'
import { selectWarmupWords } from './warmup/engine.ts'
import {
  playAudioPlan,
  playCachedWordAudio,
  playCachedWordAudioOnce,
  playReadingTeachingSequence,
  stopActiveAudio,
} from './audio/promptAudio.ts'
import { kindergartenInstructionAudio, withKindergartenAudio } from './audio/kindergartenAudio.ts'

const fixtureUrl = new URL('../tests/fixtures/kindergarten-workbook.json', import.meta.url).href
const publicPreviewEnabled = import.meta.env.VITE_PUBLIC_PREVIEW === 'true'
const prototypeBaselineEnabled = import.meta.env.VITE_PROTOTYPE_BASELINE === 'true'
const KINDERGARTEN_REVIEW_INSTRUCTION = 'Look at each answer carefully. Tap “I got it right” when your writing matches the word, or “I got it wrong” when you want more practice.'

type WritingPractice = { state: KindergartenAcquisitionLabState; dataset: Dataset; revealMethod: KindergartenLabRevealMethod }
type StandaloneActivity = Exclude<KindergartenHubActivityKind,
  | 'dojo-writing'
  | 'dojo-reading'
  | 'final-boss'
  | 'final-boss-reading'
  | 'spirit-realm-reading'>
type ScoreInput = Omit<KindergartenScoreRecord, 'id' | 'completedAt'>

function normalizeWorkbook(value: unknown): Omit<SheetsWorkbookPayload, 'sourceType'> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The Kindergarten fixture must contain one workbook object.')
  const record = value as Record<string, unknown>
  if (!Array.isArray(record.sheets)) throw new Error('The Kindergarten fixture has no sheets array.')
  return {
    ...(typeof record.spreadsheetId === 'string' ? { spreadsheetId: record.spreadsheetId } : {}),
    sheets: record.sheets as SheetsWorkbookPayload['sheets'],
  }
}

function speakText(text: string, language = 'zh-CN', rate = 0.55) {
  if (!text) return
  return playAudioPlan([{
    text,
    language: language === 'zh-CN' || language === 'en-GB' || language === 'en-IE' ? language : 'en-US',
    rate,
  }])
}

function speakWord(word: Word, warmup = false) {
  return playCachedWordAudio(withKindergartenAudio(word), warmup, warmup ? {} : { playbackRate: 1.5, sentenceRate: 1.5 })
}

function playMasteryWord(word: Word) { return speakWord(word, true) }

function speakReadingReference(target: Tier2ReadingTarget): Promise<void> {
  return playCachedWordAudioOnce(withKindergartenAudio(target), { playbackRate: 1.5 })
}

function speakReadingIntroduction(
  target: Tier2ReadingTarget,
  context: ReadingTeachingIntroductionContext,
): Promise<void> {
  const newTargetInstruction = kindergartenInstructionAudio('newTarget')
  return playReadingTeachingSequence(withKindergartenAudio(target), {
    playbackRate: 1.5,
    sentenceRate: 1.5,
    ...(context.firstPresentationOfNewTarget
      ? {
          newTargetAnnouncement: newTargetInstruction.text,
          newTargetAnnouncementStoragePath: newTargetInstruction.storagePath,
        }
      : {}),
  })
}

function speakKindergartenTextOnce(text: string) {
  const word: Word = { id: `audio-${text}`, text, sentence: '', datasetId: '__audio-cue__' }
  return playCachedWordAudioOnce(withKindergartenAudio(word))
}

function writingSessionFor(practice: WritingPractice): PracticeSession {
  const prompt = practice.state.flow.prompt
  const acquisition = prompt
    ? { ...practice.state.flow, prompt: { ...prompt, word: withKindergartenAudio(prompt.word) } }
    : practice.state.flow
  return {
    id: `kindergarten-lab-${practice.state.cohortId}`,
    childId: 'kindergarten-lab-child',
    grade: 'Kindergarten',
    primaryDatasetId: practice.dataset.id,
    primaryPhase: 'acquisition',
    segment: 'primary',
    stage: practice.state.flow.complete || !prompt ? 'complete' : prompt.revealed ? 'review' : 'dictation',
    queue: practice.dataset.words,
    warmupQueue: [],
    primaryQueue: practice.dataset.words,
    index: practice.state.flow.targetIndex,
    startedAt: 'kindergarten-development-lab',
    warmupAnswers: [],
    primaryAnswers: [],
    warmupCategoryByWordId: {},
    warmupRandomRotationWordIds: [],
    warmupRotationCycleId: 1,
    acquisition: acquisition as PracticeSession['acquisition'],
    currentRevealMethod: practice.revealMethod,
    warmupOnly: false,
  }
}

function testReviewSessionFor(dataset: Dataset): PracticeSession {
  return {
    id: 'kindergarten-unit-review-lab',
    childId: 'kindergarten-lab-child',
    grade: 'Kindergarten',
    primaryDatasetId: dataset.id,
    primaryPhase: 'test-review',
    segment: 'primary',
    stage: dataset.words.length ? 'interstitial' : 'complete',
    queue: dataset.words,
    warmupQueue: [],
    primaryQueue: dataset.words,
    index: 0,
    startedAt: 'kindergarten-development-lab',
    warmupAnswers: [],
    primaryAnswers: [],
    warmupCategoryByWordId: {},
    warmupRandomRotationWordIds: [],
    warmupRotationCycleId: 1,
    warmupOnly: false,
  }
}

function dayAfter(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

function masteryDatasetFor(review: KindergartenCumulativePoolLab | null): Dataset | null {
  if (!review) return null
  const id = `__kindergarten-${review.unitId || 'completed-unit'}-mastery-lab__`
  const tier1 = review.dataset.words.map((word) => ({ ...word, id: `${id}:writing:${word.id}`, datasetId: id }))
  return {
    ...review.dataset,
    id,
    description: `Development-only Kindergarten ${review.label} writing mastery bank`,
    words: tier1,
    vocabulary: { tier1, tier2: [], tier3: [] },
  }
}

function KindergartenLearningLab() {
  const [candidates, setCandidates] = useState<WeeklyDatasetCandidate[]>([])
  const [selectedSourceUnitId, setSelectedSourceUnitId] = useState('')
  const [status, setStatus] = useState('Loading the trusted local Kindergarten fixture…')
  const [error, setError] = useState(false)
  const [writingPractice, setWritingPractice] = useState<WritingPractice | null>(null)
  const [readingPathway, setReadingPathway] = useState<Tier2ReadingPathway | null>(null)
  const [testReviewSession, setTestReviewSession] = useState<PracticeSession | null>(null)
  const [testReviewDataset, setTestReviewDataset] = useState<Dataset | null>(null)
  const [activeActivity, setActiveActivity] = useState<StandaloneActivity | null>(null)
  const [scores, setScores] = useState<KindergartenScoreRecord[]>([])
  const [masteryResults, setMasteryResults] = useState<WarmupResultEvidence[]>([])
  const [masteryWords, setMasteryWords] = useState<Word[]>([])
  const [activeNinjaPoolId, setActiveNinjaPoolId] = useState('')

  useEffect(() => {
    if (!import.meta.env.DEV && !publicPreviewEnabled && !prototypeBaselineEnabled) {
      setStatus('This Kindergarten learning lab is available only in local development or an approved public preview.')
      setError(true)
      return
    }
    void fetch(fixtureUrl, { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error(`Fixture request failed with HTTP ${response.status}.`)
        return response.json()
      })
      .then((payload) => {
        const inspected = inspectKindergartenWorkbook(normalizeWorkbook(payload))
        const preferred = kindergartenCurrentSourceWeek(inspected)
        if (!preferred) throw new Error('The fixture has no dated Kindergarten source tab usable by the lab.')
        setCandidates(inspected)
        setSelectedSourceUnitId(preferred.source.sourceUnitId)
        setStatus('Kindergarten paths loaded. Choose an adventure and your session scores will appear in the Ninja Record.')
      })
      .catch((loadError) => {
        setStatus(loadError instanceof Error ? loadError.message : 'The Kindergarten fixture could not be loaded.')
        setError(true)
      })
  }, [])

  const selectedCandidate = candidates.find((candidate) => candidate.source.sourceUnitId === selectedSourceUnitId)
    || kindergartenCurrentSourceWeek(candidates)
  const finalBossPool = useMemo<KindergartenCumulativePoolLab | null>(() => {
    if (!selectedCandidate) return null
    try { return kindergartenUnitPoolForLab(candidates, selectedCandidate) } catch { return null }
  }, [candidates, selectedCandidate])
  const ninjaPools = useMemo<KindergartenCumulativePoolLab[]>(() => {
    if (!selectedCandidate) return []
    try { return kindergartenNinjaUnitPoolsForLab(candidates, selectedCandidate) } catch { return [] }
  }, [candidates, selectedCandidate])
  const completedUnitPool = useMemo<KindergartenCumulativePoolLab | null>(() => {
    if (!selectedCandidate) return null
    try { return kindergartenCompletedUnitPoolForLab(candidates, selectedCandidate) } catch { return null }
  }, [candidates, selectedCandidate])
  const masteryDataset = useMemo(() => masteryDatasetFor(completedUnitPool), [completedUnitPool])
  const tier1Words = selectedCandidate?.tier1.map((word) => word.text) || []
  const tier2Words = selectedCandidate?.tier2.map((word) => word.text) || []
  const activeNinjaPool = ninjaPools.find((pool) => pool.dataset.id === activeNinjaPoolId) || ninjaPools[0]
  const ninjaTier1Words = activeNinjaPool?.tier1Words || []
  const ninjaTier2Words = activeNinjaPool?.tier2Words || []
  const ninjaChoicePool = [...ninjaTier2Words, ...ninjaTier1Words]

  function recordScore(score: ScoreInput) {
    setScores((current) => [...current, {
      ...score,
      id: `kindergarten-score-${Date.now()}-${current.length + 1}`,
      completedAt: new Date().toISOString(),
    }])
  }

  function returnToHub(message = 'Returned to the Kindergarten paths.') {
    stopActiveAudio()
    setActiveActivity(null)
    setReadingPathway(null)
    setMasteryWords([])
    setStatus(message)
    setError(false)
  }

  function completeStandalone(score: ScoreInput) {
    recordScore(score)
    returnToHub(`${score.label} complete: ${score.correct}/${score.total}. The score is shown in this visit’s Ninja Record.`)
  }

  function leavePractice(message: string) {
    stopActiveAudio()
    setWritingPractice(null)
    setReadingPathway(null)
    setTestReviewSession(null)
    setTestReviewDataset(null)
    setStatus(message)
    setError(false)
  }

  function startWriting() {
    if (!selectedCandidate || !kindergartenCandidateIsUsableInLab(selectedCandidate)) return
    try {
      setWritingPractice({
        state: startKindergartenAcquisitionLab(selectedCandidate),
        dataset: kindergartenWritingDatasetForLab(selectedCandidate),
        revealMethod: 'timer',
      })
      setStatus('Running the current-week Kindergarten writing flow. Finish or choose Done for today to add a session score.')
    } catch (startError) {
      setStatus(startError instanceof Error ? startError.message : 'Writing practice could not start.')
      setError(true)
    }
  }

  function revealWriting(method: KindergartenLabRevealMethod) {
    setWritingPractice((current) => current ? { ...current, state: revealKindergartenAcquisitionLab(current.state), revealMethod: method } : current)
  }

  function finishWriting() {
    if (writingPractice) {
      const scored = writingPractice.state.assessments.filter((item) => item.countsTowardWeeklyScore)
      if (scored.length) recordScore({
        label: 'Writing characters',
        kind: 'Current week',
        correct: scored.filter((item) => item.correct).length,
        total: scored.length,
      })
    }
    leavePractice('Returned to the paths. This visit’s writing score is shown in the Ninja Record.')
  }

  function answerWriting(answer: PracticeAnswer) {
    if (typeof answer === 'object') return
    if (answer === 'done') { finishWriting(); return }
    if (typeof answer !== 'boolean') return
    setWritingPractice((current) => current ? {
      ...current,
      state: answerKindergartenAcquisitionLab(current.state, answer, current.revealMethod),
      revealMethod: 'timer',
    } : current)
  }

  function startUnitReview() {
    if (!finalBossPool) return
    setTestReviewDataset(finalBossPool.dataset)
    setTestReviewSession(testReviewSessionFor(finalBossPool.dataset))
    setStatus(`Facing the Final Boss: the cumulative ${finalBossPool.label} writing pool is ready.`)
  }

  function completeTestReviewDictation(method: 'timer' | 'skip_timer' = 'timer') {
    setTestReviewSession((current) => {
      if (!current || current.stage !== 'dictation') return current
      if (current.index < current.queue.length - 1) return { ...current, stage: 'interstitial', index: current.index + 1, currentRevealMethod: method }
      return { ...current, stage: 'complete', currentRevealMethod: method }
    })
  }

  function answerTestReview(answer: PracticeAnswer) {
    const current = testReviewSession
    if (!current) return
    if (typeof answer === 'object') {
      if (answer.kind !== 'deferred-writing-test-review') return
      const correct = answer.completion.assessments.filter((item) => item.correct).length
      recordScore({ label: 'Final Boss Test', kind: 'Final Boss', correct, total: answer.completion.total })
      leavePractice(`Final Boss complete: ${correct}/${answer.completion.total}. The score is shown in the Ninja Record.`)
      return
    }
    if (answer === 'skip-test-review') {
      leavePractice('Final Boss review skipped. No score was added.')
      return
    }
    if (typeof answer !== 'boolean' || current.stage !== 'review') return
    const word = current.queue[current.index]
    if (!word) return
    const response: SessionAnswer = { word, correct: answer, revealMethod: current.currentRevealMethod || 'timer' }
    const primaryAnswers = [...current.primaryAnswers, response]
    if (current.index < current.queue.length - 1) {
      setTestReviewSession({ ...current, primaryAnswers, index: current.index + 1 })
      return
    }
    const correct = primaryAnswers.filter((item) => item.correct).length
    recordScore({ label: 'Final Boss Test', kind: 'Final Boss', correct, total: primaryAnswers.length })
    leavePractice(`Final Boss complete: ${correct}/${primaryAnswers.length}. The score is shown in the Ninja Record.`)
  }

  function startSpiritRealm() {
    if (!masteryDataset || !completedUnitPool) return
    const masteredAt = dayAfter(completedUnitPool.dataset.endDate)
    const lifecycle: WarmupLifecycleSnapshot = {
      masteredDatasetIds: [masteryDataset.id],
      masteredAtByDatasetId: { [masteryDataset.id]: masteredAt },
      lifecycleByDatasetId: { [masteryDataset.id]: 'mastered' },
    }
    const selection = selectWarmupWords({
      datasets: [masteryDataset],
      results: masteryResults,
      childId: 'kindergarten-lab-child',
      today: new Date(`${masteredAt}T12:00:00.000Z`),
      rotationCycleId: 1,
      lifecycle,
      policy: kindergartenWritingPracticeProfile.lifecycle,
      targetSize: 6,
    })
    setMasteryWords(selection.words)
    setActiveActivity('spirit-realm')
    setStatus('The Spirit Realm selected six adaptive mastery words. Missed words receive priority in a later visit.')
  }

  function recordMasteryAnswer(word: Word, correct: boolean) {
    setMasteryResults((current) => [...current, {
      id: `kindergarten-mastery-result-${Date.now()}-${current.length + 1}`,
      childId: 'kindergarten-lab-child',
      wordId: word.id,
      completedAt: new Date().toISOString(),
      correct,
    }])
  }

  function launchFromHub(launch: KindergartenHubLaunch, context: LearningHubLaunchContext) {
    if (launch.kind === 'dojo-writing') { startWriting(); return }
    if (launch.kind === 'dojo-reading') {
      if (selectedCandidate && kindergartenCandidateIsUsableInLab(selectedCandidate)) {
        setReadingPathway(kindergartenReadingAcquisitionPathway(selectedCandidate))
        setStatus('Running the current-week high-frequency reading Acquisition flow.')
      } else {
        setStatus('The current Kindergarten reading cohort is unavailable.')
        setError(true)
      }
      return
    }
    if (launch.kind === 'final-boss') { startUnitReview(); return }
    if (launch.kind === 'final-boss-reading') {
      if (finalBossPool) {
        setReadingPathway(kindergartenReadingReviewPathway(finalBossPool))
        setStatus(`Facing the Final Boss: the cumulative ${finalBossPool.label} reading pool is ready.`)
      } else {
        setStatus('The cumulative Kindergarten reading review is unavailable.')
        setError(true)
      }
      return
    }
    if (launch.kind === 'spirit-realm') { startSpiritRealm(); return }
    if (launch.kind === 'spirit-realm-reading') {
      if (completedUnitPool) {
        setReadingPathway(kindergartenReadingMasteryPathway(completedUnitPool))
        setStatus('The Spirit Realm opened the separate Tier 2 reading mastery path.')
      } else {
        setStatus('The Kindergarten reading mastery path is unavailable.')
        setError(true)
      }
      return
    }
    if (launch.kind.startsWith('ninja-')) {
      const selectedNinjaPool = ninjaPools.find((pool) => pool.dataset.id === context.cohortId) || ninjaPools[0]
      if (!selectedNinjaPool) {
        setStatus('Choose a Kindergarten unit before starting Ninja Skills.')
        setError(true)
        return
      }
      setActiveNinjaPoolId(selectedNinjaPool.dataset.id)
      setActiveActivity(launch.kind)
      setStatus(`${launch.label} started with ${selectedNinjaPool.label}. Finish the activity to add its score to the Ninja Record.`)
      return
    }
    setActiveActivity(launch.kind)
    setStatus(`${launch.label} started. Finish the activity to add its score to the Ninja Record.`)
  }

  if (writingPractice) {
    const promptWord = writingPractice.state.flow.prompt?.word
    const scored = writingPractice.state.assessments.filter((item) => item.countsTowardWeeklyScore)
    const correct = scored.filter((item) => item.correct).length
    return <main className="k-lab-shell practice">
      <p className="k-practice-note"><strong>Current score: {correct}/{scored.length}</strong> · Current-week Dojo writing · Session-only development record</p>
      <PracticeView
        session={writingSessionFor(writingPractice)}
        datasets={[writingPractice.dataset]}
        onExit={() => leavePractice('Writing practice exited. No score was added.')}
        onReplay={() => promptWord ? speakWord(promptWord) : undefined}
        onBeginWarmup={() => undefined}
        onInterstitialComplete={() => undefined}
        onDictationComplete={(method = 'timer') => revealWriting(method)}
        onStartReview={() => undefined}
        onAnswer={answerWriting}
        onSpeakWord={speakWord}
        onSpeakReviewInstruction={() => undefined}
        reviewInstruction={KINDERGARTEN_REVIEW_INSTRUCTION}
        timerSecondsOverride={kindergartenWritingLabProfile.testReviewTimerSeconds}
      />
    </main>
  }

  if (testReviewSession && testReviewDataset) {
    const activeWord = activePracticeWord(testReviewSession)
    return <main className="k-lab-shell practice">
      <p className="k-practice-note"><strong>Responses stay unscored until final review.</strong> · Final Boss cumulative active-unit review · Session-only development record</p>
      <PracticeView
        session={testReviewSession}
        datasets={[testReviewDataset]}
        onExit={() => leavePractice('Final Boss exited. No score was added.')}
        onReplay={() => testReviewSession.stage === 'complete' ? speakText(KINDERGARTEN_REVIEW_INSTRUCTION, 'en-US', 0.9) : activeWord ? speakWord(activeWord) : undefined}
        onBeginWarmup={() => undefined}
        onInterstitialComplete={() => setTestReviewSession((current) => current?.stage === 'interstitial' ? { ...current, stage: 'dictation' } : current)}
        onDictationComplete={completeTestReviewDictation}
        onStartReview={() => setTestReviewSession((current) => current?.stage === 'complete' ? { ...current, stage: 'review', index: 0 } : current)}
        onAnswer={answerTestReview}
        onSpeakWord={speakWord}
        onSpeakReviewInstruction={() => speakText(KINDERGARTEN_REVIEW_INSTRUCTION, 'en-US', 0.9)}
        reviewInstruction={KINDERGARTEN_REVIEW_INSTRUCTION}
        timerSecondsOverride={kindergartenWritingLabProfile.testReviewTimerSeconds}
      />
    </main>
  }

  if (readingPathway?.kind === 'test-review') {
    const targets = tier2ReadingPathwayTargets(readingPathway)
    return <main className="k-lab-shell practice">
      <p className="k-practice-note"><strong>Record every response before the final review.</strong> · Final Boss cumulative active-unit reading review · Session-only development record</p>
      <DeferredTestReview
        key={`kindergarten-reading-review-${readingPathway.cycle || 1}`}
        mode="reading"
        targets={targets}
        activityLabel="Final Boss Reading Test"
        onPlayReference={speakReadingReference}
        onDiscard={() => returnToHub('Final Boss reading exited. Temporary recordings and provisional answers were discarded.')}
        onComplete={(completion) => completeStandalone({
          label: 'Final Boss Reading Test',
          kind: 'Final Boss',
          correct: completion.correct,
          total: completion.total,
        })}
        sessionNote="Temporary recordings stay only in this Final Boss visit and are released when it ends."
      />
    </main>
  }

  if (readingPathway) {
    const label = readingPathway.kind === 'acquisition'
      ? 'High-frequency words'
      : 'Reading Mastery'
    const scoreKind = readingPathway.kind === 'acquisition'
      ? 'Current week'
      : 'Spirit Realm'
    return <main className="k-lab-shell practice">
      <p className="k-practice-note">Tier 2 recorded reading · Session-only development record</p>
      <Tier2ReadingPractice
        key={`${readingPathway.kind}-${readingPathway.cohorts.map((cohort) => cohort.datasetId).join('-')}`}
        profile={kindergartenTier2ReadingProfile}
        pathway={readingPathway}
        label={label}
        onPlayReference={speakReadingReference}
        onPlayTeachingIntroduction={speakReadingIntroduction}
        onExit={() => returnToHub('Reading practice exited. No score was added.')}
        onComplete={(summary) => completeStandalone({
          label,
          kind: scoreKind,
          correct: summary.correct,
          total: summary.attempted,
        })}
        sessionNote="Kindergarten development reading · recording and results remain in this visit"
      />
    </main>
  }

  const speak = (text: string) => speakKindergartenTextOnce(text)
  if (activeActivity === 'ninja-listening') return <ListeningLilyPads targets={ninjaTier2Words} choicePool={ninjaChoicePool} onExit={returnToHub} onComplete={completeStandalone} speak={speak} />
  if (activeActivity === 'ninja-memory') return <MemoryLanterns words={ninjaChoicePool} onExit={returnToHub} onComplete={completeStandalone} speak={speak} />
  if (activeActivity === 'ninja-sky-writing') return <SkyWriting
    words={ninjaTier1Words}
    onExit={() => returnToHub()}
    onComplete={({ correct, total }) => completeStandalone({ label: 'Sky Writing', kind: 'Ninja game', correct, total })}
    speak={speak}
  />
  if (activeActivity === 'spirit-realm') return <MasteryWarmup words={masteryWords} onExit={returnToHub} onAnswer={recordMasteryAnswer} onComplete={completeStandalone} playWord={playMasteryWord} />

  if (!selectedCandidate) return <main className="k-lab-shell"><div className="k-loading">{status}</div></main>
  const hubModel = kindergartenLearningHubView(selectedCandidate, finalBossPool, ninjaPools, completedUnitPool)

  return <main className="k-lab-shell k-hub-shell">
    <p className="k-lab-safety">Development-only child experience · Local fixture and session-only scores · No Google request, Firestore write, saved progress, or production activation</p>
    <details className="k-lab-settings">
      <summary>Development fixture controls</summary>
      <label className="k-week-picker">Current fixture week
        <select value={selectedCandidate.source.sourceUnitId} onChange={(event) => setSelectedSourceUnitId(event.target.value)}>
          {candidates.filter((candidate) => candidate.assignedWeek).map((candidate) => <option key={candidate.source.sourceUnitId} value={candidate.source.sourceUnitId}>{candidate.rawDate} · {candidate.normalizedStartDate}–{candidate.normalizedEndDate}</option>)}
        </select>
        <span className="k-manual-note">Defaults to the authoritative top spreadsheet tab. Select another week only to test that fixture.</span>
      </label>
    </details>
    <LearningHub model={hubModel} onLaunch={launchFromHub} />
    <NinjaRecord scores={scores} />
    <p className={`k-status${error ? ' error' : ''}`} role="status" aria-live="polite">{status}</p>
  </main>
}

const rootElement = document.getElementById('kindergarten-lab-root')
if (!rootElement) throw new Error('Missing Kindergarten learning lab root.')
createRoot(rootElement).render(<KindergartenLearningLab />)
