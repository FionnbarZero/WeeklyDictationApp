import assert from 'node:assert/strict'
import test from 'node:test'
import { dateRangeFromText, datasetIdFor, extractTier1, importLatestWeeklyDataset, parseSlide, grade5DeckProfile } from '../src/slidesImporter.ts'

test('grade 5 profile extracts the observed week/date range', () => {
  assert.deepEqual(dateRangeFromText('Week 6 (9/14-18)'), { startDate: '2026-09-14', endDate: '2026-09-18', dateRange: '9/14–9/18' })
})

test('tier 1 extraction keeps multi-character terms and ignores tiers 2 and 3', () => {
  const text = 'Week 6 (9/14-18)\nMandarin\nThis week: students practiced sentence structures.\nTier 1：怎样、吸收、通过、像、如果\nTier 2：空气、根\nTier 3：光合作用、二氧化碳\nELA'
  assert.deepEqual(extractTier1(text), ['怎样', '吸收', '通过', '像', '如果'])
})

test('stable dataset IDs use grade, school year, and permanent dates', () => {
  assert.equal(datasetIdFor(grade5DeckProfile, { startDate: '2026-09-14', endDate: '2026-09-18' }), 'grade-5-2026-27-2026-09-14-2026-09-18')
})

test('incomplete weekly slides are import errors, not workshops', () => {
  const result = parseSlide({ objectId: 'week-2', text: 'Week 2\nMandarin\nContent\nVocabulary\nSentence Frame' })
  assert.equal(result.status, 'error')
  assert.match(result.message, /date-range|weekly heading/i)
})

test('explicit writing-workshop markers create a distinguishable outcome', () => {
  const result = parseSlide({ objectId: 'workshop', text: 'Week 7 (9/21-25)\nMandarin\nWriting Project\nBiography\nNo Dictation' })
  assert.equal(result.status, 'writing-workshop')
})

test('newest valid weekly slide wins and duplicate imports are idempotent', () => {
  const presentation = { slides: [
    { objectId: 'new', text: 'Week 6 (9/14-18)\nMandarin\nThis week: photosynthesis.\nTier 1：怎样、吸收、通过、像、如果\nTier 2：空气' },
    { objectId: 'old', text: 'Week 5 (9/8-11)\nMandarin\nTier 1：需要、部分' },
  ] }
  const imported = importLatestWeeklyDataset(presentation)
  assert.equal(imported.status, 'imported')
  assert.equal(imported.sourceSlideId, 'new')
  assert.equal(importLatestWeeklyDataset(presentation, [imported.datasetId!]).status, 'duplicate')
})

test('Google Slides API text runs are traversed from page elements', () => {
  const result = importLatestWeeklyDataset({ slides: [{ objectId: 'api-slide', pageElements: [{ shape: { text: { textElements: [{ textRun: { content: 'Week 6 (9/14-18)\\nMandarin\\nTier 1：怎样、吸收、通过、像、如果' } }] } } }] }] })
  assert.equal(result.status, 'imported')
  assert.deepEqual(result.dataset?.words.map((word) => word.text), ['怎样', '吸收', '通过', '像', '如果'])
})
