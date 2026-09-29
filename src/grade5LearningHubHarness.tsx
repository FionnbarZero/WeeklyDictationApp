import { createRoot } from 'react-dom/client'
import { extractGrade5Presentation, type Grade5SourceExtraction } from './curriculum/adapters/grade5GoogleSlides.ts'
import type { SlidesPresentationPayload, WeeklyDatasetCandidate } from './curriculum/model.ts'
import type { Dataset, PracticeSession, Word } from './domain.ts'
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
  type Grade5HubActivity,
  type Grade5HubSection,
} from './grade5Lab/learningHub.ts'
import { PracticeView } from './practice/PracticeView.tsx'

const fixtureUrl = '/tests/fixtures/grade5-presentation.json'
const REVIEW_INSTRUCTION = 'If you cheat, you are just cheating yourself. Answer whether you got it right or wrong honestly, to improve your score.'

function requiredElement<T extends HTMLElement>(id: string) {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Missing Grade 5 learning-hub element: ${id}`)
  return element as T
}

const statusElement = requiredElement<HTMLParagraphElement>('hub-status')
const hubIntro = requiredElement<HTMLElement>('hub-intro')
const sectionsElement = requiredElement<HTMLElement>('hub-sections')
const requestPanel = requiredElement<HTMLElement>('request-panel')
const requestTitle = requiredElement<HTMLHeadingElement>('request-title')
const requestMessage = requiredElement<HTMLParagraphElement>('request-message')
const requestOutput = requiredElement<HTMLElement>('request-output')
const requestActions = requiredElement<HTMLElement>('request-actions')
const dismissButton = requiredElement<HTMLButtonElement>('dismiss-request')
const practicePanel = requiredElement<HTMLElement>('practice-panel')
const practiceRootElement = requiredElement<HTMLElement>('grade5-practice-root')
const practiceSummary = requiredElement<HTMLElement>('practice-summary')
const practiceRoot = createRoot(practiceRootElement)

let sourceExtraction: Grade5SourceExtraction | null = null
let activePractice: Grade5AcquisitionLabState | null = null
let activeDataset: Dataset | null = null
let currentRevealMethod: Grade5LabRevealMethod = 'timer'

function createElement<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const element = document.createElement(tag)
  if (className) element.className = className
  if (text !== undefined) element.textContent = text
  return element
}

function setStatus(message: string, error = false) {
  statusElement.textContent = message
  statusElement.classList.toggle('error', error)
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

function wordsElement(label: string, words: string[]) {
  const group = createElement('div', 'word-group')
  group.append(createElement('span', 'word-label', label))
  const values = createElement('span', 'word-values', words.length ? words.join('、') : 'None')
  group.append(values)
  return group
}

function cohortElement(section: Grade5HubSection) {
  const wrapper = createElement('div', 'cohort-summary')
  if (!section.cohorts.length) {
    wrapper.append(createElement('p', 'unavailable-message', section.unavailableReason || 'No cohort is available.'))
    return wrapper
  }
  for (const cohort of section.cohorts) {
    const cohortCard = createElement('div', 'cohort')
    cohortCard.append(createElement('strong', undefined, cohort.dateRangeLabel))
    cohortCard.append(wordsElement('Tier 1', cohort.tier1Words))
    cohortCard.append(wordsElement('Tier 2', cohort.tier2Words))
    cohortCard.append(createElement('small', undefined, `Cohort: ${cohort.cohortId}`))
    wrapper.append(cohortCard)
  }
  return wrapper
}

function isConnectedWritingAcquisition(request: Grade5ActivityLaunchRequest) {
  return request.activityKind === 'acquisition'
    && request.learningChannel === 'tier-1-writing'
    && Boolean(request.cohortId)
}

function candidateFor(request: Grade5ActivityLaunchRequest): WeeklyDatasetCandidate {
  const candidate = sourceExtraction?.candidates.find((item) =>
    item.status === 'valid' && item.datasetId === request.cohortId)
  if (!candidate) throw new Error('The requested Grade 5 cohort is not available in the validated fixture.')
  return candidate
}

function speakWord(word: Word) {
  if (!word.text || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(word.text)
  utterance.lang = 'zh-CN'
  utterance.rate = 0.55
  window.speechSynthesis.speak(utterance)
  return () => window.speechSynthesis.cancel()
}

function speakCurrentWord() {
  const word = activePractice?.flow.prompt?.word
  return word ? speakWord(word) : undefined
}

function datasetFor(candidate: WeeklyDatasetCandidate, practice: Grade5AcquisitionLabState): Dataset {
  if (!candidate.datasetId || !candidate.dateRangeLabel || !candidate.normalizedStartDate || !candidate.normalizedEndDate) {
    throw new Error('The validated Grade 5 cohort is missing canonical dates or identity.')
  }
  return {
    id: candidate.datasetId,
    dateRange: candidate.dateRangeLabel,
    startDate: candidate.normalizedStartDate,
    endDate: candidate.normalizedEndDate,
    grade: candidate.grade,
    schoolYear: candidate.schoolYear,
    description: 'Grade 5 Tier 1 writing',
    sourceDeckId: candidate.source.sourceDocumentId,
    sourceSlideId: candidate.source.sourceUnitId,
    importStatus: 'valid',
    words: practice.targetSet.targets.map((target) => ({
      ...target,
      grade: 'Grade 5',
      sourceSlideId: candidate.source.sourceUnitId,
    })),
  }
}

function renderAssessmentSummary() {
  if (!activePractice) {
    practiceSummary.textContent = ''
    return
  }
  const official = activePractice.assessments.filter((item) => item.countsTowardWeeklyScore)
  const familiar = activePractice.assessments.filter((item) => item.dtPoolType === 'familiar')
  const officialCorrect = official.filter((item) => item.correct).length
  const familiarCorrect = familiar.filter((item) => item.correct).length
  practiceSummary.innerHTML = `<strong>Lab observations:</strong> official target/Earned-DT trials ${officialCorrect}/${official.length} correct · Familiar-DT diagnostic trials ${familiarCorrect}/${familiar.length} correct. Nothing from this lab run is saved.`
}

function practiceSessionFor(state: Grade5AcquisitionLabState, dataset: Dataset): PracticeSession {
  const prompt = state.flow.prompt
  return {
    id: `grade5-lab-${state.cohortId}`,
    childId: 'grade5-lab-child',
    grade: 'Grade 5',
    primaryDatasetId: dataset.id,
    primaryPhase: 'acquisition',
    segment: 'primary',
    stage: state.flow.complete || !prompt ? 'complete' : prompt.revealed ? 'review' : 'dictation',
    queue: dataset.words,
    warmupQueue: [],
    primaryQueue: dataset.words,
    index: state.flow.targetIndex,
    startedAt: 'grade5-development-lab',
    warmupAnswers: [],
    primaryAnswers: [],
    warmupCategoryByWordId: {},
    warmupRandomRotationWordIds: [],
    warmupRotationCycleId: 1,
    acquisition: state.flow as PracticeSession['acquisition'],
    currentRevealMethod,
    warmupOnly: false,
  }
}

function revealCurrentPrompt(method: Grade5LabRevealMethod) {
  if (!activePractice?.flow.prompt || activePractice.flow.prompt.revealed) return
  currentRevealMethod = method
  activePractice = revealGrade5AcquisitionLab(activePractice)
  renderPracticeView()
}

function answerCurrentPrompt(correct: boolean) {
  if (!activePractice?.flow.prompt?.revealed) return
  activePractice = answerGrade5AcquisitionLab(activePractice, correct, currentRevealMethod)
  currentRevealMethod = 'timer'
  renderPracticeView()
}

function leavePractice() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
  activePractice = null
  activeDataset = null
  practiceRoot.render(null)
  practicePanel.hidden = true
  hubIntro.hidden = false
  statusElement.hidden = false
  sectionsElement.hidden = false
  document.body.classList.remove('practice-active')
  setStatus('Returned to the Grade 5 hub. The development-only Acquisition run was discarded.')
}

function handlePracticeAnswer(answer: boolean | 'skip-warmup' | 'skip-test-review' | 'done') {
  if (typeof answer === 'boolean') answerCurrentPrompt(answer)
  else if (answer === 'done') leavePractice()
}

function renderPracticeView() {
  if (!activePractice || !activeDataset) return
  renderAssessmentSummary()
  practiceRoot.render(
    <PracticeView
      session={practiceSessionFor(activePractice, activeDataset)}
      datasets={[activeDataset]}
      onExit={leavePractice}
      onReplay={speakCurrentWord}
      onBeginWarmup={() => undefined}
      onInterstitialComplete={() => undefined}
      onDictationComplete={(method = 'timer') => revealCurrentPrompt(method)}
      onStartReview={() => undefined}
      onAnswer={handlePracticeAnswer}
      onSpeakWord={speakWord}
      onSpeakReviewInstruction={() => undefined}
      reviewInstruction={REVIEW_INSTRUCTION}
    />,
  )
}

function startWritingAcquisition(request: Grade5ActivityLaunchRequest, label: string) {
  try {
    const candidate = candidateFor(request)
    activePractice = startGrade5AcquisitionLab(candidate)
    activeDataset = datasetFor(candidate, activePractice)
    currentRevealMethod = 'timer'
    requestPanel.hidden = true
    hubIntro.hidden = true
    statusElement.hidden = true
    sectionsElement.hidden = true
    practicePanel.hidden = false
    document.body.classList.add('practice-active')
    setStatus(`Running ${label} with the shared Acquisition v3 engine and validated Grade 5 Tier 1 targets. This lab run is not persisted.`)
    renderPracticeView()
    practicePanel.scrollIntoView({ behavior: 'smooth', block: 'start' })
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Grade 5 Acquisition could not start.', true)
  }
}

function showLaunchRequest(label: string, requests: Grade5ActivityLaunchRequest[]) {
  requestTitle.textContent = label
  requestMessage.textContent = requests.length > 1
    ? 'Writing Acquisition is connected to the shared engine. Reading remains intentionally unavailable until its shared engine is designed.'
    : 'This activity is not connected yet. The portable request below is ready for its future shared practice engine.'
  requestOutput.textContent = JSON.stringify(requests.length === 1 ? requests[0] : requests, null, 2)
  requestActions.replaceChildren()
  for (const request of requests) {
    const button = createElement('button', isConnectedWritingAcquisition(request) ? 'primary-button' : 'secondary-button')
    button.type = 'button'
    if (isConnectedWritingAcquisition(request)) {
      button.textContent = 'Start Writing Dojo'
      button.addEventListener('click', () => startWritingAcquisition(request, label))
    } else {
      button.textContent = request.learningChannel === 'tier-2-reading' ? 'Reading Engine Not Built Yet' : 'Not Connected Yet'
      button.disabled = true
    }
    requestActions.append(button)
  }
  requestPanel.hidden = false
  requestPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

function activityElement(activity: Grade5HubActivity) {
  const connectedRequests = activity.launchRequests.filter(isConnectedWritingAcquisition)
  const effectiveAvailability = connectedRequests.length ? 'ready' : activity.availability
  const card = createElement('article', `activity activity-${effectiveAvailability}`)
  const icon = activity.book ? '📖' : activity.id.includes('reading') ? '🗣️' : activity.id.includes('writing') ? '✍️' : '🌱'
  card.append(createElement('span', 'activity-icon', icon))
  card.append(createElement('h3', undefined, activity.label))
  card.append(createElement('p', undefined, activity.description))

  if (activity.book) {
    const link = createElement('a', 'activity-action', activity.label)
    link.href = activity.book.url
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.setAttribute('aria-label', `${activity.label}: ${activity.book.title} (opens in a new tab)`)
    card.append(link)
  } else {
    const button = createElement('button', 'activity-action', activity.availability === 'unavailable' ? 'Not Available Yet' : activity.label)
    button.type = 'button'
    if (activity.availability === 'unavailable') {
      button.disabled = true
      button.title = activity.unavailableReason || 'This activity is unavailable.'
      card.append(createElement('small', 'availability-note', activity.unavailableReason || 'This activity is unavailable.'))
    } else if (activity.launchRequests.length === 1 && connectedRequests.length === 1) {
      button.addEventListener('click', () => startWritingAcquisition(connectedRequests[0], activity.label))
      card.append(createElement('small', 'availability-note', 'Shared Acquisition v3 engine connected for this lab.'))
    } else {
      button.addEventListener('click', () => showLaunchRequest(activity.label, activity.launchRequests))
      const note = connectedRequests.length
        ? 'Writing Acquisition is connected; reading is still unavailable.'
        : 'Learning engine not connected yet.'
      card.append(createElement('small', 'availability-note', note))
    }
    card.append(button)
  }
  return card
}

function sectionElement(section: Grade5HubSection) {
  const element = createElement('section', `hub-section section-${section.id}`)
  if (!section.available) element.classList.add('section-unavailable')
  const heading = createElement('div', 'section-heading')
  const text = createElement('div')
  text.append(createElement('p', 'section-kicker', section.stage.replace(/-/g, ' ')))
  text.append(createElement('h2', undefined, section.title), createElement('p', undefined, section.subtitle))
  heading.append(text, createElement('span', `stage-badge ${section.available ? 'available' : 'unavailable'}`, section.available ? 'Available' : 'Waiting'))
  element.append(heading, cohortElement(section))
  const activityGrid = createElement('div', 'activity-grid')
  for (const activity of section.activities) activityGrid.append(activityElement(activity))
  element.append(activityGrid)
  return element
}

async function loadHub() {
  setStatus('Loading the trusted Grade 5 fixture…')
  try {
    const response = await fetch(fixtureUrl, { cache: 'no-store' })
    if (!response.ok) throw new Error(`Fixture request failed with HTTP ${response.status}.`)
    sourceExtraction = extractGrade5Presentation(normalizePayload(await response.json()))
    const model = buildGrade5LearningHub(sourceExtraction)
    sectionsElement.replaceChildren(...model.sections.map(sectionElement))
    setStatus('Loaded the validated Grade 5 fixture. Tier 1 writing Acquisition is ready for local testing.')
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'The Grade 5 hub could not be loaded.', true)
  }
}

dismissButton.addEventListener('click', () => {
  requestPanel.hidden = true
  requestOutput.textContent = ''
  requestActions.replaceChildren()
})

if (!import.meta.env.DEV) {
  setStatus('This Grade 5 learning hub is available only in local development.', true)
} else {
  void loadHub()
}
