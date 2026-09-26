import { canonicalizeWeeklyDatasetCandidate } from '../canonical.ts'
import type { SlidesPresentationPayload, SourceAdapter, WeeklyDatasetCandidate } from '../model.ts'

export type SlidesParserProfile = {
  id: string
  version: number
  sourceAdapterId: string
  grade: string
  schoolYear: string
  sourceDeckId: string
  weeklyHeading: RegExp
  tier1Heading: RegExp
  tierStops: RegExp[]
  termSeparators: RegExp
  workshopMarkers: RegExp[]
}

export type SlideLike = SlidesPresentationPayload['slides'] extends Array<infer Slide> | undefined ? Slide : never
export type PresentationLike = Omit<SlidesPresentationPayload, 'sourceType'>

function collectText(value: unknown): string[] {
  if (!value || typeof value !== 'object') return []
  if (Array.isArray(value)) return value.flatMap(collectText)
  const record = value as Record<string, unknown>
  const parts: string[] = []
  if (typeof record.text === 'string') parts.push(record.text)
  if (typeof record.content === 'string') parts.push(record.content)
  for (const [key, child] of Object.entries(record)) {
    if (!((key === 'text' || key === 'content') && typeof child === 'string')) parts.push(...collectText(child))
  }
  return parts
}

export function slideText(slide: SlideLike) {
  return [slide.text || '', ...collectText(slide.pageElements), slide.speakerNotes || ''].filter(Boolean).join('\n').replace(/\u000b/g, '\n')
}

function schoolYearStart(year: string) {
  const match = year.match(/20\d{2}/)
  return Number(match?.[0] || 2026)
}

