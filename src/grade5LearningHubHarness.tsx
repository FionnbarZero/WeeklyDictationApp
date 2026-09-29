import { createRoot } from 'react-dom/client'
import { extractGrade5Presentation, type Grade5SourceExtraction } from './curriculum/adapters/grade5GoogleSlides.ts'
import type { SlidesPresentationPayload, WeeklyDatasetCandidate } from './curriculum/model.ts'
import { activePracticeWord, type Dataset, type PracticeSession, type SessionAnswer, type Word } from './domain.ts'
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
  type Grade5LearningHubModel,
} from './grade5Lab/learningHub.ts'
import {
  grade5LabDataset,
  grade5LabDatasets,
  grade5LabWarmupSelection,
  grade5LabWritingRequestIsConnected,
} from './grade5Lab/writingPractice.ts'
import { grade5WritingLabProfile } from './grade5Lab/practiceProfile.ts'
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
const labDetails = requiredElement<HTMLDetailsElement>('lab-details')
const practicePanel = requiredElement<HTMLElement>('practice-panel')
const practiceRootElement = requiredElement<HTMLElement>('grade5-practice-root')
const practiceSummary = requiredElement<HTMLElement>('practice-summary')
const practiceRoot = createRoot(practiceRootElement)

let sourceExtraction: Grade5SourceExtraction | null = null
let learningHubModel: Grade5LearningHubModel | null = null
let selectedSectionId: Grade5HubSection['id'] | null = null
let activePractice: Grade5AcquisitionLabState | null = null
let activeDataset: Dataset | null = null
let activeDatasets: Dataset[] = []
let activeSession: PracticeSession | null = null
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

function wordsElement(label: string, words: string[]) {
  const group = createElement('div', 'training-word-group')
  group.append(createElement('p', 'training-word-label', label))
  const values = createElement('div', 'training-word-list')
  if (words.length) {
    for (const word of words) values.append(createElement('span', undefined, word))
  } else {
    values.append(createElement('small', undefined, 'No words listed'))
  }
  group.append(values)
  return group
}

function cohortElement(section: Grade5HubSection) {
  const wrapper = createElement('section', 'cohort-focus')
  if (!section.cohorts.length) {
    wrapper.append(createElement('p', 'unavailable-message', section.unavailableReason || 'No cohort is available.'))
    return wrapper
  }
  for (const cohort of section.cohorts) {
    const cohortCard = createElement('article', 'cohort-card')
    const heading = createElement('div', 'cohort-card-heading')
    const copy = createElement('div')
    copy.append(createElement('p', 'eyebrow', cohort.dateRangeLabel), createElement('h2', undefined, 'Words in this challenge'))
    heading.append(copy, createElement('span', 'word-count-pill', `${cohort.tier1Words.length} writing · ${cohort.tier2Words.length} reading`))
    const groups = createElement('div', 'training-word-groups')
    groups.append(wordsElement('Tier 1 · Writing', cohort.tier1Words), wordsElement('Tier 2 · Reading', cohort.tier2Words))
    const details = createElement('details', 'cohort-source-details')
    const summary = createElement('summary', undefined, 'Source details')
    const sourceCopy = createElement('p', undefined, `Cohort: ${cohort.cohortId}`)
    details.append(summary, sourceCopy)
    if (cohort.tier3Words.length) details.append(wordsElement('Tier 3 · Preserved', cohort.tier3Words))
    cohortCard.append(heading, groups, details)
    wrapper.append(cohortCard)
  }
  return wrapper
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
  const word = activeSession ? activePracticeWord(activeSession) : undefined
  return word ? speakWord(word) : undefined
}

