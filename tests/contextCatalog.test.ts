import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyApprovedDictationContexts,
  approvedContextTextForGradeTarget,
  DICTATION_CONTEXT_CATALOG_SCHEMA_VERSION,
  dictationContextText,
  validateDictationContextCandidate,
  type DictationContextCatalog,
} from '../src/curriculum/contextCatalog.ts'
import type { Dataset } from '../src/domain/contracts.ts'

const dataset: Dataset = {
  id: 'kindergarten-week-3',
  dateRange: '08/31–09/06',
  startDate: '2026-08-31',
  endDate: '2026-09-06',
  grade: 'Kindergarten',
  schoolYear: '2026–2027',
  description: 'Authoritative Kindergarten week',
  source: {
    sourceType: 'google-sheets',
    sourceDocumentId: 'authoritative-kindergarten-sheet',
    sourceUnitId: 'Week 3 08/31',
    adapterId: 'kindergarten-sheets-v1',
  },
  words: [{
    id: 'kindergarten-week-3:tier-1:1',
    text: '一',
    sentence: '',
    datasetId: 'kindergarten-week-3',
    tier: 'tier-1',
  }],
}

function catalog(status: 'Draft' | 'Approved' | 'Revise' = 'Approved'): DictationContextCatalog {
  return {
    schemaVersion: DICTATION_CONTEXT_CATALOG_SCHEMA_VERSION,
    generatedAt: '2026-10-03T12:00:00.000Z',
    candidates: [{
      id: 'kindergarten-week-3-tier-1-1-context-v1',
      grade: 'Kindergarten',
      schoolYear: '2026–2027',
      sourceDocumentId: 'authoritative-kindergarten-sheet',
      sourceUnitId: 'Week 3 08/31',
      tier: 'tier-1',
      targetOccurrenceId: 'kindergarten-week-3:tier-1:1',
      targetText: '一',
      contextTokens: ['我', '有', '一', '本', '书'],
      status,
    }],
  }
}

test('only an approved exact-source context overlays an authoritative target', () => {
  const approved = applyApprovedDictationContexts(dataset, catalog())
  assert.equal(approved.words[0].sentence, '我有一本书')
  assert.equal(dataset.words[0].sentence, '', 'the authoritative source projection remains immutable')

  const draft = applyApprovedDictationContexts(dataset, catalog('Draft'))
  assert.equal(draft.words[0].sentence, '')

  const base = catalog()
  const wrongSource = { ...base, candidates: base.candidates.map((candidate) => ({ ...candidate, sourceUnitId: 'another-week' })) }
  assert.equal(applyApprovedDictationContexts(dataset, wrongSource).words[0].sentence, '')
})

test('context validation enforces exact target presence and at most six explicit vocabulary units', () => {
  const candidate = catalog().candidates[0]
  assert.equal(validateDictationContextCandidate(candidate).valid, true)
  assert.equal(dictationContextText(candidate), '我有一本书')
  assert.equal(validateDictationContextCandidate({ ...candidate, contextTokens: ['我', '有', '书'] }).valid, false)
  assert.equal(validateDictationContextCandidate({ ...candidate, contextTokens: ['一', '一', '一', '一', '一', '一'] }).valid, true, 'the target may repeat when meaning requires it')
  assert.equal(validateDictationContextCandidate({ ...candidate, contextTokens: ['我', '有', '一', '本', '很', '好的', '书'] }).valid, false)
})

test('a Familiar DT reuses only one unambiguous approved grade-level context', () => {
  const approved = catalog()
  assert.equal(approvedContextTextForGradeTarget(approved, 'Kindergarten', '一'), '我有一本书')
  assert.equal(approvedContextTextForGradeTarget(catalog('Draft'), 'Kindergarten', '一'), undefined)
  assert.equal(approvedContextTextForGradeTarget({
    ...approved,
    candidates: [
      ...approved.candidates,
      { ...approved.candidates[0], id: 'second', targetOccurrenceId: 'second', contextTokens: ['一', '个人'] },
    ],
  }, 'Kindergarten', '一'), undefined)
})
