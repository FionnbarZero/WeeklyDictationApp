import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { KINDERGARTEN_SHEETS_ID, SOURCE_REGISTRY } from '../src/config.ts'
import { candidateFromSheet, mondaySundayCycleFromTabTitle } from '../src/curriculum/adapters/googleSheets.ts'
import type { SheetsWorkbookPayload } from '../src/curriculum/model.ts'
import {
  inspectKindergartenWorkbook,
  kindergartenSheetsDryRunSummary,
  kindergartenSheetsProfile,
  kindergartenSheetsSourceAdapter,
} from '../src/kindergartenSheetsImporter.ts'

const fixturePath = fileURLToPath(new URL('./fixtures/kindergarten-workbook.json', import.meta.url))
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as Omit<SheetsWorkbookPayload, 'sourceType'>
const candidates = inspectKindergartenWorkbook(fixture)

test('the Kindergarten source is registered but cannot activate production practice', () => {
  const entry = SOURCE_REGISTRY.find((source) => source.grade === 'Kindergarten')
  assert.deepEqual(entry, {
    grade: 'Kindergarten',
    displayName: 'Kindergarten',
    schoolYear: '2026–2027',
    sourceType: 'google-sheets',
    sourceDocumentId: KINDERGARTEN_SHEETS_ID,
    parserProfileId: kindergartenSheetsProfile.id,
    sourceAdapterId: kindergartenSheetsProfile.sourceAdapterId,
    practiceProfileId: 'kindergarten-tier-1-writing-practice',
    active: false,
  })
  assert.equal(kindergartenSheetsSourceAdapter.sourceType, 'google-sheets')
})

test('observed weekly tabs preserve source order and source-neutral provenance', () => {
  assert.deepEqual(candidates.map((candidate) => candidate.rawDate), fixture.sheets!.map((sheet) => sheet.title))
  assert.deepEqual(candidates.map((candidate) => candidate.source.sourceUnitId), fixture.sheets!.map((sheet) => String(sheet.sheetId)))
  assert.ok(candidates.every((candidate) => candidate.source.sourceDocumentId === KINDERGARTEN_SHEETS_ID))
  assert.ok(candidates.every((candidate) => candidate.source.sourceType === 'google-sheets'))
  assert.ok(candidates.every((candidate) => !('sourceWorkbookId' in candidate)))
  assert.ok(candidates.every((candidate) => !('sourceSheetId' in candidate)))
})

test('Writing character maps to Tier 1 and High frequency word maps to Tier 2', () => {
  const expected = new Map([
    ['Week 6 09/21', { tier1: ['九', '十', '白'], tier2: ['红色', '蓝色'] }],
    ['Week 5 09/14', { tier1: ['七', '八', '水'], tier2: ['有', '没有'] }],
    ['Week 4 09/08', { tier1: ['四', '五', '六', '心'], tier2: ['我', '开心'] }],
    ['Week 3 08/31', { tier1: ['一', '二', '三', '人'], tier2: ['爸爸', '妈妈', '小'] }],
  ])

  for (const candidate of candidates) {
    const terms = expected.get(candidate.rawDate || '')
    if (!terms) continue
    assert.deepEqual(candidate.tier1.map((term) => term.text), terms.tier1)
    assert.deepEqual(candidate.tier2.map((term) => term.text), terms.tier2)
    assert.deepEqual(candidate.tier3, [])
    assert.deepEqual(candidate.tier1.map((term) => term.sourcePosition), terms.tier1.map((_, index) => index + 1))
    assert.deepEqual(candidate.tier2.map((term) => term.sourcePosition), terms.tier2.map((_, index) => index + 1))
  }
})

test('weekly tab dates normalize to the containing Monday-through-Sunday cycle', () => {
  const byTitle = new Map(candidates.map((candidate) => [candidate.rawDate, candidate]))
  assert.deepEqual(byTitle.get('Week 4 09/08')?.assignedWeek, { startDate: '2026-09-07', endDate: '2026-09-13' })
  assert.deepEqual(byTitle.get('Week 6 09/21')?.assignedWeek, { startDate: '2026-09-21', endDate: '2026-09-27' })
  assert.deepEqual(byTitle.get('Week 7 09/28')?.assignedWeek, { startDate: '2026-09-28', endDate: '2026-10-04' })
  assert.deepEqual(mondaySundayCycleFromTabTitle('Week 20 01/05', kindergartenSheetsProfile), {
    sourceDate: '2027-01-05',
    startDate: '2027-01-04',
    endDate: '2027-01-10',
  })
})

