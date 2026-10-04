import { createRoot } from 'react-dom/client'
import type { ReactNode } from 'react'
import { AppErrorBoundary } from './AppErrorBoundary.tsx'
import { writingSessionAnswers } from './application/testReview.ts'
import { fetchAutomaticGrade5Curriculum } from './automaticGrade5Curriculum.ts'
import type { Grade5SourceExtraction } from './curriculum/adapters/grade5GoogleSlides.ts'
import type { WeeklyDatasetCandidate } from './curriculum/model.ts'
import { type Dataset, type PracticeSession, type SessionAnswer, type Word } from './domain.ts'
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
  appendGrade5LabResult,
  grade5RequestKey,
  readGrade5LabProgress,
  saveGrade5WritingRun,
  writeGrade5LabProgress,
  type Grade5LabResult,
} from './grade5Lab/persistence.ts'
import {
  grade5LabReadingPathway,
  grade5LabReadingRequestIsConnected,
  grade5LabReadingWarmupPathway,
} from './grade5Lab/readingPractice.ts'
import { LearningHub } from './learningHub/LearningHub.tsx'
import { PracticeView, type PracticeAnswer } from './practice/PracticeView.tsx'
import { Tier2ReadingPractice } from './readingPractice/Tier2ReadingPractice.tsx'
import type { Tier2ReadingPracticeSummary, Tier2ReadingProgressRecord } from './readingPractice/contracts.ts'
import { DeferredTestReview } from './testReview/DeferredTestReview.tsx'
import { tier2ReadingPathwayTargets } from './tier2/pathway.ts'
import type { Tier2ReadingPathway } from './tier2/contracts.ts'
import { grade5Tier2ReadingProfile } from './tier2/profiles/grade5.ts'
import { browserSpeech, requireCompletedSpeech } from './audio/browserSpeech.ts'
import { tier2ReadingProgressMatchesPathway } from './application/readingPersistence.ts'
import { readLocalTier2ReadingProgress, writeLocalTier2ReadingProgress } from './persistence/tier2ReadingLocal.ts'
import './accessibility/typography.css'

const REVIEW_INSTRUCTION =
  'If you cheat, you are just cheating yourself. Answer whether you got it right or wrong honestly, to improve your score.'

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

function renderHub(content: ReactNode) {
  hubRoot.render(<AppErrorBoundary>{content}</AppErrorBoundary>)
}

function renderPractice(content: ReactNode) {
  practiceRoot.render(<AppErrorBoundary>{content}</AppErrorBoundary>)
}

let sourceExtraction: Grade5SourceExtraction | null = null
let learningHubModel: Grade5LearningHubModel | null = null
let activePractice: Grade5AcquisitionLabState | null = null
let activeDataset: Dataset | null = null
let activeDatasets: Dataset[] = []
let activeSession: PracticeSession | null = null
let activeRequest: Grade5ActivityLaunchRequest | null = null
let currentRevealMethod: Grade5LabRevealMethod = 'timer'
let savedProgress = readGrade5LabProgress(window.localStorage)
let savedReadingProgress = readLocalTier2ReadingProgress(window.localStorage)

function persistProgress(next = savedProgress) {
  savedProgress = next
  if (!writeGrade5LabProgress(window.localStorage, savedProgress)) {
    setStatus('Grade 5 progress could not be saved on this device.', true)
    return false
  }
  return true
}

function checkpointWriting() {
  if (!activeRequest || !activeSession) return
  persistProgress(
    saveGrade5WritingRun(savedProgress, activeRequest, activeSession, activePractice, currentRevealMethod),
  )
}

function reviewCycleFor(request: Grade5ActivityLaunchRequest): 1 | 2 | undefined {
  return request.stage === 'test-review-1' ? 1 : request.stage === 'test-review-2' ? 2 : undefined
}

function storeResult(result: Grade5LabResult) {
  persistProgress(appendGrade5LabResult(savedProgress, result))
}

