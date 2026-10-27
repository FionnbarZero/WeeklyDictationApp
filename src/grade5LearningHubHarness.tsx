import { deviceAcceptancePreview } from './deviceAcceptance/policy.ts'
import { activityStorage, previewProfile } from './familyBeta/runtime.ts'
import { withScrollsWrite } from './familyBeta/scrollsCompletion.ts'
import { activityClock } from './activity/activityLifecycle.ts'
import { answerNativeWarmup, nativeVisitWords, newNativeWarmupVisit, readNativeWarmupVisit, writeNativeWarmup, type NativeWarmupVisit } from './warmupDesign/nativeVisit.ts'
import { createRoot } from 'react-dom/client'
import { familyPreview, savePreviewResult } from './familyBeta/runtime.ts'
import { familyAcquisitionStore, familyWritingStore } from './familyBeta/acquisitionRuntime.ts'
import { nativeWritingAdapter } from './familyBeta/nativeWritingCheckpoint.ts'
import NativeWritingPractice from './writingAcquisition/NativeWritingPractice.tsx'
import { enablePreviewSpeechFromTap } from './writingAcquisition/previewSpeech.ts'
import type { AcquisitionTarget } from './acquisition/contracts.ts'
import { fetchCurriculum } from './familyBeta/curriculum.ts'
import { automaticCurriculumPreview } from './familyBeta/automaticCurriculum.ts'
import { writingSessionAnswers } from './application/testReview.ts'
import { extractGrade5Presentation, type Grade5SourceExtraction } from './curriculum/adapters/grade5GoogleSlides.ts'
import type { SlidesPresentationPayload, WeeklyDatasetCandidate } from './curriculum/model.ts'
import { activePracticeWord, type Dataset, type PracticeSession, type SessionAnswer, type Word } from './domain.ts'
import { playCachedWordAudio, playCachedWordAudioOnce, playReadingTeachingSequence, stopActiveAudio } from './audio/promptAudio.ts'
import { gradeAudioProfileFor } from './audio/gradeAudioProfile.ts'
import {
  answerGrade5AcquisitionLab,
  revealGrade5AcquisitionLab,
  startGrade5AcquisitionLab,
  type Grade5AcquisitionLabState,
  type Grade5LabRevealMethod,
} from './grade5Lab/acquisitionLab.ts'
import {
  buildGrade5LearningHub,
  type Grade5ActivityLaunchRequest,
  type Grade5LearningHubModel,
} from './grade5Lab/learningHub.ts'
import { grade5LearningHubView, type Grade5HubLaunch } from './grade5Lab/learningHubView.ts'
import {
  grade5LabDataset,
  grade5LabDatasets,
  grade5LabWarmupSelection,
  grade5LabWritingRequestIsConnected,
} from './grade5Lab/writingPractice.ts'
import { grade5WritingLabProfile } from './grade5Lab/practiceProfile.ts'
import {
  grade5LabReadingPathway,
  grade5LabReadingRequestIsConnected,
} from './grade5Lab/readingPractice.ts'
import { PreviewLearningHub as LearningHub } from './familyBeta/PreviewLearningHub.tsx'
import { PracticeView, type PracticeAnswer } from './practice/PracticeView.tsx'
import { Tier2ReadingPractice } from './readingPractice/Tier2ReadingPractice.tsx'
import { DeferredTestReview } from './testReview/DeferredTestReview.tsx'
import { tier2ReadingPathwayTargets } from './tier2/pathway.ts'
import { grade5Tier2ReadingProfile } from './tier2/profiles/grade5.ts'
import { grade5PresentationPreview } from './grade5PresentationPreview/policy.ts'
import { extractGrade5Assessment } from './grade5PresentationPreview/assessmentSource.ts'
import { Grade5PresentationReading } from './grade5PresentationPreview/ReadingPractice.tsx'

const ReadingPractice = grade5PresentationPreview ? Grade5PresentationReading : Tier2ReadingPractice

const fixtureUrl = new URL('../tests/fixtures/grade5-presentation.json', import.meta.url).href
const publicPreviewEnabled = import.meta.env.VITE_PUBLIC_PREVIEW === 'true'
const prototypeBaselineEnabled = import.meta.env.VITE_PROTOTYPE_BASELINE === 'true'
const REVIEW_INSTRUCTION = 'Do your own best work. Compare your answer carefully. Every try helps you learn.'
const grade5AudioProfile = gradeAudioProfileFor('Grade 5')
let writingLaunch = 0