test('vocabulary candidates become canonical while empty tabs remain blocked and production stays inactive', () => {
  assert.ok(candidates.every((candidate) => candidate.datasetId !== null && candidate.assignedWeek !== null))
  assert.ok(candidates.every((candidate) => candidate.instructionalRole === 'unassigned'))
  assert.ok(candidates.every((candidate) => !candidate.validationOutcomes.some((outcome) => outcome.code === 'kindergarten_date_policy_unresolved')))

  const vocabularyUnits = candidates.filter((candidate) => candidate.tier1.length > 0 || candidate.tier2.length > 0)
  assert.ok(vocabularyUnits.every((candidate) => candidate.status === 'valid'))
  assert.ok(vocabularyUnits.every((candidate) => !candidate.validationOutcomes.some((outcome) => outcome.severity === 'error')))

  const emptyUnits = candidates.filter((candidate) => candidate.tier1.length === 0 && candidate.tier2.length === 0)
  assert.deepEqual(emptyUnits.map((candidate) => candidate.rawDate), ['Week 7 09/28', 'Week 2 08/24', 'Week 1 08/17'])
  assert.ok(emptyUnits.every((candidate) => candidate.validationOutcomes.some((outcome) => outcome.code === 'kindergarten_no_instruction_unresolved')))
  assert.ok(emptyUnits.every((candidate) => candidate.status !== 'no-instruction'))
})

test('only the Mandarin column contributes Kindergarten vocabulary', () => {
  const candidate = candidateFromSheet({
    sheetId: 43,
    title: 'Week 7 09/28',
    values: [
      ['', 'Mandarin', '', 'English'],
      ['', 'We will review classroom language.', '', 'Writing character shere\nHigh frequency word I, see'],
    ],
  }, kindergartenSheetsProfile)
  assert.deepEqual(candidate.tier1, [])
  assert.deepEqual(candidate.tier2, [])
})

test('duplicate terms remain distinct ordered source occurrences', () => {
  const candidate = candidateFromSheet({
    sheetId: 42,
    title: 'Week 8 10/05',
    values: [['Mandarin\n- Writing character 一、一、二\n- High frequency word 我、我']],
  }, kindergartenSheetsProfile)
  assert.deepEqual(candidate.tier1.map((term) => term.text), ['一', '一', '二'])
  assert.deepEqual(candidate.tier1.map((term) => term.sourcePosition), [1, 2, 3])
  assert.equal(new Set(candidate.tier1.map((term) => term.targetOccurrenceId)).size, 3)
  assert.deepEqual(candidate.tier2.map((term) => term.text), ['我', '我'])
})

test('invalid calendar dates and source identity mismatches fail closed', () => {
  const invalidDate = candidateFromSheet({
    sheetId: 41,
    title: 'Week 30 02/30',
    values: [['Mandarin\n- Writing character 一']],
  }, kindergartenSheetsProfile)
  assert.equal(invalidDate.assignedWeek, null)
  assert.ok(invalidDate.validationOutcomes.some((outcome) => outcome.code === 'invalid_kindergarten_tab_date'))

  const wrongSource = candidateFromSheet(fixture.sheets![1], kindergartenSheetsProfile, 'different-workbook')
  assert.equal(wrongSource.status, 'malformed')
  assert.ok(wrongSource.validationOutcomes.some((outcome) => outcome.code === 'source_identity_mismatch'))
})

test('the dry-run summary exposes normalized dates, vocabulary, and activation blockers', () => {
  const summary = kindergartenSheetsDryRunSummary(candidates)
  assert.equal(summary.mode, 'read-only-dry-run')
  assert.equal(summary.datePolicy, 'monday-through-sunday')
  assert.equal(summary.activation, 'inactive-source-registry')
  assert.equal(summary.sourceDocumentId, KINDERGARTEN_SHEETS_ID)
  assert.equal(summary.sourceUnitCount, 7)
  assert.equal(summary.vocabularyUnitCount, 4)
  assert.ok(summary.units.filter((unit) => unit.tier1.length > 0).every((unit) => unit.blockers.length === 0))
  assert.ok(summary.units.filter((unit) => unit.tier1.length === 0).every((unit) => unit.blockers.includes('kindergarten_no_instruction_unresolved')))
})