function latestProgressionDate(extraction: Grade5SourceExtraction) {
  return extraction.progressionEvents.reduce((latest, event) => event.effectiveDate > latest ? event.effectiveDate : latest, '0000-00-00')
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
  const correct = activeSession.primaryAnswers.filter((answer) => answer.correct).length
  practiceSummary.innerHTML = `<strong>Lab observations:</strong> Test Review ${correct}/${activeSession.primaryAnswers.length} correct · Warmup ${activeSession.warmupAnswers.length}/${activeSession.warmupQueue.length} reviewed. Nothing from this lab run is saved.`
}

function initialPracticeSession(
  request: Grade5ActivityLaunchRequest,
  dataset: Dataset,
  warmupWords: Word[],
  acquisition: Grade5AcquisitionLabState | null,
): PracticeSession {
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
    ? { ...activeSession, stage: 'interstitial', index: 0 }
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
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
  activePractice = null
  activeDataset = null
  activeDatasets = []
  activeSession = null
  practiceRoot.render(null)
  practicePanel.hidden = true
  labDetails.hidden = false
  statusElement.hidden = false
  sectionsElement.hidden = false
  const selectedSection = learningHubModel?.sections.find((section) => section.id === selectedSectionId)
  if (selectedSection) renderSectionDetail(selectedSection)
  else renderHubHome()
  document.body.classList.remove('practice-active')
  setStatus(message)
}

