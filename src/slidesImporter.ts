import { DEFAULT_GRADE, DEFAULT_SCHOOL_YEAR, ACTIVE_DECK_ID } from './config.ts'
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

export const grade5DeckProfile: ParserProfile = {
  id: 'grade-5-2026-27-weekly-focus', grade: DEFAULT_GRADE, schoolYear: DEFAULT_SCHOOL_YEAR, sourceDeckId: ACTIVE_DECK_ID,
  weeklyHeading: /\bweek\s+\d+\s*\(\s*(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[-–]\s*(?:(\d{1,2})\s*[/.-]\s*)?(\d{1,2})\s*\)/i,
  tier1Heading: /tier\s*1\s*[:：]/i,
  tierStops: [/tier\s*2\s*[:：]/i, /tier\s*3\s*[:：]/i, /coming\s+next\s+week/i, /core\s+vocab/i, /\bELA\b/i, /\bMath\b/i, /\bScience\b/i],
  termSeparators: /[、,，;；\n]+/,
  workshopMarkers: [/writing\s+project/i, /writers['’]?\s*workshop/i, /biography/i, /sample\s+writing/i, /no\s+dictation/i, /homework\s+instructions/i],
}

export type SlideLike = { objectId?: string; pageObjectId?: string; pageElements?: unknown[]; text?: string; speakerNotes?: string }
export type PresentationLike = { presentationId?: string; slides?: SlideLike[] }
export type ImportOutcome = { status: 'imported' | 'duplicate' | 'writing-workshop' | 'error'; dataset?: Dataset; message: string; sourceSlideId?: string; datasetId?: string }

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

function schoolYearStart(year: string) { const match = year.match(/(20\d{2})/); return Number(match?.[1] || 2026) }
function isoDate(year: string, month: number, day: number) { const actualYear = month >= 8 ? schoolYearStart(year) : schoolYearStart(year) + 1; return `${actualYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` }

export function dateRangeFromText(text: string, profile = grade5DeckProfile) {
  const match = text.match(profile.weeklyHeading); if (!match) return null
  const startMonth = Number(match[1]); const startDay = Number(match[2]); const endMonth = Number(match[3] || match[1]); const endDay = Number(match[4])
  const startDate = isoDate(profile.schoolYear, startMonth, startDay); const endDate = isoDate(profile.schoolYear, endMonth, endDay)
  return { startDate, endDate, dateRange: `${startMonth}/${startDay}–${endMonth}/${endDay}` }
}

function mandarinText(text: string) { const match = text.match(/Mandarin[\s\S]*?(?=\bELA\b|\bMath\b|\bScience\b|Social Study|$)/i); return match?.[0] || text }
export function extractTier1(text: string, profile = grade5DeckProfile) {
  const mandarin = mandarinText(text); const heading = mandarin.match(profile.tier1Heading); if (!heading || heading.index === undefined) return []
  let values = mandarin.slice(heading.index + heading[0].length)
  const stops = profile.tierStops.map((stop) => stop.exec(values)?.index).filter((index): index is number => index !== undefined).sort((a, b) => a - b)
  if (stops.length) values = values.slice(0, stops[0])
  return values.split(profile.termSeparators).map((value) => value.replace(/[“”".。:：]/g, '').trim()).filter(Boolean)
}

export function classifyWritingWorkshop(text: string, profile = grade5DeckProfile) {
  const marker = profile.workshopMarkers.find((candidate) => candidate.test(text));
  return marker ? { isWritingWorkshop: true, marker: marker.source } : { isWritingWorkshop: false }
}

function contextFor(text: string) { const mandarin = mandarinText(text); return mandarin.replace(/Tier\s*1\s*[:：][\s\S]*$/i, '').replace(/This\s+week\s*/i, '').replace(/\s+/g, ' ').trim() }
export function datasetIdFor(profile: ParserProfile, range: { startDate: string; endDate: string }) { return `${profile.grade.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${profile.schoolYear.replace(/[^0-9]+/g, '-')}-${range.startDate}-${range.endDate}` }

export function parseSlide(slide: SlideLike, profile = grade5DeckProfile): ImportOutcome {
  const text = slideText(slide); const sourceSlideId = slide.objectId || slide.pageObjectId
  const range = dateRangeFromText(text, profile); if (!range) return { status: 'error', message: 'The slide has no recognizable Week/date-range heading.', sourceSlideId }
  const workshop = classifyWritingWorkshop(text, profile); if (workshop.isWritingWorkshop) { const datasetId = datasetIdFor(profile, range); return { status: 'writing-workshop', message: `Writing-workshop marker detected: ${workshop.marker}.`, sourceSlideId, datasetId, dataset: { id: datasetId, dateRange: range.dateRange, startDate: range.startDate, endDate: range.endDate, grade: profile.grade, schoolYear: profile.schoolYear, description: `Writing workshop from ${range.dateRange}`, sourceDeckId: profile.sourceDeckId, sourceSlideId, importStatus: 'writing-workshop', isWritingWorkshop: true, importedAt: new Date().toISOString(), words: [] } } }
  const terms = extractTier1(text, profile); if (!terms.length) return { status: 'error', message: 'The slide has a weekly heading but no confident Tier 1 vocabulary section.', sourceSlideId }
  const datasetId = datasetIdFor(profile, range); const context = contextFor(text); const words: Word[] = terms.map((term, index) => ({ id: `${datasetId}-${index + 1}`, text: term, sentence: context, datasetId }))
  return { status: 'imported', message: `Extracted ${words.length} Tier 1 target${words.length === 1 ? '' : 's'}.`, sourceSlideId, datasetId, dataset: { id: datasetId, dateRange: range.dateRange, startDate: range.startDate, endDate: range.endDate, grade: profile.grade, schoolYear: profile.schoolYear, description: `Tier 1 words from ${range.dateRange}`, sourceDeckId: profile.sourceDeckId, sourceSlideId, importStatus: 'valid', importedAt: new Date().toISOString(), words } }
}

export function importLatestWeeklyDataset(presentation: PresentationLike, existingDatasetIds: string[] = [], profile = grade5DeckProfile): ImportOutcome {
  const slides = (presentation.slides || []).map((slide) => ({ slide, range: dateRangeFromText(slideText(slide), profile) })).filter((item): item is { slide: SlideLike; range: NonNullable<ReturnType<typeof dateRangeFromText>> } => Boolean(item.range)).sort((a, b) => b.range.startDate.localeCompare(a.range.startDate))
  if (!slides.length) return { status: 'error', message: 'No weekly slides with a complete date range were found.' }
  const outcome = parseSlide(slides[0].slide, profile); if (outcome.status !== 'imported' && outcome.status !== 'writing-workshop') return outcome
  if (existingDatasetIds.includes(outcome.datasetId!)) return { ...outcome, status: 'duplicate', message: 'The stable dataset ID already exists; no duplicate import was created.' }
  return outcome
}

export const observedGrade5DeckSlides = [
  { slideNumber: 1, pageId: 'g3fb43a5e916_1_1', week: 'Week 6 (9/14-18)', tier1: ['怎样', '吸收', '通过', '像', '如果'] },
  { slideNumber: 2, pageId: 'g3fbb7d5bcd5_0_0', week: 'Week 5 (9/8-11)', tier1: ['怎样', '吸收', '通过', '像', '如果'] },
  { slideNumber: 3, pageId: 'g3fb43066ba2_0_0', week: 'Week 4 (8/31-9/4)', tier1: ['需要', '部分', '重要', '开始', '各种各样'] },
  { slideNumber: 4, pageId: 'g3facdc62d75_0_0', week: 'Week 3 (8/24-28)', tier1: ['问', '课', '猫', '经常', '说', '同学', '兔子', '蛇', '害怕', '照顾', '打扫'] },
  { slideNumber: 5, pageId: 'g3f8b04c699e_0_0', week: 'Week 2', tier1: [], note: 'No Mandarin Tier 1 list observed; ambiguous/incomplete.' },
  { slideNumber: 6, pageId: 'g3f728729da8_0_0', week: 'Week 1', tier1: [], note: 'Mandarin placeholders only; ambiguous/incomplete.' },
]