function saveReadingCheckpoint(progress: Tier2ReadingProgressRecord) {
  savedReadingProgress = [...savedReadingProgress.filter((item) => item.id !== progress.id), progress]
  if (!writeLocalTier2ReadingProgress(window.localStorage, savedReadingProgress)) {
    setStatus('Grade 5 reading progress could not be saved on this device.', true)
  }
}

function readingResult(
  request: Grade5ActivityLaunchRequest,
  summary: Tier2ReadingPracticeSummary,
  completedAt = new Date().toISOString(),
  answers: Grade5LabResult['answers'] = [],
): Grade5LabResult {
  const reviewCycle = request.activityKind === 'test-review' ? reviewCycleFor(request) : undefined
  return {
    id: `${grade5RequestKey(request)}:${completedAt}`,
    channel: request.learningChannel,
    activityKind: request.activityKind,
    stage: request.stage,
    cohortId: request.cohortId,
    ...(reviewCycle ? { reviewCycle } : {}),
    correct: summary.correct,
    total: summary.attempted,
    answers,
    completedAt,
  }
}

function writingResult(request: Grade5ActivityLaunchRequest, session: PracticeSession): Grade5LabResult {
  const completedAt = new Date().toISOString()
  const reviewCycle = request.activityKind === 'test-review' ? reviewCycleFor(request) : undefined
  const answers = [
    ...session.warmupAnswers.map((answer) => ({
      wordId: answer.word.id,
      correct: answer.correct,
      phase: 'warmup' as const,
    })),
    ...session.primaryAnswers.map((answer) => ({
      wordId: answer.word.id,
      correct: answer.correct,
      phase: 'primary' as const,
    })),
  ]
  const primary = session.primaryAnswers.filter((answer) => answer.countsTowardWeeklyScore !== false)
  return {
    id: `${grade5RequestKey(request)}:${completedAt}`,
    channel: request.learningChannel,
    activityKind: request.activityKind,
    stage: request.stage,
    cohortId: request.cohortId,
    ...(reviewCycle ? { reviewCycle } : {}),
    correct: primary.filter((answer) => answer.correct).length,
    total: primary.length,
    answers,
    completedAt,
  }
}

function createElement<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const element = document.createElement(tag)
  if (className) element.className = className
  if (text !== undefined) element.textContent = text
  return element
}

function setStatus(message: string, error = false) {
  statusElement.textContent = message
  statusElement.classList.toggle('error', error)
  if (error) labDetails.open = true
}

function candidateFor(request: Grade5ActivityLaunchRequest): WeeklyDatasetCandidate {
  const candidate = sourceExtraction?.classification.selectedCandidates.find(
    (item) => item.datasetId === request.cohortId,
  )
  if (!candidate) throw new Error('The requested Grade 5 cohort is not available in the reviewed curriculum.')
  return candidate
}

function speakReadingReference(word: Word): Promise<void> {
  return requireCompletedSpeech(browserSpeech.play([{ text: word.text, language: 'zh-CN', rate: 0.55 }]))
}

function latestProgressionDate(extraction: Grade5SourceExtraction) {
  return extraction.progressionEvidence.reduce(
    (latest, evidence) => (evidence.effectiveDate > latest ? evidence.effectiveDate : latest),
    '0000-00-00',
  )
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
    practiceSummary.innerHTML = `<strong>Lab observations:</strong> official target/Earned-DT trials ${officialCorrect}/${official.length} correct · Familiar-DT diagnostic trials ${familiarCorrect}/${familiar.length} correct. Progress is saved on this device.`
    return
  }
  if (activeSession.segment === 'primary' && activeSession.primaryPhase === 'test-review') {
    practiceSummary.innerHTML =
      '<strong>Lab observations:</strong> Activity position is saved on this device. Writing responses remain provisional in this visit until the final review page.'
    return
  }
  const correct = activeSession.primaryAnswers.filter((answer) => answer.correct).length
  practiceSummary.innerHTML = `<strong>Lab observations:</strong> Test Review ${correct}/${activeSession.primaryAnswers.length} correct · Warmup ${activeSession.warmupAnswers.length}/${activeSession.warmupQueue.length} reviewed. Progress is saved on this device.`
}

