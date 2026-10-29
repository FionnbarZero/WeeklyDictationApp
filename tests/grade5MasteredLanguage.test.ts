import assert from 'node:assert/strict'
import test from 'node:test'
import { GRADE5_DECK_ID } from '../src/config.ts'
import {
  GRADE5_MASTERED_LANGUAGE_VERSION,
  withGrade5MasteredLanguage,
} from '../src/grade5PresentationPreview/masteredLanguage.ts'
import type { LearningModuleCohort } from '../src/ninjaSkills/contracts.ts'

const writing = ['怎样', '吸收', '通过', '像', '如果', '需要', '部分', '重要', '开始', '各种各样']
const reading = [
  '提醒',
  '年长的',
  '并且',
  '表达',
  '碰',
  '空气',
  '根',
  '帮助',
  '植物',
  '食物',
  '得到',
  '关',
  '打开',
  '海洋',
  '阳光',
  '鲨鱼',
  '天敌',
  '生存',
]

function cohort(): LearningModuleCohort {
  return {
    id: 'mastered-historical',
    label: 'Historical mastered words',
    grade: 'Grade 5',
    schoolYear: '2026–2027',
    provenance: [
      {
        datasetId: 'historical-week',
        contentFingerprint: 'original-fingerprint',
        source: {
          sourceType: 'google-slides',
          sourceDocumentId: GRADE5_DECK_ID,
          sourceUnitId: 'original-slide',
          adapterId: 'grade-5-google-slides-v1',
        },
      },
    ],
    terms: [...writing, ...reading].map((text, index) => ({
      occurrenceId: `original:${index}`,
      datasetId: 'historical-week',
      text,
      tier: index < writing.length ? 'tier-1' : 'tier-2',
    })),
  }
}

test('historical writing receives unique meanings and exact tokenized sentences; reading receives meanings only', () => {
  const result = withGrade5MasteredLanguage(cohort())
  assert.equal(new Set(result.terms.map((term) => term.text)).size, writing.length + reading.length)
  assert.equal(new Set(result.terms.map((term) => term.meaning)).size, result.terms.length)
  for (const term of result.terms) {
    assert.ok(term.meaning?.trim())
    assert.equal(term.supplementalVersion, GRADE5_MASTERED_LANGUAGE_VERSION)
    assert.equal(term.pinyinText, undefined)
    assert.equal(term.pinyinSteps, undefined)
    if (term.tier === 'tier-1') {
      assert.ok(term.context)
      assert.equal(term.context.tokens.join(''), term.context.sentence)
      assert.ok(term.context.tokens.length >= 2)
      assert.ok(term.context.tokens.every((token) => token.trim()))
      assert.equal(term.context.sentence.split(term.text).length - 1, 1)
      assert.equal(term.context.tokens.filter((token) => token === term.text).length, 1)
    } else {
      assert.equal(term.context, undefined)
    }
  }
})

test('overlay preserves exact identities, order, tiers and source metadata without mutating its input', () => {
  const original = cohort()
  const before = structuredClone(original)
  const result = withGrade5MasteredLanguage(original)
  assert.notEqual(result, original)
  assert.deepEqual(original, before)
  assert.equal(result.provenance, original.provenance)
  assert.deepEqual({ ...result, terms: [] }, { ...original, terms: [] })
  assert.deepEqual(
    result.terms.map(({ occurrenceId, datasetId, text, tier }) => ({ occurrenceId, datasetId, text, tier })),
    original.terms,
  )
  assert.deepEqual(withGrade5MasteredLanguage(result), result)
})

test('existing meanings and contexts win independently over generated practice support', () => {
  const original = cohort()
  const teacherContext = {
    sentence: '你知道怎样读这个字吗？',
    tokens: ['你', '知道', '怎样', '读', '这个', '字', '吗', '？'],
  }
  const partial: LearningModuleCohort = {
    ...original,
    terms: [
      { ...original.terms[0], meaning: 'Teacher definition' },
      { ...original.terms[0], context: teacherContext },
      {
        ...original.terms[0],
        meaning: 'Teacher definition',
        context: teacherContext,
        supplementalVersion: 'prior-support',
      },
      {
        ...original.terms[writing.length],
        meaning: 'Teacher reminder definition',
        supplementalVersion: 'prior-support',
      },
    ],
  }
  const result = withGrade5MasteredLanguage(partial)
  assert.equal(result.terms[0].meaning, 'Teacher definition')
  assert.ok(result.terms[0].context)
  assert.equal(result.terms[1].context, teacherContext)
  assert.equal(result.terms[1].meaning, 'how')
  assert.equal(result.terms[2], partial.terms[2])
  assert.equal(result.terms[3], partial.terms[3])
})

test('other grades, missing provenance, different sources and mixed-source cohorts receive no overlay', () => {
  const original = cohort()
  const source = original.provenance[0]
  for (const wrong of [
    { ...original, grade: 'Kindergarten' },
    { ...original, grade: 'Grade 2' },
    { ...original, provenance: [] },
    { ...original, provenance: [{ ...source, source: { ...source.source, sourceDocumentId: 'different-deck' } }] },
    { ...original, provenance: [{ ...source, source: { ...source.source, sourceType: 'owner-assessment' as const } }] },
    {
      ...original,
      provenance: [source, { ...source, source: { ...source.source, sourceDocumentId: 'different-deck' } }],
    },
  ]) {
    assert.equal(withGrade5MasteredLanguage(wrong), wrong)
  }
})

test('active assessment and unknown or inexact target texts are never supplemented', () => {
  const original = cohort()
  const untouched: LearningModuleCohort = {
    ...original,
    terms: ['或者', '了解', '完', '兴奋的', '告诉', '沟通', '快速地', '有意思', '未知', '怎样 ', '各种各样的'].map(
      (text, index) => ({
        ...original.terms[0],
        occurrenceId: `untouched:${index}`,
        text,
      }),
    ),
  }
  assert.deepEqual(withGrade5MasteredLanguage(untouched), untouched)
  assert.ok(withGrade5MasteredLanguage(untouched).terms.every((term, index) => term === untouched.terms[index]))
})