function requiredElement<T extends HTMLElement>(id: string) {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Missing Grade 5 learning-hub element: ${id}`)
  return element as T
}

const statusElement = requiredElement<HTMLParagraphElement>('hub-status')
const hubRootElement = requiredElement<HTMLElement>('grade5-learning-hub-root')
const requestPanel = requiredElement<HTMLElement>('request-panel')
const requestTitle = requiredElement<HTMLHeadingElement>('request-title')
const requestMessage = requiredElement<HTMLParagraphElement>('request-message')
const requestOutput = requiredElement<HTMLElement>('request-output')
const requestActions = requiredElement<HTMLElement>('request-actions')
const dismissButton = requiredElement<HTMLButtonElement>('dismiss-request')
const labDetails = requiredElement<HTMLDetailsElement>('lab-details')
const practicePanel = requiredElement<HTMLElement>('practice-panel')
const practiceRootElement = requiredElement<HTMLElement>('grade5-practice-root')
const practiceSummary = requiredElement<HTMLElement>('practice-summary')
const hubRoot = createRoot(hubRootElement)
const practiceRoot = createRoot(practiceRootElement)
// The family preview hides lab details. Launch failures still need a visible,
// accessible retry explanation, separate from routine developer status.
if (automaticCurriculumPreview) {
  hubRootElement.before(statusElement)
  statusElement.hidden = true
}

let sourceExtraction: Grade5SourceExtraction | null = null
let learningHubModel: Grade5LearningHubModel | null = null
let activePractice: Grade5AcquisitionLabState | null = null
let acquisitionStore: ReturnType<typeof familyAcquisitionStore<AcquisitionTarget, Grade5LabRevealMethod>> = null
let activeDataset: Dataset | null = null
let activeDatasets: Dataset[] = []
let activeSession: PracticeSession | null = null
let currentRevealMethod: Grade5LabRevealMethod = 'timer'
let strokeWarmupReady: (() => void) | null = null

function createElement<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const element = document.createElement(tag)
  if (className) element.className = className
  if (text !== undefined) element.textContent = text
  return element
}

function setStatus(message: string, error = false) {
  statusElement.textContent = message
  statusElement.classList.toggle('error', error)
  if (automaticCurriculumPreview) {
    statusElement.hidden = !error
    statusElement.setAttribute('role', error ? 'alert' : 'status')
    if (error) statusElement.scrollIntoView({ block: 'nearest' })
  }
  if (error) labDetails.open = true
}

function normalizePayload(value: unknown): SlidesPresentationPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('The Grade 5 fixture must contain one presentation object.')
  }
  const record = value as Record<string, unknown>
  if (!Array.isArray(record.slides)) throw new Error('The Grade 5 fixture has no slides array.')
  return {
    sourceType: 'google-slides',
    ...(typeof record.presentationId === 'string' ? { presentationId: record.presentationId } : {}),
    slides: record.slides as SlidesPresentationPayload['slides'],
  }
}

function candidateFor(request: Grade5ActivityLaunchRequest): WeeklyDatasetCandidate {
  const candidate = sourceExtraction?.classification.selectedCandidates.find((item) =>
    item.datasetId === request.cohortId)
  if (!candidate) throw new Error('The requested Grade 5 cohort is not available in the validated fixture.')
  return candidate
}

function speakWord(word: Word) {
  return playCachedWordAudio(word, false, {
    playbackRate: grade5AudioProfile.dictationRate,
    sentenceRate: grade5AudioProfile.dictationRate,
    pauseMs: grade5AudioProfile.segmentGapMs,
  })
}

function speakReadingReference(word: Word): Promise<void> {
  return playCachedWordAudioOnce(word, { playbackRate: grade5AudioProfile.readingRate })
}

function speakReadingIntroduction(word: Word): Promise<void> {
  return playReadingTeachingSequence(word, {
    playbackRate: grade5AudioProfile.readingRate,
    sentenceRate: grade5AudioProfile.readingRate,
    instructionRate: grade5AudioProfile.instructionRate,
    pauseMs: grade5AudioProfile.segmentGapMs,
  })
}

function speakCurrentWord() {
  const word = activeSession ? activePracticeWord(activeSession) : undefined
  return word ? speakWord(word) : undefined
}

function latestProgressionDate(extraction: Grade5SourceExtraction) {
  return extraction.progressionEvidence.reduce((latest, evidence) =>
    evidence.effectiveDate > latest ? evidence.effectiveDate : latest, '0000-00-00')
}

function renderAssessmentSummary() {
  if (!activeSession) {
    practiceSummary.textContent = ''
    return
  }
  if (activePractice) {
    const official = activePractice.assessments.filter((item) => item.countsTowardWeeklyScore)
    const familiar = activePractice.assessments.filter((item) => item.dtPoolType === 'familiar')
    const officialCorrect = official.filter((item) => item.correct).length
    const familiarCorrect = familiar.filter((item) => item.correct).length
    practiceSummary.innerHTML = `<strong>Lab observations:</strong> official target/Earned-DT trials ${officialCorrect}/${official.length} correct · Familiar-DT diagnostic trials ${familiarCorrect}/${familiar.length} correct. Nothing from this lab run is saved.`
    return
  }
  if (activeSession.segment === 'primary' && activeSession.primaryPhase === 'test-review') {
    practiceSummary.innerHTML = '<strong>Lab observations:</strong> Writing responses remain provisional until the final review page. Nothing from this lab run is saved.'
    return
  }
  const correct = activeSession.primaryAnswers.filter((answer) => answer.correct).length
  practiceSummary.innerHTML = `<strong>Lab observations:</strong> Test Review ${correct}/${activeSession.primaryAnswers.length} correct · Warmup ${activeSession.warmupAnswers.length}/${activeSession.warmupQueue.length} reviewed. Nothing from this lab run is saved.`
}

let nativeWarmup: NativeWarmupVisit | null = null
let nativeWarmupRaw: string | null = null
let nativeWarmupKey = ''
let nativeWarmupOwner: string | undefined

async function saveGuidedWarmup(answer: Extract<PracticeAnswer, { kind: 'guided-warmup-answer' }>) {
  const current = activeSession
  if (!current || current.segment !== 'warmup' || current.id !== answer.sessionId || current.index !== answer.position || current.queue[current.index]?.id !== answer.wordId)
    throw new Error('This Warmup answer is no longer current. Reopen the activity.')
  if (!nativeWarmup) throw new Error('Warmup’s saved visit is unavailable. Reopen the activity.')
  const nextVisit = await withScrollsWrite(nativeWarmupKey, () => {
    if (activeSession !== current || activityClock.paused || previewProfile()?.id !== nativeWarmupOwner)
      throw new Error('Warmup changed while saving. Reopen the activity to continue.')
    let next = answerNativeWarmup(nativeWarmup!, current.index, answer.correct)
    if (next.answers.length === next.words.length) next = { ...next, closed: true }
    nativeWarmupRaw = writeNativeWarmup(activityStorage(), nativeWarmupKey, nativeWarmupRaw, next)
    return next
  })
  nativeWarmup = nextVisit
  const answers = [...current.warmupAnswers, { word: current.queue[current.index], correct: answer.correct, revealMethod: 'timer' as const }]
  activeSession = nextVisit.closed ? primaryStartState({ ...current, warmupAnswers: answers })
    : { ...current, warmupAnswers: answers, index: nextVisit.answers.length, stage: 'interstitial' }
  renderPracticeView()
}

async function closeGuidedWarmup() {
  const current = activeSession
  if (!current || !nativeWarmup) throw new Error('Warmup is not ready. Reopen the activity.')
  await withScrollsWrite(nativeWarmupKey, () => {
    if (activeSession !== current || activityClock.paused || previewProfile()?.id !== nativeWarmupOwner)
      throw new Error('Warmup changed. Reopen the activity to continue.')
    const next = { ...nativeWarmup!, closed: true }
    nativeWarmupRaw = writeNativeWarmup(activityStorage(), nativeWarmupKey, nativeWarmupRaw, next)
    nativeWarmup = next
  })
  activeSession = primaryStartState(current)
  renderPracticeView()
}

function initialPracticeSession(
  request: Grade5ActivityLaunchRequest,
  dataset: Dataset,
  warmupWords: Word[],
  acquisition: Grade5AcquisitionLabState | null,
): PracticeSession {
  const primaryPhase = request.activityKind === 'test-review' ? 'test-review' : 'acquisition'
  return {
    id: familyPreview ? crypto.randomUUID() : `grade5-lab-${request.stage}-${request.cohortId}`,
    childId: 'grade5-lab-child',
    grade: 'Grade 5',
    primaryDatasetId: dataset.id,
    primaryPhase,
    segment: 'warmup',
    stage: 'warmup-intro',
    queue: warmupWords,
    warmupQueue: warmupWords,
    primaryQueue: dataset.words,
    index: 0,
    startedAt: 'grade5-development-lab',
    warmupAnswers: [],
    primaryAnswers: [],
    warmupCategoryByWordId: {},
    warmupRandomRotationWordIds: warmupWords.map((word) => word.id),
    warmupRotationCycleId: 1,
    acquisition: acquisition?.flow as PracticeSession['acquisition'],
    warmupOnly: false,
  }
}

function primaryStartState(session: PracticeSession): PracticeSession {
  if (session.primaryQueue.length === 0) return { ...session, segment: 'primary', stage: 'complete', queue: [], index: 0 }
  if (session.acquisition?.prompt) return { ...session, segment: 'primary', stage: 'dictation', queue: [session.acquisition.prompt.word], index: 0 }
  return { ...session, segment: 'primary', stage: 'interstitial', queue: session.primaryQueue, index: 0 }
}

function beginWarmup() {
  if (!activeSession || activeSession.stage !== 'warmup-intro') return
  activeSession = activeSession.queue.length > 0
    ? { ...activeSession, stage: 'interstitial', index: import.meta.env.VITE_INTEGRATED_WARMUP_PREVIEW === 'true' ? activeSession.warmupAnswers.length : 0 }
    : primaryStartState(activeSession)
  renderPracticeView()
}

function completeInterstitial() {
  if (!activeSession || activeSession.stage !== 'interstitial') return
  activeSession = { ...activeSession, stage: 'dictation' }
  renderPracticeView()
}

function completeDictationWord(method: Grade5LabRevealMethod = 'timer') {
  if (!activeSession || activeSession.stage !== 'dictation') return
  if (activeSession.segment === 'primary' && activePractice) {
    if (!activePractice.flow.prompt) return
    currentRevealMethod = method
    activePractice = revealGrade5AcquisitionLab(activePractice)
    activeSession = { ...activeSession, acquisition: activePractice.flow, currentRevealMethod: method, stage: 'review' }
  } else if (activeSession.index < activeSession.queue.length - 1) {
    activeSession = { ...activeSession, stage: 'interstitial', index: activeSession.index + 1 }
  } else if (activeSession.segment === 'warmup') {
    activeSession = { ...activeSession, stage: 'review', index: 0 }
  } else {
    activeSession = { ...activeSession, stage: 'complete' }
  }
  renderPracticeView()
}

function startPrimaryReview() {
  if (!activeSession || activeSession.stage !== 'complete' || activeSession.primaryPhase !== 'test-review') return
  activeSession = { ...activeSession, stage: 'review', index: 0 }
  renderPracticeView()
}

function leavePractice(message = 'Returned to the Grade 5 hub. This development-only run was discarded.') {
  writingLaunch++
  strokeWarmupReady = null
  stopActiveAudio()
  activePractice = null
  acquisitionStore = null
  activeDataset = null
  activeDatasets = []
  activeSession = null
  practiceRoot.render(null)
  practicePanel.hidden = true
  requestPanel.hidden = true
  hubRootElement.hidden = false
  labDetails.hidden = false
  statusElement.hidden = false
  document.body.classList.remove('practice-active')
  setStatus(message)
}

function recordWritingResult(correct: number, attempted: number) {
  if (!activeSession || !activeDataset) return false
  try {
    if (activeSession.primaryPhase === 'acquisition' && acquisitionStore)
      activeSession = { ...activeSession, id: acquisitionStore.prepareResult().sessionId }
    const saved = savePreviewResult({ id: activeSession.id, activity: activeSession.primaryPhase === 'acquisition' ? 'Writing Dojo' : 'Writing Test Review', channel: 'writing', datasetIds: [activeDataset.id], correct, attempted })
    if ((grade5PresentationPreview || deviceAcceptancePreview) && attempted > 0 && !saved) throw new Error('The writing result could not be saved.')
    return true
  } catch {
    window.parent.postMessage({ type: 'family-beta-save-error' }, window.location.origin)
    return false
  }
}

function answerCurrentPrompt(correct: boolean) {
  if (!activeSession || activeSession.stage !== 'review') return
  if (activeSession.segment === 'primary' && activePractice) {
    if (!activePractice.flow.prompt?.revealed) return
    const assessmentCount = activePractice.assessments.length
    try {
      if (acquisitionStore) {
        const saved = acquisitionStore.answer(correct, currentRevealMethod)
        activeSession = { ...activeSession, id: saved.sessionId }
        activePractice = { ...activePractice, flow: saved.envelope.flow, assessments: saved.assessments }
      } else activePractice = answerGrade5AcquisitionLab(activePractice, correct, currentRevealMethod)
    } catch (error) {
      practiceSummary.textContent = error instanceof Error ? error.message : 'Response could not be saved. Please retry.'
      window.parent.postMessage({ type: 'family-beta-save-error' }, window.location.origin)
      if (acquisitionStore?.current.writing) throw error
      return
    }
    const assessment = activePractice.assessments.length > assessmentCount
      ? activePractice.assessments[activePractice.assessments.length - 1]
      : undefined
    const response: SessionAnswer | undefined = assessment ? {
      word: assessment.target as Word,
      correct: assessment.correct,
      revealMethod: assessment.revealMethod,
      acquisitionKind: assessment.kind,
      promptId: assessment.promptId,
      countsTowardWeeklyScore: assessment.countsTowardWeeklyScore,
      dtPoolType: assessment.dtPoolType,
    } : undefined
    activeSession = {
      ...activeSession,
      acquisition: activePractice.flow,
      primaryAnswers: response ? [...activeSession.primaryAnswers, response] : activeSession.primaryAnswers,
      currentRevealMethod: undefined,
      stage: activePractice.flow.complete ? 'complete' : 'dictation',
      queue: activePractice.flow.prompt ? [activePractice.flow.prompt.word] : [],
      index: 0,
    }
    currentRevealMethod = 'timer'
    renderPracticeView()
    return
  }

  const word = activeSession.queue[activeSession.index]
  if (!word) return
  const response: SessionAnswer = { word, correct, revealMethod: currentRevealMethod }
  const isWarmup = activeSession.segment === 'warmup'
  const answers = isWarmup
    ? [...activeSession.warmupAnswers, response]
    : [...activeSession.primaryAnswers, response]
  if (activeSession.index < activeSession.queue.length - 1) {
    activeSession = isWarmup
      ? { ...activeSession, warmupAnswers: answers, index: activeSession.index + 1 }
      : { ...activeSession, primaryAnswers: answers, index: activeSession.index + 1 }
    renderPracticeView()
    return
  }
  if (isWarmup) {
    activeSession = primaryStartState({ ...activeSession, warmupAnswers: answers })
    renderPracticeView()
    return
  }
  const correctCount = answers.filter((answer) => answer.correct).length
  if (!recordWritingResult(correctCount, answers.length)) return
  leavePractice(`Test Review complete: ${correctCount}/${answers.length} correct. This lab result was not saved.`)
}

function handlePracticeAnswer(answer: PracticeAnswer) {
  if (import.meta.env.VITE_INTEGRATED_WARMUP_PREVIEW === 'true') {
    if (typeof answer === 'object' && answer.kind === 'guided-warmup-answer') return saveGuidedWarmup(answer)
    if ((answer === 'skip-warmup' || answer === 'continue-primary') && activeSession?.segment === 'warmup') {
      return closeGuidedWarmup().catch(error => { practiceSummary.textContent = error instanceof Error ? error.message : 'Warmup could not save.' })
    }
  }
  if (typeof answer === 'object') {
    if (!activeSession || answer.kind !== 'deferred-writing-test-review') return
    const primaryAnswers = writingSessionAnswers(answer.completion)
    activeSession = { ...activeSession, stage: 'complete', primaryAnswers }
    const correct = primaryAnswers.filter((item) => item.correct).length
    if (!recordWritingResult(correct, primaryAnswers.length)) {
      if (grade5PresentationPreview || deviceAcceptancePreview) throw new Error('The writing result could not be saved. Please retry.')
      return
    }
    leavePractice(`Test Review complete: ${correct}/${primaryAnswers.length} correct. This lab result was not saved.`)
  }
  else if (typeof answer === 'boolean') answerCurrentPrompt(answer)
  else if (answer === 'skip-warmup' && activeSession?.stage === 'warmup-intro') {
    activeSession = primaryStartState(activeSession)
    renderPracticeView()
  }
  else if (answer === 'continue-primary' && activeSession?.segment === 'warmup') {
    activeSession = primaryStartState(activeSession)
    renderPracticeView()
  }
  else if (answer === 'skip-test-review') leavePractice('Test Review was abandoned. Its temporary answers were discarded and no score was created.')
  else if (answer === 'done') {
    const assessed = activePractice?.assessments.filter(item => item.countsTowardWeeklyScore) || []
    if (!recordWritingResult(assessed.filter(item => item.correct).length, assessed.length)) {
      if (acquisitionStore?.current.writing) throw new Error('The writing score could not be confirmed. Please retry Done for today.')
      return
    }
    leavePractice(familyPreview ? 'Writing session complete. See family progress for saving status.' : 'Acquisition stopped for today. This development lab does not save progress yet.')
  }
}

function renderPracticeView() {
  if (!activeSession || !activeDataset) return
  if (strokeWarmupReady && activeSession.segment === 'primary') {
    const ready = strokeWarmupReady
    leavePractice('Warmup finished. Opening Stroke Order Slay.')
    ready()
    return
  }
  renderAssessmentSummary()
  const nativeStore = acquisitionStore?.current.writing ? acquisitionStore : null
  const WritingView = nativeStore ? NativeWritingPractice : PracticeView
  practiceRoot.render(
    <WritingView
      store={nativeStore!}
      session={activeSession}
      datasets={activeDatasets}
      onExit={leavePractice}
      onReplay={speakCurrentWord}
      onBeginWarmup={beginWarmup}
      onInterstitialComplete={completeInterstitial}
      onDictationComplete={completeDictationWord}
      onStartReview={startPrimaryReview}
      onAnswer={handlePracticeAnswer}
      onSpeakWord={speakWord}
      onSpeakReviewInstruction={() => undefined}
      reviewInstruction={REVIEW_INSTRUCTION}
      retryTestSaveFailures={grade5PresentationPreview || deviceAcceptancePreview}
    />,
  )
}

async function startWritingPractice(request: Grade5ActivityLaunchRequest, label: string, ready?: () => void) {
  const launch = ++writingLaunch
  enablePreviewSpeechFromTap()
  try {
    if (!sourceExtraction) throw new Error('The validated Grade 5 source has not loaded yet.')
    const candidate = candidateFor(request)
    activeDatasets = grade5LabDatasets(sourceExtraction)
    activeDataset = activeDatasets.find((dataset) => dataset.id === candidate.datasetId) || grade5LabDataset(candidate)
    const warmup = grade5LabWarmupSelection(sourceExtraction, latestProgressionDate(sourceExtraction))
    activePractice = !ready && (request.activityKind === 'acquisition' || request.activityKind === 'reacquisition')
      ? startGrade5AcquisitionLab(candidate)
      : null
    const opened = activePractice
      ? import.meta.env.VITE_CROSS_GRADE_WRITING_PILOT === 'true'
        ? await familyWritingStore<AcquisitionTarget, Grade5LabRevealMethod>(activePractice.targetSet,
            grade5WritingLabProfile.acquisition, nativeWritingAdapter(activeDataset), () => writingLaunch === launch)
        : familyAcquisitionStore<AcquisitionTarget, Grade5LabRevealMethod>(activePractice.targetSet, grade5WritingLabProfile.acquisition, 'writing-dojo', 'tier-1')
      : null
    if (writingLaunch !== launch) return
    acquisitionStore = opened
    if (acquisitionStore && activePractice) activePractice = { ...activePractice,
      targetSet: acquisitionStore.context.targetSet,
      flow: acquisitionStore.current.envelope.flow, assessments: acquisitionStore.current.assessments }
    if (acquisitionStore) activeDataset = { ...activeDataset, words: [...acquisitionStore.context.targetSet.targets] }
    activeSession = initialPracticeSession(request, activeDataset, warmup.words, activePractice)
    if (import.meta.env.VITE_OCT26_REPORTS_PREVIEW === 'true' && request.activityKind === 'test-review') activeSession = primaryStartState(activeSession)
    strokeWarmupReady = ready || null
    if (ready) activeSession = { ...activeSession, primaryQueue: [] }
    if (acquisitionStore) {
      activeSession = { ...activeSession, id: acquisitionStore.current.sessionId }
      if (acquisitionStore.current.envelope.revision > 0 || (acquisitionStore.current.writing?.revision || 0) > 0)
        activeSession = primaryStartState(activeSession)
    }
    nativeWarmup = null
    if (import.meta.env.VITE_INTEGRATED_WARMUP_PREVIEW === 'true' && familyPreview && activeSession.segment === 'warmup' && warmup.words.length) {
      const current = activeSession
      nativeWarmupOwner = previewProfile()?.id
      // Scope to the native lesson and activity; current selection is used only
      // for a fresh visit. Unfinished visits retain their original word order.
      nativeWarmupKey = `native-writing-warmup-visit-v1:grade5:${current.primaryPhase}:${activeDataset.id}:${activeDataset.words.map(w => `${w.id}:${w.text}`).join('|')}`
      const pool = [...activeDatasets.flatMap(d => d.words), ...warmup.words]
      const saved = await withScrollsWrite(nativeWarmupKey, () => {
        if (writingLaunch !== launch || previewProfile()?.id !== nativeWarmupOwner) throw new Error('Writing launch changed.')
        const storage = activityStorage()
        nativeWarmupRaw = storage.getItem(nativeWarmupKey)
        let visit = readNativeWarmupVisit(nativeWarmupRaw, pool)
        if (!visit || (visit.closed && current.primaryPhase === 'test-review')) visit = newNativeWarmupVisit(warmup.words, crypto.randomUUID())
        nativeWarmupRaw = writeNativeWarmup(storage, nativeWarmupKey, nativeWarmupRaw, visit)
        return visit
      })
      if (writingLaunch !== launch) return
      nativeWarmup = saved
      const words = nativeVisitWords(saved, pool)
      const warmupAnswers = saved.answers.map((correct, index) => ({ word: words[index], correct, revealMethod: 'timer' as const }))
      activeSession = { ...current, adaptiveWarmupVisitId: saved.id, queue: words, warmupQueue: words, warmupAnswers, index: saved.answers.length }
      if (saved.closed) activeSession = primaryStartState(activeSession)
    }
    currentRevealMethod = 'timer'
    requestPanel.hidden = true
    hubRootElement.hidden = true
    labDetails.hidden = true
    statusElement.hidden = true
    practicePanel.hidden = false
    document.body.classList.add('practice-active')
    setStatus(`Running ${label} with an up-to-six-item mastery Warmup preview and the shared Grade 5 Tier 1 writing flow. The production Warmup requirement is still undecided, and this lab run is not persisted.`)
    renderPracticeView()
    practicePanel.scrollTop = 0
  } catch (error) {
    if (writingLaunch !== launch) return
    setStatus(error instanceof Error ? error.message : 'Grade 5 writing practice could not start.', true)
  }
}

function startReadingPractice(request: Grade5ActivityLaunchRequest, label: string) {
  writingLaunch++
  try {
    if (!sourceExtraction) throw new Error('The validated Grade 5 source has not loaded yet.')
    const pathway = grade5LabReadingPathway(sourceExtraction, request)
    const readingSessionId = crypto.randomUUID()
    const finishReading = (correct: number, attempted: number, savedSessionId?: string) => {
      try {
        const saved = savePreviewResult({ id: savedSessionId || readingSessionId, activity: label, channel: 'reading', datasetIds: pathway.cohorts.map(c => c.datasetId), correct, attempted })
        if ((grade5PresentationPreview || deviceAcceptancePreview) && attempted > 0 && !saved) throw new Error('The reading result could not be saved. Please retry.')
      }
      catch (error) {
        window.parent.postMessage({ type: 'family-beta-save-error' }, window.location.origin)
        if (grade5PresentationPreview || deviceAcceptancePreview) throw error
        return
      }
      leavePractice(`Reading complete: ${correct}/${attempted}. ${familyPreview ? 'See family progress for saving status.' : 'This lab result was not saved.'}`)
    }
    activePractice = null
    activeDataset = null
    activeDatasets = []
    activeSession = null
    requestPanel.hidden = true
    hubRootElement.hidden = true
    labDetails.hidden = true
    statusElement.hidden = true
    practicePanel.hidden = false
    document.body.classList.add('practice-active')
    if (pathway.kind === 'test-review') {
      const targets = tier2ReadingPathwayTargets(pathway)
      practiceSummary.textContent = 'Tier 2 reading Test Review collects every temporary recording before one final self-assessment page. Nothing from this lab run is saved.'
      practiceRoot.render(<DeferredTestReview
        key={`grade5-reading-review-${request.stage}-${request.cohortId}`}
        mode="reading"
        retrySaveFailures={grade5PresentationPreview || deviceAcceptancePreview}
        targets={targets}
        activityLabel={pathway.cycle ? `Reading Test Review ${pathway.cycle}` : 'Reading Test Review'}
        onPlayReference={speakReadingReference}
        onDiscard={() => leavePractice('Reading Test Review was abandoned. Temporary recordings and provisional answers were discarded.')}
        onComplete={(completion) => finishReading(completion.correct, completion.total)}
        sessionNote={familyPreview ? 'Recordings stay only in this session. Completed scores appear in family progress.' : 'Grade 5 reading Test Review · collect every response first · recordings and results are not saved'}
      />)
      practicePanel.scrollTop = 0
      return
    }
    practiceSummary.textContent = 'Tier 2 reading uses prompt-local microphone audio and session-only scoring. Nothing from this lab run is saved.'
    practiceRoot.render(<ReadingPractice
      key={`${request.stage}-${request.activityKind}-${request.cohortId || request.eligibleCohortIds.join('-')}`}
      profile={grade5Tier2ReadingProfile}
      pathway={pathway}
      label={label}
      onPlayReference={speakReadingReference}
      onPlayTeachingIntroduction={speakReadingIntroduction}
      onExit={() => leavePractice('Returned to the Grade 5 hub. This reading run was discarded.')}
      onComplete={(summary) => finishReading(summary.correct, summary.attempted, summary.sessionId)}
      sessionNote={familyPreview ? 'Recordings stay only in this session. Completed scores appear in family progress.' : 'Grade 5 development reading · recording and results are not saved'}
    />)
    practicePanel.scrollTop = 0
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Grade 5 reading practice could not start.', true)
  }
}

function connectedRequest(request: Grade5ActivityLaunchRequest) {
  return grade5LabWritingRequestIsConnected(request) || grade5LabReadingRequestIsConnected(request)
}

function startConnectedRequest(request: Grade5ActivityLaunchRequest, label: string) {
  if (grade5LabReadingRequestIsConnected(request)) startReadingPractice(request, label)
  else return startWritingPractice(request, label)
}

function launchFromLearningHub(launch: Grade5HubLaunch) {
  writingLaunch++
  const connected = launch.requests.filter(connectedRequest)
  if (connected.length === 1) {
    return startConnectedRequest(connected[0], launch.label)
  }
  showLaunchRequest(launch.label, launch.requests)
}

function showLaunchRequest(label: string, requests: Grade5ActivityLaunchRequest[]) {
  requestTitle.textContent = label
  const includesGuidedAndReview = requests.some((request) => request.activityKind === 'acquisition' || request.activityKind === 'reacquisition')
    && requests.some((request) => request.activityKind === 'test-review')
  requestMessage.textContent = includesGuidedAndReview
    ? 'Choose guided practice or the collect-first Test Review format for Tier 1 writing or Tier 2 reading.'
    : requests.length > 1
      ? 'Choose the connected Tier 1 writing or Tier 2 reading pathway.'
    : 'This activity is not connected yet. The portable request below is preserved for its future practice engine.'
  requestOutput.textContent = JSON.stringify(requests.length === 1 ? requests[0] : requests, null, 2)
  requestActions.replaceChildren()
  for (const request of requests) {
    const button = createElement('button', connectedRequest(request) ? 'primary-button' : 'secondary-button')
    button.type = 'button'
    if (connectedRequest(request)) {
      const cohortLabel = request.cohortId
        ? sourceExtraction?.classification.selectedCandidates.find((candidate) => candidate.datasetId === request.cohortId)?.dateRangeLabel
        : undefined
      const actionLabel = request.learningChannel === 'tier-2-reading'
        ? request.activityKind === 'test-review' ? 'Start Reading Test' : request.activityKind === 'warmup' ? 'Start Reading Mastery' : request.activityKind === 'reacquisition' ? 'Relearn Reading' : 'Start Reading Dojo'
        : request.activityKind === 'test-review' ? 'Start Writing Test' : request.activityKind === 'reacquisition' ? 'Relearn Writing' : 'Start Writing Dojo'
      button.textContent = `${actionLabel}${cohortLabel ? ` · ${cohortLabel}` : ''}`
      button.addEventListener('click', () => startConnectedRequest(request, label))
    } else {
      button.textContent = request.activityKind === 'reacquisition' ? 'Re-teaching Not Connected Yet' : 'Not Connected Yet'
      button.disabled = true
    }
    requestActions.append(button)
  }
  requestPanel.hidden = false
  requestPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

async function loadHub() {
  setStatus('Loading the trusted Grade 5 fixture…')
  try {
    const response = familyPreview ? new Response(JSON.stringify((await fetchCurriculum('Grade 5')).snapshot.payload)) : await fetch(fixtureUrl, { cache: 'no-store' })
    if (!response.ok) throw new Error(`Fixture request failed with HTTP ${response.status}.`)
    const payload = await response.json()
    sourceExtraction = grade5PresentationPreview && payload.sourceType === 'owner-assessment'
      ? extractGrade5Assessment(payload)
      : extractGrade5Presentation(normalizePayload(payload))
    const date = familyPreview ? new URLSearchParams(window.location.search).get('week') || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()) : undefined
    learningHubModel = buildGrade5LearningHub(sourceExtraction, date)
  hubRoot.render(<LearningHub model={grade5LearningHubView(learningHubModel)} onLaunch={launchFromLearningHub} hideUnavailable={familyPreview}
    onStrokeOrderWarmup={(dataset, ready) => startWritingPractice({
      cohortId: dataset.id, eligibleCohortIds: [dataset.id], stage: 'acquisition',
      learningChannel: 'tier-1-writing', activityKind: 'acquisition',
      warmupMaximum: grade5WritingLabProfile.warmupPreview.preActivityMaximum,
      preActivityWarmupRequirement: 'undecided',
    }, 'Stroke Order Slay', ready)} />)
    hubRootElement.hidden = false
    setStatus(familyPreview ? 'Teacher curriculum loaded. Choose writing or reading; completed scores appear in family progress.' : 'Loaded the validated Grade 5 fixture. Tier 1 writing and Tier 2 recorded-reading pathways are ready for local testing.')
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'The Grade 5 hub could not be loaded.', true)
  }
}

dismissButton.addEventListener('click', () => {
  requestPanel.hidden = true
  requestOutput.textContent = ''
  requestActions.replaceChildren()
})

if (window.parent === window) {
  void import('./familyBeta/installProblemReporter.tsx').then((m) => m.installProblemReporter('Grade 5'))
}

if (!import.meta.env.DEV && !publicPreviewEnabled && !prototypeBaselineEnabled) {
  setStatus('This Grade 5 learning hub is available only in local development or an approved public preview.', true)
} else {
  void loadHub()
}