function initialPracticeSession(
  request: Grade5ActivityLaunchRequest,
  dataset: Dataset,
  warmup: ReturnType<typeof grade5LabWarmupSelection>,
  acquisition: Grade5AcquisitionLabState | null,
): PracticeSession {
  const warmupWords = warmup.words
  const primaryPhase = request.activityKind === 'test-review' ? 'test-review' : 'acquisition'
  return {
    id: `grade5-lab-${request.stage}-${request.cohortId}`,
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
    warmupCategoryByWordId: warmup.categoryByWordId,
    warmupRandomRotationWordIds: warmupWords
      .filter((word) => warmup.categoryByWordId[word.id] === 'random-rotation')
      .map((word) => word.id),
    warmupRotationCycleId: 1,
    acquisition: acquisition?.flow as PracticeSession['acquisition'],
    warmupOnly: false,
  }
}

function primaryStartState(session: PracticeSession): PracticeSession {
  if (session.primaryQueue.length === 0)
    return { ...session, segment: 'primary', stage: 'complete', queue: [], index: 0 }
  if (session.acquisition?.prompt)
    return { ...session, segment: 'primary', stage: 'interstitial', queue: [session.acquisition.prompt.word], index: 0 }
  return { ...session, segment: 'primary', stage: 'interstitial', queue: session.primaryQueue, index: 0 }
}

function beginWarmup() {
  if (!activeSession || activeSession.stage !== 'warmup-intro') return
  browserSpeech.unlock()
  activeSession =
    activeSession.queue.length > 0
      ? { ...activeSession, stage: 'interstitial', index: 0 }
      : primaryStartState(activeSession)
  checkpointWriting()
  renderPracticeView()
}

function completeInterstitial() {
  if (!activeSession || activeSession.stage !== 'interstitial') return
  activeSession = { ...activeSession, stage: 'dictation' }
  checkpointWriting()
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
  checkpointWriting()
  renderPracticeView()
}

function startPrimaryReview() {
  if (!activeSession || activeSession.stage !== 'complete' || activeSession.primaryPhase !== 'test-review') return
  browserSpeech.unlock()
  activeSession = { ...activeSession, stage: 'review', index: 0 }
  checkpointWriting()
  renderPracticeView()
}

function leavePractice(
  message = 'Returned to the Grade 5 hub. Your unfinished run is saved on this device.',
  preserveActive = true,
) {
  if (preserveActive) checkpointWriting()
  browserSpeech.cancel()
  activePractice = null
  activeDataset = null
  activeDatasets = []
  activeSession = null
  activeRequest = null
  renderPractice(null)
  practicePanel.hidden = true
  requestPanel.hidden = true
  hubRootElement.hidden = false
  labDetails.hidden = false
  statusElement.hidden = false
  document.body.classList.remove('practice-active')
  setStatus(message)
}