function isoDate(year: string, month: number, day: number) {
  const actualYear = month >= 8 ? schoolYearStart(year) : schoolYearStart(year) + 1
  const candidate = new Date(Date.UTC(actualYear, month - 1, day))
  if (candidate.getUTCFullYear() !== actualYear || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) return null
  return `${actualYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function dateRangeFromText(text: string, profile: SlidesParserProfile) {
  const match = text.match(profile.weeklyHeading)
  if (!match) return null
  const startMonth = Number(match[1])
  const startDay = Number(match[2])
  const endMonth = Number(match[3] || match[1])
  const endDay = Number(match[4])
  const startDate = isoDate(profile.schoolYear, startMonth, startDay)
  const endDate = isoDate(profile.schoolYear, endMonth, endDay)
  if (!startDate || !endDate || endDate < startDate) return null
  const startWeekday = new Date(`${startDate}T00:00:00Z`).getUTCDay()
  const endWeekday = new Date(`${endDate}T00:00:00Z`).getUTCDay()
  const spanDays = (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000
  if (startWeekday === 0 || startWeekday === 6 || endWeekday === 0 || endWeekday === 6 || spanDays > 7) return null
  return { startDate, endDate, dateRange: `${startMonth}/${startDay}–${endMonth}/${endDay}` }
}

function mandarinText(text: string) {
  const match = text.match(/Mandarin[\s\S]*?(?=\bELA\b|\bMath\b|\bScience\b|\bSocial\s+Studies?\b|$)/i)
  return match?.[0] || text
}

function cleanVocabularyValues(values: string, profile: SlidesParserProfile) {
  return values.split(profile.termSeparators)
    .map((value) => value.replace(/[“”".。:：]/g, '').replace(/\s+/g, '').trim())
    .filter(Boolean)
}

export function extractTier1(text: string, profile: SlidesParserProfile) {
  const mandarin = mandarinText(text)
  const heading = mandarin.match(profile.tier1Heading)
  if (!heading || heading.index === undefined) return []
  let values = mandarin.slice(heading.index + heading[0].length)
  const stops = profile.tierStops
    .map((stop) => stop.exec(values)?.index)
    .filter((index): index is number => index !== undefined)
    .sort((a, b) => a - b)
  if (stops.length) values = values.slice(0, stops[0])
  return cleanVocabularyValues(values, profile)
}

function extractTier(text: string, tier: 1 | 2 | 3, profile: SlidesParserProfile) {
  if (tier === 1) return extractTier1(text, profile)
  const mandarin = mandarinText(text)
  const heading = mandarin.match(new RegExp(`tier\\s*${tier}\\s*[:：]`, 'i'))
  if (!heading || heading.index === undefined) return []
  let values = mandarin.slice(heading.index + heading[0].length)
  const stops = [
    /tier\s*1\s*[:：]/i,
    /tier\s*2\s*[:：]/i,
    /tier\s*3\s*[:：]/i,
    ...profile.tierStops.filter((stop) => !/^tier\\s\*/i.test(stop.source)),
  ].map((stop) => stop.exec(values)?.index)
    .filter((index): index is number => index !== undefined)
    .sort((a, b) => a - b)
  if (stops.length) values = values.slice(0, stops[0])
  return cleanVocabularyValues(values, profile)
}

export function classifyWritingWorkshop(text: string, profile: SlidesParserProfile) {
  const marker = profile.workshopMarkers.find((candidate) => candidate.test(text))
  return marker ? { isWritingWorkshop: true, marker: marker.source } : { isWritingWorkshop: false }
}

export function candidateFromSlide(
  slide: SlideLike,
  profile: SlidesParserProfile,
  sourceDocumentId = profile.sourceDeckId,
): WeeklyDatasetCandidate {
  const text = slideText(slide)
  const sourceUnitId = slide.objectId || slide.pageObjectId || ''
  const range = dateRangeFromText(text, profile)
  const workshop = classifyWritingWorkshop(text, profile)
  const rawDate = text.match(profile.weeklyHeading)?.[0] || null
  const validationOutcomes = sourceDocumentId && sourceDocumentId !== profile.sourceDeckId
    ? [{ code: 'source_identity_mismatch', severity: 'error' as const, message: `The source identity does not match the configured ${profile.grade} source.` }]
    : []
  return canonicalizeWeeklyDatasetCandidate({
    grade: profile.grade,
    schoolYear: profile.schoolYear,
    rawDate,
    dateRangeLabel: range?.dateRange || null,
    normalizedStartDate: range?.startDate || null,
    normalizedEndDate: range?.endDate || null,
    assignedWeek: range ? { startDate: range.startDate, endDate: range.endDate } : null,
    source: { sourceType: 'google-slides', sourceDocumentId, sourceUnitId, adapterId: profile.sourceAdapterId },
    sourceSectionLabel: /Mandarin/i.test(text) ? 'Mandarin' : null,
    instructionalRole: 'weekly-acquisition',
    tier1: workshop.isWritingWorkshop ? [] : extractTier(text, 1, profile),
    tier2: workshop.isWritingWorkshop ? [] : extractTier(text, 2, profile),
    tier3: workshop.isWritingWorkshop ? [] : extractTier(text, 3, profile),
    requestedStatus: workshop.isWritingWorkshop ? 'no-instruction' : 'valid',
    validationOutcomes,
    ...(workshop.isWritingWorkshop ? { noInstructionReason: `writing-workshop:${workshop.marker}` } : {}),
  })
}

export function candidatesFromPresentation(presentation: PresentationLike, profile: SlidesParserProfile) {
  return (presentation.slides || []).map((slide) => candidateFromSlide(slide, profile, presentation.presentationId || ''))
}

export function slidesSourceAdapterFor(profile: SlidesParserProfile): SourceAdapter<SlidesPresentationPayload> {
  return {
    id: profile.sourceAdapterId,
    version: profile.version,
    sourceType: 'google-slides',
    grade: profile.grade,
    schoolYear: profile.schoolYear,
    adapt(payload) {
      return candidatesFromPresentation(payload, profile)
    },
  }
}
