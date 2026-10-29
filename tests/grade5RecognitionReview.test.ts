import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { koreAudioSegments } from '../src/audio/koreVoice.ts'
import { inspectSnapshot } from '../src/familyBeta/curriculum.ts'
import reviewed from '../src/grade5RecognitionReview/source.json' with { type: 'json' }
import {
  grade5ReadingReviewPreview,
  grade5ReadingReviewSource,
  isGrade5ReadingReview,
} from '../src/grade5RecognitionReview/source.ts'
import { learningModuleCapability, learningModuleCohortFromDatasets } from '../src/ninjaSkills/content.ts'
import { rotatingGameTerms } from '../src/ninjaSkills/policy.ts'
import { NINJA_SKILLS_PROFILES } from '../src/ninjaSkills/profiles.ts'

test('all 50 teacher rows remain ordered reading occurrences with no writing or invented sentences', () => {
  const { candidate, dataset } = grade5ReadingReviewSource()
  assert.equal(candidate.tier2.length, 50)
  assert.deepEqual(
    dataset.vocabulary!.tier2.map((word) => word.text),
    reviewed.targets.map((row) => row.text),
  )
  assert.deepEqual(dataset.words, [])
  assert.deepEqual(candidate.tier1, [])
  assert.equal(isGrade5ReadingReview(dataset), true)
  assert.equal(isGrade5ReadingReview(undefined), false)
  for (const [i, word] of dataset.vocabulary!.tier2.entries()) {
    assert.equal(word.learningModule!.pinyinText, reviewed.targets[i].pinyin)
    assert.equal(word.learningModule!.meaning, reviewed.targets[i].meaning)
    assert.equal(word.sentence, '')
    assert.equal(word.tier, 'tier-2')
  }
  assert.equal(new Set(dataset.vocabulary!.tier2.map((word) => word.id)).size, 50)
  assert.deepEqual(grade5ReadingReviewSource(), { candidate, dataset })
})

test('review does not appear in ordinary source validation or change the weekly importer', () => {
  assert.equal(grade5ReadingReviewPreview, false)
  const snapshot = JSON.parse(
    readFileSync(new URL('./fixtures/game-content-2026-10-26/grade5.json', import.meta.url), 'utf8'),
  )
  const original = structuredClone(snapshot)
  assert.equal(inspectSnapshot(snapshot).datasets.some(isGrade5ReadingReview), false)
  assert.deepEqual(snapshot, original)
})

test('all 50 review targets have an existing Kore recording', () => {
  for (const row of reviewed.targets) assert.ok(koreAudioSegments(row.text)?.length, row.text)
})

test('bounded reading rotation reaches every target without enabling ordinary mixed-tier matching', () => {
  const { dataset } = grade5ReadingReviewSource()
  const cohort = learningModuleCohortFromDatasets('review', 'Review', [dataset])!
  const seen = new Set<string>()
  for (let visit = 0; visit < 7; visit++)
    for (const term of rotatingGameTerms('memory-flip', cohort.terms, 8, visit)) seen.add(term.text)
  assert.equal(seen.size, 50)
  assert.equal(learningModuleCapability('speed-match', cohort, NINJA_SKILLS_PROFILES['Grade 5']).status, 'unavailable')
  assert.equal(learningModuleCapability('target-blast', cohort, NINJA_SKILLS_PROFILES['Grade 5']).status, 'ready')
  assert.equal(learningModuleCapability('memory-flip', cohort, NINJA_SKILLS_PROFILES['Grade 5']).status, 'ready')
})
