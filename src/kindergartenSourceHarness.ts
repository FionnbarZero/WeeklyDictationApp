import type { SheetsWorkbookPayload } from './curriculum/model.ts'
import { inspectKindergartenWorkbook, kindergartenSheetsDryRunSummary } from './kindergartenSheetsImporter.ts'

const fixtureUrl = new URL('../tests/fixtures/kindergarten-workbook.json', import.meta.url).href
const prototypeBaselineEnabled = import.meta.env.VITE_PROTOTYPE_BASELINE === 'true'

function requiredElement<T extends HTMLElement>(id: string) {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Missing Kindergarten source harness element: ${id}`)
  return element as T
}

const loadFixtureButton = requiredElement<HTMLButtonElement>('load-fixture')
const clearButton = requiredElement<HTMLButtonElement>('clear-results')
const fileInput = requiredElement<HTMLInputElement>('json-file')
const statusElement = requiredElement<HTMLParagraphElement>('status')
const resultsElement = requiredElement<HTMLElement>('results')
const summaryElement = requiredElement<HTMLElement>('summary')
const candidatesElement = requiredElement<HTMLElement>('candidates')

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const result = document.createElement(tag)
  if (className) result.className = className
  if (text !== undefined) result.textContent = text
  return result
}

function clear(elementToClear: HTMLElement) {
  elementToClear.replaceChildren()
}

function setStatus(message: string, error = false) {
  statusElement.textContent = message
  statusElement.classList.toggle('error', error)
}

function normalizedWorkbook(value: unknown): Omit<SheetsWorkbookPayload, 'sourceType'> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The selected file must contain one JSON workbook object.')
  const record = value as Record<string, unknown>
  if (record.sheets !== undefined && !Array.isArray(record.sheets)) throw new Error('The workbook sheets field must be an array.')
  return {
    ...(typeof record.spreadsheetId === 'string' ? { spreadsheetId: record.spreadsheetId } : {}),
    ...(Array.isArray(record.sheets) ? { sheets: record.sheets as SheetsWorkbookPayload['sheets'] } : {}),
  }
}

function renderTier(card: HTMLElement, label: string, values: string[]) {
  const section = element('div', 'tier')
  section.append(element('strong', undefined, `${label} · ${values.length}`))
  const terms = element('div', 'terms')
  if (values.length === 0) terms.append(element('span', 'empty', 'None observed'))
  for (const value of values) terms.append(element('span', 'term', value))
  section.append(terms)
  card.append(section)
}

function renderWorkbook(workbook: Omit<SheetsWorkbookPayload, 'sourceType'>, sourceLabel: string) {
  const candidates = inspectKindergartenWorkbook(workbook)
  const summary = kindergartenSheetsDryRunSummary(candidates)
  clear(summaryElement)
  clear(candidatesElement)
  for (const item of [
    { label: 'Source tabs', value: summary.sourceUnitCount },
    { label: 'Tabs with vocabulary', value: summary.vocabularyUnitCount },
    { label: 'Production-ready', value: candidates.filter((candidate) => candidate.status === 'valid').length },
    { label: 'Blocked', value: candidates.filter((candidate) => candidate.status === 'malformed').length },
  ]) {
    const card = element('div', 'summary-card')
    card.append(element('strong', undefined, String(item.value)), element('span', undefined, item.label))
    summaryElement.append(card)
  }

  for (const candidate of candidates) {
    const card = element('article', 'candidate')
    card.append(element('h3', undefined, candidate.rawDate || 'Untitled tab'))
    const badges = element('div', 'badges')
    badges.append(element('span', 'badge blocked', candidate.status), element('span', 'badge', 'production blocked'))
    card.append(badges)
    card.append(element('p', 'metadata', `Cycle: ${candidate.normalizedStartDate || 'unresolved'} through ${candidate.normalizedEndDate || 'unresolved'}`))
    card.append(element('p', 'metadata', `Source tab: ${candidate.source.sourceUnitId || 'missing ID'}`))
    renderTier(card, 'Tier 1 writing', candidate.tier1.map((term) => term.text))
    renderTier(card, 'Tier 2 reading', candidate.tier2.map((term) => term.text))
    renderTier(card, 'Tier 3', candidate.tier3.map((term) => term.text))
    const blockers = element('ul', 'blockers')
    for (const outcome of candidate.validationOutcomes.filter((outcome) => outcome.severity === 'error')) {
      blockers.append(element('li', undefined, outcome.code))
    }
    card.append(blockers)
    candidatesElement.append(card)
  }
  resultsElement.hidden = false
  setStatus(`Loaded ${sourceLabel}. Nothing was written or activated.`)
}

async function loadFixture() {
  loadFixtureButton.disabled = true
  setStatus('Loading the trusted local fixture…')
  try {
    const response = await fetch(fixtureUrl, { cache: 'no-store' })
    if (!response.ok) throw new Error(`Fixture request failed with HTTP ${response.status}.`)
    renderWorkbook(normalizedWorkbook(await response.json()), 'trusted Kindergarten fixture')
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'The fixture could not be loaded.', true)
  } finally {
    loadFixtureButton.disabled = false
  }
}

if (!import.meta.env.DEV && !prototypeBaselineEnabled) {
  loadFixtureButton.disabled = true
  fileInput.disabled = true
  setStatus('This Kindergarten source harness is available only in local development.', true)
} else {
  loadFixtureButton.addEventListener('click', () => void loadFixture())
  clearButton.addEventListener('click', () => {
    resultsElement.hidden = true
    clear(summaryElement)
    clear(candidatesElement)
    fileInput.value = ''
    setStatus('Results cleared. No project or source data changed.')
  })
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    if (!file) return
    void file.text()
      .then((text) => renderWorkbook(normalizedWorkbook(JSON.parse(text)), file.name))
      .catch((error) => setStatus(error instanceof Error ? error.message : 'The selected JSON file could not be read.', true))
  })
  void loadFixture()
}
