import { extractGrade5Presentation } from './curriculum/adapters/grade5GoogleSlides.ts'
import type { SlidesPresentationPayload } from './curriculum/model.ts'
import {
  buildGrade5LearningHub,
  type Grade5ActivityLaunchRequest,
  type Grade5HubActivity,
  type Grade5HubSection,
} from './grade5Lab/learningHub.ts'

const fixtureUrl = '/tests/fixtures/grade5-presentation.json'

function requiredElement<T extends HTMLElement>(id: string) {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Missing Grade 5 learning-hub element: ${id}`)
  return element as T
}

const statusElement = requiredElement<HTMLParagraphElement>('hub-status')
const sectionsElement = requiredElement<HTMLElement>('hub-sections')
const requestPanel = requiredElement<HTMLElement>('request-panel')
const requestTitle = requiredElement<HTMLHeadingElement>('request-title')
const requestMessage = requiredElement<HTMLParagraphElement>('request-message')
const requestOutput = requiredElement<HTMLElement>('request-output')
const dismissButton = requiredElement<HTMLButtonElement>('dismiss-request')

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

function showLaunchRequest(label: string, requests: Grade5ActivityLaunchRequest[]) {
  requestTitle.textContent = label
  requestMessage.textContent = requests.length > 1
    ? 'This re-teaching activity will keep writing and reading in separate queues. Neither queue is connected yet.'
    : 'This activity is not connected yet. The portable request below is ready for the future shared practice engine.'
  requestOutput.textContent = JSON.stringify(requests.length === 1 ? requests[0] : requests, null, 2)
  requestPanel.hidden = false
  requestPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

function activityElement(activity: Grade5HubActivity) {
  const card = createElement('article', `activity activity-${activity.availability}`)
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
    } else {
      button.addEventListener('click', () => showLaunchRequest(activity.label, activity.launchRequests))
      card.append(createElement('small', 'availability-note', 'Learning engine not connected yet.'))
    }
    card.append(button)
  }
  return card
}

function sectionElement(section: Grade5HubSection) {
  const sectionElement = createElement('section', `hub-section section-${section.id}`)
  if (!section.available) sectionElement.classList.add('section-unavailable')
  const heading = createElement('div', 'section-heading')
  const text = createElement('div')
  text.append(createElement('p', 'section-kicker', section.stage.replace(/-/g, ' ')))
  text.append(createElement('h2', undefined, section.title), createElement('p', undefined, section.subtitle))
  heading.append(text, createElement('span', `stage-badge ${section.available ? 'available' : 'unavailable'}`, section.available ? 'Available' : 'Waiting'))
  sectionElement.append(heading, cohortElement(section))
  const activityGrid = createElement('div', 'activity-grid')
  for (const activity of section.activities) activityGrid.append(activityElement(activity))
  sectionElement.append(activityGrid)
  return sectionElement
}

async function loadHub() {
  setStatus('Loading the trusted Grade 5 fixture…')
  try {
    const response = await fetch(fixtureUrl, { cache: 'no-store' })
    if (!response.ok) throw new Error(`Fixture request failed with HTTP ${response.status}.`)
    const extraction = extractGrade5Presentation(normalizePayload(await response.json()))
    const model = buildGrade5LearningHub(extraction)
    sectionsElement.replaceChildren(...model.sections.map(sectionElement))
    setStatus('Loaded the validated Grade 5 source fixture. Practice engines, persistence, and cloud services remain disconnected.')
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'The Grade 5 hub could not be loaded.', true)
  }
}

dismissButton.addEventListener('click', () => {
  requestPanel.hidden = true
  requestOutput.textContent = ''
})

if (!import.meta.env.DEV) {
  setStatus('This Grade 5 learning hub is available only in local development.', true)
} else {
  void loadHub()
}
