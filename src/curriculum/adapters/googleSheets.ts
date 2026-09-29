import { canonicalizeWeeklyDatasetCandidate } from '../canonical.ts'
import type { SheetSourceUnit, SheetsWorkbookPayload, SourceAdapter, ValidationOutcome, WeeklyDatasetCandidate } from '../model.ts'

export type SheetsParserProfile = {
  id: string
  version: number
  sourceAdapterId: string
  grade: string
  schoolYear: string
  sourceWorkbookId: string
  weekTabHeading: RegExp
  academicYearStartMonth: number
  writingCharacterHeading: RegExp
  highFrequencyWordHeading: RegExp
  termSeparators: RegExp
}

export type MondaySundayCycle = {
  sourceDate: string
  startDate: string
  endDate: string
}

function stableMatch(pattern: RegExp, value: string) {
  return new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, '')).exec(value)
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function schoolYearYears(schoolYear: string) {
  const match = schoolYear.match(/^(\d{4})\D+(\d{4})$/)
  if (!match) return null
  const startYear = Number(match[1])
  const endYear = Number(match[2])
  return endYear === startYear + 1 ? { startYear, endYear } : null
}

export function mondaySundayCycleFromTabTitle(title: string, profile: SheetsParserProfile): MondaySundayCycle | null {
  const match = stableMatch(profile.weekTabHeading, title.trim())
  const years = schoolYearYears(profile.schoolYear)
  if (!match || !years) return null
  const month = Number(match[1])
  const day = Number(match[2])
  if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1 || day > 31) return null
  const year = month >= profile.academicYearStartMonth ? years.startYear : years.endYear
  const sourceDate = new Date(Date.UTC(year, month - 1, day))
  if (sourceDate.getUTCFullYear() !== year || sourceDate.getUTCMonth() !== month - 1 || sourceDate.getUTCDate() !== day) return null

  const mondayOffset = (sourceDate.getUTCDay() + 6) % 7
  const monday = new Date(sourceDate)
  monday.setUTCDate(monday.getUTCDate() - mondayOffset)
  const sunday = new Date(monday)
  sunday.setUTCDate(sunday.getUTCDate() + 6)
  return { sourceDate: isoDate(sourceDate), startDate: isoDate(monday), endDate: isoDate(sunday) }
}

function sheetText(sheet: SheetSourceUnit) {
  return (sheet.values || [])
    .flatMap((row) => row.map((value) => value === null || value === undefined ? '' : String(value)))
    .filter(Boolean)
    .join('\n')
}

function mandarinSectionText(sheet: SheetSourceUnit) {
  const rows = sheet.values || []
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const columnIndex = rows[rowIndex].findIndex((value) => /^Mandarin\s*$/i.test(String(value ?? '').trim()))
    if (columnIndex < 0) continue
    for (let contentRowIndex = rowIndex + 1; contentRowIndex < rows.length; contentRowIndex += 1) {
      const value = String(rows[contentRowIndex][columnIndex] ?? '').trim()
      if (value) return `Mandarin\n${value}`
    }
  }
  return sheetText(sheet)
}

function cleanTerms(value: string, profile: SheetsParserProfile) {
  return value
    .split(profile.termSeparators)
    .map((term) => term.replace(/^[\s:：\-–—•]+|[\s。.;；]+$/g, '').replace(/\s+/g, '').trim())
    .filter(Boolean)
}

function extractLabeledTerms(text: string, heading: RegExp, profile: SheetsParserProfile) {
  const match = stableMatch(heading, text)
  if (!match || match.index === undefined) return []
  const remainder = text.slice(match.index + match[0].length)
  const firstLine = remainder.split(/\r?\n/, 1)[0] || ''
  return cleanTerms(firstLine, profile)
}

function activationBlockers(
  title: string,
  cycle: MondaySundayCycle | null,
  tier1Count: number,
  tier2Count: number,
  sourceDocumentId: string,
  profile: SheetsParserProfile,
): ValidationOutcome[] {
  const outcomes: ValidationOutcome[] = []
  if (sourceDocumentId && sourceDocumentId !== profile.sourceWorkbookId) {
    outcomes.push({
      code: 'source_identity_mismatch',
      severity: 'error',
      message: `The source identity does not match the configured ${profile.grade} workbook.`,
    })
  }
  if (!cycle) {
    outcomes.push({
      code: 'invalid_kindergarten_tab_date',
      severity: 'error',
      message: 'The sheet title does not contain a real date in the observed Kindergarten weekly-tab convention.',
    })
  }
  if (tier1Count === 0 && tier2Count === 0) {
    outcomes.push({
      code: 'kindergarten_no_instruction_unresolved',
      severity: 'error',
      message: 'This tab has no observed Kindergarten vocabulary and no approved no-instruction marker.',
    })
  }
  if (!title) {
    outcomes.push({ code: 'missing_sheet_title', severity: 'error', message: 'The source sheet has no title.' })
  }
  return outcomes
}

export function candidateFromSheet(
  sheet: SheetSourceUnit,
  profile: SheetsParserProfile,
  sourceDocumentId = profile.sourceWorkbookId,
): WeeklyDatasetCandidate {
  const title = sheet.title?.trim() || ''
  const cycle = mondaySundayCycleFromTabTitle(title, profile)
  const text = mandarinSectionText(sheet)
  const tier1 = extractLabeledTerms(text, profile.writingCharacterHeading, profile)
  const tier2 = extractLabeledTerms(text, profile.highFrequencyWordHeading, profile)
  const assignedWeek = cycle ? { startDate: cycle.startDate, endDate: cycle.endDate } : null

  return canonicalizeWeeklyDatasetCandidate({
    grade: profile.grade,
    schoolYear: profile.schoolYear,
    rawDate: title || null,
    dateRangeLabel: cycle ? `${cycle.startDate}–${cycle.endDate}` : null,
    normalizedStartDate: cycle?.startDate || null,
    normalizedEndDate: cycle?.endDate || null,
    assignedWeek,
    source: {
      sourceType: 'google-sheets',
      sourceDocumentId,
      sourceUnitId: sheet.sheetId === undefined ? '' : String(sheet.sheetId),
      adapterId: profile.sourceAdapterId,
    },
    sourceSectionLabel: /Mandarin/i.test(text) ? 'Mandarin' : null,
    instructionalRole: 'unassigned',
    tier1,
    tier2,
    tier3: [],
    requestedStatus: 'valid',
    validationOutcomes: activationBlockers(title, cycle, tier1.length, tier2.length, sourceDocumentId, profile),
  })
}

export function candidatesFromWorkbook(
  workbook: Omit<SheetsWorkbookPayload, 'sourceType'>,
  profile: SheetsParserProfile,
) {
  return (workbook.sheets || []).map((sheet) => candidateFromSheet(sheet, profile, workbook.spreadsheetId || ''))
}

export function sheetsSourceAdapterFor(profile: SheetsParserProfile): SourceAdapter<SheetsWorkbookPayload> {
  return {
    id: profile.sourceAdapterId,
    version: profile.version,
    sourceType: 'google-sheets',
    grade: profile.grade,
    schoolYear: profile.schoolYear,
    adapt(payload) {
      return candidatesFromWorkbook(payload, profile)
    },
  }
}
