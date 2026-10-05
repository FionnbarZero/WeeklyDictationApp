import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { candidateContentFingerprint } from '../src/curriculum/identity.ts'
import { learningModuleCapabilities } from '../src/ninjaSkills/content.ts'
import type { LearningModuleCohort, LearningModuleTerm } from '../src/ninjaSkills/contracts.ts'
import { NINJA_SKILLS_PROFILES } from '../src/ninjaSkills/profiles.ts'

const source = {
  sourceType: 'google-slides' as const,
  sourceDocumentId: 'authoritative-source',
  sourceUnitId: 'source-unit',
  adapterId: 'reviewed-adapter-v1',
}

function cohort(terms: LearningModuleTerm[]): LearningModuleCohort {
  return {
    id: 'grade-2-cohort',
    label: 'Current week',
    grade: 'Grade 2',
    schoolYear: '2026–2027',
    terms,
    provenance: [{ datasetId: 'dataset-1', contentFingerprint: 'v2-fnv1a64-reviewed', source }],
  }
}

const plainTerms: LearningModuleTerm[] = [
  { occurrenceId: 'term-1', text: '学', tier: 'tier-1' },
  { occurrenceId: 'term-2', text: '校', tier: 'tier-1' },
  { occurrenceId: 'term-3', text: '老师', tier: 'tier-2' },
  { occurrenceId: 'term-4', text: '同学', tier: 'tier-2' },
  { occurrenceId: 'term-5', text: '朋友', tier: 'tier-2' },
]

test('text-only authoritative cohorts enable only modules whose contracts need text', () => {
  const capabilities = learningModuleCapabilities(cohort(plainTerms), NINJA_SKILLS_PROFILES['Grade 2'])
  assert.deepEqual(
    capabilities.map((capability) => [
      capability.status === 'ready' ? capability.pack.moduleId : capability.moduleId,
      capability.status,
    ]),
    [
      ['dictation-streak', 'unavailable'],
      ['speed-match', 'unavailable'],
      ['target-blast', 'ready'],
      ['memory-flip', 'ready'],
      ['context-gap-dash', 'unavailable'],
      ['sentence-scramble', 'unavailable'],
    ],
  )
})

test('reviewed metadata creates complete packs for all six transplanted modules', () => {
  const enriched = plainTerms.map(
    (term, termIndex): LearningModuleTerm => ({
      ...term,
      meaning: `meaning ${termIndex + 1}`,
      pinyinText: Array.from(term.text)
        .map((_, index) => `pin${index + 1}`)
        .join(' '),
      pinyinSteps: Array.from(term.text).map((character, index) => ({
        pinyin: `pin${index + 1}`,
        candidates: [character, index % 2 ? '天' : '地'],
      })),
      context: {
        sentence: `我爱${term.text}`,
        tokens: ['我', '爱', term.text],
      },
    }),
  )
  const capabilities = learningModuleCapabilities(cohort(enriched), NINJA_SKILLS_PROFILES['Grade 2'])
  assert.ok(capabilities.every((capability) => capability.status === 'ready'))
  for (const capability of capabilities) {
    if (capability.status !== 'ready') continue
    assert.equal(capability.pack.cohort.provenance[0].source.sourceDocumentId, 'authoritative-source')
    const items = 'pairs' in capability.pack ? capability.pack.pairs : capability.pack.rounds
    assert.ok(items.length > 0)
    assert.ok(items.length <= NINJA_SKILLS_PROFILES['Grade 2'].maximumItems[capability.pack.moduleId])
  }
})

test('guided Dictation and meaning matching fail closed on ambiguous authoritative metadata', () => {
  const ambiguous = plainTerms.map((term, index): LearningModuleTerm => ({
    ...term,
    meaning: index < 2 ? 'same meaning' : `meaning ${index}`,
    pinyinSteps: Array.from(term.text).map(() => ({ pinyin: 'pin', candidates: ['错'] })),
  }))
  const capabilities = learningModuleCapabilities(cohort(ambiguous), NINJA_SKILLS_PROFILES['Grade 2'])
  const byId = new Map(
    capabilities.map((capability) => [
      capability.status === 'ready' ? capability.pack.moduleId : capability.moduleId,
      capability,
    ]),
  )
  assert.equal(byId.get('dictation-streak')?.status, 'unavailable')
  assert.equal(byId.get('speed-match')?.status, 'unavailable')
})

test('learning-module metadata participates in canonical content fingerprints', () => {
  const base = {
    grade: 'Grade 2',
    schoolYear: '2026–2027',
    assignedWeek: { startDate: '2026-09-21', endDate: '2026-09-25' },
    tier1: [{ text: '学校', sourcePosition: 1, targetOccurrenceId: 'word-1' }],
    tier2: [],
    tier3: [],
  }
  const enriched = {
    ...base,
    tier1: [
      {
        ...base.tier1[0],
        learningModule: { meaning: 'school' },
      },
    ],
  }
  assert.notEqual(candidateContentFingerprint(base), candidateContentFingerprint(enriched))
})

test('all six grade profiles exist and use explicit per-module limits', () => {
  assert.deepEqual(Object.keys(NINJA_SKILLS_PROFILES), [
    'Kindergarten',
    'Grade 1',
    'Grade 2',
    'Grade 3',
    'Grade 4',
    'Grade 5',
  ])
  assert.ok(
    Object.values(NINJA_SKILLS_PROFILES).every((profile) =>
      Object.values(profile.maximumItems).every((limit) => Number.isInteger(limit) && limit > 0),
    ),
  )
})

test('session limits are disclosed instead of silently truncating eligible source targets', () => {
  const terms = Array.from({ length: 10 }, (_, index): LearningModuleTerm => ({
    occurrenceId: `term-${index + 1}`,
    text: `词${index + 1}`,
    tier: 'tier-1',
    meaning: `meaning ${index + 1}`,
  }))
  const capabilities = learningModuleCapabilities(cohort(terms), NINJA_SKILLS_PROFILES['Grade 2'])
  const speedMatch = capabilities.find((capability) =>
    capability.status === 'ready' ? capability.pack.moduleId === 'speed-match' : false,
  )
  assert.ok(speedMatch?.status === 'ready')
  assert.equal(speedMatch.pack.pairs.length, 8)
  assert.match(speedMatch.pack.scopeNote || '', /first 8 of 10 eligible source targets/)
})

test('the production host lazy-loads every transplanted module and records its source commit', () => {
  const host = readFileSync(new URL('../src/ninjaSkills/LearningModuleHost.tsx', import.meta.url), 'utf8')
  const provenance = readFileSync(new URL('../src/learningModules/PROVENANCE.md', import.meta.url), 'utf8')
  for (const folder of [
    'dictation-streak',
    'speed-match',
    'target-blast',
    'memory-lanterns',
    'context-gap-dash',
    'sushi-scramble',
  ])
    assert.match(host, new RegExp(`import\\('../learningModules/${folder}/Game\\.tsx'\\)`))
  assert.match(provenance, /56d4becba3149f28b9737d8bc552017da077fe64/)
})
