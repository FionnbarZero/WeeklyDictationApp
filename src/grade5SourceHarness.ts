import { extractGrade5Presentation } from './curriculum/adapters/grade5GoogleSlides.ts'
import type { SlidesPresentationPayload, WeeklyDatasetCandidate } from './curriculum/model.ts'

const fixtureUrl = new URL('../tests/fixtures/grade5-presentation.json', import.meta.url).href
const prototypeBaselineEnabled = import.meta.env.VITE_PROTOTYPE_BASELINE === 'true'

function requiredElement<T extends HTMLElement>(id: string) {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Missing Grade 5 harness element: ${id}`)
  return element as T
}

const loadFixtureButton = requiredElement<HTMLButtonElement>('load-fixture')
const clearButton = requiredElement<HTMLButtonElement>('clear-results')
const fileInput = requiredElement<HTMLInputElement>('json-file')
const statusElement = requiredElement<HTMLParagraphElement>('status')
const resultsElement = requiredElement<HTMLElement>('results')
const summaryElement = requiredElement<HTMLElement>('summary')
const stagePreviewElement = requiredElement<HTMLElement>('stage-preview')
const candidatesElement = requiredElement<HTMLElement>('candidates')
const eventsElement = requiredElement<HTMLElement>('events')
const issuesElement = requiredElement<HTMLElement>('issues')

function clear(element: HTMLElement) {
  element.replaceChildren()
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
}

function normalizePayload(value: unknown): SlidesPresentationPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The selected file must contain one JSON presentation object.')
  const record = value as Record<string, unknown>
  if (record.slides !== undefined && !Array.isArray(record.slides)) throw new Error('The presentation slides field must be an array.')
  return {
    sourceType: 'google-slides',
    ...(typeof record.presentationId === 'string' ? { presentationId: record.presentationId } : {}),
    ...(Array.isArray(record.slides) ? { slides: record.slides as SlidesPresentationPayload['slides'] } : {}),
  }
}

function candidateLabel(candidate: WeeklyDatasetCandidate | undefined) {
  if (!candidate) return 'None'
  return `${candidate.dateRangeLabel || candidate.normalizedStartDate || 'Unknown week'} · ${candidate.tier1.map((item) => item.text).join('、')}`
}

function renderSummary(values: Array<{ label: string; value: number }>) {
  clear(summaryElement)
  for (const item of values) {
    const card = createElement('div', 'summary-card')
    card.append(createElement('strong', undefined, String(item.value)), createElement('span', undefined, item.label))
    summaryElement.append(card)
  }
}

function renderTier(card: HTMLElement, label: string, values: string[]) {
  const section = createElement('div', 'tier')
  section.append(createElement('strong', undefined, `${label} · ${values.length}`))
  const terms = createElement('div', 'terms')
  if (values.length === 0) terms.append(createElement('span', 'empty', 'None'))
  for (const value of values) terms.append(createElement('span', 'term', value))
  section.append(terms)
  card.append(section)
}

function renderCandidates(candidates: WeeklyDatasetCandidate[]) {
  clear(candidatesElement)
  const ordered = [...candidates].sort((left, right) =>
    (left.normalizedStartDate || '').localeCompare(right.normalizedStartDate || ''))
  if (ordered.length === 0) {
    candidatesElement.append(createElement('p', 'empty', 'No candidate was extracted.'))
    return
  }
  for (const candidate of ordered) {
    const card = createElement('article', 'candidate')
    card.append(createElement('h3', undefined, candidate.dateRangeLabel || candidate.rawDate || 'Unknown week'))
    const badges = createElement('div', 'badges')
    badges.append(
      createElement('span', `badge ${candidate.status}`, candidate.status),
      createElement('span', 'badge', candidate.instructionalRole),
    )
    card.append(badges)
    card.append(createElement('p', 'metadata', `Dataset: ${candidate.datasetId || 'not assigned'}`))
    card.append(createElement('p', 'metadata', `Source slide: ${candidate.source.sourceUnitId || 'missing'}`))
    renderTier(card, 'Tier 1 writing', candidate.tier1.map((item) => item.text))
    renderTier(card, 'Tier 2 preserved', candidate.tier2.map((item) => item.text))
    renderTier(card, 'Tier 3 preserved', candidate.tier3.map((item) => item.text))
    candidatesElement.append(card)
  }
}

function renderEvents(events: ReturnType<typeof extractGrade5Presentation>['progressionEvidence']) {
  clear(eventsElement)
  if (events.length === 0) {
    eventsElement.append(createElement('p', 'empty', 'No accepted progression events.'))
    return
  }
  for (const [index, event] of events.entries()) {
    const item = createElement('div', 'event')
    item.append(createElement('strong', undefined, index === 0 ? `Baseline · ${event.effectiveDate}` : `Accepted step · ${event.effectiveDate}`))
    item.append(createElement('p', 'metadata', `Introduced: ${event.introducedDatasetId}`))
    item.append(createElement('p', 'metadata', event.confirmedDatasetId ? `Confirmed: ${event.confirmedDatasetId}` : 'Confirmed: baseline does not reconstruct an earlier cohort'))
    item.append(createElement('code', undefined, event.evidenceId))
    eventsElement.append(item)
  }
}

function renderIssues(issues: ReturnType<typeof extractGrade5Presentation>['issues']) {
  clear(issuesElement)
  if (issues.length === 0) {
    issuesElement.append(createElement('p', 'empty', 'No extraction issues were found.'))
    return
  }
  for (const issue of issues) {
    const item = createElement('div', `issue ${issue.severity}`)
    const badges = createElement('div', 'badges')
    badges.append(createElement('span', `badge ${issue.severity}`, issue.severity), createElement('span', 'badge', issue.code))
    item.append(badges, createElement('p', undefined, issue.message))
    if (issue.sourceUnitId) item.append(createElement('p', 'metadata', `Source slide: ${issue.sourceUnitId}`))
    if (issue.datasetId) item.append(createElement('p', 'metadata', `Dataset: ${issue.datasetId}`))
    issuesElement.append(item)
  }
}

function renderStagePreview(candidates: WeeklyDatasetCandidate[], eventIds: string[]) {
  clear(stagePreviewElement)
  const byId = new Map(candidates.filter((candidate) => candidate.datasetId).map((candidate) => [candidate.datasetId!, candidate]))
  const accepted = eventIds.map((id) => byId.get(id)).filter((candidate): candidate is WeeklyDatasetCandidate => Boolean(candidate))
  const acceptedCount = accepted.length
  const stages = [
    { label: 'Acquisition', candidate: accepted[acceptedCount - 1] },
    { label: 'Test Review 1', candidate: accepted[acceptedCount - 2] },
    { label: 'Test Review 2', candidate: accepted[acceptedCount - 3] },
  ]
  for (const stage of stages) {
    const item = createElement('div', 'stage')
    item.append(createElement('strong', undefined, stage.label), createElement('span', undefined, candidateLabel(stage.candidate)))
    stagePreviewElement.append(item)
  }
  const mastered = accepted.slice(0, Math.max(0, accepted.length - 3))
  const mastery = createElement('div', 'stage')
  mastery.append(createElement('strong', undefined, 'Mastery'))
  mastery.append(createElement('span', undefined, mastered.length ? mastered.map(candidateLabel).join(' | ') : 'None yet'))
  stagePreviewElement.append(mastery)
}

function renderPayload(payload: SlidesPresentationPayload, sourceLabel: string) {
  const extraction = extractGrade5Presentation(payload)
  const counts = extraction.classification.decisions.reduce<Record<string, number>>((result, decision) => {
    result[decision.status] = (result[decision.status] || 0) + 1
    return result
  }, {})
  renderSummary([
    { label: 'Source slides considered', value: payload.slides?.length || 0 },
    { label: 'Canonical candidates', value: extraction.candidates.length },
    { label: 'Accepted events', value: extraction.progressionEvidence.length },
    { label: 'Duplicates', value: counts.duplicate || 0 },
    { label: 'Conflicts', value: counts.conflict || 0 },
    { label: 'Errors', value: extraction.issues.filter((issue) => issue.severity === 'error').length },
  ])
  renderStagePreview(extraction.candidates, extraction.progressionEvidence.map((event) => event.introducedDatasetId))
  renderCandidates(extraction.candidates)
  renderEvents(extraction.progressionEvidence)
  renderIssues(extraction.issues)
  resultsElement.hidden = false
  setStatus(`Loaded ${sourceLabel}. Nothing was written or activated.`)
}

async function loadFixture() {
  loadFixtureButton.disabled = true
  setStatus('Loading the trusted local fixture…')
  try {
    const response = await fetch(fixtureUrl, { cache: 'no-store' })
    if (!response.ok) throw new Error(`Fixture request failed with HTTP ${response.status}.`)
    renderPayload(normalizePayload(await response.json()), 'trusted Week 4–7 fixture')
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'The fixture could not be loaded.', true)
  } finally {
    loadFixtureButton.disabled = false
  }
}

function clearResults() {
  resultsElement.hidden = true
  for (const element of [summaryElement, stagePreviewElement, candidatesElement, eventsElement, issuesElement]) clear(element)
  fileInput.value = ''
  setStatus('Results cleared. No project or source data changed.')
}

if (!import.meta.env.DEV && !prototypeBaselineEnabled) {
  loadFixtureButton.disabled = true
  fileInput.disabled = true
  setStatus('This Grade 5 source harness is available only in local development.', true)
} else {
  loadFixtureButton.addEventListener('click', () => void loadFixture())
  clearButton.addEventListener('click', clearResults)
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    if (!file) return
    void file.text()
      .then((text) => renderPayload(normalizePayload(JSON.parse(text)), file.name))
      .catch((error) => setStatus(error instanceof Error ? error.message : 'The selected JSON file could not be read.', true))
  })
  void loadFixture()
}
