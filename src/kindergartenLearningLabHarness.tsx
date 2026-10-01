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
  CurrentWeekReading,
  ListeningLilyPads,
  MasteryWarmup,
  MemoryLanterns,
  NinjaRecord,
  type KindergartenScoreRecord,
} from './kindergartenLab/games.tsx'
import { kindergartenLearningHubView, type KindergartenHubActivityKind, type KindergartenHubLaunch } from './kindergartenLab/learningHub.ts'
import { kindergartenWritingLabProfile } from './kindergartenLab/practiceProfile.ts'
import { kindergartenUnitReviewForLab, type KindergartenUnitReviewLab } from './kindergartenLab/unitReview.ts'
import { LearningHub } from './learningHub/LearningHub.tsx'
import { PracticeView } from './practice/PracticeView.tsx'
import { SkyWriting } from './skywriting/index.ts'
import { kindergartenWritingPracticeProfile } from './practice/profiles/kindergarten.ts'
import type { WarmupLifecycleSnapshot, WarmupResultEvidence } from './warmup/contracts.ts'
import { selectWarmupWords } from './warmup/engine.ts'

const fixtureUrl = '/tests/fixtures/kindergarten-workbook.json'
const DEFAULT_FIXTURE_TAB = 'Week 6 09/21'
const KINDERGARTEN_REVIEW_INSTRUCTION = 'Look at each answer carefully. Tap “I got it right” when your writing matches the word, or “I got it wrong” when you want more practice.'

type WritingPractice = { state: KindergartenAcquisitionLabState; dataset: Dataset; revealMethod: KindergartenLabRevealMethod }
type StandaloneActivity = Exclude<KindergartenHubActivityKind, 'dojo-writing' | 'final-boss'>
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
  if (!text || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = language
  utterance.rate = rate
  window.speechSynthesis.speak(utterance)
  return () => window.speechSynthesis.cancel()
}

function speakWord(word: Word) {
  return speakText(word.text)
}