function answerCurrentPrompt(correct: boolean) {
  if (!activeSession || activeSession.stage !== 'review') return
  if (activeSession.segment === 'primary' && activePractice) {
    if (!activePractice.flow.prompt?.revealed) return
    const assessmentCount = activePractice.assessments.length
    activePractice = answerGrade5AcquisitionLab(activePractice, correct, currentRevealMethod)
    const assessment =
      activePractice.assessments.length > assessmentCount
        ? activePractice.assessments[activePractice.assessments.length - 1]
        : undefined
    const response: SessionAnswer | undefined = assessment
      ? {
          word: assessment.target as Word,
          correct: assessment.correct,
          revealMethod: assessment.revealMethod,
          acquisitionKind: assessment.kind,
          promptId: assessment.promptId,
          countsTowardWeeklyScore: assessment.countsTowardWeeklyScore,
          dtPoolType: assessment.dtPoolType,
        }
      : undefined
    activeSession = {
      ...activeSession,
      acquisition: activePractice.flow,
      primaryAnswers: response ? [...activeSession.primaryAnswers, response] : activeSession.primaryAnswers,
      currentRevealMethod: undefined,
      stage: activePractice.flow.complete ? 'complete' : 'interstitial',
      queue: activePractice.flow.prompt ? [activePractice.flow.prompt.word] : [],
      index: 0,
    }
    currentRevealMethod = 'timer'
    checkpointWriting()
    renderPracticeView()
    return
  }

  const word = activeSession.queue[activeSession.index]
  if (!word) return
  const response: SessionAnswer = { word, correct, revealMethod: currentRevealMethod }
  const isWarmup = activeSession.segment === 'warmup'
  const answers = isWarmup ? [...activeSession.warmupAnswers, response] : [...activeSession.primaryAnswers, response]
  if (activeSession.index < activeSession.queue.length - 1) {
    activeSession = isWarmup
      ? { ...activeSession, warmupAnswers: answers, index: activeSession.index + 1 }
      : { ...activeSession, primaryAnswers: answers, index: activeSession.index + 1 }
    checkpointWriting()
    renderPracticeView()
    return
  }
  if (isWarmup) {
    activeSession = primaryStartState({ ...activeSession, warmupAnswers: answers })
    checkpointWriting()
    renderPracticeView()
    return
  }
  const correctCount = answers.filter((answer) => answer.correct).length
  activeSession = { ...activeSession, primaryAnswers: answers, stage: 'complete' }
  if (activeRequest) storeResult(writingResult(activeRequest, activeSession))
  leavePractice(
    `Test Review complete: ${correctCount}/${answers.length} correct. The result was saved on this device.`,
    false,
  )
}

function handlePracticeAnswer(answer: PracticeAnswer) {
  if (typeof answer === 'object') {
    if (!activeSession || answer.kind !== 'deferred-writing-test-review') return
    const primaryAnswers = writingSessionAnswers(answer.completion)
    activeSession = { ...activeSession, stage: 'complete', primaryAnswers }
    const correct = primaryAnswers.filter((item) => item.correct).length
    if (activeRequest) storeResult(writingResult(activeRequest, activeSession))
    leavePractice(
      `Test Review complete: ${correct}/${primaryAnswers.length} correct. The result was saved on this device.`,
      false,
    )
  } else if (typeof answer === 'boolean') answerCurrentPrompt(answer)
  else if (answer === 'skip-warmup' && activeSession?.stage === 'warmup-intro') {
    browserSpeech.unlock()
    activeSession = primaryStartState(activeSession)
    checkpointWriting()
    renderPracticeView()
  } else if (answer === 'continue-primary' && activeSession?.segment === 'warmup') {
    browserSpeech.unlock()
    activeSession = primaryStartState(activeSession)
    checkpointWriting()
    renderPracticeView()
  } else if (answer === 'skip-test-review')
    leavePractice('Test Review was abandoned. Its provisional writing was discarded; no score was created.')
  else if (answer === 'done') {
    if (activeRequest && activeSession) storeResult(writingResult(activeRequest, activeSession))
    leavePractice('Acquisition stopped for today. The completed progress was saved on this device.', false)
  }
}

