import { DEFAULT_GRADE, DEFAULT_SCHOOL_YEAR, GRADE2_DECK_ID, GRADE5_DECK_ID, schoolYearToken } from './config.ts'
import type { Dataset, Word } from './domain.ts'

export type ParserProfile = {
  id: string
  grade: string
  schoolYear: string
  sourceDeckId: string
  weeklyHeading: RegExp
  tier1Heading: RegExp
  tierStops: RegExp[]
  termSeparators: RegExp
  workshopMarkers: RegExp[]
}

const weeklyHeading = /\bweek(?:\s+\d+(?=\s*\())?\s*(?:\(\s*)?(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[-–]\s*(?:(\d{1,2})\s*[/.\-]\s*)?(\d{1,2})(?:\s*\))?/i
const tierStops = [/tier\s*2\s*[:：]/i, /tier\s*3\s*[:：]/i, /coming\s+next\s+week/i, /core\s+vocab/i, /\bELA\b/i, /\bMath\b/i, /\bScience\b/i, /\bSocial\s+Studies?\b/i]
const termSeparators = /[、,，;；\n]+/
const workshopMarkers = [/writing\s+project/i, /writing\s+workshop/i, /writers['’]?\s*workshop/i, /biography/i, /sample\s+writing/i, /no\s+(?:new\s+)?tier\s*1/i, /no\s+dictation/i, /homework\s+instructions/i, /mastery\s+warm\s*up/i]

export const grade2DeckProfile: ParserProfile = {
  id: 'grade-2-2026-27-weekly-focus', grade: DEFAULT_GRADE, schoolYear: DEFAULT_SCHOOL_YEAR, sourceDeckId: GRADE2_DECK_ID,
  weeklyHeading, tier1Heading: /tier\s*1\s*[:：]/i, tierStops, termSeparators, workshopMarkers,
}

export const grade5DeckProfile: ParserProfile = {
  id: 'grade-5-2026-27-weekly-focus', grade: 'Grade 5', schoolYear: DEFAULT_SCHOOL_YEAR, sourceDeckId: GRADE5_DECK_ID,
  weeklyHeading, tier1Heading: /tier\s*1\s*[:：]/i, tierStops, termSeparators, workshopMarkers,
}

export type SlideLike = { objectId?: string; pageObjectId?: string; pageElements?: unknown[]; text?: string; speakerNotes?: string }
export type PresentationLike = { presentationId?: string; slides?: SlideLike[] }
export type ImportOutcome = { status: 'imported' | 'duplicate' | 'writing-workshop' | 'error'; dataset?: Dataset; message: string; sourceSlideId?: string; datasetId?: string }
export type ImportBatchOutcome = {
  status: 'ok' | 'error'
  outcomes: ImportOutcome[]
  datasets: Dataset[]
  summary: { datasetCount: number; slideIds: string[]; dateRanges: string[]; wordCounts: number[] }
  message: string
}

function collectText(value: unknown): string[] {
  if (!value || typeof value !== 'object') return []
  if (Array.isArray(value)) return value.flatMap(collectText)
  const record = value as Record<string, unknown>
  const parts: string[] = []
  if (typeof record.text === 'string') parts.push(record.text)
  if (typeof record.content === 'string') parts.push(record.content)
  for (const [key, child] of Object.entries(record)) if (!((key === 'text' || key === 'content') && typeof child === 'string')) parts.push(...collectText(child))
  return parts
}

export function slideText(slide: SlideLike) { return [slide.text || '', ...collectText(slide.pageElements), slide.speakerNotes || ''].filter(Boolean).join('\n').replace(/\u000b/g, '\n') }

function schoolYearStart(year: string) { const match = year.match(/20\d{2}/); return Number(match?.[0] || 2026) }

function isoDate(year: string, month: number, day: number) {
  const actualYear = month >= 8 ? schoolYearStart(year) : schoolYearStart(year) + 1
  const candidate = new Date(Date.UTC(actualYear, month - 1, day))
  if (candidate.getUTCFullYear() !== actualYear || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) return null
  return `${actualYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function dateRangeFromText(text: string, profile = grade2DeckProfile) {
  const match = text.match(profile.weeklyHeading); if (!match) return null
  const startMonth = Number(match[1]); const startDay = Number(match[2]); const endMonth = Number(match[3] || match[1]); const endDay = Number(match[4])
  const startDate = isoDate(profile.schoolYear, startMonth, startDay); const endDate = isoDate(profile.schoolYear, endMonth, endDay)
  if (!startDate || !endDate || endDate < startDate) return null
  return { startDate, endDate, dateRange: `${startMonth}/${startDay}–${endMonth}/${endDay}` }
}

function mandarinText(text: string) { const match = text.match(/Mandarin[\s\S]*?(?=\bELA\b|\bMath\b|\bScience\b|\bSocial\s+Studies?\b|$)/i); return match?.[0] || text }

export function extractTier1(text: string, profile = grade2DeckProfile) {
  const mandarin = mandarinText(text); const heading = mandarin.match(profile.tier1Heading); if (!heading || heading.index === undefined) return []
  let values = mandarin.slice(heading.index + heading[0].length)
  const stops = profile.tierStops.map((stop) => stop.exec(values)?.index).filter((index): index is number => index !== undefined).sort((a, b) => a - b)
  if (stops.length) values = values.slice(0, stops[0])
  return values.split(profile.termSeparators).map((value) => value.replace(/[“”".。:：]/g, '').replace(/\s+/g, '').trim()).filter(Boolean)
}

export function classifyWritingWorkshop(text: string, profile = grade2DeckProfile) {
  const marker = profile.workshopMarkers.find((candidate) => candidate.test(text))
  return marker ? { isWritingWorkshop: true, marker: marker.source } : { isWritingWorkshop: false }
}

function contextFor(text: string) { const mandarin = mandarinText(text); return mandarin.replace(/Tier\s*1\s*[:：][\s\S]*$/i, '').replace(/This\s+week\s*/i, '').replace(/\s+/g, ' ').trim() }

export function datasetIdFor(profile: ParserProfile, range: { startDate: string; endDate: string }) { return `${profile.grade.toLowerCase().replace(/[^a-z0-9]+/g, '-')}__${schoolYearToken(profile.schoolYear)}__${range.startDate}__${range.endDate}` }

function datasetFor(profile: ParserProfile, range: { startDate: string; endDate: string; dateRange: string }, sourceSlideId: string | undefined, words: Word[], workshop = false): Dataset {
  const datasetId = datasetIdFor(profile, range)
  return {
    id: datasetId, dateRange: range.dateRange, startDate: range.startDate, endDate: range.endDate, grade: profile.grade, schoolYear: profile.schoolYear,
    description: workshop ? `Writing workshop from ${range.dateRange}` : `Tier 1 words from ${range.dateRange}`,
    sourceDeckId: profile.sourceDeckId, sourceSlideId, importStatus: workshop ? 'writing-workshop' : 'valid', isWritingWorkshop: workshop,
    importedAt: new Date().toISOString(), words,
  }
}

export function parseSlide(slide: SlideLike, profile = grade2DeckProfile): ImportOutcome {
  const text = slideText(slide); const sourceSlideId = slide.objectId || slide.pageObjectId
  const range = dateRangeFromText(text, profile); if (!range) return { status: 'error', message: 'The slide has no recognizable, valid Week/date-range heading.', sourceSlideId }
  const datasetId = datasetIdFor(profile, range)
  const workshop = classifyWritingWorkshop(text, profile)
  if (workshop.isWritingWorkshop) return { status: 'writing-workshop', message: `Writing-workshop marker detected: ${workshop.marker}.`, sourceSlideId, datasetId, dataset: datasetFor(profile, range, sourceSlideId, [], true) }
  const terms = extractTier1(text, profile); if (!terms.length) return { status: 'error', message: 'The slide has a weekly heading but no confident Tier 1 vocabulary section.', sourceSlideId, datasetId }
  const context = contextFor(text); const words: Word[] = terms.map((term, index) => ({ id: `${datasetId}-${index + 1}`, text: term, sentence: context, datasetId, grade: profile.grade, sourceSlideId, language: 'mandarin', tier: 'tier-1', activityType: 'dictation' }))
  return { status: 'imported', message: `Extracted ${words.length} Tier 1 target${words.length === 1 ? '' : 's'}.`, sourceSlideId, datasetId, dataset: datasetFor(profile, range, sourceSlideId, words) }
}

export function importWeeklyDatasets(presentation: PresentationLike, existingDatasetIds: string[] = [], profile = grade2DeckProfile): ImportBatchOutcome {
  if (presentation.presentationId && presentation.presentationId !== profile.sourceDeckId) {
    return { status: 'error', outcomes: [{ status: 'error', message: `The inspected presentation ID does not match the configured ${profile.grade} deck.`, sourceSlideId: presentation.presentationId }], datasets: [], summary: { datasetCount: 0, slideIds: [], dateRanges: [], wordCounts: [] }, message: 'No Firestore write may occur because the source deck identity is not validated.' }
  }
  const knownIds = new Set(existingDatasetIds); const outcomes: ImportOutcome[] = []; const datasets: Dataset[] = []
  for (const slide of presentation.slides || []) {
    const outcome = parseSlide(slide, profile); const dataset = outcome.dataset
    if (dataset && knownIds.has(dataset.id)) outcomes.push({ ...outcome, status: 'duplicate', message: 'The stable dataset ID already exists; no duplicate import was created.' })
    else {
      outcomes.push(outcome)
      if (dataset && (outcome.status === 'imported' || outcome.status === 'writing-workshop')) { datasets.push(dataset); knownIds.add(dataset.id) }
    }
  }
  datasets.sort((a, b) => a.startDate.localeCompare(b.startDate))
  const summary = { datasetCount: datasets.length, slideIds: datasets.map((dataset) => dataset.sourceSlideId || ''), dateRanges: datasets.map((dataset) => dataset.dateRange), wordCounts: datasets.map((dataset) => dataset.words.length) }
  return { status: datasets.length ? 'ok' : 'error', outcomes, datasets, summary, message: datasets.length ? `Validated ${datasets.length} weekly dataset${datasets.length === 1 ? '' : 's'}; malformed slides were skipped.` : 'No valid weekly datasets were found; nothing may be written.' }
}

export function dryRunSummary(batch: ImportBatchOutcome) {
  return { status: batch.status, message: batch.message, datasets: batch.datasets.map((dataset) => ({ id: dataset.id, slideId: dataset.sourceSlideId, dateRange: dataset.dateRange, wordCount: dataset.words.length, importStatus: dataset.importStatus })), skipped: batch.outcomes.filter((outcome) => outcome.status === 'error').map((outcome) => ({ slideId: outcome.sourceSlideId, message: outcome.message })) }
}

export function importLatestWeeklyDataset(presentation: PresentationLike, existingDatasetIds: string[] = [], profile = grade2DeckProfile): ImportOutcome {
  const batch = importWeeklyDatasets(presentation, existingDatasetIds, profile)
  const candidates = batch.outcomes.filter((outcome) => outcome.dataset && (outcome.status === 'imported' || outcome.status === 'writing-workshop' || outcome.status === 'duplicate')).sort((a, b) => (b.dataset?.startDate || '').localeCompare(a.dataset?.startDate || ''))
  return candidates[0] || { status: 'error', message: batch.message }
}

export const observedGrade2DeckSlides = [
  { slideNumber: 1, pageId: 'g40a01d2cf58_0_10', week: 'Week 9/21-9/25', tier1: ['比如', '部分', '更', '方便', '美好'] },
  { slideNumber: 2, pageId: 'g40a01d2cf58_0_0', week: 'Week 9/14-9/18', tier1: ['出生', '但是', '运动', '地方', '不同'] },
  { slideNumber: 3, pageId: 'g3fa28218657_0_10', week: 'Week 9/8-9/11', tier1: ['美国', '带', '路', '到', '都'] },
  { slideNumber: 4, pageId: 'g3fa28218657_0_0', week: 'Week 8/31-9/4', tier1: ['很短', '也', '笑', '学校', '说'] },
]

export const observedGrade5DeckSlides = [
  { slideNumber: 1, pageId: 'g3fb43a5e916_1_1', week: 'Week 6 (9/14-18)', tier1: ['怎样', '吸收', '通过', '像', '如果'] },
  { slideNumber: 2, pageId: 'g3fbb7d5bcd5_0_0', week: 'Week 5 (9/8-11)', tier1: ['怎样', '吸收', '通过', '像', '如果'] },
  { slideNumber: 3, pageId: 'g3fb43066ba2_0_0', week: 'Week 4 (8/31-9/4)', tier1: ['需要', '部分', '重要', '开始', '各种各样'] },
  { slideNumber: 4, pageId: 'g3facdc62d75_0_0', week: 'Week 3 (8/24-28)', tier1: ['问', '课', '猫', '经常', '说', '同学', '兔子', '蛇', '害怕', '照顾', '打扫'] },
]
