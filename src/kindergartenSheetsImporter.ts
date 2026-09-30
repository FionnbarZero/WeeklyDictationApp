import { DEFAULT_SCHOOL_YEAR, KINDERGARTEN_SHEETS_ID } from './config.ts'
import {
  candidatesFromWorkbook,
  sheetsSourceAdapterFor,
  type SheetsParserProfile,
} from './curriculum/adapters/googleSheets.ts'
import type { SheetsWorkbookPayload, WeeklyDatasetCandidate } from './curriculum/model.ts'

export const kindergartenSheetsProfile: SheetsParserProfile = {
  id: 'kindergarten-2026-27-weekly-focus',
  version: 1,
  sourceAdapterId: 'kindergarten-google-sheets-v1',
  grade: 'Kindergarten',
  schoolYear: DEFAULT_SCHOOL_YEAR,
  sourceWorkbookId: KINDERGARTEN_SHEETS_ID,
  weekTabHeading: /^Week\s+\d+\s+(\d{1,2})\/(\d{1,2})$/i,
  academicYearStartMonth: 8,
  writingCharacterHeading: /Writing\s+character\s*[:：]?/i,
  highFrequencyWordHeading: /High(?:\s*[-–—]\s*|\s+)frequency(?:\s+reading)?\s+words?\s*[:：]?/i,
  termSeparators: /[、,，;；]+/,
}

export const kindergartenSheetsSourceAdapter = sheetsSourceAdapterFor(kindergartenSheetsProfile)

export function inspectKindergartenWorkbook(workbook: Omit<SheetsWorkbookPayload, 'sourceType'>) {
  return candidatesFromWorkbook(workbook, kindergartenSheetsProfile)
}

export type KindergartenSheetsDryRunUnit = {
  sourceUnitId: string
  tabTitle: string | null
  normalizedStartDate: string | null
  normalizedEndDate: string | null
  tier1: string[]
  tier2: string[]
  tier3: string[]
  status: WeeklyDatasetCandidate['status']
  blockers: string[]
}

export function kindergartenSheetsDryRunSummary(candidates: WeeklyDatasetCandidate[]) {
  const units: KindergartenSheetsDryRunUnit[] = candidates.map((candidate) => ({
    sourceUnitId: candidate.source.sourceUnitId,
    tabTitle: candidate.rawDate,
    normalizedStartDate: candidate.normalizedStartDate,
    normalizedEndDate: candidate.normalizedEndDate,
    tier1: candidate.tier1.map((term) => term.text),
    tier2: candidate.tier2.map((term) => term.text),
    tier3: candidate.tier3.map((term) => term.text),
    status: candidate.status,
    blockers: candidate.validationOutcomes
      .filter((outcome) => outcome.severity === 'error')
      .map((outcome) => outcome.code),
  }))
  return {
    sourceDocumentId: kindergartenSheetsProfile.sourceWorkbookId,
    sourceType: 'google-sheets' as const,
    mode: 'read-only-dry-run' as const,
    datePolicy: 'monday-through-sunday' as const,
    activation: 'inactive-source-registry' as const,
    sourceUnitCount: units.length,
    vocabularyUnitCount: units.filter((unit) => unit.tier1.length > 0 || unit.tier2.length > 0).length,
    units,
  }
}