function renderPracticeView() {
  if (!activeSession || !activeDataset) return
  renderAssessmentSummary()
  renderPractice(
    <PracticeView
      session={activeSession}
      datasets={activeDatasets}
      onExit={leavePractice}
      onBeginWarmup={beginWarmup}
      onInterstitialComplete={completeInterstitial}
      onDictationComplete={completeDictationWord}
      onStartReview={startPrimaryReview}
      onAnswer={handlePracticeAnswer}
      reviewInstruction={REVIEW_INSTRUCTION}
      timerSecondsOverride={grade5WritingLabProfile.timers.testReview}
      warmupRequired={grade5WritingLabProfile.preActivityWarmupRequirement === 'required'}
      wordAudioMode="word-only"
      wordAudioRate={0.55}
    />,
  )
}

function startWritingPractice(request: Grade5ActivityLaunchRequest, label: string) {
  try {
    if (!sourceExtraction) throw new Error('The validated Grade 5 source has not loaded yet.')
    const candidate = candidateFor(request)
    activeDatasets = grade5LabDatasets(sourceExtraction)
    activeDataset = activeDatasets.find((dataset) => dataset.id === candidate.datasetId) || grade5LabDataset(candidate)
    const warmup = grade5LabWarmupSelection(
      sourceExtraction,
      latestProgressionDate(sourceExtraction),
      Math.random,
      savedProgress.results,
    )
    activePractice =
      request.activityKind === 'acquisition' || request.activityKind === 'reacquisition'
        ? startGrade5AcquisitionLab(candidate)
        : null
    const resumable =
      savedProgress.activeWriting?.requestKey === grade5RequestKey(request) &&
      savedProgress.activeWriting.session.primaryDatasetId === activeDataset.id
        ? savedProgress.activeWriting
        : null
    activeRequest = request
    activeSession = resumable?.session || initialPracticeSession(request, activeDataset, warmup, activePractice)
    activePractice = resumable?.acquisition || activePractice
    currentRevealMethod = resumable?.currentRevealMethod || 'timer'
    checkpointWriting()
    requestPanel.hidden = true
    hubRootElement.hidden = true
    labDetails.hidden = true
    statusElement.hidden = true
    practicePanel.hidden = false
    document.body.classList.add('practice-active')
    setStatus(
      `${resumable ? 'Resumed' : 'Running'} ${label} with the required up-to-six-item Warmup and the shared Grade 5 Tier 1 writing flow. Progress is saved on this device.`,
    )
    renderPracticeView()
    practicePanel.scrollTop = 0
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Grade 5 writing practice could not start.', true)
  }
}

function activeReadingProgress(pathway: Tier2ReadingPathway) {
  return savedReadingProgress
    .filter(
      (progress) =>
        progress.status === 'in-progress' &&
        tier2ReadingProgressMatchesPathway(
          progress,
          'grade5-lab-child',
          '2026–2027',
          grade5Tier2ReadingProfile,
          pathway,
        ),
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]
}

function readingAnswers(
  progress: Tier2ReadingProgressRecord | undefined,
  phase: Grade5LabResult['answers'][number]['phase'],
): Grade5LabResult['answers'] {
  if (!progress) return []
  const attempts = progress.run.kind === 'acquisition' ? progress.run.assessments : progress.run.attempts
  return attempts.map((attempt) => ({ wordId: attempt.target.id, correct: attempt.correct, phase }))
}

function renderReadingRunner(
  pathway: Tier2ReadingPathway,
  label: string,
  sessionNote: string,
  onDone: (
    summary: Tier2ReadingPracticeSummary,
    progress: Tier2ReadingProgressRecord | undefined,
    completedAt: string,
  ) => void,
) {
  const resumed = activeReadingProgress(pathway)
  const readingSessionId = resumed?.id || `grade5-reading-${crypto.randomUUID()}`
  const readingStartedAt = resumed?.startedAt || new Date().toISOString()
  renderPractice(
    <Tier2ReadingPractice
      key={readingSessionId}
      profile={grade5Tier2ReadingProfile}
      pathway={pathway}
      label={label}
      onExit={() => leavePractice('Returned to the Grade 5 hub. Reading progress is saved on this device.')}
      onComplete={(summary, progress) => {
        const completedAt = new Date().toISOString()
        const completedProgress = progress
          ? {
              ...progress,
              revision: progress.revision + 1,
              status: 'completed' as const,
              summary,
              updatedAt: completedAt,
              completedAt,
            }
          : undefined
        if (completedProgress) saveReadingCheckpoint(completedProgress)
        onDone(summary, completedProgress, completedAt)
      }}
      persistence={{
        sessionId: readingSessionId,
        childId: 'grade5-lab-child',
        schoolYear: '2026–2027',
        startedAt: readingStartedAt,
        savedProgress: resumed,
        onCheckpoint: saveReadingCheckpoint,
      }}
      sessionNote={sessionNote}
    />,
  )
  practicePanel.scrollTop = 0
}