function writingSessionFor(practice: WritingPractice): PracticeSession {
  const prompt = practice.state.flow.prompt
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
    acquisition: practice.state.flow as PracticeSession['acquisition'],
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

function masteryDatasetFor(review: KindergartenUnitReviewLab | null): Dataset | null {
  if (!review) return null
  const id = '__kindergarten-unit-1-mastery-lab__'
  const tier1 = review.dataset.words.map((word) => ({ ...word, id: `${id}:writing:${word.id}`, datasetId: id }))
  const tier2 = review.tier2Words.map((text, index): Word => ({
    id: `${id}:reading:${index + 1}`,
    text,
    sentence: '',
    datasetId: id,
    grade: 'Kindergarten',
    language: 'mandarin',
    tier: 'tier-2',
    activityType: 'reading',
  }))
  return {
    ...review.dataset,
    id,
    description: 'Development-only Kindergarten Unit 1 writing and reading mastery bank',
    words: [...tier1, ...tier2],
  }
}

function KindergartenLearningLab() {
  const [candidates, setCandidates] = useState<WeeklyDatasetCandidate[]>([])
  const [selectedSourceUnitId, setSelectedSourceUnitId] = useState('')
  const [status, setStatus] = useState('Loading the trusted local Kindergarten fixture…')
  const [error, setError] = useState(false)
  const [writingPractice, setWritingPractice] = useState<WritingPractice | null>(null)
  const [testReviewSession, setTestReviewSession] = useState<PracticeSession | null>(null)
  const [testReviewDataset, setTestReviewDataset] = useState<Dataset | null>(null)
  const [activeActivity, setActiveActivity] = useState<StandaloneActivity | null>(null)
  const [scores, setScores] = useState<KindergartenScoreRecord[]>([])
  const [masteryResults, setMasteryResults] = useState<WarmupResultEvidence[]>([])
  const [masteryWords, setMasteryWords] = useState<Word[]>([])

  useEffect(() => {
    if (!import.meta.env.DEV) {
      setStatus('This Kindergarten learning lab is available only in local development.')
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
        const usable = inspected.filter(kindergartenCandidateIsUsableInLab)
        const preferred = usable.find((candidate) => candidate.rawDate === DEFAULT_FIXTURE_TAB) || usable[0]
        if (!preferred) throw new Error('The fixture has no Kindergarten vocabulary tab usable by the lab.')
        setCandidates(inspected)
        setSelectedSourceUnitId(preferred.source.sourceUnitId)
        setStatus('Kindergarten paths loaded. Choose an adventure and your session scores will appear in the Ninja Record.')
      })
      .catch((loadError) => {
        setStatus(loadError instanceof Error ? loadError.message : 'The Kindergarten fixture could not be loaded.')
        setError(true)
      })
  }, [])

  const usableCandidates = useMemo(() => candidates.filter(kindergartenCandidateIsUsableInLab), [candidates])
  const selectedCandidate = usableCandidates.find((candidate) => candidate.source.sourceUnitId === selectedSourceUnitId) || usableCandidates[0]
  const unitReview = useMemo<KindergartenUnitReviewLab | null>(() => {
    if (!candidates.length) return null
    try { return kindergartenUnitReviewForLab(candidates) } catch { return null }
  }, [candidates])
  const masteryDataset = useMemo(() => masteryDatasetFor(unitReview), [unitReview])
  const tier1Words = selectedCandidate?.tier1.map((word) => word.text) || []
  const tier2Words = selectedCandidate?.tier2.map((word) => word.text) || []
  const choicePool = [...tier2Words, ...tier1Words]

  function recordScore(score: ScoreInput) {
    setScores((current) => [...current, {
      ...score,
      id: `kindergarten-score-${Date.now()}-${current.length + 1}`,
      completedAt: new Date().toISOString(),
    }])
  }

  function returnToHub(message = 'Returned to the Kindergarten paths.') {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    setActiveActivity(null)
    setMasteryWords([])
    setStatus(message)
    setError(false)
  }

  function completeStandalone(score: ScoreInput) {
    recordScore(score)
    returnToHub(`${score.label} complete: ${score.correct}/${score.total}. The score is shown in this visit’s Ninja Record.`)
  }

  function leavePractice(message: string) {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    setWritingPractice(null)
    setTestReviewSession(null)
    setTestReviewDataset(null)
    setStatus(message)
    setError(false)
  }

  function startWriting() {
    if (!selectedCandidate) return
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

  function answerWriting(answer: boolean | 'skip-warmup' | 'continue-primary' | 'skip-test-review' | 'done') {
    if (answer === 'done') { finishWriting(); return }
    if (typeof answer !== 'boolean') return
    setWritingPractice((current) => current ? {
      ...current,
      state: answerKindergartenAcquisitionLab(current.state, answer, current.revealMethod),
      revealMethod: 'timer',
    } : current)
  }

  function startUnitReview() {
    if (!unitReview) return
    setTestReviewDataset(unitReview.dataset)
    setTestReviewSession(testReviewSessionFor(unitReview.dataset))
    setStatus('Facing the Final Boss: the cumulative Unit 1 writing review is ready.')
  }

  function completeTestReviewDictation(method: 'timer' | 'skip_timer' = 'timer') {
    setTestReviewSession((current) => {
      if (!current || current.stage !== 'dictation') return current
      if (current.index < current.queue.length - 1) return { ...current, stage: 'interstitial', index: current.index + 1, currentRevealMethod: method }
      return { ...current, stage: 'complete', currentRevealMethod: method }
    })
  }

  function answerTestReview(answer: boolean | 'skip-warmup' | 'continue-primary' | 'skip-test-review' | 'done') {
    const current = testReviewSession
    if (!current) return
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
    if (!masteryDataset || !unitReview) return
    const masteredAt = dayAfter(unitReview.dataset.endDate)
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

  function launchFromHub(launch: KindergartenHubLaunch) {
    if (launch.kind === 'dojo-writing') { startWriting(); return }
    if (launch.kind === 'final-boss') { startUnitReview(); return }
    if (launch.kind === 'spirit-realm') { startSpiritRealm(); return }
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
    const correct = testReviewSession.primaryAnswers.filter((answer) => answer.correct).length
    return <main className="k-lab-shell practice">
      <p className="k-practice-note"><strong>Current score: {correct}/{testReviewSession.primaryAnswers.length}</strong> · Final Boss cumulative Unit 1 review · Session-only development record</p>
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

  const speak = (text: string) => { speakText(text) }
  if (activeActivity === 'dojo-reading') return <CurrentWeekReading words={tier2Words} onExit={returnToHub} onComplete={completeStandalone} speak={speak} />
  if (activeActivity === 'ninja-listening') return <ListeningLilyPads targets={tier2Words} choicePool={choicePool} onExit={returnToHub} onComplete={completeStandalone} speak={speak} />
  if (activeActivity === 'ninja-memory') return <MemoryLanterns words={choicePool} onExit={returnToHub} onComplete={completeStandalone} speak={speak} />
  if (activeActivity === 'ninja-sky-writing') return <SkyWriting
    words={tier1Words}
    onExit={returnToHub}
    onComplete={({ correct, total }) => completeStandalone({ label: 'Sky Writing', kind: 'Ninja game', correct, total })}
    speak={speak}
  />
  if (activeActivity === 'spirit-realm') return <MasteryWarmup words={masteryWords} onExit={returnToHub} onAnswer={recordMasteryAnswer} onComplete={completeStandalone} speak={speak} />

  if (!selectedCandidate) return <main className="k-lab-shell"><div className="k-loading">{status}</div></main>
  const hubModel = kindergartenLearningHubView(selectedCandidate, unitReview)

  return <main className="k-lab-shell k-hub-shell">
    <p className="k-lab-safety">Development-only child experience · Local fixture and session-only scores · No Google request, Firestore write, saved progress, or production activation</p>
    <details className="k-lab-settings">
      <summary>Development fixture controls</summary>
      <label className="k-week-picker">Current fixture week
        <select value={selectedCandidate.source.sourceUnitId} onChange={(event) => setSelectedSourceUnitId(event.target.value)}>
          {usableCandidates.map((candidate) => <option key={candidate.source.sourceUnitId} value={candidate.source.sourceUnitId}>{candidate.rawDate} · {candidate.normalizedStartDate}–{candidate.normalizedEndDate}</option>)}
        </select>
        <span className="k-manual-note">Manual selection only—this lab does not infer the active week.</span>
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