function answerCurrentPrompt(correct: boolean) {
  if (!activeSession || activeSession.stage !== 'review') return
  if (activeSession.segment === 'primary' && activePractice) {
    if (!activePractice.flow.prompt?.revealed) return
    const assessmentCount = activePractice.assessments.length
    activePractice = answerGrade5AcquisitionLab(activePractice, correct, currentRevealMethod)
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
  leavePractice(`Test Review complete: ${correctCount}/${answers.length} correct. This lab result was not saved.`)
}

function handlePracticeAnswer(answer: boolean | 'skip-warmup' | 'skip-test-review' | 'done') {
  if (typeof answer === 'boolean') answerCurrentPrompt(answer)
  else if (answer === 'skip-test-review') leavePractice('Test Review was abandoned. Its temporary answers were discarded and no score was created.')
  else if (answer === 'done') leavePractice('Acquisition stopped for today. This development lab does not save progress yet.')
}

function renderPracticeView() {
  if (!activeSession || !activeDataset) return
  renderAssessmentSummary()
  practiceRoot.render(
    <PracticeView
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
      timerSecondsOverride={grade5WritingLabProfile.testReviewTimerSeconds}
      warmupRequired
    />,
  )
}

function startWritingPractice(request: Grade5ActivityLaunchRequest, label: string) {
  try {
    if (!sourceExtraction) throw new Error('The validated Grade 5 source has not loaded yet.')
    const candidate = candidateFor(request)
    activeDatasets = grade5LabDatasets(sourceExtraction)
    activeDataset = activeDatasets.find((dataset) => dataset.id === candidate.datasetId) || grade5LabDataset(candidate)
    const warmup = grade5LabWarmupSelection(sourceExtraction, latestProgressionDate(sourceExtraction))
    if (warmup.words.length !== grade5WritingLabProfile.requiredWarmupTrials) {
      throw new Error(`Grade 5 writing requires ${grade5WritingLabProfile.requiredWarmupTrials} mastery Warmup trials before this activity.`)
    }
    activePractice = request.activityKind === 'acquisition' ? startGrade5AcquisitionLab(candidate) : null
    activeSession = initialPracticeSession(request, activeDataset, warmup.words, activePractice)
    currentRevealMethod = 'timer'
    requestPanel.hidden = true
    hubIntro.hidden = true
    labDetails.hidden = true
    statusElement.hidden = true
    sectionsElement.hidden = true
    practicePanel.hidden = false
    document.body.classList.add('practice-active')
    setStatus(`Running ${label} with a required six-item mastery Warmup and the shared Grade 5 Tier 1 writing flow. This lab run is not persisted.`)
    renderPracticeView()
    practicePanel.scrollTop = 0
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Grade 5 writing practice could not start.', true)
  }
}

function showLaunchRequest(label: string, requests: Grade5ActivityLaunchRequest[]) {
  requestTitle.textContent = label
  requestMessage.textContent = requests.length > 1
    ? 'Tier 1 writing is connected to the shared practice flow. Reading remains intentionally unavailable until its shared engine is designed.'
    : 'This activity is not connected yet. The portable request below is ready for its future shared practice engine.'
  requestOutput.textContent = JSON.stringify(requests.length === 1 ? requests[0] : requests, null, 2)
  requestActions.replaceChildren()
  for (const request of requests) {
    const button = createElement('button', grade5LabWritingRequestIsConnected(request) ? 'primary-button' : 'secondary-button')
    button.type = 'button'
    if (grade5LabWritingRequestIsConnected(request)) {
      button.textContent = request.activityKind === 'test-review' ? 'Start Writing Test' : 'Start Writing Dojo'
      button.addEventListener('click', () => startWritingPractice(request, label))
    } else {
      button.textContent = request.learningChannel === 'tier-2-reading' ? 'Reading Engine Not Built Yet' : 'Not Connected Yet'
      button.disabled = true
    }
    requestActions.append(button)
  }
  requestPanel.hidden = false
  requestPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

const sectionVisuals: Record<Grade5HubSection['id'], { number: string; kicker: string; action: string; theme: string }> = {
  homework: { number: '1', kicker: 'This week', action: 'Enter the Dojo', theme: 'gold' },
  'test-review-1': { number: '2', kicker: 'Test practice 1', action: 'Practice my skills', theme: 'blue' },
  'test-review-2': { number: '3', kicker: 'Test practice 2', action: 'Face the Final Boss', theme: 'violet' },
  review: { number: '4', kicker: 'Older words', action: 'Enter the Spirit realm', theme: 'green' },
}

function activityLabel(activity: Grade5HubActivity) {
  if (activity.book) return 'Read together'
  if (activity.id.includes('reading')) return 'Tier 2 · Reading'
  if (activity.id.includes('writing')) return 'Tier 1 · Writing'
  if (activity.id.includes('reenter')) return 'Need more help?'
  if (activity.id.includes('reteach')) return 'Future training'
  return 'Mastery practice'
}

function activityElement(activity: Grade5HubActivity, index: number, theme: string) {
  const connectedRequests = activity.launchRequests.filter(grade5LabWritingRequestIsConnected)
  const effectiveAvailability = connectedRequests.length ? 'ready' : activity.availability
  const card = createElement('article', `training-module module-${theme} activity-${effectiveAvailability}`)
  const icon = activity.book ? '📖' : activity.id.includes('reading') ? '🗣️' : activity.id.includes('writing') ? '✍️' : '🌱'
  card.append(createElement('span', 'training-module-number', String(index + 1)))
  card.append(createElement('span', 'activity-icon', icon))
  card.append(createElement('p', 'eyebrow', activityLabel(activity)))
  card.append(createElement('h3', undefined, activity.label))
  card.append(createElement('p', undefined, activity.description))

  if (activity.book) {
    const link = createElement('a', 'activity-action', 'Open the Book')
    link.href = activity.book.url
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.setAttribute('aria-label', `${activity.label}: ${activity.book.title} (opens in a new tab)`)
    card.append(link)
  } else {
    const button = createElement('button', 'activity-action')
    button.type = 'button'
    if (activity.availability === 'unavailable') {
      button.textContent = 'Not Available Yet'
      button.disabled = true
      button.title = activity.unavailableReason || 'This activity is unavailable.'
      card.append(createElement('small', 'availability-note', activity.unavailableReason || 'This activity is unavailable.'))
    } else if (connectedRequests.length === 1) {
      button.textContent = activity.label
      button.addEventListener('click', () => startWritingPractice(connectedRequests[0], activity.label))
      card.append(createElement('small', 'availability-note ready-note', activity.launchRequests.length > 1
        ? 'Tier 1 writing is ready; Tier 2 reading is still being built.'
        : 'Ready to practice in this test lab.'))
    } else if (connectedRequests.length) {
      button.textContent = activity.label
      button.addEventListener('click', () => showLaunchRequest(activity.label, activity.launchRequests))
      card.append(createElement('small', 'availability-note ready-note', 'Writing is ready; reading is still being built.'))
    } else {
      button.textContent = 'Coming Soon'
      button.disabled = true
      card.append(createElement('small', 'availability-note', 'This learning engine is not connected yet.'))
    }
    card.append(button)
  }
  return card
}

function sectionElement(section: Grade5HubSection) {
  const visual = sectionVisuals[section.id]
  const element = createElement('section', `challenge-page section-${section.id} theme-${visual.theme}`)
  if (!section.available) element.classList.add('section-unavailable')
  const back = createElement('button', 'back-link', '← Back to all challenges')
  back.type = 'button'
  back.addEventListener('click', renderHubHome)
  const heading = createElement('div', 'challenge-heading')
  const text = createElement('div')
  text.append(createElement('p', 'eyebrow', visual.kicker))
  text.append(createElement('h2', undefined, section.title), createElement('p', undefined, section.subtitle))
  const mark = createElement('div', 'challenge-mark', visual.number)
  heading.append(text, mark)
  element.append(back, heading, cohortElement(section))
  const activityHeading = createElement('div', 'activity-heading')
  activityHeading.append(createElement('p', 'eyebrow', 'Choose an activity'), createElement('h2', undefined, 'How do you want to train?'))
  element.append(activityHeading)
  const activityGrid = createElement('div', 'activity-grid')
  section.activities.forEach((activity, index) => activityGrid.append(activityElement(activity, index, visual.theme)))
  element.append(activityGrid)
  return element
}

function sectionCard(section: Grade5HubSection) {
  const visual = sectionVisuals[section.id]
  const card = createElement('button', `path-card path-${visual.theme}`)
  card.type = 'button'
  card.disabled = !section.available
  card.append(createElement('span', 'path-number', visual.number), createElement('span', 'eyebrow', visual.kicker), createElement('span', 'path-title', section.title), createElement('span', 'path-description', section.subtitle))
  const date = section.cohorts[0]?.dateRangeLabel
  card.append(createElement('span', 'path-date', date || section.unavailableReason || 'Waiting for this challenge'))
  card.append(createElement('span', 'path-action', section.available ? `${visual.action} →` : 'Not available yet'))
  if (!section.available && section.unavailableReason) card.title = section.unavailableReason
  else card.addEventListener('click', () => renderSectionDetail(section))
  return card
}

function renderHubHome() {
  if (!learningHubModel) return
  selectedSectionId = null
  requestPanel.hidden = true
  hubIntro.hidden = false
  sectionsElement.className = 'hub-sections challenge-grid'
  sectionsElement.replaceChildren(...learningHubModel.sections.map(sectionCard))
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function renderSectionDetail(section: Grade5HubSection) {
  selectedSectionId = section.id
  requestPanel.hidden = true
  hubIntro.hidden = true
  sectionsElement.className = 'hub-sections section-detail-container'
  sectionsElement.replaceChildren(sectionElement(section))
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

async function loadHub() {
  setStatus('Loading the trusted Grade 5 fixture…')
  try {
    const response = await fetch(fixtureUrl, { cache: 'no-store' })
    if (!response.ok) throw new Error(`Fixture request failed with HTTP ${response.status}.`)
    sourceExtraction = extractGrade5Presentation(normalizePayload(await response.json()))
    learningHubModel = buildGrade5LearningHub(sourceExtraction)
    renderHubHome()
    setStatus('Loaded the validated Grade 5 fixture. Tier 1 Acquisition and both writing Test Reviews are ready for local testing.')
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