function renderPrimaryReading(request: Grade5ActivityLaunchRequest, label: string, pathway: Tier2ReadingPathway) {
  if (pathway.kind === 'test-review') {
    const targets = tier2ReadingPathwayTargets(pathway)
    practiceSummary.textContent =
      'Tier 2 reading Test Review collects every temporary recording before one final self-assessment page. Audio stays temporary; the final result is saved on this device.'
    renderPractice(
      <DeferredTestReview
        key={`grade5-reading-review-${request.stage}-${request.cohortId}`}
        mode="reading"
        targets={targets}
        activityLabel={pathway.cycle ? `Reading Test Review ${pathway.cycle}` : 'Reading Test Review'}
        onPlayReference={speakReadingReference}
        onDiscard={() =>
          leavePractice('Reading Test Review was abandoned. Temporary recordings and provisional answers were discarded.')
        }
        onComplete={(completion) => {
          const summary = {
            kind: 'test-review' as const,
            correct: completion.correct,
            attempted: completion.total,
            diagnostics: 0,
          }
          storeResult(
            readingResult(
              request,
              summary,
              new Date().toISOString(),
              completion.assessments.map((assessment) => ({
                wordId: assessment.target.id,
                correct: assessment.correct,
                phase: 'primary',
              })),
            ),
          )
          leavePractice(
            `Reading Test Review ${pathway.cycle || ''} complete: ${completion.correct}/${completion.total} correct. The cycle-specific result was saved on this device.`,
            false,
          )
        }}
        sessionNote="Grade 5 reading Test Review · collect every response first · audio is never saved"
      />,
    )
    practicePanel.scrollTop = 0
    return
  }
  practiceSummary.textContent =
    'Tier 2 reading uses prompt-local microphone audio. Progress and results are saved on this device; audio is never saved.'
  renderReadingRunner(
    pathway,
    label,
    'Grade 5 reading · progress is saved on this device · microphone audio is never saved',
    (summary, progress, completedAt) => {
      const phase = request.activityKind === 'warmup' ? 'warmup' : 'primary'
      storeResult(readingResult(request, summary, completedAt, readingAnswers(progress, phase)))
      leavePractice(
        `Reading complete: ${summary.correct}/${summary.attempted} assessed responses marked correct. The result was saved on this device.`,
        false,
      )
    },
  )
}

