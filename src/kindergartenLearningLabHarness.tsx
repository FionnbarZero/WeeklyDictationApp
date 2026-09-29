import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowLeft, Check, Headphones, PencilLine, Sparkles, Volume2 } from 'lucide-react'
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
import { kindergartenWritingLabProfile } from './kindergartenLab/practiceProfile.ts'
import { kindergartenUnitReviewForLab, type KindergartenUnitReviewLab } from './kindergartenLab/unitReview.ts'
import { PracticeView } from './practice/PracticeView.tsx'

const fixtureUrl = '/tests/fixtures/kindergarten-workbook.json'
const DEFAULT_FIXTURE_TAB = 'Week 6 09/21'
const KINDERGARTEN_REVIEW_INSTRUCTION = 'Look at each answer carefully. Tap “I got it right” when your writing matches the word, or “I got it wrong” when you want more practice.'

type Screen = 'landing' | 'dojo' | 'reading'
type WritingPractice = { state: KindergartenAcquisitionLabState; dataset: Dataset; revealMethod: KindergartenLabRevealMethod }

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

function KindergartenLearningLab() {
  const [screen, setScreen] = useState<Screen>('landing')
  const [candidates, setCandidates] = useState<WeeklyDatasetCandidate[]>([])
  const [selectedSourceUnitId, setSelectedSourceUnitId] = useState('')
  const [status, setStatus] = useState('Loading the trusted local Kindergarten fixture…')
  const [error, setError] = useState(false)
  const [writingPractice, setWritingPractice] = useState<WritingPractice | null>(null)
  const [testReviewSession, setTestReviewSession] = useState<PracticeSession | null>(null)
  const [testReviewDataset, setTestReviewDataset] = useState<Dataset | null>(null)
  const [readingIndex, setReadingIndex] = useState(0)

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
        setStatus('Trusted local fixture loaded. Choose Enter the Dojo to test the child experience.')
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
  const tier2Words = selectedCandidate?.tier2.map((word) => word.text) || []

  function leavePractice(message: string) {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    setWritingPractice(null)
    setTestReviewSession(null)
    setTestReviewDataset(null)
    setScreen('dojo')
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
      setStatus('Running the Kindergarten-owned Acquisition strategy. This lab run is not saved.')
    } catch (startError) {
      setStatus(startError instanceof Error ? startError.message : 'Writing practice could not start.')
      setError(true)
    }
  }

  function revealWriting(method: KindergartenLabRevealMethod) {
    setWritingPractice((current) => current ? { ...current, state: revealKindergartenAcquisitionLab(current.state), revealMethod: method } : current)
  }

  function answerWriting(answer: boolean | 'skip-warmup' | 'skip-test-review' | 'done') {
    if (answer === 'done') {
      leavePractice('Returned to the Dojo. The unfinished in-memory writing run was discarded.')
      return
    }
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
    setStatus('Running the cumulative Unit 1 writing review in memory. No answers or scores are saved.')
  }

  function completeTestReviewDictation(method: 'timer' | 'skip_timer' = 'timer') {
    setTestReviewSession((current) => {
      if (!current || current.stage !== 'dictation') return current
      if (current.index < current.queue.length - 1) return { ...current, stage: 'interstitial', index: current.index + 1, currentRevealMethod: method }
      return { ...current, stage: 'complete', currentRevealMethod: method }
    })
  }

  function answerTestReview(answer: boolean | 'skip-warmup' | 'skip-test-review' | 'done') {
    const current = testReviewSession
    if (!current) return
    if (answer === 'skip-test-review') {
      leavePractice('Unit review skipped. The in-memory run was discarded and no score was created.')
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
    leavePractice(`Unit 1 review complete in the lab: ${primaryAnswers.filter((item) => item.correct).length}/${primaryAnswers.length} self-checked correct. Nothing was saved.`)
  }

  if (writingPractice) {
    const promptWord = writingPractice.state.flow.prompt?.word
    return <main className="k-lab-shell practice">
      <p className="k-practice-note">Development lab · No Warmup or persistence · Kindergarten-owned strategy · Shared PracticeView</p>
      <PracticeView
        session={writingSessionFor(writingPractice)}
        datasets={[writingPractice.dataset]}
        onExit={() => leavePractice('Returned to the Dojo. The in-memory writing run was discarded.')}
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
      <p className="k-practice-note">Development lab · Unit 1 fixture · Shared Test Review presentation · No persistence or official score</p>
      <PracticeView
        session={testReviewSession}
        datasets={[testReviewDataset]}
        onExit={() => leavePractice('Returned to the Dojo. The in-memory unit review was discarded.')}
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

  if (!selectedCandidate) return <main className="k-lab-shell"><div className="k-loading">{status}</div></main>

  if (screen === 'reading') {
    const word = tier2Words[readingIndex]
    const complete = readingIndex >= tier2Words.length
    return <main className="k-lab-shell k-reading-screen">
      <p className="k-lab-safety">Development-only Tier 2 teaching prototype · Visible reading words · No recording, score, or saved progress</p>
      <section className="k-reading-card">
        <button className="k-back" type="button" onClick={() => { setScreen('dojo'); setReadingIndex(0) }}><ArrowLeft size={17} /> Back to the Dojo</button>
        {complete ? <div className="k-reading-complete">
          <div className="mark"><Check /></div>
          <p className="k-eyebrow">Tier 2 reading</p>
          <h1>Wonderful work!</h1>
          <p className="k-reading-prompt">You looked, listened, and said every high-frequency word in this fixture week.</p>
          <button className="k-primary" type="button" onClick={() => { setScreen('dojo'); setReadingIndex(0); setStatus('Tier 2 prototype complete. Nothing was scored or saved.') }}>Return to the Dojo</button>
        </div> : <>
          <p className="k-eyebrow">High-frequency reading · {readingIndex + 1} of {tier2Words.length}</p>
          <h1>Look, listen, and say it</h1>
          <div className="k-reading-word">{word}</div>
          <p className="k-reading-prompt">Point to the word, listen to it, then say it aloud.</p>
          <div className="k-reading-actions">
            <button className="k-secondary" type="button" onClick={() => speakText(word)}><Volume2 size={18} /> Hear the word</button>
            <button className="k-primary" type="button" onClick={() => setReadingIndex((index) => index + 1)}>I said it <ArrowLeft size={17} /></button>
          </div>
          <div className="k-reading-steps"><span>1 · Look</span><span>2 · Listen</span><span>3 · Say it</span></div>
        </>}
      </section>
    </main>
  }

  return <main className="k-lab-shell">
    <p className="k-lab-safety">Development-only child experience · Local fixture only · No Google request, Firestore write, saved progress, or production activation</p>
    {screen === 'landing' ? <section className="k-lab-hero">
      <p className="k-eyebrow">Kindergarten learning lab</p>
      <h1>Your Mandarin adventure is ready.</h1>
      <p>Practice this week’s writing characters and high-frequency reading words in two small, supported activities.</p>
      <button className="k-primary" type="button" onClick={() => setScreen('dojo')}>Enter the Dojo <Sparkles size={18} /></button>
    </section> : <>
      <button className="k-back" type="button" onClick={() => setScreen('landing')}><ArrowLeft size={17} /> Back to entrance</button>
      <header className="k-dojo-header">
        <div>
          <p className="k-eyebrow">Weekly teaching modules</p>
          <h1>Welcome to the <em>Dojo</em></h1>
          <p>First learn the writing characters through the shared Acquisition flow. Then practice reading the visible high-frequency words aloud.</p>
        </div>
        <label className="k-week-picker">Development fixture week
          <select value={selectedCandidate.source.sourceUnitId} onChange={(event) => { setSelectedSourceUnitId(event.target.value); setReadingIndex(0) }}>
            {usableCandidates.map((candidate) => <option key={candidate.source.sourceUnitId} value={candidate.source.sourceUnitId}>{candidate.rawDate} · {candidate.normalizedStartDate}–{candidate.normalizedEndDate}</option>)}
          </select>
          <span className="k-manual-note">Manual selection only—this lab does not infer the active week.</span>
        </label>
      </header>

      <section className="k-module-grid">
        <article className="k-module k-writing">
          <span className="k-module-number">1</span>
          <p className="k-eyebrow">Tier 1 · Writing</p>
          <h2>Writing characters</h2>
          <p>Listen, copy, write, and check each character with age-appropriate repetition.</p>
          <div className="k-targets">{selectedCandidate.tier1.map((target) => <span key={target.targetOccurrenceId}>{target.text}</span>)}</div>
          <button className="k-primary" type="button" onClick={startWriting}><PencilLine size={18} /> Start writing practice</button>
        </article>
        <article className="k-module k-reading">
          <span className="k-module-number">2</span>
          <p className="k-eyebrow">Tier 2 · Reading</p>
          <h2>High-frequency words</h2>
          <p>See each word, hear it in Mandarin, and say it aloud. This remains an unscored teaching prototype.</p>
          <div className="k-targets">{tier2Words.length ? tier2Words.map((word, index) => <span key={`${word}-${index}`}>{word}</span>) : <span>—</span>}</div>
          <button className="k-primary" type="button" disabled={!tier2Words.length} onClick={() => { setReadingIndex(0); setScreen('reading') }}><Headphones size={18} /> Start reading practice</button>
        </article>
      </section>

      {unitReview && <section className="k-unit-review">
        <div>
          <p className="k-eyebrow">Cumulative lab fixture · {unitReview.label}</p>
          <h2>Prepare for your test</h2>
          <p>This lab review grows from every writing and high-frequency target found in the explicit Unit 1 fixture window. The shared Test Review presentation currently assesses Tier 1 writing only.</p>
          <div className="k-unit-groups"><span>{unitReview.sourceWeekCount} teaching weeks</span><span>{unitReview.tier1Words.length} Tier 1 writing targets</span><span>{unitReview.tier2Words.length} Tier 2 words preserved</span></div>
        </div>
        <button className="k-secondary" type="button" onClick={startUnitReview}>Prepare for your test <Sparkles size={18} /></button>
      </section>}
    </>}
    <p className={`k-status${error ? ' error' : ''}`} role="status" aria-live="polite">{status}</p>
  </main>
}

const rootElement = document.getElementById('kindergarten-lab-root')
if (!rootElement) throw new Error('Missing Kindergarten learning lab root.')
createRoot(rootElement).render(<KindergartenLearningLab />)