function startReadingPractice(request: Grade5ActivityLaunchRequest, label: string) {
  try {
    browserSpeech.unlock()
    if (!sourceExtraction) throw new Error('The validated Grade 5 source has not loaded yet.')
    const pathway = grade5LabReadingPathway(sourceExtraction, request)
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
    const resumedPrimary = pathway.kind !== 'test-review' ? activeReadingProgress(pathway) : undefined
    const warmup = grade5LabReadingWarmupPathway(
      sourceExtraction,
      latestProgressionDate(sourceExtraction),
      grade5RequestKey(request),
      Math.random,
      savedProgress.results,
    )
    if (request.preActivityWarmupRequirement === 'required' && !resumedPrimary && warmup.available) {
      practiceSummary.textContent =
        'Required Tier 2 Warmup · up to six mastered reading targets · progress is saved on this device · audio is never saved.'
      const warmupRequest: Grade5ActivityLaunchRequest = {
        ...request,
        activityKind: 'warmup',
        cohortId: null,
        eligibleCohortIds: warmup.cohorts.map((cohort) => cohort.datasetId),
        warmupMaximum: null,
        preActivityWarmupRequirement: 'not-applicable',
      }
      renderReadingRunner(
        warmup,
        `${label} · required Warmup`,
        'Grade 5 required reading Warmup · progress is saved on this device · microphone audio is never saved',
        (summary, progress, completedAt) => {
          storeResult(readingResult(warmupRequest, summary, completedAt, readingAnswers(progress, 'warmup')))
          renderPrimaryReading(request, label, pathway)
        },
      )
      return
    }
    renderPrimaryReading(request, label, pathway)
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Grade 5 reading practice could not start.', true)
  }
}

function connectedRequest(request: Grade5ActivityLaunchRequest) {
  return grade5LabWritingRequestIsConnected(request) || grade5LabReadingRequestIsConnected(request)
}

function startConnectedRequest(request: Grade5ActivityLaunchRequest, label: string) {
  if (grade5LabReadingRequestIsConnected(request)) startReadingPractice(request, label)
  else startWritingPractice(request, label)
}

function launchFromLearningHub(launch: Grade5HubLaunch) {
  const connected = launch.requests.filter(connectedRequest)
  if (connected.length === 1) {
    startConnectedRequest(connected[0], launch.label)
    return
  }
  showLaunchRequest(launch.label, launch.requests)
}

function showLaunchRequest(label: string, requests: Grade5ActivityLaunchRequest[]) {
  requestTitle.textContent = label
  const includesGuidedAndReview =
    requests.some((request) => request.activityKind === 'acquisition' || request.activityKind === 'reacquisition') &&
    requests.some((request) => request.activityKind === 'test-review')
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
        ? sourceExtraction?.classification.selectedCandidates.find(
            (candidate) => candidate.datasetId === request.cohortId,
          )?.dateRangeLabel
        : undefined
      const actionLabel =
        request.learningChannel === 'tier-2-reading'
          ? request.activityKind === 'test-review'
            ? 'Start Reading Test'
            : request.activityKind === 'warmup'
              ? 'Start Reading Mastery'
              : request.activityKind === 'reacquisition'
                ? 'Relearn Reading'
                : 'Start Reading Dojo'
          : request.activityKind === 'test-review'
            ? 'Start Writing Test'
            : request.activityKind === 'reacquisition'
              ? 'Relearn Writing'
              : 'Start Writing Dojo'
      button.textContent = `${actionLabel}${cohortLabel ? ` · ${cohortLabel}` : ''}`
      button.addEventListener('click', () => startConnectedRequest(request, label))
    } else {
      button.textContent =
        request.activityKind === 'reacquisition' ? 'Re-teaching Not Connected Yet' : 'Not Connected Yet'
      button.disabled = true
    }
    requestActions.append(button)
  }
  requestPanel.hidden = false
  requestPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

async function loadHub() {
  setStatus('Loading the reviewed Grade 5 curriculum…')
  try {
    const curriculum = await fetchAutomaticGrade5Curriculum()
    sourceExtraction = curriculum.extraction
    learningHubModel = buildGrade5LearningHub(sourceExtraction)
    renderHub(<LearningHub model={grade5LearningHubView(learningHubModel)} onLaunch={launchFromLearningHub} />)
    hubRootElement.hidden = false
    setStatus(
      'Loaded the reviewed Grade 5 curriculum. Tier 1 writing and Tier 2 reading pathways are ready.',
    )
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'The Grade 5 hub could not be loaded.', true)
  }
}

dismissButton.addEventListener('click', () => {
  requestPanel.hidden = true
  requestOutput.textContent = ''
  requestActions.replaceChildren()
})

void loadHub()
